import { Client, Pool } from "pg"
import { createDb, migrate } from "postgres-migrations"
import * as uuid from "uuid"
import moment from "moment"
import fs from "fs"
import nodemailer from "nodemailer";

import { ImageList, Image, CreateImageInput, UpdateImageInput, LoginInput, VerifyLoginInput, LoginResult } from "./client/api"
import { sleep } from "./sleep"
import { EmailMessage } from "./email_message"
import { Config } from "./config"

process.env.PGUSER = process.env.PGUSER || "postgres"

export class BackendService {

    private pool: Pool

    constructor(private config: Config) {
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

        try {
            // create database
            const client = new Client()
            await client.connect()
            await createDb(this.config.databaseName, { client })
            await client.end()
        } catch (error) {
            console.error(error)
            throw error
        }

        try {
            // migrate
            const client = new Client({ database: this.config.databaseName })
            await client.connect()
            await migrate({ client }, "./src/migrations")
            await sleep(100)
        } catch (error) {
            console.error(error)
            throw error
        }

        this.pool = new Pool({ database: this.config.databaseName })
        // ensure data folder exists
        if (!fs.existsSync(`./${this.config.dataFolderName}`)) {
            fs.mkdirSync(`./${this.config.dataFolderName}`)
        }
    }

    async destroy() {
        await this.pool.end()
    }


    // list images
    async listImages(): Promise<ImageList> {
        const client = await this.pool.connect()
        try {
            const result = await client.query(
                `SELECT * FROM images ORDER BY created_at desc`
            )
            return {
                images: result.rows
            }
        } finally {
            client.release()
        }
    }

    // get image by id
    async getImage(id: string, download?: ("thumbnail" | "image" | "latents")): Promise<Image> {
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
            let latents: Buffer
            let image: Buffer
            let thumbnail: Buffer
            if (download === "latents") {
                latents = fs.readFileSync(`./${this.config.dataFolderName}/${id}.latents`)
            }
            if (download === "image") {
                image = fs.readFileSync(`./${this.config.dataFolderName}/${id}.image`)
            }
            if (download === "thumbnail") {
                thumbnail = fs.readFileSync(`./${this.config.dataFolderName}/${id}.thumbnail`)
            }
            return {
                ...imageData,
                encoded_latents: latents && latents.toString(),
                encoded_image: image && image.toString(),
                encoded_thumbnail: thumbnail && thumbnail.toString(),
            }
        } finally {
            client.release()
        }
    }

    // delete image
    async deleteImage(id: string): Promise<void> {
        const client = await this.pool.connect()
        try {
            await client.query(
                `DELETE FROM images WHERE id=$1`,
                [id]
            )
        } finally {
            client.release()
        }
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
}
