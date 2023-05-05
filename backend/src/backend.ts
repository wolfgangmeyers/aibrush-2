import { Client, ClientBase, Pool, PoolClient } from "pg";
import axios from "axios";
import os from "os";
import { createDb, migrate } from "postgres-migrations";
import * as uuid from "uuid";
import moment from "moment";
import nodemailer from "nodemailer";
import sharp from "sharp";
import { hash } from "./auth";

import {
    FeatureList,
    ImageList,
    Image,
    CreateImageInput,
    UpdateImageInput,
    StatusEnum,
    InviteCode,
    User,
    AddMetricsInput,
    Worker,
    ImageUrls,
    GlobalSettings,
    TemporaryImage,
    Credits,
    DepositCode,
    CreateDepositCodeInput,
    CreateStripeSessionInput,
} from "./client/api";
import { sleep } from "./sleep";
import { EmailMessage } from "./email_message";
import { Config } from "./config";
import { Authentication, AuthHelper, ServiceAccountConfig } from "./auth";
import { LoginCode } from "./model";
import { Filestore, S3Filestore, LocalFilestore } from "./filestore";
import { MetricsClient } from "./metrics";
import Bugsnag from "@bugsnag/js";
import { Logger } from "./logs";
import { Clock, RealClock } from "./clock";
import { HordeQueue, SQSHordeQueue } from "./horde_queue";
import { calculateImagesCost } from "./credits";
import { calculateCredits, StripeHelper, StripeHelperImpl } from "./stripe_helper";
import Stripe from "stripe";

process.env.PGUSER = process.env.PGUSER || "postgres";

const STUCK_IMAGES_KEY = 1;
const TEMPORARY_IMAGES_KEY = 2;
const DELETED_IMAGES_KEY = 3;
const MIGRATIONS_KEY = 4;
const RESET_CREDITS_KEY = 5;
// const WORK_DISTRIBUTION_KEY = 6;
// const IDLE_BOOSTS_KEY = 7;

const RESET_CREDITS_EVENT = "reset_credits";

const DEPOSIT_CODE_DAYS = 7;

export type NotificationListener = (payload: string) => void;

export const NOTIFICATION_IMAGE_UPDATED = "image_updated";
export const NOTIFICATION_IMAGE_DELETED = "image_deleted";
export const NOTIFICATION_PENDING_IMAGE = "pending_image";
export const NOTIFICATION_WORKER_CONFIG_UPDATED = "worker_config_updated";
export const NOTIFICATION_CREDITS_UPDATED = "credits_updated";

const IMAGE_FIELDS: { [key: string]: boolean } = {
    id: true,
    created_at: true,
    created_by: true,
    updated_at: true,
    params: true,
    label: true,
    parent: true,
    score: true,
    negative_score: true,
    status: true,
    model: true,
    nsfw: true,
    temporary: true,
    deleted_at: true,
    error: true,
};

export class UserError extends Error {
    constructor(message: string) {
        super(message);
    }
}

interface DiscordLoginResult {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    scope: string;
}

interface DiscordUser {
    id: string;
    username: string;
    avatar: string;
    avatar_decoration: string;
    discriminator: string;
    public_flags: number;
    flags: number;
    banner: string;
    banner_color: string;
    accent_color: string;
    locale: string;
    mfa_enabled: boolean;
    premium_type: number;
    email: string;
    verified: boolean;
}

// map of model name -> score
export interface PendingImages {
    model: string;
    score: number; // count * (now - created_at)
}

export class BackendService {
    private pool: Pool;
    private authHelper: AuthHelper;
    private filestore: Filestore;
    private notificationsClient: Client;
    private clock: Clock;
    private hordeQueue: HordeQueue;
    private paidHordeQueue: HordeQueue;
    private stripeHelper: StripeHelper;

    private notificationListeners: { [key: string]: NotificationListener[] } =
        {};

    setHordeQueueForTesting(queue: HordeQueue) {
        this.hordeQueue = queue;
    }

    setPaidHordeQueueForTesting(queue: HordeQueue) {
        this.paidHordeQueue = queue;
    }

    setStripeHelperForTesting(helper: StripeHelper) {
        this.stripeHelper = helper;
    }

    constructor(
        private config: Config,
        private metrics: MetricsClient,
        private logger: Logger,
        clock?: Clock
    ) {
        this.authHelper = new AuthHelper(
            config,
            () => this.clock.now().valueOf(),
            logger
        );
        this.clock = clock || new RealClock();
        if (config.s3Bucket) {
            this.filestore = new S3Filestore(config.s3Bucket, config.s3Region);
        } else {
            this.filestore = new LocalFilestore(config.dataFolderName);
        }
        if (config.hordeQueueName) {
            this.hordeQueue = new SQSHordeQueue(config.hordeQueueName, {
                region: config.s3Region || "us-west-2",
            });
        }
        if (config.paidHordeQueueName) {
            this.paidHordeQueue = new SQSHordeQueue(config.paidHordeQueueName, {
                region: config.s3Region || "us-west-2",
            });
        }
        if (config.stripeSecretKey && config.stripeWebhookSecret) {
            this.stripeHelper = new StripeHelperImpl(config.stripeSecretKey, config.stripeWebhookSecret);
        }
    }

    private async sendMail(message: EmailMessage): Promise<void> {
        const transporter = nodemailer.createTransport({
            host: this.config.smtpHost,
            port: this.config.smtpPort,
            secure: !!this.config.smtpUser,
            auth: this.config.smtpUser && {
                user: this.config.smtpUser,
                pass: this.config.smtpPassword,
            },
        });
        const mailOptions = {
            from: this.config.smtpFrom,
            to: message.to,
            subject: message.subject,
            text: message.text,
        };
        await transporter.sendMail(mailOptions);
    }

