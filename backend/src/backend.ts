import { Client, Pool } from "pg"
import os from "os";
import { createDb, migrate } from "postgres-migrations"
import * as uuid from "uuid"
import moment from "moment"
import nodemailer from "nodemailer";
import sharp from "sharp";
import { hash } from "./auth";

import {
    FeatureList,
    ImageList,
    Image,
    CreateImageInput,
    CreateWorkflowInput,
    UpdateImageInput,
    ImageStatusEnum,
    InviteCode,
    SuggestionSeed,
    SuggestionSeedInput,
    SuggestionSeedList,
    SuggestionsJob,
    SuggestionsJobList,
    SuggestionsJobStatusEnum,
    CreateSuggestionsJobInput,
    UpdateSuggestionsJobInput,
    UpdateSuggestionsJobInputStatusEnum,
    CreateSvgJobInput,
    SvgJob,
    SvgJobStatusEnum,
    UpdateSvgJobInput,
    UpdateWorkflowInput,
    User,
    Workflow,
    WorkflowList,
} from "./client/api"
import { sleep } from "./sleep"
import { EmailMessage } from "./email_message"
import { Config } from "./config"
import { Authentication, AuthHelper, ServiceAccountConfig } from "./auth";
import { LoginCode } from "./model"
import { Filestore, S3Filestore, LocalFilestore } from "./filestore";

process.env.PGUSER = process.env.PGUSER || "postgres"

export class BackendService {

    private pool: Pool
    private authHelper: AuthHelper;
    private filestore: Filestore;

    constructor(private config: Config) {
        this.authHelper = new AuthHelper(config)
        if (config.s3Bucket) {
            this.filestore = new S3Filestore(config.s3Bucket, config.s3Region)
        } else {
            this.filestore = new LocalFilestore(config.dataFolderName)
        }
    }

    private async sendMail(message: EmailMessage): Promise<void> {
        const transporter = nodemailer.createTransport({
            host: this.config.smtpHost,
            port: this.config.smtpPort,
            secure: !!this.config.smtpUser,
            auth: this.config.smtpUser && {
                user: this.config.smtpUser,
                pass: this.config.smtpPassword
            }
        });
        const mailOptions = {
            from: this.config.smtpFrom,
            to: message.to,
            subject: message.subject,
            text: message.text
        };
        await transporter.sendMail(mailOptions);
    }

    public async init(): Promise<void> {
        // check for DATABASE_URL env var, set it on config if it's populated
        if (process.env.DATABASE_URL) {
            this.config.databaseUrl = process.env.DATABASE_URL
        }
        try {
            // migrate
            const client = new Client({
                connectionString: this.config.databaseUrl,
                ssl: this.config.databaseSsl && { rejectUnauthorized: false },
                keepAlive: false,
            })
            await client.connect()
            await migrate({ client }, "./src/migrations")
            await client.end()
            await sleep(100)
        } catch (error) {
            console.error(error)
            throw error
        }

        this.pool = new Pool({
            connectionString: this.config.databaseUrl,
            ssl: this.config.databaseSsl && { rejectUnauthorized: false },
        })

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
        await this.pool.end()
    }


    private hydrateImage(image: Image): Image {
        return {
            ...image,
            zoom_scale: parseFloat(image.zoom_scale || "0.0" as any),
            zoom_shift_x: parseFloat(image.zoom_shift_x || "0.0" as any),
            zoom_shift_y: parseFloat(image.zoom_shift_y || "0.0" as any),
        }
    }

    // list images
    async listImages(query: { userId?: string, status?: ImageStatusEnum, cursor?: number, direction?: "asc" | "desc", limit?: number }): Promise<ImageList> {
        const client = await this.pool.connect()
        let whereClauses = [];
        let args = [];

        if (query.userId) {
            whereClauses.push("created_by=$" + (args.length + 1))
            args.push(query.userId)
        }
        if (query.status) {
            whereClauses.push("status=$" + (args.length + 1))
            args.push(query.status)
        }
        if (query.cursor) {
            // cursor references updated_at
            // if direction is asc, find all images with updated_at >= cursor
            // if direction is desc, find all images with updated_at <= cursor
            whereClauses.push(`updated_at ${query.direction === "asc" ? ">=" : "<="} $` + (args.length + 1))
            args.push(query.cursor)
        }
        let whereClause = "";
        if (whereClauses.length > 0) {
            whereClause = "WHERE " + whereClauses.join(" AND ")
        }
        const limit = query.limit || 100;
        const orderBy = query.direction === "asc" ? "ASC" : "DESC";
        try {
            const result = await client.query(
                `SELECT * FROM images ${whereClause} ORDER BY updated_at ${orderBy} LIMIT ${limit}`,
                args
            )
            return {
                images: result.rows.map(i => this.hydrateImage(i))
            }
        } finally {
            client.release()
        }
    }

