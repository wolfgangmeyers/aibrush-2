import * as uuid from 'uuid'
import moment from 'moment'
import axios, { Axios, AxiosInstance, AxiosResponse } from "axios"
import fs from "fs"
import path from "path"

import { Server } from "./server"
import { BackendService } from "./backend"
import { AIBrushApi, ImageList, Image, CreateImageInput, UpdateImageInput, LoginResult, UpdateImageInputStatusEnum } from "./client/api"

import nodemailer from "nodemailer";
import { Mailcatcher, MailcatcherMessage } from './mailcatcher'
import { Config } from './config'
import { Authentication } from './auth'

async function authenticateUser(mailcatcher: Mailcatcher, client: AIBrushApi, httpClient: AxiosInstance, emailAddress: string) {
    await mailcatcher.clearAll()

    await client.login({
        email: emailAddress
    })
    const emails = await mailcatcher.getMessages()
    expect(emails.length).toBe(1)
    const email = emails[0]
    // extract the code from the email
    const body = email.text.split(" ")
    const code = body[body.length - 1]
    // verify the code
    const verifyResponse = await client.verify({
        code: code
    })
    const verifyResult = verifyResponse.data
    // add the access token to the http client
    httpClient.defaults.headers['Authorization'] = `Bearer ${verifyResult.accessToken}`
}

