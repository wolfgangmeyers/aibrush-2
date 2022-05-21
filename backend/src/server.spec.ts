import * as uuid from 'uuid'
import moment from 'moment'
import axios, { Axios, AxiosInstance, AxiosResponse } from "axios"
import fs from "fs"
import path from "path"

import { Server } from "./server"
import { BackendService } from "./backend"
import {
    AIBrushApi,
    ImageList,
    Image,
    CreateImageInput,
    UpdateImageInput,
    LoginResult,
    UpdateImageInputStatusEnum,
    SuggestionSeedList,
    SuggestionSeed,
    SuggestionsJobList,
    SuggestionsJob,
    CreateSuggestionsJobInput,
    UpdateSuggestionsJobInput,
    UpdateSuggestionsJobInputStatusEnum,
    CreateServiceAccountInputTypeEnum,
    SvgJob,
    SvgJobStatusEnum,
} from "./client/api"

// import { Mailcatcher, MailcatcherMessage } from './mailcatcher'
import { Config } from './config'
import { Authentication, hash } from './auth'
import { sleep } from './sleep'

jest.setTimeout(60000);

async function authenticateUser(backendService: BackendService, httpClient: AxiosInstance, emailAddress: string): Promise<Authentication> {
    const code = await backendService.login(emailAddress, false)
    const verifyResponse = await backendService.verify(code)
    // add the access token to the http client
    httpClient.defaults.headers['Authorization'] = `Bearer ${verifyResponse.accessToken}`
    return verifyResponse
}

async function refreshUser(client: AIBrushApi, httpClient: AxiosInstance, refreshToken: string) {
    const response = await client.refresh({
        refreshToken: refreshToken
    })
    const refreshResult = response.data
    httpClient.defaults.headers['Authorization'] = `Bearer ${refreshResult.accessToken}`
}

