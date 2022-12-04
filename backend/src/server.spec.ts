import moment from 'moment'
import axios, { Axios, AxiosInstance, AxiosResponse } from "axios"
import fs from "fs"
import path from "path"

import { Server } from "./server"
import { BackendService } from "./backend"
import {
    AIBrushApi,
    FeatureList,
    ImageList,
    Image,
    IsAdminResponse,
    CreateImageInput,
    UpdateImageInput,
    LoginResult,
    UpdateImageInputStatusEnum,
    CreateServiceAccountInputTypeEnum,
    Worker,
    WorkerStatusEnum,
    ImageUrls,
} from "./client/api"

// import { Mailcatcher, MailcatcherMessage } from './mailcatcher'
import { Config } from './config'
import { Authentication, hash } from './auth'
import { sleep } from './sleep'
import { MetricsClient } from './metrics'
import { ConsoleLogger } from './logs'

jest.setTimeout(60000);

async function authenticateUser(backendService: BackendService, httpClient: AxiosInstance, emailAddress: string): Promise<Authentication> {
    const code = await backendService.login(emailAddress, false)
    const verifyResponse = await backendService.verify(code)
    // add the access token to the http client
    httpClient.defaults.headers['Authorization'] = `Bearer ${verifyResponse.accessToken}`
    return verifyResponse
}