    public async init(): Promise<void> {
        // check for DATABASE_URL env var, set it on config if it's populated
        if (process.env.DATABASE_URL) {
            this.config.databaseUrl = process.env.DATABASE_URL;
        }
        let lock = false;

        this.pool = new Pool({
            connectionString: this.config.databaseUrl,
            ssl: this.config.databaseSsl && { rejectUnauthorized: false },
        });

        let client: PoolClient = await this.pool.connect();
        try {
            lock = await this.acquireLock(client, MIGRATIONS_KEY);
            if (lock) {
                await migrate({ client }, "./src/migrations");
                await sleep(100);
            }
        } catch (error) {
            this.metrics.addMetric("backend.init", 1, "count", {
                status: "error",
                error: error.message,
            });
            Bugsnag.notify(error, (evt) => {
                evt.context = "backend.init";
            });
            throw error;
        } finally {
            if (client && lock) {
                await this.releaseLock(client, MIGRATIONS_KEY);
            }
            client.release();
        }

        this.metrics.addMetric("backend.init", 1, "count", {
            status: "success",
        });

        this.notificationsClient = new Client({
            connectionString: this.config.databaseUrl,
            ssl: this.config.databaseSsl && { rejectUnauthorized: false },
        });
        this.notificationsClient.on("error", (error) => {
            console.error(error);
        });
        await this.notificationsClient.connect();
        this.notificationsClient.on("notification", async (message) => {
            const listeners = this.notificationListeners[message.channel];
            if (listeners) {
                for (const listener of listeners) {
                    listener(message.payload);
                }
            }
        });
        if (this.hordeQueue) {
            await this.hordeQueue.init();
        }
        if (this.paidHordeQueue) {
            await this.paidHordeQueue.init();
        }

        // emergency cleanup logic...
        // const images = await this.listImages({limit: 100000});
        // for (let image of images.images) {
        //     if (image.label == "cyborg harry potter") {
        //         console.log(`deleting ${image.id}`)
        //         await this.deleteImage(image.id)
        //     }
        // }
    }

    now(): moment.Moment {
        return this.clock.now();
    }

    async destroy() {
        this.metrics.addMetric("backend.destroy", 1, "count", {
            status: "success",
        });
        await this.pool.end();
        await this.notificationsClient.end();
    }

    private hydrateImage(image: Image): Image {
        let result: any = {
            ...image,
        };
        if (result.created_at) {
            result.created_at = parseInt(result.created_at as any);
        }
        if (result.updated_at) {
            result.updated_at = parseInt(result.updated_at as any);
        }
        if (result.deleted_at) {
            result.deleted_at = parseInt(result.deleted_at as any);
        }
        // support legacy params
        if (result.params) {
            result.phrases = [result.params.prompt];
            result.negative_phrases = [result.params.negative_prompt];
            result.iterations = result.params.steps;
            result.stable_diffusion_strength = result.params.denoising_strength;
            result.width = result.params.width;
            result.height = result.params.height;
        }
        return result;
    }

    private sanitizeChannel(channel: string): string {
        // replace any non-alphanumeric characters
        // with underscores
        return channel.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    }

    async listen(channel: string, listener: NotificationListener) {
        channel = this.sanitizeChannel(channel);
        let listeners = this.notificationListeners[channel];
        if (!listeners) {
            listeners = [];
            this.notificationListeners[channel] = listeners;
        }
        const newChannel = listeners.length == 0;
        listeners.push(listener);
        if (newChannel) {
            // console.log("LISTENING to channel", channel);
            // console.log(this.notificationListeners);
            await this.notificationsClient.query(`LISTEN "${channel}"`);
        }
    }

    async unlisten(channel: string, listener: NotificationListener) {
        channel = this.sanitizeChannel(channel);
        const listeners = this.notificationListeners[channel];
        if (listeners) {
            const index = listeners.indexOf(listener);
            if (index >= 0) {
                listeners.splice(index, 1);
            }
            if (listeners.length == 0) {
                await this.notificationsClient.query(`UNLISTEN "${channel}"`);
                delete this.notificationListeners[channel];
            }
        }
    }

    async notify(channel: string, payload: string) {
        channel = this.sanitizeChannel(channel);
        // console.log("NOTIFYING channel", channel);
        const client = await this.pool.connect();
        try {
            await client.query(`NOTIFY "${channel}", '${payload}'`);
        } finally {
            client.release();
        }
    }

    // list images
    async listImages(query: {
        userId?: string;
        status?: StatusEnum;
        cursor?: number;
        direction?: "asc" | "desc";
        limit?: number;
        filter?: string;
        fields?: string[];
    }): Promise<ImageList> {
        const client = await this.pool.connect();
        let whereClauses = [];
        let args = [];

        if (query.userId) {
            whereClauses.push("created_by=$" + (args.length + 1));
            args.push(query.userId);
        }
        if (query.status) {
            whereClauses.push("status=$" + (args.length + 1));
            args.push(query.status);
        }
        if (query.cursor) {
            // cursor references updated_at
            // if direction is asc, find all images with updated_at >= cursor
            // if direction is desc, find all images with updated_at <= cursor
            whereClauses.push(
                `updated_at ${query.direction === "asc" ? ">=" : "<="} $` +
                    (args.length + 1)
            );
            args.push(query.cursor);
        }
        if (query.filter) {
            whereClauses.push(
                `(label ILIKE $` +
                    (args.length + 1) +
                    ` OR params->>'prompt' ILIKE $` +
                    (args.length + 1) +
                    `)`
            );
            args.push(`%${query.filter}%`);
        }
        whereClauses.push("temporary=false");
        if (query.direction == "desc") {
            whereClauses.push("deleted_at IS NULL");
        }
        let whereClause = "";
        if (whereClauses.length > 0) {
            whereClause = "WHERE " + whereClauses.join(" AND ");
        }
        const limit = query.limit || 100;
        const orderBy = query.direction === "asc" ? "ASC" : "DESC";

        if (query.fields) {
            query.fields = query.fields.filter((f) => IMAGE_FIELDS[f]);
        }
        const selectFields =
            query.fields && query.fields.length > 0
                ? query.fields.join(",")
                : "*";
        try {
            const result = await client.query(
                `SELECT ${selectFields} FROM images ${whereClause} ORDER BY updated_at ${orderBy} LIMIT ${limit}`,
                args
            );
            return {
                images: result.rows.map((i: any) => this.hydrateImage(i)),
            };
        } finally {
            client.release();
        }
    }

