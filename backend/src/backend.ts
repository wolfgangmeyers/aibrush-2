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
import { Authentication, AuthHelper } from "./auth";
import { LoginCode } from "./model"

process.env.PGUSER = process.env.PGUSER || "postgres"

export class BackendService {

    private pool: Pool
    private authHelper: AuthHelper;

    constructor(private config: Config) {
        this.authHelper = new AuthHelper(config.secret)
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

    async login(email: string): Promise<void> {
        // generate crypto random 6 digit code
        const code = uuid.v4().substr(0, 6).toUpperCase()
        // calculate expiration based on config.loginCodeExpirationSeconds
        const expiresAt = moment().add(this.config.loginCodeExpirationSeconds, "seconds")
        // insert login_code
        const client = await this.pool.connect()
        try {
            await client.query(
                `INSERT INTO login_codes (code, user_email, expires_at) VALUES ($1, $2, $3)`,
                [code, email, expiresAt.toDate()]
            )
            // send email with code
            const message: EmailMessage = {
                from: this.config.smtpFrom,
                to: email,
                subject: "Login code",
                text: `Your login code is ${code}`
            }
            await this.sendMail(message)
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