async function authenticateWorker(backendService: BackendService, httpClient: AxiosInstance, worker: Worker): Promise<Authentication> {
    const code = await backendService.generateWorkerLoginCode(worker.id);
    const authResult = await backendService.loginAsWorker(code.login_code);
    httpClient.defaults.headers['Authorization'] = `Bearer ${authResult.accessToken}`;
    return authResult;
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
            adminUsers: ["admin@test.test"],
            assetsBaseUrl: "/api/images",
        }, new MetricsClient(""), new ConsoleLogger())
        const databases = await backendService.listDatabases()
        for (const db of databases) {
            if (db.startsWith("aibrush_test_")) {
                await backendService.dropDatabase(db)
            }
        }
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
            adminUsers: ["admin@test.test"],
            assetsBaseUrl: "/api/images",
        }, new MetricsClient(""), new ConsoleLogger())
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
            adminUsers: ["admin@test.test"],
            assetsBaseUrl: "/api/images",
            disableCleanupJob: true,
        }
        backendService = new BackendService(config, new MetricsClient(""), new ConsoleLogger())

        server = new Server(config, backendService, 35456, new MetricsClient(""), new ConsoleLogger(), null, null)
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

        describe("when getting the features (unset)", () => {
            let response: AxiosResponse<FeatureList>;

            beforeEach(async () => {
                process.env.PRIVACY_URI = "";
                process.env.TERMS_URI = "";
                response = await client.getFeatures();
            })

            it("should return the features", () => {
                expect(response.status).toBe(200);
                expect(response.data.privacy_uri).toBeFalsy();
                expect(response.data.terms_uri).toBeFalsy();
            })
        })

        describe("when getting the features (set)", () => {
            let response: AxiosResponse<FeatureList>;

            beforeEach(async () => {
                process.env.PRIVACY_URI = "https://privacy.com";
                process.env.TERMS_URI = "https://terms.com";
                response = await client.getFeatures();
            })

            it("should return the features", () => {
                expect(response.status).toBe(200);
                expect(response.data.privacy_uri).toBe("https://privacy.com");
                expect(response.data.terms_uri).toBe("https://terms.com");
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
        let worker: Worker;
        let worker2: Worker;

        beforeEach(async () => {
            verifyResult = await authenticateUser(backendService, httpClient, "test@test.test")
            worker = await backendService.createWorker("test worker");
            worker2 = await backendService.createWorker("test worker 2");
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
                image = response.data.images[0]
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
                expect(image.model).toBe("stable_diffusion_text2im")
                expect(image.glid_3_xl_skip_iterations).toBe(0)
                expect(image.glid_3_xl_clip_guidance).toBe(false)
                expect(image.glid_3_xl_clip_guidance_scale).toBe(150)
                expect(image.stable_diffusion_strength).toBe(0.75)
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

            describe("when getting image download urls", () => {
                let urls: ImageUrls;

                beforeEach(async () => {
                    const response = await client.getImageDownloadUrls(image.id)
                    urls = response.data
                })

                it("should return the image download urls", () => {
                    expect(urls).toBeDefined()
                })
            })

            describe("when getting image upload urls", () => {
                let urls: ImageUrls;

                beforeEach(async () => {
                    const response = await client.getImageUploadUrls(image.id)
                    urls = response.data
                })

                it("should return the image upload urls", () => {
                    expect(urls).toBeDefined()
                })
            })

            describe("when getting image upload urls as another user", () => {

                beforeEach(async () => {
                    await authenticateUser(backendService, httpClient2, "test2@test.test");
                })
                
                // it should fail with 404
                it("should fail", async () => {
                    await expect(client2.getImageUploadUrls(image.id)).rejects.toThrow(/404/)
                });
            })

            describe("when getting image upload urls as a service account", () => {
                // it should fail with 404
                beforeEach(async () => {
                    await authenticateWorker(backendService, httpClient2, worker);
                });

                it("should fail", async () => {
                    await expect(client2.getImageUploadUrls(image.id)).rejects.toThrow(/404/)
                });
            })

            describe("when getting the image with a service account", () => {
                let img: Image;

                beforeEach(async () => {
                    // authenticate as service account
                    // await authenticateUser(backendService, httpClient2, "service-account@test.test")
                    await authenticateWorker(backendService, httpClient2, worker)
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
                        status: UpdateImageInputStatusEnum.Processing,
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
                    // read 512.png from file and base64 encode it
                    const imageData = fs.readFileSync("512.png")
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
                        childImage = response.data.images[0]
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

                beforeEach(async () => {
                    // authenticate the service account
                    // await authenticateUser(backendService, httpClient2, "service-account@test.test")
                    await authenticateWorker(backendService, httpClient2, worker);
                })

                it("should reject the request with forbidden error", async () => {
                    await expect(client2.listImages()).rejects.toThrow(/Request failed with status code 403/)
                });
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
                // should fail with not found
                beforeEach(async () => {
                    // authenticate as service account
                    // await authenticateUser(backendService, httpClient2, "service-account@test.test")
                    await authenticateWorker(backendService, httpClient2, worker);
                })

                it("should reject the request with not found error", async () => {
                    await expect(client2.updateImage(image.id, {
                        label: "test2",
                        current_iterations: 1,
                        status: UpdateImageInputStatusEnum.Processing
                    })).rejects.toThrow(/Request failed with status code 404/)
                });
            })

            describe("when processing an image as a service account", () => {
                let processingImage: Image;

                beforeEach(async () => {
                    // authenticate as service account
                    // await authenticateUser(backendService, httpClient2, "service-account@test.test")
                    await authenticateWorker(backendService, httpClient2, worker);
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

                it("should update the worker to active", async () => {
                    const updatedWorker = await backendService.getWorker(worker.id);
                    expect(updatedWorker.status).toBe(WorkerStatusEnum.Active);
                });

                describe("when updating a processing image with the wrong service account", () => {
                    beforeEach(async () => {
                        // authenticate as second service account
                        await authenticateWorker(backendService, httpClient2, worker2);
                    });

                    it("should reject the request with not found error", async () => {
                        await expect(client2.updateImage(image.id, {
                            label: "test2",
                            current_iterations: 1,
                            status: UpdateImageInputStatusEnum.Processing
                        })).rejects.toThrow(/Request failed with status code 404/)
                    });
                })

                describe("when getting image upload urls after processing", () => {
                    let uploadUrls: ImageUrls;

                    beforeEach(async () => {
                        const response = await client2.getImageUploadUrls(processingImage.id)
                        uploadUrls = response.data
                    })

                    it("should return the upload urls", () => {
                        expect(uploadUrls).toBeDefined()
                    })
                });

                describe("when processing again with no pending images", () => {
                    beforeEach(async () => {
                        // process the image
                        const response = await client2.processImage()
                        processingImage = response.data
                    })

                    it("should return null", () => {
                        expect(processingImage).toBeNull()
                    })

                    it("should update the worker to idle", async () => {
                        const updatedWorker = await backendService.getWorker(worker.id);
                        expect(updatedWorker.status).toBe(WorkerStatusEnum.Idle);
                    });

                })

                describe("when updating a processing image to completed with a service account", () => {

                    let updatedImage: Image;

                    beforeEach(async () => {
                        // authenticate service account
                        // await authenticateUser(backendService, httpClient2, "service-account@test.test")
                        await authenticateWorker(backendService, httpClient2, worker);
                    })

                    beforeEach(async () => {
                        // update the image
                        const response = await client2.updateImage(image.id, {
                            label: "test2",
                            current_iterations: 1,
                            status: UpdateImageInputStatusEnum.Completed
                        })
                        updatedImage = response.data
                    })

                    it("should update the image", async () => {
                        expect(updatedImage.id).toBe(image.id)
                        expect(updatedImage.label).toBe("test2")
                        expect(updatedImage.iterations).toBe(1)
                        expect(updatedImage.status).toBe(UpdateImageInputStatusEnum.Completed)
                        expect(updatedImage.current_iterations).toBe(1)
                    })

                    describe("when updating the image again as a service account", () => {
                        // it will fail with not found
                        it("should reject the request with not found error", async () => {
                            await expect(client2.updateImage(image.id, {
                                label: "test2",
                                current_iterations: 1,
                                status: UpdateImageInputStatusEnum.Completed
                            })).rejects.toThrow(/Request failed with status code 404/)
                        });
                    })

                    describe("when getting image upload urls as a service account", () => {
                        // fails with 404
                        it("should reject the request with not found error", async () => {
                            await expect(client2.getImageUploadUrls(image.id)).rejects.toThrow(/Request failed with status code 404/)
                        });
                    })
                })
            })

            describe("when processing an image with peek=true", () => {
                let processingImage: Image;

                beforeEach(async () => {
                    // authenticate as service account
                    // await authenticateUser(backendService, httpClient2, "service-account@test.test")
                    await authenticateWorker(backendService, httpClient2, worker);
                })

                beforeEach(async () => {
                    // process the image
                    const response = await client2.processImage({
                        peek: true,
                    })
                    processingImage = response.data
                })

                it("should return the image with status=pending", () => {
                    expect(processingImage.id).toBe(image.id)
                    expect(processingImage.status).toBe(UpdateImageInputStatusEnum.Pending)
                })
            })

            describe("when processing an image with different model arg", () => {
                let processingImage: Image;

                beforeEach(async () => {
                    // authenticate as service account
                    // await authenticateUser(backendService, httpClient2, "service-account@test.test")
                    await authenticateWorker(backendService, httpClient2, worker);
                })

                beforeEach(async () => {
                    // process the image
                    const response = await client2.processImage({
                        model: "swinir"
                    })
                    processingImage = response.data
                })

                it("should return the null", () => {
                    expect(processingImage).toBeNull();
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

                    it("deleted_at should be set", () => {
                        expect(images.images).toHaveLength(1)
                        expect(images.images[0].deleted_at).toBeDefined()
                    })

                    describe("when hard deleting an image (already soft deleted)", () => {
                        beforeEach(async () => {
                            await client.deleteImage(image.id)
                        })

                        describe("when listing images", () => {
                            beforeEach(async () => {
                                const response = await client.listImages()
                                images = response.data
                            })

                            it("should not return the image", () => {
                                expect(images.images).toHaveLength(0)
                            })
                        })
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
                    // await authenticateUser(backendService, httpClient2, "service-account@test.test")
                    await authenticateWorker(backendService, httpClient2, worker);
                })

                it("should reject the request with forbidden error", async () => {
                    await expect(client2.deleteImage(image.id)).rejects.toThrow(/Request failed with status code 403/)
                })
            })

            describe("when deleting an image that doesn't exist", () => {
                it("should reject the request with not found error", async () => {
                    await expect(client.deleteImage("does-not-exist")).rejects.toThrow(/Request failed with status code 404/)
                })
            })
        })

        describe("batch get images", () => {
            // before each - create 2 images
            let image1: Image;
            let image2: Image;

            beforeEach(async () => {
                // create image
                const response = await client.createImage({
                    label: "test",
                    iterations: 1,
                    status: UpdateImageInputStatusEnum.Pending,
                    count: 2,
                    phrases: ["test"],
                })
                image1 = response.data.images[0]
                image2 = response.data.images[1]
            });

            describe("when getting images", () => {
                let images: ImageList;

                beforeEach(async () => {
                    const response = await client.batchGetImages({ids: [image1.id, image2.id]})
                    images = response.data
                })

                it("should return the images", () => {
                    expect(images.images).toHaveLength(2)
                    expect(images.images[0].id).toBe(image1.id)
                    expect(images.images[1].id).toBe(image2.id)
                })
            });

            describe("when getting images that don't exist", () => {
                let images: ImageList;

                beforeEach(async () => {
                    const response = await client.batchGetImages({ids: [image1.id, image2.id, "does-not-exist"]})
                    images = response.data
                })

                it("should return only existent images images", () => {
                    expect(images.images).toHaveLength(2)
                    expect(images.images[0].id).toBe(image1.id)
                    expect(images.images[1].id).toBe(image2.id)
                })
            });

            describe("when getting images as another user", () => {
                let images: ImageList;

                beforeEach(async () => {
                    // authenticate second user
                    await authenticateUser(backendService, httpClient2, "test2@test")
                })

                beforeEach(async () => {
                    const response = await client2.batchGetImages({ids: [image1.id, image2.id]})
                    images = response.data
                })

                it("should return no images", () => {
                    expect(images.images).toHaveLength(0)
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
                image = response.data.images[0]
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
                    // await authenticateUser(backendService, httpClient, "service-account@test.test")
                    await authenticateWorker(backendService, httpClient, worker);
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
                image = response.data.images[0]
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
                image = response.data.images[0]
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
                // read 512.png from file and base64 encode it
                const imageData = fs.readFileSync("512.png")
                const base64Image = Buffer.from(imageData).toString('base64')
                const response = await client.createImage({
                    encoded_image: base64Image,
                    phrases: ["test"],
                    label: "test",
                    width: 512,
                    height: 512,
                    iterations: 1
                })
                image = response.data.images[0]
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
                // read 512.png from file and base64 encode it
                const imageData = fs.readFileSync("512.png")
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
                image = response.data.images[0]
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
                image = response.data.images[0]
            })

            it("should return the image", () => {
                expect(image.model).toBe("glid_3_xl")
                expect(image.glid_3_xl_clip_guidance).toBe(true)
                expect(image.glid_3_xl_clip_guidance_scale).toBe(300)
                expect(image.glid_3_xl_skip_iterations).toBe(1)
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
                    images.push(resp.data.images[0])
                    await sleep(100)
                }
            })

            describe("when listing images with limit=2, direction=desc", () => {
                beforeEach(async () => {
                    listResponse = await client.listImages(images[0].updated_at, "", 2, "asc")
                })

                it("should return the 2 oldest images", () => {
                    expect(listResponse.data.images).toHaveLength(2)
                    expect(listResponse.data.images[0].id).toBe(images[0].id)
                    expect(listResponse.data.images[1].id).toBe(images[1].id)
                })
            })

            describe("when listing images with limit=2, direction=asc", () => {
                beforeEach(async () => {
                    listResponse = await client.listImages(images[9].updated_at, "", 2, "desc")
                })

                it("should return the 2 newest images", () => {
                    expect(listResponse.data.images).toHaveLength(2)
                    expect(listResponse.data.images[0].id).toBe(images[9].id)
                    expect(listResponse.data.images[1].id).toBe(images[8].id)
                })
            })

            describe("when listing images starting with the third image, limit=2, direction=asc", () => {
                beforeEach(async () => {
                    listResponse = await client.listImages(images[2].updated_at, "", 2, "asc")
                })

                it("should return the third and fourth images", () => {
                    expect(listResponse.data.images).toHaveLength(2)
                    expect(listResponse.data.images[0].id).toBe(images[2].id)
                    expect(listResponse.data.images[1].id).toBe(images[3].id)
                })
            })

            describe("when listing images starting with the third image, no limit, direction=asc", () => {
                beforeEach(async () => {
                    listResponse = await client.listImages(images[2].updated_at, "", undefined, "asc")
                })

                it("should return the last 8 images", () => {
                    expect(listResponse.data.images).toHaveLength(8)
                    expect(listResponse.data.images[0].id).toBe(images[2].id)
                    expect(listResponse.data.images[7].id).toBe(images[9].id)
                })
            })

            describe("when listing images starting with the third image, no limit, direction=desc", () => {
                beforeEach(async () => {
                    listResponse = await client.listImages(images[2].updated_at, "", undefined, "desc")
                })

                it("should return the first 3 images", () => {
                    expect(listResponse.data.images).toHaveLength(3)
                    expect(listResponse.data.images[0].id).toBe(images[2].id)
                    expect(listResponse.data.images[2].id).toBe(images[0].id)
                })
            })
        })

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
                let createResponse: AxiosResponse<ImageList>;
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
                    response = await client2.processImage();
                })

                it("should return pending images belonging to the creator", () => {
                    expect(response.status).toBe(200);
                    expect(response.data).not.toBeNull();
                    expect(response.data.id).toEqual(createResponse.data.images[0].id);
                })
            })

            describe("when processing images for a different user's account", () => {
                let createResponse: AxiosResponse<ImageList>;
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
                    response = await client2.processImage();
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
                let createResponse: AxiosResponse<ImageList>;
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
                    response = await client2.processImage();
                })

                it("should return pending images belonging to the creator", () => {
                    expect(response.status).toBe(200);
                    expect(response.data).not.toBeNull();
                    expect(response.data.id).toEqual(createResponse.data.images[0].id);
                })
            })

            describe("when processing images for a different user's account", () => {
                let createResponse: AxiosResponse<ImageList>;
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
                    response = await client2.processImage();
                })

                it("should return pending images belonging to the creator", () => {
                    expect(response.status).toBe(200);
                    expect(response.data).not.toBeNull();
                    expect(response.data.id).toEqual(createResponse.data.images[0].id);
                })
            })

        }) // end create service account test

        // is admin tests
        describe("when an admin user checks if they are an admin", () => {
            let response: AxiosResponse<IsAdminResponse>;

            beforeEach(async () => {
                await authenticateUser(backendService, httpClient, "admin@test.test");
                response = await client.isAdmin();
            })

            it("should return true", () => {
                expect(response.status).toBe(200);
                expect(response.data.is_admin).toBe(true);
            })
        })

        describe("when a non-admin user checks if they are an admin", () => {
            beforeEach(async () => {
                await authenticateUser(backendService, httpClient, "test@test.test")
            })

            it("should return false", async () => {
                const response = await client.isAdmin();
                expect(response.status).toBe(200);
                expect(response.data.is_admin).toBe(false);
            })
        })

    }) // end authenticated tests

    
})
