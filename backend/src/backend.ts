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
    ImageStatusEnum,
    InviteCode,
    User,
    AddMetricsInput,
    UpdateImageInputStatusEnum,
    Worker,
    WorkerConfig,
    WorkerLoginCode,
    LoginResult,
    WorkerStatusEnum,
    Order,
    CreateOrderInput,
    ProcessImageInput,
    UpsertWorkerInput,
    WorkerGpuConfig,
    UpsertWorkerConfigInput,
    ImageUrls,
    Boost,
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

process.env.PGUSER = process.env.PGUSER || "postgres";

export const STUCK_IMAGES_KEY = 1;
export const TEMPORARY_IMAGES_KEY = 2;
export const DELETED_IMAGES_KEY = 3;
export const MIGRATIONS_KEY = 4;
export const SCALING_KEY = 5;
export const WORK_DISTRIBUTION_KEY = 6;
export const IDLE_BOOSTS_KEY = 7;

const BLOCK_DURATION_DAYS = 7;

export type NotificationListener = (payload: string) => void;

export const NOTIFICATION_IMAGE_UPDATED = "image_updated";
export const NOTIFICATION_IMAGE_DELETED = "image_deleted";
export const NOTIFICATION_PENDING_IMAGE = "pending_image";
export const NOTIFICATION_WORKER_CONFIG_UPDATED = "worker_config_updated";
export const NOTIFICATION_BOOST_UPDATED = "boost_updated";

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

    private notificationListeners: { [key: string]: NotificationListener[] } =
        {};

    constructor(
        private config: Config,
        private metrics: MetricsClient,
        private logger: Logger
    ) {
        this.authHelper = new AuthHelper(
            config,
            () => moment().valueOf(),
            logger
        );
        if (config.s3Bucket) {
            this.filestore = new S3Filestore(config.s3Bucket, config.s3Region);
        } else {
            this.filestore = new LocalFilestore(config.dataFolderName);
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
            lock = await this.acquireLock(client, 1);
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
                await this.releaseLock(client, 1);
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

        // emergency cleanup logic...
        // const images = await this.listImages({limit: 100000});
        // for (let image of images.images) {
        //     if (image.label == "cyborg harry potter") {
        //         console.log(`deleting ${image.id}`)
        //         await this.deleteImage(image.id)
        //     }
        // }
    }

    async destroy() {
        this.metrics.addMetric("backend.destroy", 1, "count", {
            status: "success",
        });
        await this.pool.end();
        await this.notificationsClient.end();
    }

    private hydrateImage(image: Image): Image {
        return {
            ...image,
            zoom_scale: parseFloat(image.zoom_scale || ("0.0" as any)),
            zoom_shift_x: parseFloat(image.zoom_shift_x || ("0.0" as any)),
            zoom_shift_y: parseFloat(image.zoom_shift_y || ("0.0" as any)),
            created_at: parseInt(image.created_at || ("0" as any)),
            updated_at: parseInt(image.updated_at || ("0" as any)),
        };
    }

    private hydrateWorker(worker: Worker): Worker {
        return {
            ...worker,
            created_at: parseInt(worker.created_at || ("0" as any)),
            last_ping: parseInt(worker.last_ping || ("0" as any)),
        };
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
        status?: ImageStatusEnum;
        cursor?: number;
        direction?: "asc" | "desc";
        limit?: number;
        filter?: string;
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
            // label is a string, phrases is a string list
            // if the filter is in either, return the image
            // TODO: refactor phrases to prompt
            whereClauses.push(
                `(label ILIKE $` +
                    (args.length + 1) +
                    ` OR prompt ILIKE $` +
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
        try {
            const result = await client.query(
                `SELECT i.* FROM images i, unnest(phrases) prompt ${whereClause} ORDER BY updated_at ${orderBy} LIMIT ${limit}`,
                args
            );
            // deduplicate images due to the unnest. Again, temporary until we refactor phrases to prompt
            const dedupedImages = result.rows.reduce(
                (acc: Image[], image: Image) => {
                    if (acc.find((i) => i.id === image.id)) {
                        return acc;
                    }
                    return [...acc, image];
                },
                []
            );
            return {
                images: dedupedImages.map((i: any) => this.hydrateImage(i)),
            };
        } finally {
            client.release();
        }
    }

    async getPendingImageScores(): Promise<PendingImages[]> {
        // aggregate images that are pending by model
        // calculate score as sum of (now - created_at) for each image
        const now = moment().valueOf();
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
        const imagePromise = this.filestore.getUploadUrl(`${id}.image.png`);
        const maskPromise = this.filestore.getUploadUrl(`${id}.mask.png`);
        const thumbnailPromise = this.filestore.getUploadUrl(
            `${id}.thumbnail.png`
        );

        return {
            image_url: await imagePromise,
            mask_url: await maskPromise,
            thumbnail_url: await thumbnailPromise,
        };
    }

    async getImageDownloadUrls(id: string): Promise<ImageUrls> {
        const imagePromise = this.filestore.getDownloadUrl(`${id}.image.png`);
        const maskPromise = this.filestore.getDownloadUrl(`${id}.mask.png`);
        const thumbnailPromise = this.filestore.getDownloadUrl(
            `${id}.thumbnail.png`
        );

        return {
            image_url: await imagePromise,
            mask_url: await maskPromise,
            thumbnail_url: await thumbnailPromise,
        };
    }

    async batchGetImages(userId: string, ids: string[]): Promise<Image[]> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM images WHERE created_by=$1 AND id=ANY($2)`,
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
        const now = moment().valueOf();
        // set deleted_at to now
        const client = await this.pool.connect();
        const image = await this.getImage(id);
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
                `${id}.image.png`,
                `${id}.thumbnail.png`,
                `${id}.mask.png`,
                `${id}.mp4`,
                `${id}.npy`,
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

    private async createThumbnail(encoded_image: string) {
        const thumbnail = await sharp(Buffer.from(encoded_image, "base64"))
            .resize(128, 128)
            .toBuffer()
            .then((buffer) => buffer.toString("base64"));
        return thumbnail;
    }

    private async createImage(
        createdBy: string,
        body: CreateImageInput
    ): Promise<Image> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `INSERT INTO images
                    (id, created_by, created_at, updated_at, label, parent, phrases, iterations, current_iterations, score, status, enable_video, enable_zoom, zoom_frequency, zoom_scale, zoom_shift_x, zoom_shift_y, model, glid_3_xl_skip_iterations, glid_3_xl_clip_guidance, glid_3_xl_clip_guidance_scale, width, height, uncrop_offset_x, uncrop_offset_y, negative_phrases, negative_score, stable_diffusion_strength, nsfw, temporary)
                VALUES
                    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
                RETURNING *`,
                [
                    uuid.v4(),
                    createdBy,
                    new Date().getTime(),
                    new Date().getTime(),
                    body.label,
                    body.parent,
                    body.phrases,
                    body.iterations,
                    0,
                    0,
                    body.status || "pending",
                    !!body.enable_video,
                    !!body.enable_zoom,
                    body.zoom_frequency || 10,
                    body.zoom_scale || 0.99,
                    body.zoom_shift_x || 0,
                    body.zoom_shift_y || 0,
                    body.model || "stable_diffusion_text2im",
                    body.glid_3_xl_skip_iterations || 0,
                    body.glid_3_xl_clip_guidance || false,
                    body.glid_3_xl_clip_guidance_scale || 150,
                    body.width || 256,
                    body.height || 256,
                    body.uncrop_offset_x || 0,
                    body.uncrop_offset_y || 0,
                    body.negative_phrases || [],
                    0,
                    body.stable_diffusion_strength || 0.75,
                    body.nsfw || false,
                    body.temporary || false,
                ]
            );
            const image = result.rows[0] as Image;
            let encoded_image = body.encoded_image;
            if (!encoded_image && body.parent) {
                try {
                    const parentImageData = await this.filestore.readBinaryFile(
                        `${body.parent}.image.png`
                    );
                    encoded_image = parentImageData.toString("base64");
                } catch (err) {
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
                        `${image.id}.image.png`,
                        binary_image
                    )
                );
                const encoded_thumbnail = await this.createThumbnail(
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
            let encoded_npy = body.encoded_npy;

            // if encoded_npy is set, save npy
            if (encoded_npy) {
                const binary_npy = Buffer.from(encoded_npy, "base64");
                promises.push(
                    this.filestore.writeFile(`${image.id}.npy`, binary_npy)
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

    async createImages(
        createdBy: string,
        body: CreateImageInput
    ): Promise<Array<Image>> {
        const promises: Array<Promise<Image>> = [];
        for (let i = 0; i < (body.count || 1); i++) {
            promises.push(this.createImage(createdBy, body));
        }
        return Promise.all(promises);
    }

    async updateImage(
        id: string,
        body: UpdateImageInput,
        workerId: string | null
    ): Promise<Image> {
        const existingImage = await this.getImage(id);
        if (!existingImage) {
            this.logger.log("Existing image not found: " + id);
            return null;
        }
        if (workerId && existingImage.worker_id != workerId) {
            this.logger.log(
                `Worker ${workerId} tried to update image ${id} but it is owned by ${existingImage.worker_id}`
            );
            return null;
        }
        let completed =
            existingImage.status !== ImageStatusEnum.Completed &&
            body.status === UpdateImageInputStatusEnum.Completed;
        // update existing image fields
        Object.keys(body).forEach((key) => {
            existingImage[key] = body[key];
        });

        let assignedWorkerId = existingImage.worker_id;
        if (body.status === UpdateImageInputStatusEnum.Completed) {
            assignedWorkerId = null;
        }
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `UPDATE images
                SET
                    label=$1,
                    current_iterations=$2,
                    phrases=$3,
                    status=$4,
                    updated_at=$5,
                    score=$6,
                    negative_score=$7,
                    nsfw=$8,
                    deleted_at=$9,
                    worker_id=$10
                WHERE id=$11 RETURNING *`,
                [
                    existingImage.label,
                    existingImage.current_iterations,
                    existingImage.phrases,
                    existingImage.status,
                    new Date().getTime(),
                    existingImage.score,
                    existingImage.negative_score,
                    existingImage.nsfw,
                    existingImage.deleted_at,
                    assignedWorkerId,
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
                const encoded_thumbnail = await this.createThumbnail(
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

    async blockWorker(workerId: string, engine: string, now: moment.Moment) {
        this.metrics.addMetric("backend.block_worker", 1, "count", {
            engine: engine,
        });
        // block for BLOCK_DURATION_DAYS
        const until = now.clone().add(BLOCK_DURATION_DAYS, "days").valueOf();
        const client = await this.pool.connect();
        try {
            // upsert - if exists, update until, otherwise insert
            await client.query(
                `INSERT INTO blocklist (id, engine, until)
                VALUES ($1, $2, $3)
                ON CONFLICT (id, engine) DO UPDATE SET until = $3`,
                [workerId, engine, until]
            );
        } finally {
            client.release();
        }
    }

    async listBlockedWorkerIds(
        engine: string,
        now: moment.Moment
    ): Promise<string[]> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `SELECT id FROM blocklist WHERE engine = $1 AND until > $2`,
                [engine, now.valueOf()]
            );
            return result.rows.map((row) => row.id);
        } finally {
            client.release();
        }
    }

    async isWorkerBlocked(
        workerId: string,
        engine: string,
        now: moment.Moment
    ): Promise<boolean> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `SELECT count(*) FROM blocklist WHERE id=$1 AND engine=$2 AND until > $3`,
                [workerId, engine, now.valueOf()]
            );
            const count = result.rows[0].count;
            return count > 0;
        } finally {
            client.release();
        }
    }

    async createWorker(displayName: string): Promise<Worker> {
        this.metrics.addMetric("backend.create_worker", 1, "count", {});
        const id = uuid.v4();
        const now = moment().valueOf();
        const login_code = "";
        const status = WorkerStatusEnum.Idle;
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `INSERT INTO workers (id, created_at, display_name, login_code, status) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [id, now, displayName, login_code, status]
            );
            return result.rows[0];
        } finally {
            client.release();
        }
    }

    async getWorkerConfig(workerId: string): Promise<WorkerConfig> {
        const worker = await this.getWorker(workerId);
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM worker_configs WHERE worker_id = $1`,
                [workerId]
            );
            if (result.rows.length === 0) {
                const gpuConfigs: WorkerGpuConfig[] = [];
                for (let i = 0; i < (worker.num_gpus || 1); i++) {
                    gpuConfigs.push({
                        gpu_num: i,
                        model: "stable_diffusion_text2im",
                    });
                }
                return {
                    worker_id: workerId,
                    gpu_configs: gpuConfigs,
                };
            }
            let cfg: any = result.rows[0];
            cfg = JSON.parse(cfg.config_json);
            return {
                worker_id: workerId,
                gpu_configs: cfg.gpu_configs,
            };
        } finally {
            client.release();
        }
    }

    async upsertWorkerConfig(
        workerId: string,
        config: UpsertWorkerConfigInput
    ): Promise<WorkerConfig> {
        const configJson = JSON.stringify({
            gpu_configs: config.gpu_configs,
        });
        const client = await this.pool.connect();
        try {
            await client.query(
                `INSERT INTO worker_configs (worker_id, config_json)
                VALUES ($1, $2)
                ON CONFLICT (worker_id) DO UPDATE SET config_json = $2`,
                [workerId, configJson]
            );
            this.notify(
                workerId,
                JSON.stringify({
                    type: NOTIFICATION_WORKER_CONFIG_UPDATED,
                })
            );
            return {
                worker_id: workerId,
                gpu_configs: config.gpu_configs,
            };
        } finally {
            client.release();
        }
    }

    async listWorkers(): Promise<Worker[]> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`SELECT * FROM workers`);
            return result.rows.map((row) => this.hydrateWorker(row));
        } finally {
            client.release();
        }
    }

    async getWorker(workerId: string): Promise<Worker> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM workers WHERE id = $1`,
                [workerId]
            );
            if (result.rows.length === 0) {
                return null;
            }
            return this.hydrateWorker(result.rows[0]);
        } finally {
            client.release();
        }
    }

    async updateWorker(
        workerId: string,
        upsertWorkerInput: UpsertWorkerInput
    ): Promise<Worker> {
        const existingWorker = await this.getWorker(workerId);
        upsertWorkerInput.display_name =
            upsertWorkerInput.display_name || existingWorker.display_name;
        upsertWorkerInput.status =
            upsertWorkerInput.status || existingWorker.status;
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `UPDATE workers SET display_name = $1, status=$2, last_ping=$3 WHERE id = $4 RETURNING *`,
                [
                    upsertWorkerInput.display_name,
                    upsertWorkerInput.status,
                    moment().valueOf(),
                    workerId,
                ]
            );

            return result.rows[0];
        } finally {
            client.release();
        }
    }

    async updateWorkerDeploymentInfo(
        workerId: string,
        engine: string,
        numGpus: number,
        cloudInstanceId: string,
        gpuType: string
    ): Promise<Worker> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `UPDATE workers SET engine = $1, num_gpus = $2, cloud_instance_id = $3, gpu_type = $4 WHERE id = $5 RETURNING *`,
                [engine, numGpus, cloudInstanceId, gpuType, workerId]
            );
            return result.rows[0];
        } finally {
            client.release();
        }
    }

    async deleteWorker(workerId: string): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query(`DELETE FROM workers WHERE id = $1`, [workerId]);
        } finally {
            client.release();
        }
    }

    async generateWorkerLoginCode(workerId: string): Promise<WorkerLoginCode> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM workers WHERE id = $1`,
                [workerId]
            );
            if (result.rows.length === 0) {
                return null;
            }
            const worker = result.rows[0];
            const login_code = uuid.v4();
            await client.query(
                `UPDATE workers SET login_code = $1 WHERE id = $2`,
                [login_code, workerId]
            );
            // return result2.rows[0]
            return {
                login_code: login_code,
            };
        } finally {
            client.release();
        }
    }

    async loginAsWorker(loginCode: string): Promise<Authentication> {
        // validate that loginCode is a uuid
        if (!uuid.validate(loginCode)) {
            this.metrics.addMetric("backend.login_as_worker", 1, "count", {
                status: "invalid_login_code",
            });
            return null;
        }

        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM workers WHERE login_code = $1`,
                [loginCode]
            );
            if (result.rows.length === 0) {
                this.metrics.addMetric("backend.login_as_worker", 1, "count", {
                    status: "login_code_not_found",
                });
                return null;
            }
            const worker = result.rows[0];
            // generate auth tokens
            const auth = this.authHelper.createTokens(worker.id, {
                workerId: worker.id,
                type: "public",
            });
            // blank out login code
            await client.query(
                `UPDATE workers SET login_code = '' WHERE id = $1`,
                [worker.id]
            );
            this.metrics.addMetric("backend.login_as_worker", 1, "count", {
                status: "success",
            });
            return auth;
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

    private async getUsersWithPendingImages(
        model: string | null
    ): Promise<Array<string>> {
        const args = [];
        const client = await this.pool.connect();
        let filter = " AND deleted_at IS NULL";
        if (model) {
            filter = "AND deleted_at IS NULL AND model = $1 ";
            args.push(model);
        }
        try {
            const result = await client.query(
                `SELECT DISTINCT created_by FROM images WHERE status='pending'${filter}`,
                args
            );
            return result.rows.map((row) => row.created_by);
        } finally {
            client.release();
        }
    }

    async processImage(
        user: string,
        input: ProcessImageInput | null,
        workerId: string | null
    ): Promise<Image> {
        // get all users with pending images
        const users = await this.getUsersWithPendingImages(input?.model);
        // if there are no users, return null
        if (users.length === 0) {
            return null;
        }

        if (!user) {
            // get random user
            const boosts = await this.listActiveBoosts();
            const paidUsers: string[] = [];
            for (let boost of boosts) {
                if (users.indexOf(boost.user_id) !== -1) {
                    for (let i = 0; i < boost.level; i++) {
                        paidUsers.push(boost.user_id);
                    }
                }
            }
            // 50/50 split between paid and free pool
            if (Math.random() < 0.5 && paidUsers.length > 0) {
                user = paidUsers[Math.floor(Math.random() * paidUsers.length)];
            } else {
                user = users[Math.floor(Math.random() * users.length)];
            }
        }
        const args = [user];
        let filter = " AND deleted_at IS NULL";
        if (input?.model) {
            filter = " AND model = $2 AND deleted_at IS NULL";
            args.push(input?.model);
        }

        // get random image from user
        const client = await this.pool.connect();
        try {
            if (!input?.peek) {
                // begin transaction
                await client.query("BEGIN");
            }

            const result = await client.query(
                `SELECT * FROM images WHERE created_by=$1 AND status='pending'${filter} ORDER BY created_at ASC LIMIT 1`,
                args
            );
            if (result.rows.length === 0) {
                return null;
            }
            const image = result.rows[0];
            if (!input?.peek) {
                // update image status to "processing"
                await client.query(
                    `UPDATE images SET status='processing', updated_at=$2, worker_id=$3 WHERE id=$1`,
                    [image.id, new Date().getTime(), workerId]
                );
                // commit transaction
                await client.query("COMMIT");
            }
            return this.hydrateImage({
                ...image,
                status: input?.peek ? "pending" : "processing",
            });
        } catch (err) {
            if (!input?.peek) {
                await client.query("ROLLBACK");
            }
        } finally {
            client.release();
        }
        return null;
    }

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
                `SELECT * FROM images WHERE temporary=true AND created_at < $1`,
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
                `SELECT * FROM images WHERE deleted_at < $1`,
                [moment().subtract(1, "days").valueOf()]
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
        try {
            const lock = await this.acquireLock(client, key);
            if (!lock) {
                return;
            }
            await fn();
        } finally {
            await this.releaseLock(client, key);
            client.release();
        }
    }

    async cleanup() {
        const start = moment();
        await this.cleanupStuckImages();
        await this.cleanupTemporaryImages();
        await this.cleanupDeletedImages();
        await this.cleanupIdleBoosts();
        const elapsed = moment().diff(start, "milliseconds");
        this.metrics.addMetric("backend.cleanup", 1, "count", {
            duration: elapsed,
        });
    }

    async updateVideoData(id: string, videoData: Buffer) {
        // write video data to mp4 file
        this.logger.log(`writing video data to ${id}.mp4`);
        const image = await this.getImage(id);
        await this.filestore.writeFile(
            `${id}.mp4`,
            videoData,
            image.label.replace(" ", "_") + ".mp4"
        );
    }

    async getVideoData(id: string): Promise<Buffer> {
        // read video data from mp4 file
        // return null if file does not exist
        try {
            return await this.filestore.readBinaryFile(`${id}.mp4`);
        } catch (err) {
            return null;
        }
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

    async createInviteCode(): Promise<InviteCode> {
        const client = await this.pool.connect();
        try {
            const id = (uuid.v4() + uuid.v4()).replace(/-/g, "");
            await client.query(
                `INSERT INTO invite_codes(id, created_at) VALUES($1, $2)`,
                [id, moment().valueOf()]
            );
            return {
                id,
            };
        } finally {
            client.release();
        }
    }

    async deleteExpiredInviteCodes(): Promise<void> {
        // lifespan is 7 days
        const client = await this.pool.connect();
        try {
            await client.query(
                `DELETE FROM invite_codes WHERE created_at < $1`,
                [moment().subtract(7, "days").valueOf()]
            );
        } finally {
            client.release();
        }
    }

    // this is only for testing
    async createUser(email: string): Promise<boolean> {
        const existingUser = await this.getUser(hash(email));
        if (existingUser) {
            return false;
        }
        const client = await this.pool.connect();
        try {
            await client.query(
                `INSERT INTO users (id, email, active) VALUES ($1, $2, false)`,
                [hash(email), email]
            );
            return true;
        } finally {
            client.release();
        }
    }

    private hydrateBoost(row: any): Boost {
        return {
            user_id: row.user_id,
            activated_at: parseInt(row.activated_at),
            balance: parseInt(row.balance),
            level: parseInt(row.level),
            is_active: row.is_active,
        };
    }

    async getBoost(user_id: string): Promise<Boost> {
        // default is activated_at=0, balance=0, level=0
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM boost WHERE user_id=$1`,
                [hash(user_id)]
            );
            if (result.rowCount === 0) {
                return {
                    user_id,
                    activated_at: 0,
                    balance: 0,
                    level: 1,
                    is_active: false,
                };
            }
            return this.hydrateBoost(result.rows[0]);
        } finally {
            client.release();
        }
    }

    private async saveBoost(boost: Boost): Promise<Boost> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `INSERT INTO boost (user_id, activated_at, balance, level, is_active) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) DO UPDATE SET level = $4, balance = $3, activated_at = $2, is_active = $5 RETURNING *`,
                [
                    hash(boost.user_id),
                    boost.activated_at,
                    boost.balance,
                    boost.level,
                    boost.is_active,
                ]
            );
            return this.hydrateBoost(result.rows[0]);
        } finally {
            client.release();
        }
    }

    private async updateBoostBalance(boost: Boost): Promise<Boost> {
        console.log("existing boost is active");
        boost.balance -=
            (moment().valueOf() - boost.activated_at) * boost.level;
        if (boost.balance <= 0) {
            boost.balance = 0;
            boost.is_active = false;
        }
        return await this.saveBoost(boost);
    }

    async depositBoost(
        user_id: string,
        amount: number,
        level: number,
        activate = true
    ): Promise<Boost> {
        let existingBoost = await this.getBoost(user_id);
        if (existingBoost.is_active) {
            // force balance deduction before potentially changing level
            existingBoost = await this.updateBoostBalance(existingBoost);
        }
        let activatedAt = existingBoost.activated_at;
        if (activate) {
            activatedAt = moment().valueOf();
        }
        // upsert
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `INSERT INTO boost (user_id, activated_at, balance, level, is_active) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) DO UPDATE SET activated_at = $2, balance = boost.balance + $3, level = $4, is_active = $5 RETURNING *`,
                [hash(user_id), activatedAt, amount, level, activate]
            );
            await this.notify(
                existingBoost.user_id,
                JSON.stringify({
                    type: NOTIFICATION_BOOST_UPDATED,
                })
            );
            return this.hydrateBoost(result.rows[0]);
        } finally {
            client.release();
        }
    }

    async listActiveBoosts(): Promise<Boost[]> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `SELECT * FROM boost WHERE is_active AND $1 - activated_at < balance`,
                [moment().valueOf()]
            );
            return result.rows.map((row: any) => this.hydrateBoost(row));
        } finally {
            client.release();
        }
    }

    async updateBoost(
        user_id: string,
        level: number,
        isActive: boolean,
        cooldownCheck = true
    ): Promise<Boost> {
        // if level > 0, activated_at must be at least 10 minutes in the past
        // if level > 0, set activated_at to now
        let existingBoost = await this.getBoost(user_id);
        if (
            cooldownCheck &&
            moment().valueOf() - existingBoost.activated_at < 10 * 60 * 1000 &&
            isActive
        ) {
            if (!existingBoost.is_active) {
                throw new UserError("Cannot activate boost yet");
            }
            if (level !== existingBoost.level) {
                throw new UserError("Cannot change boost level yet");
            }
        }

        // if existing is active deduct balance
        if (existingBoost.is_active) {
            existingBoost = await this.updateBoostBalance(existingBoost);
        }
        if (isActive && existingBoost.balance === 0) {
            throw new UserError("Cannot activate boost with zero balance");
        }
        let activatedAt = existingBoost.activated_at;
        if (
            isActive &&
            (!existingBoost.is_active || level != existingBoost.level)
        ) {
            activatedAt = moment().valueOf();
        }
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                `INSERT INTO boost (user_id, activated_at, balance, level, is_active) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) DO UPDATE SET level = $4, balance = $3, activated_at = $2, is_active = $5 RETURNING *`,
                [
                    hash(user_id),
                    activatedAt,
                    existingBoost.balance,
                    level,
                    isActive,
                ]
            );
            await this.notify(
                existingBoost.user_id,
                JSON.stringify({
                    type: NOTIFICATION_BOOST_UPDATED,
                })
            );
            return this.hydrateBoost(result.rows[0]);
        } finally {
            client.release();
        }
    }

    async cleanupIdleBoosts(): Promise<void> {
        // list the active boosts, then
        // check if the boost owner has created any images in
        // the last 15 minutes. If not, deactivate the boost
        const activeBoosts = await this.listActiveBoosts();
        if (activeBoosts.length === 0) {
            return;
        }
        const client = await this.pool.connect();
        let lock = false;
        try {
            lock = await this.acquireLock(client, IDLE_BOOSTS_KEY);
            if (!lock) {
                return;
            }
            const userIds = activeBoosts.map((boost) => boost.user_id);
            const result = await client.query(
                `SELECT created_by, COUNT(*) FROM images WHERE created_by = ANY($1) AND created_at > $2 GROUP BY created_by`,
                [userIds, moment().valueOf() - 15 * 60 * 1000]
            );
            const activeUserIds = result.rows.map((row: any) => row.created_by);
            const inactiveBoosts = activeBoosts.filter(
                (boost) => !activeUserIds.includes(boost.user_id)
            );
            if (inactiveBoosts.length === 0) {
                return;
            }
            for (let boost of inactiveBoosts) {
                this.logger.log("deactivating boost");
                await this.updateBoost(
                    boost.user_id,
                    boost.level,
                    false,
                    false
                );
            }
        } finally {
            if (lock) {
                await this.releaseLock(client, IDLE_BOOSTS_KEY);
            }
            client.release();
        }
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

    async login(
        email: string,
        sendEmail = true
    ): Promise<string> {
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
        const expiresAt = moment().add(
            this.config.loginCodeExpirationSeconds,
            "seconds"
        );
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
                [code]
            );
            if (result.rows.length === 0) {
                this.logger.log("login code not found: " + code);
                return null;
            }
            const loginCode = result.rows[0] as LoginCode;
            // make sure loginCode isn't expired
            const now = moment();
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

    async createServiceAccountCreds(userId: string, cfg: ServiceAccountConfig) {
        // some day this probably will create a database entry so the creds
        // can be revoked
        return this.authHelper.createTokens(userId, cfg);
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