    // get image by id
    async getImage(id: string): Promise<Image> {
        const client = await this.pool.connect()
        try {
            const result = await client.query(
                `SELECT * FROM images WHERE id=$1`,
                [id]
            )
            const imageData = result.rows[0]
            if (!imageData) {
                return null
            }
            return this.hydrateImage({
                ...imageData,
            })
        } finally {
            client.release()
        }
    }

    // get image data
    async getImageData(id: string): Promise<Buffer> {
        try {
            // load image data from file and convert from base64 to buffer
            const image = await this.filestore.readBinaryFile(`${id}.image.jpg`)
            return image
        } catch (err) {
            console.error(err)
            return null
        }
    }

    // get thumbnail data
    async getThumbnailData(id: string): Promise<Buffer> {
        if (await this.filestore.exists(`${id}.thumbnail.jpg`)) {
            try {
                // load image data from file and convert from base64 to buffer
                const thumbnail = await this.filestore.readBinaryFile(`${id}.thumbnail.jpg`)
                return thumbnail
            } catch (err) {
                console.error(err)
            }
        }
        return null
    }

    // get .npy data
    async getNpyData(id: string): Promise<Buffer> {
        if (await this.filestore.exists(`${id}.npy`)) {
            try {
                // load image data from file and convert from base64 to buffer
                const npy = await this.filestore.readBinaryFile(`${id}.npy`)
                return npy
            } catch (err) {
                console.error(err)
            }
        }
        return null
    }

    async getMaskData(id: string) {
        if (await this.filestore.exists(`${id}.mask.jpg`)) {
            try {
                // load image data from file and convert from base64 to buffer
                const mask = this.filestore.readBinaryFile(`${id}.mask.jpg`)
                return mask
            } catch (err) {
                console.error(err)
            }
        }
        return null
    }

    // delete image
    async deleteImage(id: string): Promise<void> {
        const client = await this.pool.connect()
        try {
            await client.query(
                `DELETE FROM images WHERE id=$1`,
                [id]
            )
            const filesToCheck = [
                `${id}.image.jpg`,
                `${id}.thumbnail.jpg`,
                `${id}.mask.jpg`,
                `${id}.mp4`,
                `${id}.npy`,
            ]
            const checkPromises = filesToCheck.map(file => this.filestore.exists(file))
            const exists = await Promise.all(checkPromises)
            const deletePromises = []
            for (let i = 0; i < exists.length; i++) {
                if (exists[i]) {
                    deletePromises.push(this.filestore.deleteFile(filesToCheck[i]))
                }
            }
            await Promise.all(deletePromises)
        } finally {
            client.release()
        }
    }

    private async createThumbnail(encoded_image: string) {
        const thumbnail = await sharp(Buffer.from(encoded_image, "base64"))
            .resize(128, 128)
            .toBuffer()
            .then(buffer => buffer.toString("base64"));
        return thumbnail
    }

