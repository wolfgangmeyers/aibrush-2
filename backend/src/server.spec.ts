import * as uuid from 'uuid'
import moment from 'moment'
import axios, { Axios, AxiosInstance, AxiosResponse } from "axios"
import fs from "fs"

import { Server } from "./server"
import { BackendService } from "./backend"
import { AIBrushApi, ImageList, Image, CreateImageInput, UpdateImageInput, LoginResult } from "./client/api"

import nodemailer from "nodemailer";
import { Mailcatcher, MailcatcherMessage } from './mailcatcher'
import { Config } from './config'
import { Authentication } from './auth'

describe("server", () => {
    let server: Server
    let client: AIBrushApi
    let httpClient: AxiosInstance;

    beforeAll(async () => {
        const backendService = new BackendService({
            secret: "test",
            smtpHost: "localhost",
            smtpPort: 1025,
            smtpFrom: "noreply@test.aibrush.art",
            databaseName: "aibrush_test_2",
            dataFolderName: "test_data",
            loginCodeExpirationSeconds: 1,
        })
        const databases = await backendService.listDatabases()
        for (const db of databases) {
            if (db.startsWith("aibrush_test_")) {
                await backendService.dropDatabase(db)
            }
        }
    })

    beforeEach(async () => {
        // remove all files in data folder
        try {
            const files = fs.readdirSync("./test_data")
            for (const file of files) {
                fs.unlinkSync("./test_data/" + file)
            }
        } catch {}


        // const sockfile = `/tmp/aibrush-backend-${uuid.v4()}.sock`

        const databaseName = `aibrush_test_${moment().valueOf()}`
        const config: Config = {
            secret: "test",
            smtpHost: "localhost",
            smtpFrom: "noreply@test.aibrush.art",
            smtpPort: 1025,
            databaseName: databaseName,
            dataFolderName: "test_data",
            loginCodeExpirationSeconds: 1,
        }
        const backendService = new BackendService(config)

        server = new Server(config, backendService, 35456)
        await server.init()
        await server.start()

        httpClient = axios.create({
        })
        client = new AIBrushApi(undefined, "http://localhost:35456", httpClient)
    })

    afterEach(async () => {
        await server.stop()
    })

    describe("when user is unauthenticated", () => {
        describe("when listing images", () => {
            it("should return 401", async () => {
                let error: any;
                try {
                    await client.listImages()
                } catch (e) {
                    error = e
                }
                expect(error).toBeDefined();
                expect(error.response.status).toBe(401)
            })
        })
    })

    describe("when user authenticates", () => {

        let mailcatcher: Mailcatcher;
        let emails: Array<MailcatcherMessage>;

        beforeEach(async () => {
            mailcatcher = new Mailcatcher("http://localhost:1080")
            // get messages and delete each message
            const emails = await mailcatcher.getMessages()
            for (const email of emails) {
                await mailcatcher.deleteMessage(email.id)
            }
        })

        beforeEach(async () => {
            await client.login({
                email: "test@test.test"
            })
        })

        beforeEach(async () => {
            // get emails from mailcatcher
            emails = await mailcatcher.getMessages()
        })

        it("should send an email to the user", async () => {
            expect(emails).toHaveLength(1)
            const email = emails[0]
            expect(email.recipients).toEqual(["<test@test.test>"])
        })

        describe("when verifying the code sent by email", () => {
            let code: string;
            let verifyResult: LoginResult;

            beforeEach(async () => {
                const email = emails[0]
                const body = email.text.split(" ")
                code = body[body.length - 1]
                const response = await client.verify({
                    code: code
                })
                verifyResult = response.data
                // add the access token to the http client
                httpClient.defaults.headers['Authorization'] = `Bearer ${verifyResult.accessToken}`
            })

            it("should return the access and refresh tokens", () => {
                expect(verifyResult.accessToken).toBeDefined()
                expect(verifyResult.refreshToken).toBeDefined()
            })

            describe("when listing images", () => {
                let images: ImageList;

                beforeEach(async () => {
                    const response = await client.listImages()
                    images = response.data
                })

                it("should return an empty list", () => {
                    expect(images.images).toHaveLength(0)
                })
            })

            describe("when creating an image", () => {
                let image: Image;

                beforeEach(async () => {
                    const response = await client.createImage({
                        phrases: ["test"],
                        label: "test",
                        iterations: 1,
                        parent: "",
                        encoded_image: "encoded-image",
                        encoded_thumbnail: "encoded-thumbnail"
                    })
                    image = response.data
                })

                it("should return the image", () => {
                    expect(image.id).toBeDefined()
                    expect(image.phrases).toEqual(["test"])
                    expect(image.label).toBe("test")
                    expect(image.iterations).toBe(1)
                    expect(image.parent).toBe("")
                    expect(image.encoded_image).toBe("encoded-image")
                    expect(image.encoded_thumbnail).toBe("encoded-thumbnail")
                })

                // TODO: when listing images (authorized and non-authorized)

                // TODO: when updating an image (authorized and non-authorized)

                // TODO: when deleting an image (verify files are gone too) (authorized and non-authorized)

            })
        })
    })
})