    async getPendingImageScores(): Promise<PendingImages[]> {
        // aggregate images that are pending by model
        // calculate score as sum of (now - created_at) for each image
        const now = this.clock.now().valueOf();
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `SELECT model, SUM(${now} - created_at) score FROM images WHERE status='pending' AND deleted_at IS NULL GROUP BY model ORDER BY score DESC`
            );
            return result.rows.map((row) => ({
                model: row.model,
                score: parseInt(row.score),
            }));
        } finally {
            client.release();
        }
    }

    // get image by id
    async getImage(id: string): Promise<Image> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM images WHERE id=$1`,
                [id]
            );
            const imageData = result.rows[0];
            if (!imageData) {
                return null;
            }
            const img = this.hydrateImage({
                ...imageData,
            });

            return img;
        } finally {
            client.release();
        }
    }

    async getImageUploadUrls(id: string): Promise<ImageUrls> {
        const initImagePromise = this.filestore.getUploadUrl(
            `${id}.init_image.png`
        );
        const imagePromise = this.filestore.getUploadUrl(`${id}.image.png`);
        const maskPromise = this.filestore.getUploadUrl(`${id}.mask.png`);
        const thumbnailPromise = this.filestore.getUploadUrl(
            `${id}.thumbnail.png`
        );

        return {
            init_image_url: await initImagePromise,
            image_url: await imagePromise,
            mask_url: await maskPromise,
            thumbnail_url: await thumbnailPromise,
        };
    }

    async getImageDownloadUrls(id: string): Promise<ImageUrls> {
        const initImagePromise = this.filestore.getDownloadUrl(
            `${id}.init_image.png`
        );
        const imagePromise = this.filestore.getDownloadUrl(`${id}.image.png`);
        const maskPromise = this.filestore.getDownloadUrl(`${id}.mask.png`);
        const thumbnailPromise = this.filestore.getDownloadUrl(
            `${id}.thumbnail.png`
        );

        return {
            init_image_url: await initImagePromise,
            image_url: await imagePromise,
            mask_url: await maskPromise,
            thumbnail_url: await thumbnailPromise,
        };
    }

    async batchGetImages(
        userId: string,
        ids: string[],
        fields: string[]
    ): Promise<Image[]> {
        if (fields) {
            fields = fields.filter((f) => IMAGE_FIELDS[f]);
        }
        const selectFields =
            fields && fields.length > 0 ? fields.join(",") : "*";
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `SELECT ${selectFields} FROM images WHERE created_by=$1 AND id=ANY($2)`,
                [userId, ids]
            );
            return result.rows
                .map((i: any) => this.hydrateImage(i))
                .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
        } finally {
            client.release();
        }
    }

    // get image data
    async getImageData(id: string): Promise<Buffer> {
        try {
            // load image data from file and convert from base64 to buffer
            const image = await this.filestore.readBinaryFile(
                `${id}.image.png`
            );
            return image;
        } catch (_) {
            return null;
        }
    }

    // get thumbnail data
    async getThumbnailData(id: string): Promise<Buffer> {
        if (await this.filestore.exists(`${id}.thumbnail.png`)) {
            try {
                // load image data from file and convert from base64 to buffer
                const thumbnail = await this.filestore.readBinaryFile(
                    `${id}.thumbnail.png`
                );
                return thumbnail;
            } catch (_) {}
        }
        return null;
    }

    // get .npy data
    async getNpyData(id: string): Promise<Buffer> {
        if (await this.filestore.exists(`${id}.npy`)) {
            try {
                // load image data from file and convert from base64 to buffer
                const npy = await this.filestore.readBinaryFile(`${id}.npy`);
                return npy;
            } catch (_) {}
        }
        return null;
    }

    async getMaskData(id: string) {
        if (await this.filestore.exists(`${id}.mask.png`)) {
            try {
                // load image data from file and convert from base64 to buffer
                const mask = this.filestore.readBinaryFile(`${id}.mask.png`);
                return mask;
            } catch (_) {}
        }
        return null;
    }

    async deleteImage(id: string): Promise<void> {
        const now = this.clock.now().valueOf();
        // set deleted_at to now
        const image = await this.getImage(id);
        if (
            image.temporary ||
            image.status === StatusEnum.Pending ||
            image.status === StatusEnum.Processing ||
            image.status === StatusEnum.Error
        ) {
            // delete image
            await this.hardDeleteImage(id);
            return;
        }
        const client = await this.pool.connect();
        if (image) {
            try {
                await client.query(
                    `UPDATE images SET deleted_at=$1, updated_at=$1 WHERE id=$2`,
                    [now, id]
                );
            } finally {
                client.release();
            }
            this.notify(
                image.created_by,
                JSON.stringify({ type: NOTIFICATION_IMAGE_DELETED, id })
            );
        }
    }

    // delete image
    async hardDeleteImage(id: string): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query(`DELETE FROM images WHERE id=$1`, [id]);
            const filesToCheck = [
                `${id}.init_image.png`,
                `${id}.image.png`,
                `${id}.thumbnail.png`,
                `${id}.mask.png`,
            ];
            const checkPromises = filesToCheck.map((file) =>
                this.filestore.exists(file)
            );
            const exists = await Promise.all(checkPromises);
            const deletePromises = [];
            for (let i = 0; i < exists.length; i++) {
                if (exists[i]) {
                    deletePromises.push(
                        this.filestore.deleteFile(filesToCheck[i])
                    );
                }
            }
            await Promise.all(deletePromises);
        } finally {
            client.release();
        }
    }

    private async createThumbnail(image: Buffer): Promise<Buffer> {
        const thumbnail = await sharp(image)
            .resize(128, 128, {
                fit: "cover",
            })
            .toBuffer();
        return thumbnail;
    }

    private async createEncodedThumbnail(encoded_image: string) {
        const binaryImage = Buffer.from(encoded_image, "base64");
        const thumbnail = await this.createThumbnail(binaryImage);
        return thumbnail.toString("base64");
    }

    private upgradeLegacyRequest(body: CreateImageInput): CreateImageInput {
        if (!body.params) {
            const old = body as any;
            body.params = {
                prompt: old.phrases[0] || "",
                negative_prompt: old.negative_phrases[0] || "",
                width: old.width || 512,
                height: old.height || 512,
                steps: old.iterations || 20,
                denoising_strength: old.stable_diffusion_strength,
                controlnet_type: old.controlnet_type,
                augmentation: old.augmentation,
            };
        }
        return body;
    }

    private async createImage(
        createdBy: string,
        body: CreateImageInput,
        paid: boolean
    ): Promise<Image> {
        body = this.upgradeLegacyRequest(body);
        body.params.seed =
            body.params.seed ||
            Math.floor(Math.random() * 1000000000).toString();
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `INSERT INTO images
                    (id, created_by, created_at, updated_at, label, parent, params, score, status, model, negative_score, nsfw, temporary)
                VALUES
                    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING *`,
                [
                    uuid.v4(),
                    hash(createdBy),
                    new Date().getTime(),
                    new Date().getTime(),
                    body.label || "",
                    body.parent,
                    body.params,
                    0,
                    body.status || "pending",
                    body.model || "stable_diffusion",
                    0,
                    body.nsfw || false,
                    body.temporary || false,
                ]
            );
            const image = result.rows[0] as Image;
            let encoded_image = body.encoded_image;
            if (!encoded_image && body.parent) {
                try {
                    // const parentImageData = await this.filestore.readBinaryFile(
                    //     `${body.parent}.image.png`
                    // );
                    // encoded_image = parentImageData.toString("base64");
                    await this.filestore.copyFile(
                        `${body.parent}.image.png`,
                        `${image.id}.init_image.png`
                    );
                } catch (err) {
                    console.error(err);
                    Bugsnag.notify(err, (event) => {
                        event.context = `load parent image data`;
                    });
                }
            }
            const promises: Promise<void>[] = [];
            // if encoded_image is set, save image
            if (encoded_image) {
                const binary_image = Buffer.from(encoded_image, "base64");
                promises.push(
                    this.filestore.writeFile(
                        `${image.id}.init_image.png`,
                        binary_image
                    )
                );
                if (!body.temporary) {
                    const encoded_thumbnail = await this.createEncodedThumbnail(
                        encoded_image
                    );
                    const binary_thumbnail = Buffer.from(
                        encoded_thumbnail,
                        "base64"
                    );
                    promises.push(
                        this.filestore.writeFile(
                            `${image.id}.thumbnail.png`,
                            binary_thumbnail
                        )
                    );
                }
            }

            // temporary image references. This is more efficient than uploading
            // image data directly to the api
            if (body.tmp_image_id) {
                promises.push(
                    this.filestore.copyFile(
                        `tmp/${body.tmp_image_id}.png`,
                        `${image.id}.init_image.png`
                    )
                );
            }
            if (body.tmp_mask_id) {
                promises.push(
                    this.filestore.copyFile(
                        `tmp/${body.tmp_mask_id}.png`,
                        `${image.id}.mask.png`
                    )
                );
            }
            if (body.tmp_thumbnail_id) {
                promises.push(
                    this.filestore.copyFile(
                        `tmp/${body.tmp_thumbnail_id}.png`,
                        `${image.id}.thumbnail.png`
                    )
                );
            }

            let encoded_mask = body.encoded_mask;

            // if encoded_mask is set, save mask
            if (encoded_mask) {
                const binary_mask = Buffer.from(encoded_mask, "base64");
                promises.push(
                    this.filestore.writeFile(
                        `${image.id}.mask.png`,
                        binary_mask
                    )
                );
            }
            await Promise.all(promises);
            if (image.status == "pending") {
                this.notify(
                    "WORKERS",
                    JSON.stringify({
                        type: NOTIFICATION_PENDING_IMAGE,
                    })
                );
                const hordeQueue = paid ? this.paidHordeQueue : this.hordeQueue;
                if (hordeQueue) {
                    const jwt = this.authHelper.createToken(
                        image.created_by,
                        "access",
                        3600,
                        null,
                        image.id
                    );
                    hordeQueue.submitImage({
                        authToken: jwt,
                        imageId: image.id,
                        prompt: image.params.prompt,
                        negativePrompt: image.params.negative_prompt,
                        width: image.params.width,
                        height: image.params.height,
                        steps: image.params.steps,
                        cfgScale: image.params.cfg_scale || 7.5,
                        seed: image.params.seed,
                        denoisingStrength: image.params.denoising_strength,
                        nsfw: true,
                        censorNsfw: false,
                        model: image.model,
                        augmentation: image.params.augmentation,
                        controlnetType: image.params.controlnet_type,
                    });
                    console.log("Submitted to horde: " + image.id);
                }
            }
            this.notify(
                image.created_by,
                JSON.stringify({
                    type: NOTIFICATION_IMAGE_UPDATED,
                    id: image.id,
                    status: image.status,
                })
            );
            return this.hydrateImage({
                ...image,
            });
        } finally {
            client.release();
        }
    }

    private async getPendingOrProcessingCountForUser(
        userId: string
    ): Promise<number> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                "SELECT COUNT(*) FROM images WHERE created_by = $1 AND (status = 'pending' OR status = 'processing')",
                [userId]
            );
            return parseInt(result.rows[0].count);
        } finally {
            client.release();
        }
    }

    async createImages(
        createdBy: string,
        body: CreateImageInput
    ): Promise<Array<Image>> {
        const pendingOrProcessingCount =
            await this.getPendingOrProcessingCountForUser(createdBy);
        let count = body.count || 1;
        if (count > 10) {
            count = 10;
        }
        count = Math.min(count, 10 - pendingOrProcessingCount);
        if (count <= 0) {
            throw new Error(
                "You already have too many pending or processing images"
            );
        }

        const credits = await this.getCredits(createdBy);
        if (credits.free_credits === 0 && credits.paid_credits === 0) {
            throw new Error("No credits");
        }
        const promises: Array<Promise<Image>> = [];
        for (let i = 0; i < count; i++) {
            promises.push(
                this.createImage(
                    createdBy,
                    {
                        ...body,
                        params: {
                            ...body.params,
                        },
                    },
                    credits.paid_credits > 0
                )
            );
        }
        const images = await Promise.all(promises);

        return images;
    }

    async updateImage(id: string, body: UpdateImageInput): Promise<Image> {
        const existingImage = await this.getImage(id);
        if (!existingImage) {
            this.logger.log("Existing image not found: " + id);
            return null;
        }
        let completed =
            existingImage.status !== StatusEnum.Completed &&
            body.status === StatusEnum.Completed;
        // update existing image fields
        Object.keys(body).forEach((key) => {
            existingImage[key] = body[key];
        });

        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `UPDATE images
                SET
                    label=$1,
                    status=$2,
                    updated_at=$3,
                    score=$4,
                    negative_score=$5,
                    nsfw=$6,
                    deleted_at=$7,
                    error=$8
                WHERE id=$9 RETURNING *`,
                [
                    existingImage.label,
                    existingImage.status,
                    new Date().getTime(),
                    existingImage.score,
                    existingImage.negative_score,
                    existingImage.nsfw,
                    existingImage.deleted_at,
                    existingImage.error,
                    id,
                ]
            );

            const image = result.rows[0] as Image;
            const promises: Promise<void>[] = [];
            // if encoded_image is set, save it
            if (body.encoded_image) {
                const binaryImage = Buffer.from(body.encoded_image, "base64");
                promises.push(
                    this.filestore.writeFile(
                        `${image.id}.image.png`,
                        binaryImage
                    )
                );
                const encoded_thumbnail = await this.createEncodedThumbnail(
                    body.encoded_image
                );
                const binaryThumbnail = Buffer.from(
                    encoded_thumbnail,
                    "base64"
                );
                promises.push(
                    this.filestore.writeFile(
                        `${image.id}.thumbnail.png`,
                        binaryThumbnail
                    )
                );
            }
            if (body.encoded_npy) {
                const binaryNpy = Buffer.from(body.encoded_npy, "base64");
                promises.push(
                    this.filestore.writeFile(`${image.id}.npy`, binaryNpy)
                );
            }
            await Promise.all(promises);
            if (completed) {
                const created_at = image.created_at;
                const updated_at = image.updated_at;
                const duration = updated_at - created_at;
                const duration_seconds = duration / 1000;
                // log metric
                this.metrics.addMetric("backend.image_completed", 1, "count", {
                    seconds_until_completion: duration_seconds,
                });

                const cost = calculateImagesCost(
                    1,
                    image.params.width,
                    image.params.height
                );
                await this.deductCredits(image.created_by, cost);
            }
            this.notify(
                image.created_by,
                JSON.stringify({
                    type: NOTIFICATION_IMAGE_UPDATED,
                    id: image.id,
                    status: image.status,
                })
            );
            return this.hydrateImage({
                ...image,
            });
        } finally {
            client.release();
        }
    }

    async getLastEventTime(eventName: string): Promise<number> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM last_event WHERE event_name = $1`,
                [eventName]
            );
            if (result.rows.length === 0) {
                return 0;
            }
            return parseInt(result.rows[0].event_time);
        } finally {
            client.release();
        }
    }

    async setLastEventTime(
        eventName: string,
        eventTime: number
    ): Promise<void> {
        // upsert
        const client = await this.pool.connect();
        try {
            await client.query(
                `INSERT INTO last_event (event_name, event_time) VALUES ($1, $2) ON CONFLICT (event_name) DO UPDATE SET event_time = $2`,
                [eventName, eventTime]
            );
        } finally {
            client.release();
        }
    }

    // private async getUsersWithPendingImages(
    //     status: string,
    //     include_models: string[] | null,
    //     exclude_models: string[] | null
    // ): Promise<Array<string>> {
    //     const args = [];
    //     const client = await this.pool.connect();
    //     let filter = " AND deleted_at IS NULL";
    //     if (include_models) {
    //         const in_str = include_models
    //             .map((_, i) => `$${args.length + i + 1}`)
    //             .join(",");
    //         filter += ` AND model in (${in_str})`;
    //         args.push(...include_models);
    //     }
    //     if (exclude_models) {
    //         const in_str = exclude_models
    //             .map((_, i) => `$${args.length + i + 1}`)
    //             .join(",");
    //         filter += ` AND model NOT IN (${in_str})`;
    //         args.push(...exclude_models);
    //     }
    //     try {
    //         const result = await client.query(
    //             `SELECT DISTINCT created_by FROM images WHERE status='${
    //                 status || "pending"
    //             }'${filter}`,
    //             args
    //         );
    //         return result.rows.map((row) => row.created_by);
    //     } finally {
    //         client.release();
    //     }
    // }

    // for all images with status "processing" that have not been updated in more than 5 minutes,
    // update status to "pending"
    private async cleanupStuckImages(): Promise<void> {
        const client = await this.pool.connect();
        let lock = false;
        try {
            lock = await this.acquireLock(client, STUCK_IMAGES_KEY);
            if (!lock) {
                return;
            }
            const result = await client.query(
                `UPDATE images SET status='pending', updated_at=$2 WHERE status='processing' AND updated_at < $1`,
                [new Date().getTime() - 60 * 1000, new Date().getTime()]
            );
            // if any images were updated, log the number
            if (result.rowCount > 0) {
                this.logger.log(
                    `Cleaning up stuck images: ${result.rowCount} images updated to "pending"`
                );
                this.metrics.addMetric(
                    "backend.stuck_images",
                    result.rowCount,
                    "count",
                    {}
                );
            }
        } finally {
            if (lock) {
                await this.releaseLock(client, STUCK_IMAGES_KEY);
            }
            client.release();
        }
    }

    private async cleanupTemporaryImages(): Promise<void> {
        // delete images with temporary=true and older than one hour
        const client = await this.pool.connect();
        let lock = false;
        try {
            lock = await this.acquireLock(client, TEMPORARY_IMAGES_KEY);
            if (!lock) {
                return;
            }
            // first list all temporary images, iterate over them and delete them.
            // they might have files in the filestore too
            const result = await client.query(
                `SELECT id FROM images WHERE temporary=true AND created_at < $1`,
                [new Date().getTime() - 60 * 60 * 1000]
            );
            if (result.rows.length > 0) {
                const promises: Promise<void>[] = [];
                result.rows.forEach((row) => {
                    promises.push(this.hardDeleteImage(row.id));
                });
                await Promise.all(promises);
                this.logger.log(
                    `cleaned up temporary images: ${result.rowCount} images deleted`
                );
                this.metrics.addMetric(
                    "backend.temporary_images",
                    result.rowCount,
                    "count",
                    {}
                );
            }
        } finally {
            if (lock) {
                await this.releaseLock(client, TEMPORARY_IMAGES_KEY);
            }
            client.release();
        }
    }

    private async cleanupDeletedImages(): Promise<void> {
        // get all images that have been deleted for more than 7 days
        const client = await this.pool.connect();
        let lock = false;
        try {
            lock = await this.acquireLock(client, DELETED_IMAGES_KEY);
            if (!lock) {
                return;
            }
            const result = await client.query(
                `SELECT id FROM images WHERE deleted_at < $1`,
                [this.clock.now().subtract(1, "days").valueOf()]
            );
            if (result.rows.length > 0) {
                const promises: Promise<void>[] = [];
                result.rows.forEach((row) => {
                    promises.push(this.hardDeleteImage(row.id));
                });
                await Promise.all(promises);
                this.logger.log(
                    `cleaned up deleted images: ${result.rowCount} images deleted`
                );
                this.metrics.addMetric(
                    "backend.deleted_images",
                    result.rowCount,
                    "count",
                    {}
                );
            }
        } finally {
            if (lock) {
                await this.releaseLock(client, DELETED_IMAGES_KEY);
            }
            client.release();
        }
    }

    private async acquireLock(
        client: ClientBase,
        key: number
    ): Promise<boolean> {
        const result = await client.query(`SELECT pg_try_advisory_lock($1)`, [
            key,
        ]);
        return result.rows[0].pg_try_advisory_lock as boolean;
    }

    private async releaseLock(client: ClientBase, key: number): Promise<void> {
        await client.query(`SELECT pg_advisory_unlock($1)`, [key]);
    }

    async withLock(key: number, fn: () => Promise<void>): Promise<void> {
        const client = await this.pool.connect();
        let lock: boolean;
        try {
            lock = await this.acquireLock(client, key);
            if (!lock) {
                return;
            }
            await fn();
        } finally {
            if (lock) {
                await this.releaseLock(client, key);
            }
            client.release();
        }
    }

    async cleanup() {
        const start = this.clock.now();
        await this.cleanupStuckImages();
        await this.cleanupTemporaryImages();
        await this.cleanupDeletedImages();
        await this.cleanupStripeSessions();
        const elapsed = this.clock.now().diff(start, "milliseconds");
        this.metrics.addMetric("backend.cleanup", 1, "count", {
            duration: elapsed,
        });
    }

    async isUserAdmin(user: string): Promise<boolean> {
        if (user.indexOf("@") !== -1) {
            user = hash(user);
        }
        const adminUsers = (this.config.adminUsers || []).map((u) => hash(u));
        return adminUsers.includes(user);
    }

    async isUserAllowed(email: string): Promise<boolean> {
        return true;
    }

    async getUser(id: string): Promise<User> {
        id = hash(id);
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM users WHERE id=$1`,
                [id]
            );
            if (result.rowCount === 0) {
                return null;
            }
            return result.rows[0];
        } finally {
            client.release();
        }
    }

    async saveCustomerId(userId: string, customerId: string): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query(
                `UPDATE users SET customer_id=$1 WHERE id=$2`,
                [customerId, userId]
            );
        } finally {
            client.release();
        }
    }

    async createUser(email: string): Promise<boolean> {
        const existingUser = await this.getUser(email);
        if (existingUser) {
            return false;
        }
        const client = await this.pool.connect();
        try {
            await client.query(
                `INSERT INTO users (id, email, active) VALUES ($1, $2, true)`,
                [hash(email), email]
            );
            await client.query(
                `INSERT INTO credits (user_id, free_credits, paid_credits) VALUES ($1, 100, 0)`,
                [hash(email)]
            );
            return true;
        } finally {
            client.release();
        }
    }

    async getCredits(userId: string): Promise<Credits> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `SELECT free_credits, paid_credits FROM credits WHERE user_id=$1`,
                [hash(userId)]
            );
            // This shouldn't be possible, but handle it gracefully if it does happen
            if (result.rowCount === 0) {
                Bugsnag.notify(
                    new Error(`Credits not found for user: ${userId}`)
                );
                return {
                    free_credits: 0,
                    paid_credits: 0,
                };
            }
            return result.rows[0];
        } finally {
            client.release();
        }
    }

    async deductCredits(userId: string, amount: number): Promise<void> {
        userId = hash(userId);
        // deduct credits from paid_credits first, then from free_credits
        // paid_credits and free_credits should never drop below 0
        const credits = await this.getCredits(userId);
        const client = await this.pool.connect();
        try {
            if (credits.paid_credits > 0) {
                const paidDeduction = Math.min(amount, credits.paid_credits);
                await client.query(
                    `UPDATE credits SET paid_credits = paid_credits - $1 WHERE user_id=$2`,
                    [paidDeduction, userId]
                );
                amount -= paidDeduction;
            }
            if (amount > 0 && credits.free_credits > 0) {
                const freeDeduction = Math.min(amount, credits.free_credits);
                await client.query(
                    `UPDATE credits SET free_credits = free_credits - $1 WHERE user_id=$2`,
                    [freeDeduction, userId]
                );
            }
        } finally {
            client.release();
        }
        // notify user of updated credits
        await this.notify(
            userId,
            JSON.stringify({
                type: NOTIFICATION_CREDITS_UPDATED,
            })
        );
    }

    async createDepositCode(
        input: CreateDepositCodeInput
    ): Promise<DepositCode> {
        // create random code
        const code = uuid.v4().replace(/-/g, "");
        const client = await this.pool.connect();
        try {
            await client.query(
                `INSERT INTO deposit_codes (code, amount, created_at) VALUES ($1, $2, $3)`,
                [code, input.amount, this.clock.now().valueOf()]
            );
            return {
                code,
                amount: input.amount,
            };
        } finally {
            client.release();
        }
    }

    async resetFreeCredits(): Promise<void> {
        await this.withLock(RESET_CREDITS_KEY, async () => {
            // check last event time
            const lastReset = await this.getLastEventTime(RESET_CREDITS_EVENT);
            // if last reset was more than 24 hours ago, reset credits
            if (lastReset < this.clock.now().subtract(1, "days").valueOf()) {
                const client = await this.pool.connect();
                try {
                    await client.query(`UPDATE credits SET free_credits=100`);
                } finally {
                    client.release();
                }
                await this.setLastEventTime(
                    RESET_CREDITS_EVENT,
                    this.clock.now().valueOf()
                );
            }
        });
    }

    async redeemDepositCode(code: string, userId: string): Promise<void> {
        userId = hash(userId);
        const client = await this.pool.connect();
        try {
            // delete expired deposit codes
            await client.query(
                `DELETE FROM deposit_codes WHERE created_at < $1`,
                [this.clock.now().subtract(DEPOSIT_CODE_DAYS, "days").valueOf()]
            );
            const result = await client.query(
                `SELECT * FROM deposit_codes WHERE code=$1`,
                [code]
            );
            if (result.rowCount === 0) {
                throw new Error("Invalid code");
            }
            const depositCode = result.rows[0] as DepositCode;
            await client.query(
                `UPDATE credits SET paid_credits = paid_credits + $1 WHERE user_id=$2`,
                [depositCode.amount, userId]
            );
            await client.query(`DELETE FROM deposit_codes WHERE code=$1`, [
                code,
            ]);
            await this.notify(
                userId,
                JSON.stringify({
                    type: NOTIFICATION_CREDITS_UPDATED,
                })
            );
        } finally {
            client.release();
        }
    }

    async depositCredits(userId: string, amount: number): Promise<void> {
        userId = hash(userId);
        const client = await this.pool.connect();
        try {
            await client.query(
                `UPDATE credits SET paid_credits = paid_credits + $1 WHERE user_id=$2`,
                [amount, userId]
            );
            await this.notify(
                userId,
                JSON.stringify({
                    type: NOTIFICATION_CREDITS_UPDATED,
                })
            );
        } finally {
            client.release();
        }
    }

    async handleStripeEvent(payload: any, signature: string): Promise<void> {
        const stripeEvent = this.stripeHelper.constructEvent(
            payload,
            signature,
        );
        if (stripeEvent.type === "checkout.session.completed") {
            const session = stripeEvent.data.object as Stripe.Checkout.Session;
            const userId = await this.getUserForStripeSession(session.id);
            if (!userId) {
                throw new Error("User not found");
            }
            const user = await this.getUser(userId);
            if (!user.customer_id) {
                await this.saveCustomerId(userId, session.customer as string);
            }
            const lineItems = await this.stripeHelper.listLineItems(session.id);
            for (const lineItem of lineItems.data) {
                const credits = calculateCredits(
                    lineItem.price.id,
                    lineItem.quantity
                );
                await this.depositCredits(userId, credits);
            }
            await this.deleteStripeSession(session.id);
        }
    }

    async getGlobalSettings(key: string): Promise<GlobalSettings> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM global_settings WHERE settings_key = $1`,
                [key]
            );
            if (result.rows.length === 0) {
                return {
                    settings_key: key,
                    settings_json: this.defaultGlobalSettings(key),
                };
            }
            return result.rows[0];
        } finally {
            client.release();
        }
    }

    private defaultGlobalSettings(key: string): any {
        switch (key) {
            case "workers":
                return {
                    minimum_worker_allocations: {
                        stable_diffusion: 0,
                        stable_diffusion_inpainting: 0,
                        swinir: 0,
                    },
                };
            default:
                return {};
        }
    }

    async updateGlobalSettings(
        key: string,
        settings_json: any
    ): Promise<GlobalSettings> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `INSERT INTO global_settings (settings_key, settings_json) VALUES ($1, $2) ON CONFLICT (settings_key) DO UPDATE SET settings_json = $2 RETURNING *`,
                [key, settings_json]
            );
            return result.rows[0];
        } finally {
            client.release();
        }
    }

    async createTemporaryImage(): Promise<TemporaryImage> {
        const tmpImageId = uuid.v4();
        const uploadUrl = await this.filestore.getUploadUrl(
            `tmp/${tmpImageId}.png`
        );
        return {
            id: tmpImageId,
            upload_url: uploadUrl,
        };
    }

    private async backfillUserEmail(email: string): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query(`UPDATE users SET email=$1 WHERE id=$2`, [
                email,
                hash(email),
            ]);
        } finally {
            client.release();
        }
    }

    async login(email: string, sendEmail = true): Promise<string> {
        if (!(await this.isUserAllowed(email))) {
            if (!(await this.isUserAllowed(email))) {
                this.metrics.addMetric("backend.login", 1, "count", {
                    status: "failed",
                    reason: "user_not_allowed",
                });
                throw new Error("User not allowed");
            }
        }
        // generate crypto random 6 digit code
        const code = uuid.v4().substring(0, 6).toUpperCase();
        // calculate expiration based on config.loginCodeExpirationSeconds
        const expiresAt = this.clock
            .now()
            .add(this.config.loginCodeExpirationSeconds, "seconds");
        // insert login_code
        const client = await this.pool.connect();
        try {
            await client.query(
                `INSERT INTO login_codes (code, user_email, expires_at) VALUES ($1, $2, $3)`,
                [code, email, expiresAt.toDate()]
            );
            if (sendEmail) {
                // send email with code
                const message: EmailMessage = {
                    from: this.config.smtpFrom,
                    to: email,
                    subject: "Login code",
                    text: `Your login code is ${code}`,
                };
                await this.sendMail(message);
            }
            this.metrics.addMetric("backend.login", 1, "count", {
                status: "success",
            });
            return code;
        } finally {
            client.release();
        }
    }

    async verify(code: string): Promise<Authentication> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM login_codes WHERE code=$1`,
                [code.toUpperCase()]
            );
            if (result.rows.length === 0) {
                this.logger.log("login code not found: " + code);
                return null;
            }
            const loginCode = result.rows[0] as LoginCode;
            // make sure loginCode isn't expired
            const now = this.clock.now();
            const expiresAt = moment(loginCode.expires_at);
            await client.query(`DELETE FROM login_codes WHERE code=$1`, [code]);
            if (now.isAfter(expiresAt)) {
                this.logger.log("code expired: " + code);
                this.metrics.addMetric("backend.verify", 1, "count", {
                    status: "failed",
                    reason: "code_expired",
                });
                return null;
            }

            // create user if they don't yet exist
            await this.createUser(loginCode.user_email);

            // generate auth tokens
            const auth = this.authHelper.createTokens(loginCode.user_email);
            this.backfillUserEmail(loginCode.user_email);
            this.metrics.addMetric("backend.verify", 1, "count", {
                status: "success",
            });
            return auth;
        } finally {
            client.release();
        }
    }

    async refresh(refreshToken: string): Promise<Authentication> {
        const user = this.authHelper.verifyToken(refreshToken, "refresh");
        if (!user) {
            return null;
        }
        return this.authHelper.createTokens(
            user.userId,
            user.serviceAccountConfig
        );
    }

    async discordLogin(code: string): Promise<Authentication> {
        const result = await axios.post(
            "https://discord.com/api/oauth2/token",
            new URLSearchParams({
                client_id: this.config.discordClientId,
                client_secret: this.config.discordClientSecret,
                code,
                grant_type: "authorization_code",
                redirect_uri: this.config.discordRedirectUri,
                scope: "identify email",
            }).toString(),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Accept: "application/json",
                },
            }
        );
        const discordLoginResult = result.data as any as DiscordLoginResult;
        if (discordLoginResult.access_token) {
            const result2 = await axios.get(
                "https://discord.com/api/users/@me",
                {
                    headers: {
                        Authorization: `Bearer ${discordLoginResult.access_token}`,
                    },
                }
            );
            const discordUser = result2.data as any as DiscordUser;
            if (
                discordUser.email &&
                (await this.isUserAllowed(discordUser.email))
            ) {
                await this.createUser(discordUser.email);
                return this.authHelper.createTokens(discordUser.email);
            }
        }
        return null;
    }

    // use this.stripeHelper to create a session, then store it in the database
    async createStripeSession(
        userId: string,
        input: CreateStripeSessionInput,
    ): Promise<string> {
        userId = hash(userId);
        const user = await this.getUser(userId);
        const sessionId = await this.stripeHelper.createCheckoutSession(
            input.product_id,
            input.success_url,
            input.cancel_url,
            user.customer_id || undefined,
        );
        const client = await this.pool.connect();
        try {
            await client.query(
                `INSERT INTO stripe_sessions (session_id, user_id, created_at) VALUES ($1, $2, $3)`,
                [sessionId, userId, this.clock.now().valueOf()]
            );
            return sessionId;
        } finally {
            client.release();
        }
    }

    async getUserForStripeSession(sessionId: string): Promise<string> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `SELECT user_id FROM stripe_sessions WHERE session_id=$1`,
                [sessionId]
            );
            if (result.rows.length === 0) {
                return null;
            }
            return result.rows[0].user_id as string;
        } finally {
            client.release();
        }
    }

    async deleteStripeSession(sessionId: string): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query(
                `DELETE FROM stripe_sessions WHERE session_id=$1`,
                [sessionId]
            );
        } finally {
            client.release();
        }
    }

    // clean up sessions that are more than 24 hours old
    async cleanupStripeSessions(): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query(
                `DELETE FROM stripe_sessions WHERE created_at < $1`,
                [this.clock.now().subtract(24, "hours").valueOf()]
            );
        } finally {
            client.release();
        }
    }

    // list databases for testing
    async listDatabases(): Promise<Array<string>> {
        const client = new Client();
        await client.connect();
        try {
            const result = await client.query(
                `SELECT datname FROM pg_database`
            );
            return result.rows.map((row) => row.datname as string);
        } finally {
            await client.end();
        }
    }

    // drop database for testing
    async dropDatabase(database: string): Promise<void> {
        const client = new Client();
        await client.connect();

        try {
            await client.query(`DROP DATABASE IF EXISTS "${database}"`);
        } finally {
            await client.end();
        }
    }

    async createDatabase(name: string): Promise<void> {
        const client = new Client();
        await client.connect();

        try {
            await client.query(`CREATE DATABASE "${name}"`);
        } finally {
            await client.end();
        }
    }

    async getFeatures(): Promise<FeatureList> {
        return {
            privacy_uri: process.env.PRIVACY_URI,
            terms_uri: process.env.TERMS_URI,
        };
    }

    async addMetrics(metrics: AddMetricsInput) {
        for (let item of metrics.metrics) {
            const attributes: any = {};
            for (let attr of item.attributes) {
                attributes[attr.name] = attr.value;
            }
            this.metrics.addMetric(
                item.name,
                item.value,
                item.type,
                attributes
            );
        }
    }
}