    async createImage(createdBy: string, body: CreateImageInput): Promise<Image> {
        const client = await this.pool.connect()
        try {
            const result = await client.query(
                `INSERT INTO images
                    (id, created_by, created_at, updated_at, label, parent, phrases, iterations, current_iterations, score, status, enable_video, enable_zoom, zoom_frequency, zoom_scale, zoom_shift_x, zoom_shift_y, model, glid_3_xl_skip_iterations, glid_3_xl_clip_guidance, glid_3_xl_clip_guidance_scale, width, height, uncrop_offset_x, uncrop_offset_y, negative_phrases, negative_score)
                VALUES
                    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
                RETURNING *`,
                [uuid.v4(), createdBy, new Date().getTime(), new Date().getTime(), body.label, body.parent, body.phrases, body.iterations, 0, 0, "pending", !!body.enable_video, !!body.enable_zoom, body.zoom_frequency || 10, body.zoom_scale || 0.99, body.zoom_shift_x || 0, body.zoom_shift_y || 0, body.model || "vqgan_imagenet_f16_16384", body.glid_3_xl_skip_iterations || 0, body.glid_3_xl_clip_guidance || false, body.glid_3_xl_clip_guidance_scale || 150, body.width || 256, body.height || 256, body.uncrop_offset_x || 0, body.uncrop_offset_y || 0, body.negative_phrases || [], 0]
            )
            const image = result.rows[0] as Image
            let encoded_image = body.encoded_image;
            if (!encoded_image && body.parent) {
                try {
                    const parentImageData = await this.filestore.readBinaryFile(`${body.parent}.image.jpg`)
                    encoded_image = parentImageData.toString("base64")
                } catch (err) {
                    console.error(`error loading parent image data for ${image.id} (parent=${body.parent})`, err)
                }
            }
            const promises: Promise<void>[] = []
            // if encoded_image is set, save image
            if (encoded_image) {
                const binary_image = Buffer.from(encoded_image, "base64")
                promises.push(this.filestore.writeFile(`${image.id}.image.jpg`, binary_image))
                const encoded_thumbnail = await this.createThumbnail(encoded_image)
                const binary_thumbnail = Buffer.from(encoded_thumbnail, "base64")
                promises.push(this.filestore.writeFile(`${image.id}.thumbnail.jpg`, binary_thumbnail))
            }
            let encoded_npy = body.encoded_npy;

            // if encoded_npy is set, save npy
            if (encoded_npy) {
                const binary_npy = Buffer.from(encoded_npy, "base64")
                promises.push(this.filestore.writeFile(`${image.id}.npy`, binary_npy))
            }

            let encoded_mask = body.encoded_mask;

            // if encoded_mask is set, save mask
            if (encoded_mask) {
                const binary_mask = Buffer.from(encoded_mask, "base64")
                promises.push(this.filestore.writeFile(`${image.id}.mask.jpg`, binary_mask))
            }
            await Promise.all(promises)
            return this.hydrateImage({
                ...image,
            })
        } finally {
            client.release()
        }
    }