describe("server", () => {
    let server: Server
    let client: AIBrushApi
    let httpClient: AxiosInstance;
    // second user
    let client2: AIBrushApi;
    let httpClient2: AxiosInstance;

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
        // second user
        httpClient2 = axios.create({
        })
        client2 = new AIBrushApi(undefined, "http://localhost:35456", httpClient2)
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
                    })
                    image = response.data
                })

                it("should return the image", () => {
                    expect(image.id).toBeDefined()
                    expect(image.phrases).toEqual(["test"])
                    expect(image.label).toBe("test")
                    expect(image.iterations).toBe(1)
                    expect(image.parent).toBe("")
                })

                describe("when listing images", () => {
                    let images: ImageList;

                    beforeEach(async () => {
                        const response = await client.listImages()
                        images = response.data
                    })

                    it("should return the image", () => {
                        expect(images.images).toHaveLength(1)
                        expect(images.images[0].id).toBe(image.id)
                        expect(images.images[0].phrases).toEqual(["test"])
                        expect(images.images[0].label).toBe("test")
                        expect(images.images[0].iterations).toBe(1)
                        expect(images.images[0].parent).toBe("")
                        expect(images.images[0].current_iterations).toBe(0)
                        expect(images.images[0].status).toBe(UpdateImageInputStatusEnum.Pending)
                    })
                })

                describe("when updating an image", () => {
                    let updatedImage: Image;

                    beforeEach(async () => {
                        const response = await client.updateImage(image.id, {
                            phrases: ["test2"],
                            label: "test2",
                            current_iterations: 1,
                            status: UpdateImageInputStatusEnum.Processing
                        })
                        updatedImage = response.data
                    })

                    it("should return the updated image", () => {
                        expect(updatedImage.id).toBe(image.id)
                        expect(updatedImage.phrases).toEqual(["test2"])
                        expect(updatedImage.label).toBe("test2")
                        expect(updatedImage.iterations).toBe(1)
                        expect(updatedImage.status).toBe(UpdateImageInputStatusEnum.Processing)
                        expect(updatedImage.current_iterations).toBe(1)
                    })

                    describe("when listing images", () => {
                        let images: ImageList;

                        beforeEach(async () => {
                            const response = await client.listImages()
                            images = response.data
                        })

                        it("should return the updated image", () => {
                            expect(images.images).toHaveLength(1)
                            expect(images.images[0].id).toBe(image.id)
                            expect(images.images[0].phrases).toEqual(["test2"])
                            expect(images.images[0].label).toBe("test2")
                            expect(images.images[0].iterations).toBe(1)
                            expect(images.images[0].parent).toBe("")
                            expect(images.images[0].current_iterations).toBe(1)
                            expect(images.images[0].status).toBe(UpdateImageInputStatusEnum.Processing)
                        })
                    })
                })

                describe("when updating an image with encoded_image", () => {
                    let savedImageData: Buffer;
                    let savedThumbnailData: Buffer;

                    beforeEach(async () => {
                        // read 512.jpg from file and base64 encode it
                        const imageData = fs.readFileSync("512.jpg")
                        const base64Image = Buffer.from(imageData).toString('base64')
                        await client.updateImage(image.id, {
                            encoded_image: base64Image
                        })
                        // get image data
                        const imageDataResponse = await client.getImageData(image.id)
                        savedImageData = imageDataResponse.data
                        const thumbnailDataResponse = await client.getThumbnailData(image.id)
                        savedThumbnailData = thumbnailDataResponse.data
                    })

                    it("should save the image data", () => {
                        expect(savedImageData).toBeDefined()
                        expect(savedThumbnailData).toBeDefined()
                        // thumbnail should be smaller
                        expect(savedThumbnailData.length).toBeLessThan(savedImageData.length)
                    })

                    describe("when deleting an image", () => {
                        beforeEach(async () => {
                            await client.deleteImage(image.id)
                        })

                        it("should remove the image and thumbnail files from the data folder", () => {
                            // data folder is "data_test"
                            const imagePath = path.join("data_test", image.id + ".image")
                            expect(fs.existsSync(imagePath)).toBe(false)
                            const thumbnailPath = path.join("data_test", image.id + ".thumbnail")
                            expect(fs.existsSync(thumbnailPath)).toBe(false)
                        })
                    })
                })

                describe("when listing images as a different user", () => {
                    let images: ImageList;

                    beforeEach(async () => {
                        // authenticate second user
                        await authenticateUser(mailcatcher, client2, httpClient2, "test2@test")

                        const response = await client2.listImages()
                        images = response.data
                    })

                    it("should return an empty list", () => {
                        expect(images.images).toHaveLength(0)
                    })

                })

                // TODO: when listing images as a service acct

                describe("when updating an image belonging to a different user", () => {

                    beforeEach(async () => {
                        // authenticate second user
                        await authenticateUser(mailcatcher, client2, httpClient2, "test2@test")
                    })

                    it("should reject the request with not found error", async () => {
                        await expect(client2.updateImage(image.id, {
                            phrases: ["test2"],
                            label: "test2",
                            current_iterations: 1,
                            status: UpdateImageInputStatusEnum.Processing
                        })).rejects.toThrow(/Request failed with status code 404/)
                    })
                })

                // TODO: when updating an image as a service acct

                describe("when deleting an image", () => {
                    let images: ImageList;

                    beforeEach(async () => {
                        await client.deleteImage(image.id)
                    })

                    describe("when listing images", () => {
                        let images: ImageList;

                        beforeEach(async () => {
                            const response = await client.listImages()
                            images = response.data
                        })

                        it("should return the image", () => {
                            expect(images.images).toHaveLength(0)
                        })
                    })
                })

                describe("when deleting an image as a different user", () => {
                    beforeEach(async () => {
                        // authenticate second user
                        await authenticateUser(mailcatcher, client2, httpClient2, "test2@test")
                    })

                    it("should reject the request with not found error", async () => {
                        await expect(client2.deleteImage(image.id)).rejects.toThrow(/Request failed with status code 404/)
                    })

                    it("should not have deleted the image", async () => {
                        // get image by id
                        const response = await client.getImage(image.id)
                        const img = response.data;
                        expect(img.id).toBe(image.id)
                    })
                })

                // TODO: when deleting an image as a service acct

                // TODO: when deleting an image that doesn't exist
                describe("when deleting an image that doesn't exist", () => {
                    it("should reject the request with not found error", async () => {
                        await expect(client.deleteImage("does-not-exist")).rejects.toThrow(/Request failed with status code 404/)
                    })
                })
            })

            // TODO: when creating an image with encoded_image

            // TODO: when creating an image with a service acct
        })
    })
})