describe("server", () => {
    let backendService: BackendService;
    let server: Server
    let client: AIBrushApi
    let httpClient: AxiosInstance;
    // second user
    let client2: AIBrushApi;
    let httpClient2: AxiosInstance;
    let databaseName: string;

    beforeAll(async () => {
        backendService = new BackendService({
            secret: "test",
            smtpHost: "localhost",
            smtpPort: 1025,
            smtpFrom: "noreply@test.aibrush.art",
            databaseUrl: "postgres://localhost/postgres",
            databaseSsl: false,
            // databaseName: "aibrush_test_2",
            dataFolderName: "test_data",
            loginCodeExpirationSeconds: 1,
            userAccessTokenExpirationSeconds: 3600,
            serviceAccountAccessTokenExpirationSeconds: 3600,
            serviceAccounts: ["service-account@test.test"],
            userWhitelist: [],
            assetsBaseUrl: "/api/images",
        })
        const databases = await backendService.listDatabases()
        for (const db of databases) {
            if (db.startsWith("aibrush_test_")) {
                await backendService.dropDatabase(db)
            }
        }
        databaseName = `aibrush_test_${moment().valueOf()}`
        await backendService.createDatabase(databaseName)
        await sleep(1000)
    })

    beforeEach(async () => {
        backendService = new BackendService({
            secret: "test",
            smtpHost: "localhost",
            smtpPort: 1025,
            smtpFrom: "noreply@test.aibrush.art",
            databaseUrl: "postgres://localhost/postgres",
            databaseSsl: false,
            // databaseName: "aibrush_test_2",
            dataFolderName: "test_data",
            loginCodeExpirationSeconds: 1,
            userAccessTokenExpirationSeconds: 3600,
            serviceAccountAccessTokenExpirationSeconds: 3600,
            serviceAccounts: ["service-account@test.test"],
            userWhitelist: [],
            assetsBaseUrl: "/api/images",
        })
        databaseName = `aibrush_test_${moment().valueOf()}`
        await backendService.createDatabase(databaseName)
        await sleep(100)
    })

    beforeEach(async () => {
        // remove all files in data folder
        try {
            const files = fs.readdirSync("./test_data")
            for (const file of files) {
                fs.unlinkSync("./test_data/" + file)
            }
        } catch { }

        const config: Config = {
            secret: "test",
            smtpHost: "localhost",
            smtpFrom: "noreply@test.aibrush.art",
            smtpPort: 1025,
            databaseUrl: "postgres://localhost/" + databaseName,
            databaseSsl: false,
            dataFolderName: "test_data",
            loginCodeExpirationSeconds: 1,
            userAccessTokenExpirationSeconds: 3600,
            serviceAccountAccessTokenExpirationSeconds: 3600,
            serviceAccounts: ["service-account@test.test"],
            userWhitelist: [],
            assetsBaseUrl: "/api/images",
        }
        backendService = new BackendService(config)

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
        await sleep(100)
    })

    afterEach(async () => {
        await server.stop()
        await sleep(100)
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

    // describe.skip("when user authenticates", () => {

    //     let mailcatcher: Mailcatcher;
    //     let emails: Array<MailcatcherMessage>;

    //     beforeEach(async () => {
    //         mailcatcher = new Mailcatcher("http://localhost:1080")
    //         // get messages and delete each message
    //         const emails = await mailcatcher.getMessages()
    //         for (const email of emails) {
    //             await mailcatcher.deleteMessage(email.id)
    //         }
    //     })

    //     beforeEach(async () => {
    //         await client.login({
    //             email: "test@test.test"
    //         })
    //     })

    //     beforeEach(async () => {
    //         // get emails from mailcatcher
    //         emails = await mailcatcher.getMessages()
    //     })

    //     it("should send an email to the user", async () => {
    //         expect(emails).toHaveLength(1)
    //         const email = emails[0]
    //         expect(email.recipients).toEqual(["<test@test.test>"])
    //     })

    //     describe("when verifying the code sent by email", () => {
    //         let code: string;
    //         let verifyResult: LoginResult;

    //         beforeEach(async () => {
    //             const email = emails[0]
    //             const body = email.text.split(" ")
    //             code = body[body.length - 1]
    //             const response = await client.verify({
    //                 code: code
    //             })
    //             verifyResult = response.data
    //             // add the access token to the http client
    //             httpClient.defaults.headers['Authorization'] = `Bearer ${verifyResult.accessToken}`
    //         })

    //         it("should return the access and refresh tokens", () => {
    //             expect(verifyResult.accessToken).toBeDefined()
    //             expect(verifyResult.refreshToken).toBeDefined()
    //         })
    //     })
    // })

    describe("functional tests", () => {

        let verifyResult: Authentication;

        beforeEach(async () => {
            verifyResult = await authenticateUser(backendService, httpClient, "test@test.test")
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

        describe("when listing images after refreshing access token", () => {
            let images: ImageList;

            beforeEach(async () => {
                await refreshUser(client, httpClient, verifyResult.refreshToken)
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
                    negative_phrases: ["foobar"],
                    label: "test",
                    width: 512,
                    height: 512,
                    iterations: 1,
                    parent: "",
                })
                image = response.data
            })

            it("should return the image", () => {
                expect(image.id).toBeDefined()
                expect(image.phrases).toEqual(["test"])
                expect(image.negative_phrases).toEqual(["foobar"])
                expect(image.label).toBe("test")
                expect(image.iterations).toBe(1)
                expect(image.parent).toBe("")
                expect(image.enable_video).toBe(false)
                expect(image.enable_zoom).toBe(false)
                expect(image.model).toBe("vqgan_imagenet_f16_16384")
                expect(image.glid_3_xl_skip_iterations).toBe(0)
                expect(image.glid_3_xl_clip_guidance).toBe(false)
                expect(image.glid_3_xl_clip_guidance_scale).toBe(150)
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
                    expect(images.images[0].negative_phrases).toEqual(["foobar"])
                    expect(images.images[0].label).toBe("test")
                    expect(images.images[0].iterations).toBe(1)
                    expect(images.images[0].parent).toBe("")
                    expect(images.images[0].current_iterations).toBe(0)
                    expect(images.images[0].status).toBe(UpdateImageInputStatusEnum.Pending)
                })
            })

            describe("when getting the image by id", () => {
                let img: Image;

                beforeEach(async () => {
                    const response = await client.getImage(image.id)
                    img = response.data
                })

                it("should return the image", () => {
                    expect(img.id).toBeDefined()
                    expect(img.phrases).toEqual(["test"])
                    expect(img.negative_phrases).toEqual(["foobar"])
                    expect(img.label).toBe("test")
                    expect(img.iterations).toBe(1)
                    expect(img.parent).toBe("")
                    expect(img.current_iterations).toBe(0)
                    expect(img.status).toBe(UpdateImageInputStatusEnum.Pending)
                })
            })

            describe("when getting the image with a service account", () => {
                let img: Image;

                beforeEach(async () => {
                    // authenticate as service account
                    await authenticateUser(backendService, httpClient2, "service-account@test.test")
                })

                beforeEach(async () => {
                    const response = await client2.getImage(image.id)
                    img = response.data
                })

                it("should return the image", () => {
                    expect(img.id).toBeDefined()
                    expect(img.phrases).toEqual(["test"])
                    expect(img.negative_phrases).toEqual(["foobar"])
                    expect(img.label).toBe("test")
                    expect(img.iterations).toBe(1)
                    expect(img.parent).toBe("")
                    expect(img.current_iterations).toBe(0)
                    expect(img.status).toBe(UpdateImageInputStatusEnum.Pending)
                })
            })

            describe("when getting the image by id with another user", () => {

                beforeEach(async () => {
                    // authenticate as second user
                    await authenticateUser(backendService, httpClient2, "test2@test.test")
                })

                it("should reject the call with not found", async () => {
                    await expect(client2.getImage(image.id)).rejects.toThrow(/Request failed with status code 404/)
                })
            })

            describe("when getting an image that doesn't exist", () => {

                it("should reject the call with not found", async () => {
                    await expect(client.getImage("does-not-exist")).rejects.toThrow(/Request failed with status code 404/)
                })
            })

            describe("when updating an image", () => {
                let updatedImage: Image;

                beforeEach(async () => {
                    const response = await client.updateImage(image.id, {
                        label: "test2",
                        current_iterations: 1,
                        status: UpdateImageInputStatusEnum.Processing
                    })
                    updatedImage = response.data
                })

                it("should return the updated image", () => {
                    expect(updatedImage.id).toBe(image.id)
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
                        expect(images.images[0].label).toBe("test2")
                        expect(images.images[0].iterations).toBe(1)
                        expect(images.images[0].parent).toBe("")
                        expect(images.images[0].current_iterations).toBe(1)
                        expect(images.images[0].status).toBe(UpdateImageInputStatusEnum.Processing)
                    })
                })
            })

            describe("when getting image data that doesn't exist", () => {
                it("should reject the call with not found", async () => {
                    await expect(client.getImageData("does-not-exist")).rejects.toThrow(/Request failed with status code 404/)
                })
            })

            describe("when getting thumbnail data that doesn't exist", () => {
                it("should reject the call with not found", async () => {
                    await expect(client.getThumbnailData("does-not-exist")).rejects.toThrow(/Request failed with status code 404/)
                })
            })

            describe("when updating an image that doesn't exist", () => {
                it("should reject the call with not found", async () => {
                    await expect(client.updateImage("does-not-exist", {
                        label: "test2",
                        current_iterations: 1,
                        status: UpdateImageInputStatusEnum.Processing
                    })).rejects.toThrow(/Request failed with status code 404/)
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

                })

                describe("when getting image data", () => {
                    let savedImageData: Buffer;
                    let savedThumbnailData: Buffer;

                    beforeEach(async () => {
                        // get image data
                        const imageDataResponse = await client.getImageData(image.id)
                        savedImageData = imageDataResponse.data
                        const thumbnailDataResponse = await client.getThumbnailData(image.id)
                        savedThumbnailData = thumbnailDataResponse.data
                    })

                    it("should return the image data", () => {
                        expect(savedImageData).toBeDefined()
                        expect(savedThumbnailData).toBeDefined()
                        // thumbnail should be smaller
                        expect(savedThumbnailData.length).toBeLessThan(savedImageData.length)
                    })
                })

                // when creating a child image, the parent image data should be copied
                describe("when creating a child image", () => {
                    let childImage: Image;

                    beforeEach(async () => {
                        const response = await client.createImage({
                            parent: image.id,
                            phrases: ["test2"],
                            label: "test2",
                            width: 512,
                            height: 512,
                            iterations: 1,
                        })
                        childImage = response.data
                    })

                    describe("when getting image data", () => {
                        let savedImageData: Buffer;
                        let savedThumbnailData: Buffer;

                        beforeEach(async () => {
                            // get image data
                            const imageDataResponse = await client.getImageData(childImage.id)
                            savedImageData = imageDataResponse.data
                            const thumbnailDataResponse = await client.getThumbnailData(childImage.id)
                            savedThumbnailData = thumbnailDataResponse.data
                        })

                        it("should return the image data", () => {
                            expect(savedImageData).toBeDefined()
                            expect(savedThumbnailData).toBeDefined()
                            // thumbnail should be smaller
                            expect(savedThumbnailData.length).toBeLessThan(savedImageData.length)
                        })
                    })
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
            }) // end of describe("when updating an image with encoded_image")

            describe("when updating an image with encoded_npy", () => {
                let savedNPYData: Buffer;

                beforeEach(async () => {
                    // read 256.npy from file and base64 encode it
                    const npyData = fs.readFileSync("256.npy")
                    const base64NPY = Buffer.from(npyData).toString('base64')
                    await client.updateImage(image.id, {
                        encoded_npy: base64NPY
                    })
                })

                describe("when getting npy data", () => {
                    beforeEach(async () => {
                        const npyDataResponse = await client.getNpyData(image.id)
                        savedNPYData = npyDataResponse.data
                    })

                    it("should return the npy data", () => {
                        expect(savedNPYData).toBeDefined()
                    })
                })

                describe("after deleting the image and then trying to get npy data", () => {
                    beforeEach(async () => {
                        await client.deleteImage(image.id)
                    })

                    it("should reject the call with not found", async () => {
                        await expect(client.getNpyData(image.id)).rejects.toThrow(/Request failed with status code 404/)
                    })
                })
            })

            describe("when listing images as a different user", () => {
                let images: ImageList;

                beforeEach(async () => {
                    // authenticate second user
                    await authenticateUser(backendService, httpClient2, "test2@test")

                    const response = await client2.listImages()
                    images = response.data
                })

                it("should return an empty list", () => {
                    expect(images.images).toHaveLength(0)
                })

            })

            describe("when listing images as a service account", () => {

                let images: ImageList;

                beforeEach(async () => {
                    // authenticate the service account
                    await authenticateUser(backendService, httpClient2, "service-account@test.test")

                    const response = await client2.listImages()
                    images = response.data
                })

                it("should return an empty list", async () => {
                    expect(images.images).toHaveLength(0)
                })
            })

            describe("when updating an image belonging to a different user", () => {

                beforeEach(async () => {
                    // authenticate second user
                    await authenticateUser(backendService, httpClient2, "test2@test")
                })

                it("should reject the request with not found error", async () => {
                    await expect(client2.updateImage(image.id, {
                        label: "test2",
                        current_iterations: 1,
                        status: UpdateImageInputStatusEnum.Processing
                    })).rejects.toThrow(/Request failed with status code 404/)
                })
            })

            describe("when updating a pending image with a service account", () => {

                let updatedImage: Image;

                beforeEach(async () => {
                    // authenticate service account
                    await authenticateUser(backendService, httpClient2, "service-account@test.test")
                })

                it("should fail with 404", async () => {
                    await expect(client2.updateImage(image.id, {
                        label: "test2",
                        current_iterations: 1,
                        status: UpdateImageInputStatusEnum.Processing
                    })).rejects.toThrow(/Request failed with status code 404/)
                })

            })

            describe("when processing an image as a service account", () => {
                let processingImage: Image;

                beforeEach(async () => {
                    // authenticate as service account
                    await authenticateUser(backendService, httpClient2, "service-account@test.test")
                })

                beforeEach(async () => {
                    // process the image
                    const response = await client2.processImage()
                    processingImage = response.data
                })

                it("should return the image with status=processing", () => {
                    expect(processingImage.id).toBe(image.id)
                    expect(processingImage.status).toBe(UpdateImageInputStatusEnum.Processing)
                })

                describe("when processing again with no pending images", () => {
                    beforeEach(async () => {
                        // process the image
                        const response = await client2.processImage()
                        processingImage = response.data
                    })

                    it("should return null", () => {
                        expect(processingImage).toBeNull()
                    })

                })

                describe("when updating a processing image with a service account", () => {

                    let updatedImage: Image;

                    beforeEach(async () => {
                        // authenticate service account
                        await authenticateUser(backendService, httpClient2, "service-account@test.test")
                    })

                    beforeEach(async () => {
                        // update the image
                        const response = await client2.updateImage(image.id, {
                            label: "test2",
                            current_iterations: 1,
                            status: UpdateImageInputStatusEnum.Processing
                        })
                        updatedImage = response.data
                    })

                    it("should update the image", async () => {
                        expect(updatedImage.id).toBe(image.id)
                        expect(updatedImage.label).toBe("test2")
                        expect(updatedImage.iterations).toBe(1)
                        expect(updatedImage.status).toBe(UpdateImageInputStatusEnum.Processing)
                        expect(updatedImage.current_iterations).toBe(1)
                    })

                })
            })

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
                    await authenticateUser(backendService, httpClient2, "test2@test")
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

            describe("when deleting an image with a service account", () => {
                beforeEach(async () => {
                    // authenticate as service account
                    await authenticateUser(backendService, httpClient2, "service-account@test.test")
                })

                it("should reject the request with not found error", async () => {
                    await expect(client2.deleteImage(image.id)).rejects.toThrow(/Request failed with status code 404/)
                })
            })

            describe("when deleting an image that doesn't exist", () => {
                it("should reject the request with not found error", async () => {
                    await expect(client.deleteImage("does-not-exist")).rejects.toThrow(/Request failed with status code 404/)
                })
            })
        })

        describe("when creating an image with enable_video=true", () => {
            let image: Image;

            beforeEach(async () => {
                const response = await client.createImage({
                    enable_video: true,
                    phrases: ["test"],
                    label: "test",
                    width: 512,
                    height: 512,
                    iterations: 1,
                })
                image = response.data
            })

            it("should return the image with enable_video=true", () => {
                expect(image.enable_video).toBe(true)
            })

            describe("when getting the image by id", () => {
                let image2: Image;

                beforeEach(async () => {
                    const response = await client.getImage(image.id)
                    image2 = response.data
                })

                it("should return the image with enable_video=true", () => {
                    expect(image2.enable_video).toBe(true)
                })
            })

            describe("when getting video data", () => {
                // should fail with 404
                it("should fail with 404", async () => {
                    await expect(client.getVideoData(image.id)).rejects.toThrow(/Request failed with status code 404/)
                })
            })


            describe("when updating video data as a service account", () => {

                const fakeVideoData = new Uint8Array([1, 2, 3, 4])
                let resp: AxiosResponse<void>;

                beforeEach(async () => {
                    // authenticate as service account
                    await authenticateUser(backendService, httpClient, "service-account@test.test")
                })

                beforeEach(async () => {
                    resp = await client.updateVideoData(image.id, Buffer.from(fakeVideoData).toString("binary"), {
                        headers: {
                            "Content-Type": "video/mp4"
                        },
                    })
                })

                // should succeed
                it("should succeed", async () => {
                    expect(resp.status).toBe(204)
                })

                describe("when getting video data", () => {
                    // should match
                    it("should match", async () => {
                        const response = await client.getVideoData(image.id, {
                            responseType: "arraybuffer"
                        })
                        const responseData = response.data as Buffer;
                        expect(new Uint8Array(responseData)).toEqual(fakeVideoData)
                    })
                })
            })

            describe("when updating video data as another user", () => {
                beforeEach(async () => {
                    // authenticate second user
                    await authenticateUser(backendService, httpClient2, "test2@test")
                })

                it("should fail with 404", async () => {
                    await expect(client2.updateVideoData(image.id, "", {})).rejects.toThrow(/Request failed with status code 404/)
                })
            })

        }) // end of describe "when creating an image with enable_video=true"

        describe("when creating an image with enable_video=true and enable_zoom=true and default zoom options", () => {
            let image: Image;

            beforeEach(async () => {
                const response = await client.createImage({
                    enable_video: true,
                    phrases: ["test"],
                    label: "test",
                    width: 512,
                    height: 512,
                    iterations: 1,
                    enable_zoom: true,
                })
                image = response.data
            })

            it("should return the image with enable_video=true and enable_zoom=true and default zoom options", () => {
                expect(image.enable_video).toBe(true)
                expect(image.enable_zoom).toBe(true)
                expect(image.zoom_frequency).toBe(10)
                expect(image.zoom_scale).toBe(0.99)
                expect(image.zoom_shift_x).toBe(0)
                expect(image.zoom_shift_y).toBe(0)
            })

            describe("when getting the image by id", () => {
                let image2: Image;

                beforeEach(async () => {
                    const response = await client.getImage(image.id)
                    image2 = response.data
                })

                it("should return the image with enable_video=true and enable_zoom=true and default zoom options", () => {
                    expect(image2.enable_video).toBe(true)
                    expect(image2.enable_zoom).toBe(true)
                    expect(image2.zoom_frequency).toBe(10)
                    expect(image2.zoom_scale).toBe(0.99)
                    expect(image2.zoom_shift_x).toBe(0)
                    expect(image2.zoom_shift_y).toBe(0)
                })
            })

            describe("when listing images", () => {
                let listResponse: AxiosResponse<ImageList>;

                beforeEach(async () => {
                    listResponse = await client.listImages()
                })

                it("should return the image with enable_video=true and enable_zoom=true and default zoom options", () => {
                    expect(listResponse.data.images[0].enable_video).toBe(true)
                    expect(listResponse.data.images[0].enable_zoom).toBe(true)
                    expect(listResponse.data.images[0].zoom_frequency).toBe(10)
                    expect(listResponse.data.images[0].zoom_scale).toBe(0.99)
                    expect(listResponse.data.images[0].zoom_shift_x).toBe(0)
                    expect(listResponse.data.images[0].zoom_shift_y).toBe(0)
                })
            })

            describe("when processing an image as a service acct with zoom_supported=false", () => {

                let processResponse: AxiosResponse<Image>;

                // authenticate as service account
                beforeEach(async () => {
                    await authenticateUser(
                        backendService,
                        httpClient,
                        "service-account@test.test"
                    )
                })

                beforeEach(async () => {
                    processResponse = await client.processImage({
                        zoom_supported: false,
                    })
                })

                it("should return null", () => {
                    expect(processResponse.data).toBe(null)
                })
            })

            describe("when processing an image as a service acct with zoom_supported=true", () => {

                let processResponse: AxiosResponse<Image>;

                // authenticate as service account
                beforeEach(async () => {
                    await authenticateUser(
                        backendService,
                        httpClient,
                        "service-account@test.test"
                    )
                })

                beforeEach(async () => {
                    processResponse = await client.processImage({
                        zoom_supported: true,
                    })
                })

                it("should return the image", () => {
                    expect(processResponse.data.id).toBe(image.id)
                })
            })
        }) // end of describe "when creating an image with enable_video=true and enable_zoom=true and default zoom options"

        describe("when creating an image with enable_video=true and enable_zoom=true and non-default zoom options", () => {
            let image: Image;

            beforeEach(async () => {
                const response = await client.createImage({
                    enable_video: true,
                    phrases: ["test"],
                    label: "test",
                    width: 512,
                    height: 512,
                    iterations: 1,
                    enable_zoom: true,
                    zoom_frequency: 20,
                    zoom_scale: 0.98,
                    zoom_shift_x: 1,
                    zoom_shift_y: 2,
                })
                image = response.data
            })

            it("should return the image with enable_video=true and enable_zoom=true and non-default zoom options", () => {
                expect(image.enable_video).toBe(true)
                expect(image.enable_zoom).toBe(true)
                expect(image.zoom_frequency).toBe(20)
                expect(image.zoom_scale).toBe(0.98)
                expect(image.zoom_shift_x).toBe(1)
                expect(image.zoom_shift_y).toBe(2)
            })

            describe("when getting the image by id", () => {
                let image2: Image;

                beforeEach(async () => {
                    const response = await client.getImage(image.id)
                    image2 = response.data
                })

                it("should return the image with enable_video=true and enable_zoom=true and non-default zoom options", () => {
                    expect(image2.enable_video).toBe(true)
                    expect(image2.enable_zoom).toBe(true)
                    expect(image2.zoom_frequency).toBe(20)
                    expect(image2.zoom_scale).toBe(0.98)
                    expect(image2.zoom_shift_x).toBe(1)
                    expect(image2.zoom_shift_y).toBe(2)
                })
            })

            describe("when listing images", () => {
                let listResponse: AxiosResponse<ImageList>;

                beforeEach(async () => {
                    listResponse = await client.listImages()
                })

                it("should return the image with enable_video=true and enable_zoom=true and non-default zoom options", () => {
                    expect(listResponse.data.images[0].enable_video).toBe(true)
                    expect(listResponse.data.images[0].enable_zoom).toBe(true)
                    expect(listResponse.data.images[0].zoom_frequency).toBe(20)
                    expect(listResponse.data.images[0].zoom_scale).toBe(0.98)
                    expect(listResponse.data.images[0].zoom_shift_x).toBe(1)
                    expect(listResponse.data.images[0].zoom_shift_y).toBe(2)
                })
            })
        }) // end of describe "when creating an image with enable_video=true and enable_zoom=true and non-default zoom options"

        describe("when creating an image with encoded_image", () => {
            let image: Image;

            beforeEach(async () => {
                // read 512.jpg from file and base64 encode it
                const imageData = fs.readFileSync("512.jpg")
                const base64Image = Buffer.from(imageData).toString('base64')
                const response = await client.createImage({
                    encoded_image: base64Image,
                    phrases: ["test"],
                    label: "test",
                    width: 512,
                    height: 512,
                    iterations: 1
                })
                image = response.data
            })

            it("should save the image data", async () => {
                // get image data
                const imageDataResponse = await client.getImageData(image.id)
                const imageData = imageDataResponse.data
                expect(imageData).toBeDefined()
                // thumbnail should be smaller
                const thumbnailDataResponse = await client.getThumbnailData(image.id)
                const thumbnailData = thumbnailDataResponse.data
                expect(thumbnailData).toBeDefined()
                expect(thumbnailData.length).toBeLessThan(imageData.length)
            })
        }) // end of describe "when creating an image with encoded_image"

        describe("when creating an image with encoded_mask", () => {
            let image: Image;

            beforeEach(async () => {
                // read 512.jpg from file and base64 encode it
                const imageData = fs.readFileSync("512.jpg")
                const base64Image = Buffer.from(imageData).toString('base64')
                const response = await client.createImage({
                    encoded_image: base64Image,
                    encoded_mask: base64Image,
                    phrases: ["test"],
                    label: "test",
                    width: 512,
                    height: 512,
                    iterations: 1
                })
                image = response.data
            })

            it("should save the mask data", async () => {
                // get image data
                const maskDataResponse = await client.getMaskData(image.id)
                const maskData = maskDataResponse.data
                expect(maskData).toBeDefined()
            })
        }) // end of describe "when creating an image with encoded_mask"


        describe("when creating an image with non-default glid-3 xl options", () => {
            let image: Image;

            beforeEach(async () => {
                const response = await client.createImage({
                    phrases: ["test"],
                    label: "test",
                    width: 256,
                    height: 256,
                    iterations: 2,
                    parent: "",
                    model: "glid_3_xl",
                    glid_3_xl_clip_guidance: true,
                    glid_3_xl_clip_guidance_scale: 300,
                    glid_3_xl_skip_iterations: 1
                })
                image = response.data
            })

            it("should return the image", () => {
                expect(image.model).toBe("glid_3_xl")
                expect(image.glid_3_xl_clip_guidance).toBe(true)
                expect(image.glid_3_xl_clip_guidance_scale).toBe(300)
                expect(image.glid_3_xl_skip_iterations).toBe(1)
            })
        })

        describe("when creating an image with a service account", () => {

            beforeEach(async () => {
                // authenticate as service account
                await authenticateUser(backendService, httpClient, "service-account@test.test")
            })

            it("should fail with 403", async () => {
                await expect(client.createImage({
                    phrases: ["test"],
                    label: "test",
                    iterations: 1
                })).rejects.toThrow(/Request failed with status code 403/)
            })
        })

        describe("image pagination", () => {


            let images: Array<Image>;
            let listResponse: AxiosResponse<ImageList>;

            beforeEach(async () => {
                images = [];
                // create images
                for (let i = 0; i < 10; i++) {
                    const resp = await client.createImage({
                        phrases: ["test"],
                        label: "test",
                        width: 512,
                        height: 512,
                        iterations: 1
                    })
                    images.push(resp.data)
                    await sleep(100)
                }
            })

            describe("when listing images with limit=2, direction=desc", () => {
                beforeEach(async () => {
                    listResponse = await client.listImages(images[0].updated_at, 2, "asc")
                })

                it("should return the 2 oldest images", () => {
                    expect(listResponse.data.images).toHaveLength(2)
                    expect(listResponse.data.images[0].id).toBe(images[0].id)
                    expect(listResponse.data.images[1].id).toBe(images[1].id)
                })
            })

            describe("when listing images with limit=2, direction=asc", () => {
                beforeEach(async () => {
                    listResponse = await client.listImages(images[9].updated_at, 2, "desc")
                })

                it("should return the 2 newest images", () => {
                    expect(listResponse.data.images).toHaveLength(2)
                    expect(listResponse.data.images[0].id).toBe(images[9].id)
                    expect(listResponse.data.images[1].id).toBe(images[8].id)
                })
            })

            describe("when listing images starting with the third image, limit=2, direction=asc", () => {
                beforeEach(async () => {
                    listResponse = await client.listImages(images[2].updated_at, 2, "asc")
                })

                it("should return the third and fourth images", () => {
                    expect(listResponse.data.images).toHaveLength(2)
                    expect(listResponse.data.images[0].id).toBe(images[2].id)
                    expect(listResponse.data.images[1].id).toBe(images[3].id)
                })
            })

            describe("when listing images starting with the third image, no limit, direction=asc", () => {
                beforeEach(async () => {
                    listResponse = await client.listImages(images[2].updated_at, undefined, "asc")
                })

                it("should return the last 8 images", () => {
                    expect(listResponse.data.images).toHaveLength(8)
                    expect(listResponse.data.images[0].id).toBe(images[2].id)
                    expect(listResponse.data.images[7].id).toBe(images[9].id)
                })
            })

            describe("when listing images starting with the third image, no limit, direction=desc", () => {
                beforeEach(async () => {
                    listResponse = await client.listImages(images[2].updated_at, undefined, "desc")
                })

                it("should return the first 3 images", () => {
                    expect(listResponse.data.images).toHaveLength(3)
                    expect(listResponse.data.images[0].id).toBe(images[2].id)
                    expect(listResponse.data.images[2].id).toBe(images[0].id)
                })
            })
        })

        describe("when listing suggestion seeds from an empty database", () => {
            let listResponse: AxiosResponse<SuggestionSeedList>;

            beforeEach(async () => {
                listResponse = await client.listSuggestionSeeds()
            })

            it("should return an empty list", () => {
                expect(listResponse.data.suggestionSeeds).toHaveLength(0)
            })
        })

        describe("when getting a suggestion seed that doesn't exist", () => {
            it("should return 404", async () => {
                await expect(client.getSuggestionSeed("123")).rejects.toThrow(/Request failed with status code 404/)
            })
        })

        describe("when updating a suggestion seed that doesn't exist", () => {
            it("should return 404", async () => {
                await expect(client.updateSuggestionSeed("123", {
                    name: "test",
                    description: "test",
                    items: ["test"],
                })).rejects.toThrow(/Request failed with status code 404/)
            })
        })

        describe("when creating a suggestion seed", () => {
            let createResponse: AxiosResponse<SuggestionSeed>;

            beforeEach(async () => {
                createResponse = await client.createSuggestionSeed({
                    name: "test",
                    description: "test",
                    items: ["test"]
                })
            })

            it("should return the created suggestion seed", () => {
                expect(createResponse.data.id).toBeDefined()
                expect(createResponse.data.name).toBe("test")
                expect(createResponse.data.description).toBe("test")
                expect(createResponse.data.items).toHaveLength(1)
                expect(createResponse.data.items[0]).toBe("test")
            })

            describe("when listing suggestion seeds", () => {
                let listResponse: AxiosResponse<SuggestionSeedList>;

                beforeEach(async () => {
                    listResponse = await client.listSuggestionSeeds()
                })

                it("should return the created suggestion seed", () => {
                    expect(listResponse.data.suggestionSeeds).toHaveLength(1)
                    expect(listResponse.data.suggestionSeeds[0].id).toBe(createResponse.data.id)
                    expect(listResponse.data.suggestionSeeds[0].name).toBe("test")
                    expect(listResponse.data.suggestionSeeds[0].description).toBe("test")
                })
            })

            describe("when listing suggestion seeds as another user", () => {
                let listResponse: AxiosResponse<SuggestionSeedList>;

                beforeEach(async () => {
                    // authenticate as second user
                    await authenticateUser(backendService, httpClient2, "test2@test")
                })

                beforeEach(async () => {
                    listResponse = await client2.listSuggestionSeeds()
                })

                it("should return an empty list", () => {
                    expect(listResponse.data.suggestionSeeds).toHaveLength(0)
                })
            })

            describe("when getting a suggestion seed by id", () => {
                let getResponse: AxiosResponse<SuggestionSeed>;

                beforeEach(async () => {
                    getResponse = await client.getSuggestionSeed(createResponse.data.id)
                })

                it("should return the created suggestion seed", () => {
                    expect(getResponse.data.id).toBe(createResponse.data.id)
                    expect(getResponse.data.name).toBe("test")
                    expect(getResponse.data.description).toBe("test")
                })
            })

            describe("when getting a suggestion seed as another user", () => {
                beforeEach(async () => {
                    // authenticate second user
                    await authenticateUser(backendService, httpClient2, "test2@test")
                })

                it("should return 404", async () => {
                    await expect(client2.getSuggestionSeed(createResponse.data.id)).rejects.toThrow(/Request failed with status code 404/)
                })
            })

            // test update suggestion seed
            describe("when updating a suggestion seed", () => {
                let updateResponse: AxiosResponse<SuggestionSeed>;

                beforeEach(async () => {
                    updateResponse = await client.updateSuggestionSeed(createResponse.data.id, {
                        name: "test2",
                        description: "test2",
                        items: ["test2"]
                    })
                })

                it("should return the updated suggestion seed", () => {
                    expect(updateResponse.data.id).toBe(createResponse.data.id)
                    expect(updateResponse.data.name).toBe("test2")
                    expect(updateResponse.data.description).toBe("test2")
                    expect(updateResponse.data.items).toHaveLength(1)
                    expect(updateResponse.data.items[0]).toBe("test2")
                })

                describe("when getting a suggestion seed by id", () => {
                    let getResponse: AxiosResponse<SuggestionSeed>;

                    beforeEach(async () => {
                        getResponse = await client.getSuggestionSeed(createResponse.data.id)
                    })

                    it("should return the updated suggestion seed", () => {
                        expect(getResponse.data.id).toBe(createResponse.data.id)
                        expect(getResponse.data.name).toBe("test2")
                        expect(getResponse.data.description).toBe("test2")
                    })
                })
            })

            // test delete suggestion seed
            describe("when deleting a suggestion seed", () => {
                let deleteResponse: AxiosResponse<void>;

                beforeEach(async () => {
                    deleteResponse = await client.deleteSuggestionSeed(createResponse.data.id)
                })

                it("should return a no-content response", () => {
                    expect(deleteResponse.status).toBe(204)
                })

                describe("when getting a suggestion seed by id", () => {
                    it("should return 404", async () => {
                        await expect(client.getSuggestionSeed(createResponse.data.id)).rejects.toThrow(/Request failed with status code 404/)
                    })
                })
            })

            // test delete suggestion seed as another user
            describe("when deleting a suggestion seed as another user", () => {
                beforeEach(async () => {
                    // authenticate second user
                    await authenticateUser(backendService, httpClient2, "test2@test")
                })

                it("should return 404", async () => {
                    await expect(client2.deleteSuggestionSeed(createResponse.data.id)).rejects.toThrow(/Request failed with status code 404/)
                })
            })

        }) // end suggestion seed crud tests

        // suggestions job tests
        describe("when listing suggestion jobs from an empty database", () => {
            let listResponse: AxiosResponse<SuggestionsJobList>;

            beforeEach(async () => {
                listResponse = await client.listSuggestionsJobs()
            })

            it("should return an empty list", () => {
                expect(listResponse.data.suggestionsJobs).toHaveLength(0)
            })
        })

        describe("when getting a suggestions job by id that doesn't exist", () => {
            it("should return 404", async () => {
                await expect(client.getSuggestionsJob("123")).rejects.toThrow(/Request failed with status code 404/)
            })
        })

        describe("when creating a suggestions job", () => {

            let createResponse: AxiosResponse<SuggestionsJob>;
            let createSeedResponse: AxiosResponse<SuggestionSeed>;

            beforeEach(async () => {
                createSeedResponse = await client.createSuggestionSeed({
                    name: "test",
                    description: "test",
                    items: ["test"],
                })
            })

            beforeEach(async () => {
                createResponse = await client.createSuggestionsJob({
                    seed_id: createSeedResponse.data.id,
                })
            })

            it("should return the created suggestions job", () => {
                expect(createResponse.data.id).toBeDefined()
                expect(createResponse.data.seed_id).toBe(createSeedResponse.data.id)
                // created_at, created_by, updated_at
                expect(createResponse.data.created_at).toBeDefined()
                expect(createResponse.data.created_by).toEqual(hash("test@test.test"))
                expect(createResponse.data.updated_at).toBeDefined()
                expect(createResponse.data.result).toEqual([])
            })

            describe("when listing suggestions jobs", () => {
                let listResponse: AxiosResponse<SuggestionsJobList>;

                beforeEach(async () => {
                    listResponse = await client.listSuggestionsJobs()
                })

                it("should return the created suggestions job", () => {
                    expect(listResponse.data.suggestionsJobs).toHaveLength(1)
                    expect(listResponse.data.suggestionsJobs[0].id).toBe(createResponse.data.id)
                    expect(listResponse.data.suggestionsJobs[0].seed_id).toBe(createSeedResponse.data.id)
                    expect(listResponse.data.suggestionsJobs[0].created_at).toBeDefined()
                    expect(listResponse.data.suggestionsJobs[0].created_by).toEqual(hash("test@test.test"))
                    expect(listResponse.data.suggestionsJobs[0].updated_at).toBeDefined()
                    expect(listResponse.data.suggestionsJobs[0].result).toEqual([])
                })
            })

            describe("when getting a suggestions job by id", () => {
                let getResponse: AxiosResponse<SuggestionsJob>;

                beforeEach(async () => {
                    getResponse = await client.getSuggestionsJob(createResponse.data.id)
                })

                it("should return the created suggestions job", () => {
                    expect(getResponse.data.id).toBe(createResponse.data.id)
                    expect(getResponse.data.seed_id).toBe(createSeedResponse.data.id)
                    expect(getResponse.data.created_at).toBeDefined()
                    expect(getResponse.data.created_by).toEqual(hash("test@test.test"))
                    expect(getResponse.data.updated_at).toBeDefined()
                    expect(getResponse.data.result).toEqual([])
                })
            })

            describe("when getting a suggestions job as another user", () => {
                beforeEach(async () => {
                    // authenticate second user
                    await authenticateUser(backendService, httpClient2, "test2@test")
                })

                it("should return 404", async () => {
                    await expect(client2.getSuggestionsJob(createResponse.data.id)).rejects.toThrow(/Request failed with status code 404/)
                })
            })

            // get by id with service account
            describe("when getting a suggestions job by id with service account", () => {
                let getResponse: AxiosResponse<SuggestionsJob>;

                beforeEach(async () => {
                    await authenticateUser(backendService, httpClient2, "service-account@test.test")
                })

                beforeEach(async () => {
                    getResponse = await client2.getSuggestionsJob(createResponse.data.id)
                })

                it("should return the created suggestions job", () => {
                    expect(getResponse.data.id).toBe(createResponse.data.id)
                    expect(getResponse.data.seed_id).toBe(createSeedResponse.data.id)
                    expect(getResponse.data.created_at).toBeDefined()
                    expect(getResponse.data.created_by).toEqual(hash("test@test.test"))
                    expect(getResponse.data.updated_at).toBeDefined()
                    expect(getResponse.data.result).toEqual([])
                })
            })

            describe("when updating a suggestions job", () => {
                let updateResponse: AxiosResponse<SuggestionsJob>;

                beforeEach(async () => {
                    updateResponse = await client.updateSuggestionsJob(createResponse.data.id, {
                        status: UpdateSuggestionsJobInputStatusEnum.Processing,
                        result: ["test"]
                    })
                })

                it("should return the updated suggestions job", () => {
                    expect(updateResponse.data.id).toBe(createResponse.data.id)
                    expect(updateResponse.data.status).toBe(UpdateSuggestionsJobInputStatusEnum.Processing)
                    expect(updateResponse.data.result).toEqual(["test"])
                    // other fields should be unchanged
                    expect(updateResponse.data.seed_id).toBe(createSeedResponse.data.id)
                    expect(updateResponse.data.created_at).toBeDefined()
                    expect(updateResponse.data.created_by).toEqual(hash("test@test.test"))
                    expect(updateResponse.data.updated_at).toBeDefined()
                })
            })

            describe("when updating a suggestions job as a service account", () => {
                let updateResponse: AxiosResponse<SuggestionsJob>;

                beforeEach(async () => {
                    // authenticate as a service account
                    await authenticateUser(backendService, httpClient, "service-account@test.test")
                })

                beforeEach(async () => {
                    updateResponse = await client.updateSuggestionsJob(createResponse.data.id, {
                        status: UpdateSuggestionsJobInputStatusEnum.Processing,
                        result: ["test"]
                    })
                })

                it("should return the updated suggestions job", () => {
                    expect(updateResponse.data.id).toBe(createResponse.data.id)
                    expect(updateResponse.data.status).toBe(UpdateSuggestionsJobInputStatusEnum.Processing)
                    expect(updateResponse.data.result).toEqual(["test"])
                    // other fields should be unchanged
                    expect(updateResponse.data.seed_id).toBe(createSeedResponse.data.id)
                    expect(updateResponse.data.created_at).toBeDefined()
                    expect(updateResponse.data.created_by).toEqual(hash("test@test.test"))
                    expect(updateResponse.data.updated_at).toBeDefined()
                })

                describe("when getting the suggestions job by id", () => {
                    let getResponse: AxiosResponse<SuggestionsJob>;

                    beforeEach(async () => {
                        getResponse = await client.getSuggestionsJob(createResponse.data.id)
                    })

                    it("should return the updated suggestions job", () => {
                        expect(getResponse.data.id).toBe(createResponse.data.id)
                        expect(getResponse.data.status).toBe(UpdateSuggestionsJobInputStatusEnum.Processing)
                        expect(getResponse.data.result).toEqual(["test"])
                        // other fields should be unchanged
                        expect(getResponse.data.seed_id).toBe(createSeedResponse.data.id)
                        expect(getResponse.data.created_at).toBeDefined()
                        expect(getResponse.data.created_by).toEqual(hash("test@test.test"))
                        expect(getResponse.data.updated_at).toBeDefined()
                    })
                })
            })

            describe("when updating a suggestions job as another user", () => {
                beforeEach(async () => {
                    // authenticate second user
                    await authenticateUser(backendService, httpClient2, "test2@test")
                })

                it("should return 404", async () => {
                    await expect(client2.updateSuggestionsJob(createResponse.data.id, {
                        status: UpdateSuggestionsJobInputStatusEnum.Processing,
                        result: ["test"]
                    })).rejects.toThrow(/Request failed with status code 404/)
                })
            })

            describe("when deleting a suggestions job", () => {
                let deleteResponse: AxiosResponse<void>;

                beforeEach(async () => {
                    deleteResponse = await client.deleteSuggestionsJob(createResponse.data.id)
                })

                it("should return with no content status code", () => {
                    expect(deleteResponse.status).toBe(204)
                })

                describe("when getting the suggestions job by id", () => {
                    it("should return 404", async () => {
                        await expect(client.getSuggestionsJob(createResponse.data.id)).rejects.toThrow(/Request failed with status code 404/)
                    })
                })
            })

            describe("when processing a suggestions job as a service account", () => {
                let processResponse: AxiosResponse<SuggestionsJob>;

                beforeEach(async () => {
                    // authenticate service account
                    await authenticateUser(backendService, httpClient2, "service-account@test.test")
                })

                beforeEach(async () => {
                    processResponse = await client2.processSuggestionsJob()
                })

                it("should update the suggestions job", () => {
                    expect(processResponse.data.id).toBe(createResponse.data.id)
                    expect(processResponse.data.status).toBe(UpdateSuggestionsJobInputStatusEnum.Processing)
                    expect(processResponse.data.result).toEqual([])
                    // other fields should be unchanged
                    expect(processResponse.data.seed_id).toBe(createSeedResponse.data.id)
                    expect(processResponse.data.created_at).toBeDefined()
                    expect(processResponse.data.created_by).toEqual(hash("test@test.test"))
                    expect(processResponse.data.updated_at).toBeDefined()
                })

                describe("when processing a suggestions job again", () => {
                    beforeEach(async () => {
                        processResponse = await client2.processSuggestionsJob()
                    })

                    it("should return null", () => {
                        expect(processResponse.data).toBeNull()
                    })
                })
            })
        })

        describe("when creating a suggestions job with a seed that doesn't exist", () => {
            it("should return 404", async () => {
                await expect(client.createSuggestionsJob({
                    seed_id: "123",
                })).rejects.toThrow(/Request failed with status code 404/)
            })
        })

        describe("when deleting a suggestions job that doesn't exist", () => {
            it("should return 404", async () => {
                await expect(client.deleteSuggestionsJob("123")).rejects.toThrow(/Request failed with status code 404/)
            })
        })

        // end suggestions job tests

        // test create service account
        describe("when creating a new private service account", () => {

            beforeEach(async () => {
                // const creds = await client.createServiceAccount({
                //     type: CreateServiceAccountInputTypeEnum.Private
                // });
                const creds = await backendService.createServiceAccountCreds("test@test.test", {
                    type: CreateServiceAccountInputTypeEnum.Private
                })
                httpClient2.defaults.headers["Authorization"] = `Bearer ${creds.accessToken}`
            })

            describe("when processing images for the creator's account", () => {
                let createResponse: AxiosResponse<Image>;
                let response: AxiosResponse<Image>;

                // create a new image
                beforeEach(async () => {
                    createResponse = await client.createImage({
                        phrases: ["test"],
                        label: "test",
                        width: 512,
                        height: 512,
                        iterations: 1,
                        parent: "",
                    })
                })

                beforeEach(async () => {
                    response = await client2.processImage({ zoom_supported: true });
                })

                it("should return pending images belonging to the creator", () => {
                    expect(response.status).toBe(200);
                    expect(response.data).not.toBeNull();
                    expect(response.data.id).toEqual(createResponse.data.id);
                })
            })

            describe("when processing images for a different user's account", () => {
                let createResponse: AxiosResponse<Image>;
                let response: AxiosResponse<Image>;

                // create a new image
                beforeEach(async () => {
                    // authenticate second user
                    await authenticateUser(backendService, httpClient, "test2@test")
                    createResponse = await client.createImage({
                        phrases: ["test"],
                        label: "test",
                        width: 512,
                        height: 512,
                        iterations: 1,
                        parent: "",
                    })
                })

                beforeEach(async () => {
                    response = await client2.processImage({ zoom_supported: true });
                })

                it("should return null", () => {
                    expect(response.status).toBe(200);
                    expect(response.data).toBeNull();
                })
            })
        })

        describe("when creating a new public service account", () => {
            beforeEach(async () => {
                // const creds = await client.createServiceAccount({
                //     type: CreateServiceAccountInputTypeEnum.Public
                // });
                const creds = await backendService.createServiceAccountCreds("test@test.test", {
                    type: CreateServiceAccountInputTypeEnum.Public
                })
                httpClient2.defaults.headers["Authorization"] = `Bearer ${creds.accessToken}`
            })

            describe("when processing images for the creator's account", () => {
                let createResponse: AxiosResponse<Image>;
                let response: AxiosResponse<Image>;

                // create a new image
                beforeEach(async () => {
                    createResponse = await client.createImage({
                        phrases: ["test"],
                        label: "test",
                        width: 512,
                        height: 512,
                        iterations: 1,
                        parent: "",
                    })
                })

                beforeEach(async () => {
                    response = await client2.processImage({ zoom_supported: true });
                })

                it("should return pending images belonging to the creator", () => {
                    expect(response.status).toBe(200);
                    expect(response.data).not.toBeNull();
                    expect(response.data.id).toEqual(createResponse.data.id);
                })
            })

            describe("when processing images for a different user's account", () => {
                let createResponse: AxiosResponse<Image>;
                let response: AxiosResponse<Image>;

                // create a new image
                beforeEach(async () => {
                    // authenticate second user
                    await authenticateUser(backendService, httpClient, "test2@test")
                    createResponse = await client.createImage({
                        phrases: ["test"],
                        label: "test",
                        width: 512,
                        height: 512,
                        iterations: 1,
                        parent: "",
                    })
                })

                beforeEach(async () => {
                    response = await client2.processImage({ zoom_supported: true });
                })

                it("should return pending images belonging to the creator", () => {
                    expect(response.status).toBe(200);
                    expect(response.data).not.toBeNull();
                    expect(response.data.id).toEqual(createResponse.data.id);
                })
            })

        }) // end create service account test

        // svg jobs tests
        describe("when creating a new svg job", () => {
            let createImageResponse: AxiosResponse<Image>;
            let createSvgResponse: AxiosResponse<SvgJob>;

            beforeEach(async () => {
                // authenticate second user as service account
                await authenticateUser(backendService, httpClient2, "service-account@test.test")
            })

            beforeEach(async () => {
                // create a new image
                createImageResponse = await client.createImage({
                    phrases: ["test"],
                    label: "test",
                    width: 512,
                    height: 512,
                    iterations: 1,
                    parent: "",
                })
            })

            beforeEach(async () => {
                // process the image to kick it into processing status
                await client2.processImage({ zoom_supported: true });
            })

            beforeEach(async () => {
                // update image to completed
                await client2.updateImage(createImageResponse.data.id, {
                    status: UpdateImageInputStatusEnum.Completed,
                })
            })

            beforeEach(async () => {
                // create the svg job
                createSvgResponse = await client.createSvgJob({
                    image_id: createImageResponse.data.id,
                })
            })

            it("should return the svg job", () => {
                expect(createSvgResponse.status).toBe(200);
                expect(createSvgResponse.data).not.toBeNull();
                expect(createSvgResponse.data.id).toBeDefined();
                expect(createSvgResponse.data.created_at).toBeDefined();
                expect(createSvgResponse.data.updated_at).toBeDefined();
                expect(createSvgResponse.data.status).toEqual(SvgJobStatusEnum.Pending);
                expect(createSvgResponse.data.image_id).toEqual(createImageResponse.data.id);
                expect(createSvgResponse.data.created_by).toEqual(hash("test@test.test"));
            })

            describe("when getting the svg job by id", () => {
                let response: AxiosResponse<SvgJob>;

                beforeEach(async () => {
                    response = await client.getSvgJob(createSvgResponse.data.id);
                })

                it("should return the svg job", () => {
                    expect(response.status).toBe(200);
                    expect(response.data).not.toBeNull();
                    expect(response.data.id).toBeDefined();
                    expect(response.data.created_at).toBeDefined();
                    expect(response.data.updated_at).toBeDefined();
                    expect(response.data.status).toEqual(SvgJobStatusEnum.Pending);
                    expect(response.data.image_id).toEqual(createImageResponse.data.id);
                    expect(response.data.created_by).toEqual(hash("test@test.test"))
                })
            })

            describe("when getting the svg job result", () => {
                let response: AxiosResponse<string>;

                beforeEach(async () => {
                    response = await client.getSvgJobResult(createSvgResponse.data.id);
                })

                it("should return the svg job result", () => {
                    expect(response.data).toHaveLength(0);
                })
            })

            describe("when updating the svg job with a service account while it's in pending", () => {
                it("should fail with 403", async () => {
                    await expect(client2.updateSvgJob(createSvgResponse.data.id, {
                        result: "<svg></svg>",
                    })).rejects.toThrow(/403/);
                })
            })

            describe("when getting the svg job by id as a service account", () => {
                let response: AxiosResponse<SvgJob>;

                beforeEach(async () => {
                    response = await client2.getSvgJob(createSvgResponse.data.id);
                })

                it("should return the svg job", () => {
                    expect(response.status).toBe(200);
                    expect(response.data).not.toBeNull();
                    expect(response.data.id).toBeDefined();
                    expect(response.data.created_at).toBeDefined();
                    expect(response.data.updated_at).toBeDefined();
                    expect(response.data.status).toEqual(SvgJobStatusEnum.Pending);
                    expect(response.data.image_id).toEqual(createImageResponse.data.id);
                    expect(response.data.created_by).toEqual(hash("test@test.test"))
                })
            })

            describe("when getting the svg job by id as another user", () => {
                let response: AxiosResponse<SvgJob>;

                beforeEach(async () => {
                    // authenticate as second user
                    await authenticateUser(backendService, httpClient2, "test2@test.test")
                })

                it("should fail with 404", async () => {
                    await expect(client2.getSvgJob(createSvgResponse.data.id)).rejects.toThrow(/Request failed with status code 404/);
                })

            })

            describe("when processing job as a public service account", () => {
                let response: AxiosResponse<SvgJob>;

                beforeEach(async () => {
                    // process job as service acct
                    response = await client2.processSvgJob(createSvgResponse.data.id);
                })

                it("should return the svg job", () => {
                    expect(response.status).toBe(200);
                    expect(response.data).not.toBeNull();
                    expect(response.data.id).toBeDefined();
                    expect(response.data.created_at).toBeDefined();
                    expect(response.data.updated_at).toBeDefined();
                    expect(response.data.status).toEqual(SvgJobStatusEnum.Processing);
                    expect(response.data.image_id).toEqual(createImageResponse.data.id);
                    expect(response.data.created_by).toEqual(hash("test@test.test"));
                })

                describe("when updating the svg job to completed with result as a service account", () => {
                    let response: AxiosResponse<SvgJob>;

                    beforeEach(async () => {
                        response = await client2.updateSvgJob(createSvgResponse.data.id, {
                            result: "<svg></svg>",
                        })
                    })

                    it("should return the updated job", () => {
                        expect(response.status).toBe(200);
                        expect(response.data).not.toBeNull();
                        expect(response.data.id).toBeDefined();
                        expect(response.data.created_at).toBeDefined();
                        expect(response.data.updated_at).toBeDefined();
                        expect(response.data.status).toEqual(SvgJobStatusEnum.Completed);
                        expect(response.data.image_id).toEqual(createImageResponse.data.id);
                        expect(response.data.created_by).toEqual(hash("test@test.test"))
                    })

                    describe("when updating the svg job after it is completed as a service account", () => {
                        it("should fail with 403", async () => {
                            await expect(client2.updateSvgJob(createSvgResponse.data.id, {
                                result: "<svg></svg>",
                            })).rejects.toThrow(/403/);
                        })
                    })
                })

                describe("when processing job again as a public service account", () => {
                    let response: AxiosResponse<SvgJob>;

                    beforeEach(async () => {
                        response = await client2.processSvgJob(createSvgResponse.data.id);
                    })

                    it("should return the svg job", () => {
                        expect(response.status).toBe(200);
                        expect(response.data).toBeNull()
                    })
                })

            })

            describe("when processing job as a private service account from the same user", () => {
                let createServiceAccountResponse: Authentication;
                let response: AxiosResponse<SvgJob>;

                beforeEach(async () => {
                    // create a private service account for the user
                    // createServiceAccountResponse = await client.createServiceAccount({
                    //     type: CreateServiceAccountInputTypeEnum.Private,
                    // });
                    createServiceAccountResponse = await backendService.createServiceAccountCreds("test@test.test", {
                        type: CreateServiceAccountInputTypeEnum.Private,
                    })
                })

                beforeEach(async () => {
                    // set credentials for the service account
                    httpClient2.defaults.headers["Authorization"] = `Bearer ${createServiceAccountResponse.accessToken}`;
                })

                beforeEach(async () => {
                    // process job as service acct
                    response = await client2.processSvgJob(createSvgResponse.data.id);
                })

                it("should return the svg job", () => {
                    expect(response.status).toBe(200);
                    expect(response.data).not.toBeNull();
                    expect(response.data.id).toBeDefined();
                    expect(response.data.created_at).toBeDefined();
                    expect(response.data.updated_at).toBeDefined();
                    expect(response.data.status).toEqual(SvgJobStatusEnum.Processing);
                    expect(response.data.image_id).toEqual(createImageResponse.data.id);
                    expect(response.data.created_by).toEqual(hash("test@test.test"));
                })
            })

            describe("when processing job as a private service account from a different user", () => {
                let createServiceAccountResponse: Authentication;
                let response: AxiosResponse<SvgJob>;

                beforeEach(async () => {
                    // authenticate as second user
                    await authenticateUser(backendService, httpClient, "test2@test.test")
                })

                beforeEach(async () => {
                    // create a private service account for the user
                    // createServiceAccountResponse = await client.createServiceAccount({
                    //     type: CreateServiceAccountInputTypeEnum.Private,
                    // });
                    createServiceAccountResponse = await backendService.createServiceAccountCreds("test2@test.test", {
                        type: CreateServiceAccountInputTypeEnum.Private,
                    })
                })

                beforeEach(async () => {
                    // set credentials for the service account
                    httpClient2.defaults.headers["Authorization"] = `Bearer ${createServiceAccountResponse.accessToken}`;
                })

                beforeEach(async () => {
                    // process job as service acct
                    response = await client2.processSvgJob(createSvgResponse.data.id);
                })

                it("should return null", () => {
                    expect(response.status).toBe(200);
                    expect(response.data).toBeNull()
                })
            })

            describe("when deleting the svg job as the owner", () => {
                let response: AxiosResponse<void>;

                beforeEach(async () => {
                    response = await client.deleteSvgJob(createSvgResponse.data.id);
                })

                it("should return 204", () => {
                    expect(response.status).toBe(204);
                })

                describe("when getting the svg job by id", () => {
                    it("should fail with 404", async () => {
                        await expect(client.getSvgJob(createSvgResponse.data.id)).rejects.toThrow(/Request failed with status code 404/);
                    })
                })
            })


            describe("when deleting the svg job as a different user", () => {

                beforeEach(async () => {
                    // authenticate as second user
                    await authenticateUser(backendService, httpClient2, "test2@test.test")
                })

                it("should fail with 404", async () => {
                    await expect(client2.deleteSvgJob(createSvgResponse.data.id)).rejects.toThrow(/Request failed with status code 404/);
                })
            })

            describe("when deleting the svg job as a service account", () => {

                let createServiceAccountResponse: Authentication;

                beforeEach(async () => {
                    // create a private service account for the user
                    // createServiceAccountResponse = await client.createServiceAccount({
                    //     type: CreateServiceAccountInputTypeEnum.Private,
                    // });
                    createServiceAccountResponse = await backendService.createServiceAccountCreds(
                        "test@test.test",
                        {
                            type: CreateServiceAccountInputTypeEnum.Private
                        },
                    );
                })

                beforeEach(async () => {
                    // set credentials for the service account
                    httpClient2.defaults.headers["Authorization"] = `Bearer ${createServiceAccountResponse.accessToken}`;
                })

                it("should fail with 403", async () => {
                    await expect(client2.deleteSvgJob(createSvgResponse.data.id)).rejects.toThrow(/Request failed with status code 403/);
                })
            })
        })
        // end svg jobs tests
    }) // end authenticated tests
})