    async updateImage(id: string, body: UpdateImageInput): Promise<Image> {
        const existingImage = await this.getImage(id)
        if (!existingImage) {
            console.log("Existing image not found: " + id)
            return null
        }
        // update existing image fields
        Object.keys(body).forEach(key => {
            existingImage[key] = body[key]
        })

        const client = await this.pool.connect()
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
                    negative_score=$7
                WHERE id=$8 RETURNING *`,
                [
                    existingImage.label,
                    existingImage.current_iterations,
                    existingImage.phrases,
                    existingImage.status,
                    new Date().getTime(),
                    existingImage.score,
                    existingImage.negative_score,
                    id
                ]
            )

            const image = result.rows[0]
            const promises: Promise<void>[] = []
            // if encoded_image is set, save it
            if (body.encoded_image) {
                const binaryImage = Buffer.from(body.encoded_image, "base64")
                promises.push(this.filestore.writeFile(`${image.id}.image.jpg`, binaryImage))
                const encoded_thumbnail = await this.createThumbnail(body.encoded_image)
                const binaryThumbnail = Buffer.from(encoded_thumbnail, "base64")
                promises.push(this.filestore.writeFile(`${image.id}.thumbnail.jpg`, binaryThumbnail))
            }
            if (body.encoded_npy) {
                const binaryNpy = Buffer.from(body.encoded_npy, "base64")
                promises.push(this.filestore.writeFile(`${image.id}.npy`, binaryNpy))
            }
            await Promise.all(promises)
            return this.hydrateImage({
                ...image,
            })
        } finally {
            client.release()
        }
    }

    private async getUsersWithPendingImages(zoomSupported: boolean): Promise<Array<string>> {
        const client = await this.pool.connect()
        let filter = "";
        if (!zoomSupported) {
            filter = " AND enable_zoom=false"
        }
        try {
            const result = await client.query(
                `SELECT DISTINCT created_by FROM images WHERE status='pending'${filter}`
            )
            return result.rows.map(row => row.created_by)
        } finally {
            client.release()
        }
    }

    async processImage(zoomSupported: boolean, user?: string): Promise<Image> {
        let filter = "";
        if (!zoomSupported) {
            filter = " AND enable_zoom=false"
        }
        // get all users with pending images
        const users = await this.getUsersWithPendingImages(zoomSupported)
        // if there are no users, return null
        if (users.length === 0) {
            return null
        }
        if (!user) {
            // get random user
            user = users[Math.floor(Math.random() * users.length)]
        }

        // get random image from user
        const client = await this.pool.connect()
        try {
            // begin transaction
            await client.query("BEGIN")
            const result = await client.query(
                `SELECT * FROM images WHERE created_by=$1 AND status='pending'${filter} ORDER BY created_at ASC LIMIT 1`,
                [user]
            )
            if (result.rows.length === 0) {
                return null;
            }
            const image = result.rows[0]
            // update image status to "processing"
            await client.query(
                `UPDATE images SET status='processing', updated_at=$2 WHERE id=$1`,
                [image.id, new Date().getTime()]
            )
            // commit transaction
            await client.query("COMMIT")
            return this.hydrateImage({
                ...image,
                status: "processing",
            })
        } catch (err) {
            await client.query("ROLLBACK")
        } finally {
            client.release()
        }
        return null
    }

    // for all images with status "processing" that have not been updated in more than 5 minutes,
    // update status to "pending"
    async cleanupStuckImages(): Promise<void> {
        const client = await this.pool.connect()
        try {
            const result = await client.query(
                `UPDATE images SET status='pending', updated_at=$2 WHERE status='processing' AND updated_at < $1`,
                [new Date().getTime() - (60 * 60 * 1000), new Date().getTime()]
            )
            // if any images were updated, log the number
            if (result.rowCount > 0) {
                console.log(`Cleaning up stuck images: ${result.rowCount} images updated to "pending"`)
            }
        } finally {
            client.release()
        }
    }


    async updateVideoData(id: string, videoData: Buffer) {
        // write video data to mp4 file
        console.log(`writing video data to ${id}.mp4`)
        const image = await this.getImage(id)
        await this.filestore.writeFile(`${id}.mp4`, videoData, image.label.replace(" ", "_") + ".mp4")
    }

    async getVideoData(id: string): Promise<Buffer> {
        // read video data from mp4 file
        // return null if file does not exist
        try {
            return await this.filestore.readBinaryFile(`${id}.mp4`)
        } catch (err) {
            return null
        }
    }



    async listSuggestionSeeds(user: string): Promise<SuggestionSeedList> {
        const client = await this.pool.connect()
        try {
            const result = await client.query(
                `SELECT * FROM suggestion_seeds WHERE created_by=$1`,
                [user]
            )
            return {
                suggestionSeeds: result.rows
            }
        } finally {
            client.release()
        }
    }

    async createSuggestionSeed(user: string, body: SuggestionSeedInput): Promise<SuggestionSeed> {
        const client = await this.pool.connect()
        try {
            const result = await client.query(
                `INSERT INTO suggestion_seeds (id, created_by, name, description, items) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [uuid.v4(), user, body.name, body.description, body.items]
            )
            return result.rows[0]
        } finally {
            client.release()
        }
    }

    // get suggestion seed by id
    async getSuggestionSeed(id: string, userId: string): Promise<SuggestionSeed> {
        const client = await this.pool.connect()
        let filter = "";
        let args = [id]
        if (userId) {
            filter = ` AND created_by=$2`
            args.push(userId)
        }
        try {
            const result = await client.query(
                `SELECT * FROM suggestion_seeds WHERE id=$1${filter}`,
                args
            )
            // if no suggestion seed found, return null
            if (result.rowCount === 0) {
                return null
            }
            return result.rows[0]
        } finally {
            client.release()
        }
    }

    // update suggestion seed (name, description)
    async updateSuggestionSeed(id: string, userId: string, body: SuggestionSeedInput): Promise<SuggestionSeed> {
        const client = await this.pool.connect()
        try {
            const result = await client.query(
                `UPDATE suggestion_seeds SET name=$1, description=$2, items=$3 WHERE id=$4 AND created_by=$5 RETURNING *`,
                [body.name, body.description, body.items, id, userId]
            )
            // if no suggestion seed found, return null
            if (result.rowCount === 0) {
                return null
            }
            return result.rows[0]
        } finally {
            client.release()
        }
    }

    async deleteSuggestionSeed(id: string, user: string): Promise<boolean> {
        const client = await this.pool.connect()
        try {
            const result = await client.query(
                `DELETE FROM suggestion_seeds WHERE id=$1 AND created_by=$2`,
                [id, user]
            )
            return result.rowCount > 0
        } finally {
            client.release()
        }
    }

    // list suggestions jobs
    async listSuggestionsJobs(user: string): Promise<SuggestionsJobList> {
        const client = await this.pool.connect()
        try {
            const result = await client.query(
                `SELECT * FROM suggestions_jobs WHERE created_by=$1`,
                [user]
            )
            return {
                suggestionsJobs: result.rows
            }
        } finally {
            client.release()
        }
    }

    // create suggestions job
    async createSuggestionsJob(user: string, body: CreateSuggestionsJobInput): Promise<SuggestionsJob> {
        const client = await this.pool.connect()
        const now = moment().valueOf()
        try {
            const result = await client.query(
                `INSERT INTO suggestions_jobs (id, created_by, created_at, updated_at, seed_id, status, result) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                [uuid.v4(), user, now, now, body.seed_id, "pending", []]
            )
            return result.rows[0]
        } finally {
            client.release()
        }
    }

    // get suggestions job by id
    async getSuggestionsJob(id: string, userId?: string): Promise<SuggestionsJob> {
        const client = await this.pool.connect()
        try {
            let query = `SELECT * FROM suggestions_jobs WHERE id=$1`
            let args = [id]
            if (userId) {
                query += ` AND created_by=$2`
                args.push(userId)
            }
            const result = await client.query(
                query,
                args,
            )
            // if no suggestions job found, return null
            if (result.rowCount === 0) {
                return null
            }
            return result.rows[0]
        } finally {
            client.release()
        }
    }

    // update suggestions job
    async updateSuggestionsJob(id: string, userId: string, body: UpdateSuggestionsJobInput): Promise<SuggestionsJob> {
        // get suggestions job first
        const job = await this.getSuggestionsJob(id, userId)
        const client = await this.pool.connect()
        try {
            let query = `UPDATE suggestions_jobs SET status=$1, updated_at=$2, result=$3 WHERE id=$4 RETURNING *`
            let args = [body.status || job.status, moment().valueOf(), body.result || job.result, id]
            if (userId) {
                query = `UPDATE suggestions_jobs SET status=$1, updated_at=$2, result=$3 WHERE id=$4 AND created_by=$5 RETURNING *`
                args.push(userId)
            }
            const result = await client.query(
                query,
                args,
            )
            // if no suggestions job found, return null
            if (result.rowCount === 0) {
                return null
            }
            return result.rows[0]
        } finally {
            client.release()
        }
    }

    // delete suggestions job
    async deleteSuggestionsJob(id: string, user: string): Promise<boolean> {
        const client = await this.pool.connect()
        try {
            const result = await client.query(
                `DELETE FROM suggestions_jobs WHERE id=$1 AND created_by=$2`,
                [id, user]
            )
            return result.rowCount > 0
        } finally {
            client.release()
        }
    }

    // clean up old suggestion jobs
    async cleanupSuggestionsJobs(): Promise<void> {
        const client = await this.pool.connect()
        try {
            const result = await client.query(
                `DELETE FROM suggestions_jobs WHERE updated_at < $1`,
                [moment().subtract(1, "hours").valueOf()]
            )
        } finally {
            client.release()
        }
    }

    private async getUesrsWithPendingSuggestions(): Promise<string[]> {
        const client = await this.pool.connect()
        try {
            const result = await client.query(
                `SELECT DISTINCT created_by FROM suggestions_jobs WHERE status='pending'`
            )
            return result.rows.map(row => row.created_by)
        } finally {
            client.release()
        }
    }

    // process suggestions job
    async processSuggestionsJob(): Promise<SuggestionsJob> {
        const users = await this.getUesrsWithPendingSuggestions()
        if (users.length === 0) {
            return null
        }
        // get random user
        const user = users[Math.floor(Math.random() * users.length)]
        const client = await this.pool.connect()
        try {
            const result = await client.query(
                `SELECT * FROM suggestions_jobs WHERE status='pending' AND created_by=$1 ORDER BY created_at ASC LIMIT 1`,
                [user]
            )
            if (result.rowCount === 0) {
                return null
            }
            const job = result.rows[0]
            // update job status to processing
            await client.query(
                `UPDATE suggestions_jobs SET status='processing' WHERE id=$1`,
                [job.id],
            )
            // commit transaction
            await client.query("COMMIT")
            return {
                ...job,
                status: SuggestionsJobStatusEnum.Processing,
            }
        } catch (err) {
            // rollback transaction
            await client.query("ROLLBACK")
            console.error("Rolling back transaction", err)
        } finally {
            client.release()
        }
        return null
    }

    // get users that have workflows with next execution time in the past
    async getUsersWithActiveWorkflows(): Promise<string[]> {
        const client = await this.pool.connect()
        try {
            const result = await client.query(
                `SELECT DISTINCT created_by FROM workflows WHERE is_active=true AND next_execution < $1`,
                [moment().valueOf()]
            )
            return result.rows.map(row => row.created_by)
        } finally {
            client.release()
        }
    }

    // process workflow
    async processWorkflow(user?: string): Promise<Workflow> {
        // get users that have workflows with next execution time in the past
        const users = await this.getUsersWithActiveWorkflows()
        if (users.length === 0) {
            return null
        }
        if (!user) {
            // get random user
            user = users[Math.floor(Math.random() * users.length)]
        }

        const client = await this.pool.connect()
        try {
            const result = await client.query(
                `SELECT * FROM workflows WHERE is_active=true AND created_by=$1 AND next_execution < $2 ORDER BY next_execution ASC LIMIT 1`,
                [user, moment().valueOf()]
            )
            if (result.rowCount === 0) {
                return null
            }
            const workflow = result.rows[0]
            // update workflow next execution time
            await client.query(
                `UPDATE workflows SET next_execution=$1 WHERE id=$2`,
                [moment().add(workflow.execution_delay, "seconds").valueOf(), workflow.id]
            )
            // commit transaction
            await client.query("COMMIT")
            return workflow
        } catch (err) {
            // rollback transaction
            await client.query("ROLLBACK")
            console.error("Rolling back transaction", err)
        } finally {
            client.release()
        }
        return null
    }

    async createSvgJob(user: string, body: CreateSvgJobInput): Promise<SvgJob> {
        const client = await this.pool.connect()
        const now = moment().valueOf()
        try {
            const result = await client.query(
                `INSERT INTO svg_jobs (id, created_by, created_at, updated_at, image_id, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                [uuid.v4(), user, now, now, body.image_id, "pending"]
            )
            return result.rows[0]
        } catch (err) {
            await client.query("ROLLBACK")
            console.error("Rolling back transaction", err)
        } finally {
            client.release()
        }
        return null;
    }

    async getSvgJob(id: string, userId?: string): Promise<SvgJob> {
        const client = await this.pool.connect()
        try {
            let query = `SELECT * FROM svg_jobs WHERE id=$1`
            let args = [id]
            if (userId) {
                query += ` AND created_by=$2`
                args.push(userId)
            }
            const result = await client.query(
                query,
                args,
            )
            // if no svg job found, return null
            if (result.rowCount === 0) {
                return null
            }
            return result.rows[0]
        } finally {
            client.release()
        }
    }

    private async getUsersWithPendingSvgJobs(): Promise<string[]> {
        const client = await this.pool.connect()
        try {
            const result = await client.query(
                `SELECT DISTINCT created_by FROM svg_jobs WHERE status='pending'`
            )
            return result.rows.map(row => row.created_by)
        } finally {
            client.release()
        }
    }

    async processSvgJob(user?: string): Promise<SvgJob> {
        const users = await this.getUsersWithPendingSvgJobs()
        // if there are no users, return null
        if (users.length === 0) {
            return null
        }
        if (!user) {
            // get random user
            user = users[Math.floor(Math.random() * users.length)]
        }

        const client = await this.pool.connect()
        try {
            // begin transaction
            await client.query("BEGIN")
            const result = await client.query(
                `SELECT * FROM svg_jobs WHERE status='pending' AND created_by=$1 ORDER BY created_at ASC LIMIT 1`,
                [user]
            )
            if (result.rowCount === 0) {
                return null
            }
            const job = result.rows[0]
            // update job status to processing
            await client.query(
                `UPDATE svg_jobs SET status='processing' WHERE id=$1`,
                [job.id],
            )
            // commit transaction
            await client.query("COMMIT")
            job.status = SvgJobStatusEnum.Processing
            return job
        } catch (err) {
            // rollback transaction
            await client.query("ROLLBACK")
            console.error("Rolling back transaction", err)
        } finally {
            client.release()
        }
        return null
    }

    async getSvgJobResult(id: string): Promise<string> {
        // check if exists in the filestore
        const exists = await this.filestore.exists(`${id}.svg`)
        if (!exists) {
            return "";
        }
        // get the file
        const file = await this.filestore.readFile(`${id}.svg`)
        return file
    }

    async updateSvgJob(id: string, body: UpdateSvgJobInput): Promise<SvgJob> {
        const client = await this.pool.connect()
        try {
            // save result to filestore
            await this.filestore.writeFile(`${id}.svg`, body.result)
            const result = await client.query(
                `UPDATE svg_jobs SET status='completed' WHERE id=$1 RETURNING *`,
                [id]
            )
            if (result.rowCount === 0) {
                return null
            }
            return result.rows[0]
        } finally {
            client.release()
        }
        return null
    }

    async deleteSvgJob(id: string): Promise<void> {
        const client = await this.pool.connect()
        try {
            await client.query(
                `DELETE FROM svg_jobs WHERE id=$1`,
                [id]
            )
            // remove from filestore if file exists
            if (await this.filestore.exists(`${id}.svg`)) {
                await this.filestore.deleteFile(`${id}.svg`)
            }
        } finally {
            client.release()
        }
    }

    async cleanupSvgJobs(): Promise<void> {
        // clean up any svj jobs that are older than 1 hours
        const client = await this.pool.connect()
        try {
            // list jobs
            const result = await client.query(
                `SELECT * FROM svg_jobs WHERE created_at < $1`,
                [moment().subtract(1, "hours").valueOf()]
            )
            // delete jobs
            for (const job of result.rows) {
                await this.deleteSvgJob(job.id)
            }
        } finally {
            client.release()
        }
    }

   
    async getWorkflows(userId: string): Promise<WorkflowList> {
        const client = await this.pool.connect()
        try {
            const result = await client.query(
                `SELECT * FROM workflows WHERE created_by=$1`,
                [userId],
            )
            return {
                workflows: result.rows
            }
        } finally {
            client.release()
        }
    }

    async createWorkflow(body: CreateWorkflowInput, created_by: string): Promise<Workflow> {
        const id = uuid.v4()
        const nextExecution = moment().valueOf()
        const now = moment().valueOf()
        const client = await this.pool.connect()
        try {
            await client.query(
                `INSERT INTO workflows (id, created_by, workflow_type, state, config_json, data_json, is_active, execution_delay, next_execution, label, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [id, created_by, body.workflow_type, body.state, body.config_json, body.data_json, body.is_active, body.execution_delay, nextExecution, body.label, now]
            )
            return {
                id,
                created_by: created_by,
                workflow_type: body.workflow_type,
                state: body.state,
                config_json: body.config_json,
                data_json: body.data_json,
                is_active: body.is_active,
                execution_delay: body.execution_delay,
                next_execution: nextExecution,
                label: body.label
            }
        } finally {
            client.release()
        }
    }

    // take in optional user id. If present, add it as a filter
    async getWorkflow(id: string, userId?: string): Promise<Workflow> {
        let filter = ""
        let args = [id]
        if (userId) {
            filter = ` AND created_by=$2`
            args.push(userId)
        }
        const client = await this.pool.connect()
        try {
            const result = await client.query(
                `SELECT * FROM workflows WHERE id=$1${filter}`,
                args
            )
            if (result.rowCount === 0) {
                return null
            }
            const workflow = result.rows[0]
            return workflow
        } finally {
            client.release()
        }
    }

    async updateWorkflow(id: string, body: UpdateWorkflowInput, userId?: string): Promise<Workflow> {
        const existingWorkflow = await this.getWorkflow(id)
        if (!existingWorkflow) {
            console.log("Workflow not found")
            return null
        }
        Object.keys(body).forEach(key => {
            existingWorkflow[key] = body[key]
        })
        const nextExecution = moment().valueOf() + existingWorkflow.execution_delay * 1000
        const client = await this.pool.connect()
        let args = [existingWorkflow.data_json, existingWorkflow.config_json, existingWorkflow.is_active, existingWorkflow.state, existingWorkflow.execution_delay, existingWorkflow.label, nextExecution, id]
        let filter = "WHERE id=$8"
        
        if (userId) {
            args.push(userId)
            filter = filter + ` AND created_by=$9`
        }

        try {
            await client.query(
                `UPDATE workflows SET data_json=$1, config_json=$2, is_active=$3, state=$4, execution_delay=$5, label=$6, next_execution=$7 ${filter}`,
                args
            )
            return await this.getWorkflow(id)
        } finally {
            client.release()
        }
    }

    async deleteWorkflow(id: string, userId?: string): Promise<void> {
        const client = await this.pool.connect()
        let args = [id]
        let filter = "WHERE id=$1"
        if (userId) {
            args.push(userId)
            filter = filter + ` AND created_by=$2`
        }
        try {
            await client.query(
                `DELETE FROM workflows ${filter}`,
                args,
            )
        } finally {
            client.release()
        }
    }

    async isUserAdmin(user: string): Promise<boolean> {
        if (user.indexOf("@") !== -1) {
            user = hash(user)
        }
        const adminUsers = (this.config.adminUsers || []).map(u => hash(u))
        return adminUsers.includes(user)
    }


    async isUserAllowed(email: string): Promise<boolean> {
        if (await this.isUserAdmin(email)) {
            return true
        }
        const user: User = await this.getUser(hash(email))
        if (!user || !user.active) {
            return false
        }
        return true
    }

    async getUser(id: string): Promise<User> {
        const client = await this.pool.connect()
        try {
            const result = await client.query(
                `SELECT * FROM users WHERE id=$1`,
                [id]
            )
            if (result.rowCount === 0) {
                return null
            }
            return result.rows[0]
        } finally {
            client.release()
        }
    }

    async createInviteCode(): Promise<InviteCode> {
        const client = await this.pool.connect()
        try {
            const id = (uuid.v4() + uuid.v4()).replace(/-/g, "")
            await client.query(
                `INSERT INTO invite_codes(id, created_at) VALUES($1, $2)`,
                [id, moment().valueOf()]
            )
            return {
                id,
            }
        } finally {
            client.release()
        }
    }

    async deleteExpiredInviteCodes(): Promise<void> {
        // lifespan is 7 days
        const client = await this.pool.connect()
        try {
            await client.query(
                `DELETE FROM invite_codes WHERE created_at < $1`,
                [moment().subtract(7, "days").valueOf()]
            )
        } finally {
            client.release()
        }
    }

    async activateUser(email: string, inviteCode: string) : Promise<boolean> {
        await this.deleteExpiredInviteCodes()
        const existingUser = await this.getUser(hash(email))
        if (existingUser) {
            return false
        }
        const client = await this.pool.connect()
        try {
            const result = await client.query(
                `DELETE FROM invite_codes WHERE id=$1`,
                [inviteCode]
            )
            if (result.rowCount === 0) {
                return false
            }
            // create the new user and then delete the invite code
            await client.query(
                `INSERT INTO users (id, active) VALUES ($1, true)`,
                [hash(email)]
            )
            return true
        } finally {
            client.release()
        }
    }

    async login(email: string, sendEmail=true, inviteCode: string=undefined): Promise<string> {
        if (inviteCode && !await this.activateUser(email, inviteCode)) {
            throw new Error("User not allowed")
        }
        if (!await this.isUserAllowed(email)) {
            throw new Error("User not allowed")
        }
        // generate crypto random 6 digit code
        const code = uuid.v4().substring(0, 6).toUpperCase()
        // calculate expiration based on config.loginCodeExpirationSeconds
        const expiresAt = moment().add(this.config.loginCodeExpirationSeconds, "seconds")
        // insert login_code
        const client = await this.pool.connect()
        try {
            await client.query(
                `INSERT INTO login_codes (code, user_email, expires_at) VALUES ($1, $2, $3)`,
                [code, email, expiresAt.toDate()]
            )
            if (sendEmail) {
                // send email with code
                const message: EmailMessage = {
                    from: this.config.smtpFrom,
                    to: email,
                    subject: "Login code",
                    text: `Your login code is ${code}`
                }
                await this.sendMail(message)
            }
            return code
        } finally {
            client.release()
        }
    }

    async verify(code: string): Promise<Authentication> {
        const client = await this.pool.connect()
        try {
            const result = await client.query(
                `SELECT * FROM login_codes WHERE code=$1`,
                [code]
            )
            if (result.rows.length === 0) {
                console.log("login code not found: " + code)
                return null
            }
            const loginCode = result.rows[0] as LoginCode;
            // make sure loginCode isn't expired
            const now = moment()
            const expiresAt = moment(loginCode.expires_at)
            await client.query(
                `DELETE FROM login_codes WHERE code=$1`,
                [code]
            )
            if (now.isAfter(expiresAt)) {
                console.log("code expired: " + code)
                return null
            }

            // generate auth tokens
            const auth = this.authHelper.createTokens(loginCode.user_email)
            return auth
        } finally {
            client.release()
        }
    }

    async createServiceAccountCreds(userId: string, cfg: ServiceAccountConfig) {
        // some day this probably will create a database entry so the creds
        // can be revoked
        return this.authHelper.createTokens(userId, cfg);
    }

    async refresh(refreshToken: string): Promise<Authentication> {
        const user = this.authHelper.verifyToken(refreshToken, "refresh")
        if (!user) {
            return null;
        }
        return this.authHelper.createTokens(user.userId, user.serviceAccountConfig)
    }

    // list databases for testing
    async listDatabases(): Promise<Array<string>> {
        const client = new Client()
        await client.connect()
        try {
            const result = await client.query(
                `SELECT datname FROM pg_database`
            )
            return result.rows.map(row => row.datname as string)
        } finally {
            await client.end()
        }
    }

    // drop database for testing
    async dropDatabase(database: string): Promise<void> {
        const client = new Client()
        await client.connect()

        try {
            await client.query(
                `DROP DATABASE IF EXISTS "${database}"`
            )
        } finally {
            await client.end()
        }
    }

    async createDatabase(name: string): Promise<void> {
        const client = new Client()
        await client.connect()

        try {
            await client.query(
                `CREATE DATABASE "${name}"`
            )
        } finally {
            await client.end()
        }
    }

    async getFeatures(): Promise<FeatureList> {
        return {
            privacy_uri: process.env.PRIVACY_URI,
            terms_uri: process.env.TERMS_URI,
        }
    }
}
