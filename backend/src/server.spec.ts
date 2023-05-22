import moment from "moment";
import axios, { Axios, AxiosInstance, AxiosResponse } from "axios";
import fs from "fs";
import path from "path";

import { Server } from "./server";
import { BackendService } from "./backend";
import {
    AIBrushApi,
    FeatureList,
    ImageList,
    Image,
    IsAdminResponse,
    CreateImageInput,
    UpdateImageInput,
    LoginResult,
    StatusEnum,
    Worker,
    WorkerStatusEnum,
    ImageUrls,
    GlobalSettings,
    StableDiffusionModel,
    Credits,
    DepositCode,
} from "./client/api";

const anonymousClient = axios.create();

// import { Mailcatcher, MailcatcherMessage } from './mailcatcher'
import { Config } from "./config";
import { Authentication, hash } from "./auth";
import { sleep } from "./sleep";
import { MetricsClient } from "./metrics";
import { ConsoleLogger } from "./logs";
import { WorkerSettings } from "./model";
import { HordeRequest, MockHordeQueue } from "./horde_queue";
import { FakeClock } from "./clock";

jest.setTimeout(60000);

async function authenticateUser(
    backendService: BackendService,
    httpClient: AxiosInstance,
    emailAddress: string
): Promise<Authentication> {
    const code = await backendService.login(emailAddress, false);
    const verifyResponse = await backendService.verify(code);
    // add the access token to the http client
    httpClient.defaults.headers[
        "Authorization"
    ] = `Bearer ${verifyResponse.accessToken}`;
    return verifyResponse;
}

async function refreshUser(
    client: AIBrushApi,
    httpClient: AxiosInstance,
    refreshToken: string
) {
    const response = await client.refresh(
        {
            refreshToken: refreshToken,
        },
        {
            headers: {
                Cookie: `refreshToken=${refreshToken};`,
            },
        }
    );
    const refreshResult = response.data;
    httpClient.defaults.headers[
        "Authorization"
    ] = `Bearer ${refreshResult.accessToken}`;
}

async function uploadTemporaryImage(
    client: AIBrushApi,
    filename: string
): Promise<string> {
    const tmpImage = await client.createTemporaryImage("png");
    const uploadUrl = tmpImage.data.upload_url;
    const imageData = fs.readFileSync(filename);
    await anonymousClient.put(uploadUrl, imageData, {
        headers: {
            "Content-Type": "image/png",
        },
    });
    return tmpImage.data.id;
}

describe("server", () => {
    let backendService: BackendService;
    let hordeQueue: MockHordeQueue;
    let server: Server;
    let client: AIBrushApi;
    let httpClient: AxiosInstance;
    // second user
    let client2: AIBrushApi;
    let httpClient2: AxiosInstance;
    let databaseName: string;
    let clock: FakeClock;

    beforeAll(async () => {
        backendService = new BackendService(
            {
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
            },
            new MetricsClient(""),
            new ConsoleLogger()
        );
        const databases = await backendService.listDatabases();
        for (const db of databases) {
            if (db.startsWith("aibrush_test_")) {
                await backendService.dropDatabase(db);
            }
        }
    });

    beforeEach(async () => {
        backendService = new BackendService(
            {
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
            },
            new MetricsClient(""),
            new ConsoleLogger()
        );
        databaseName = `aibrush_test_${moment().valueOf()}`;
        await backendService.createDatabase(databaseName);
        await sleep(100);
    });

    beforeEach(async () => {
        // remove all files in data folder
        try {
            const files = fs.readdirSync("./test_data");
            for (const file of files) {
                fs.unlinkSync("./test_data/" + file);
            }
        } catch {}

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
        };
        clock = new FakeClock(moment());
        backendService = new BackendService(
            config,
            new MetricsClient(""),
            new ConsoleLogger(),
            clock
        );

        server = new Server(
            config,
            backendService,
            35456,
            new MetricsClient(""),
            new ConsoleLogger()
        );
        await server.init();
        await server.start();

        httpClient = axios.create({});
        client = new AIBrushApi(
            undefined,
            "http://localhost:35456",
            httpClient
        );
        // second user
        httpClient2 = axios.create({});
        client2 = new AIBrushApi(
            undefined,
            "http://localhost:35456",
            httpClient2
        );
        hordeQueue = new MockHordeQueue();
        backendService.setHordeQueueForTesting(hordeQueue);

        await sleep(100);
    });

    afterEach(async () => {
        await server.stop();
        await sleep(100);
    });

    describe("when user is unauthenticated", () => {
        describe("when listing images", () => {
            it("should return 401", async () => {
                let error: any;
                try {
                    await client.listImages();
                } catch (e) {
                    error = e;
                }
                expect(error).toBeDefined();
                expect(error.response.status).toBe(401);
            });
        });

        describe("when getting the features (unset)", () => {
            let response: AxiosResponse<FeatureList>;

            beforeEach(async () => {
                process.env.PRIVACY_URI = "";
                process.env.TERMS_URI = "";
                response = await client.getFeatures();
            });

            it("should return the features", () => {
                expect(response.status).toBe(200);
                expect(response.data.privacy_uri).toBeFalsy();
                expect(response.data.terms_uri).toBeFalsy();
            });
        });

        describe("when getting the features (set)", () => {
            let response: AxiosResponse<FeatureList>;

            beforeEach(async () => {
                process.env.PRIVACY_URI = "https://privacy.com";
                process.env.TERMS_URI = "https://terms.com";
                response = await client.getFeatures();
            });

            it("should return the features", () => {
                expect(response.status).toBe(200);
                expect(response.data.privacy_uri).toBe("https://privacy.com");
                expect(response.data.terms_uri).toBe("https://terms.com");
            });
        });

        describe("when getting the stable diffusion models", () => {
            let response: AxiosResponse<{
                [key: string]: StableDiffusionModel;
            }>;

            beforeEach(async () => {
                response = await client.getModels();
            });

            it("should return the models", () => {
                expect(response.status).toBe(200);
                expect(Object.keys(response.data).length).toBeGreaterThan(0);
            });
        });
    });

    describe("functional tests", () => {
        let verifyResult: Authentication;
        let worker: Worker;
        let worker2: Worker;

        beforeEach(async () => {
            verifyResult = await authenticateUser(
                backendService,
                httpClient,
                "test@test.test"
            );
        });

        describe("when checking credits", () => {
            let credits: Credits;

            beforeEach(async () => {
                const response = await client.getCredits();
                credits = response.data;
            });

            it("should return the credits", () => {
                expect(credits.free_credits).toBe(0);
                expect(credits.paid_credits).toBe(0);
            });
        });

        describe("when listing images", () => {
            let images: ImageList;

            beforeEach(async () => {
                const response = await client.listImages();
                images = response.data;
            });

            it("should return an empty list", () => {
                expect(images.images).toHaveLength(0);
            });
        });

        describe("when listing images after refreshing access token", () => {
            let images: ImageList;

            beforeEach(async () => {
                await refreshUser(
                    client,
                    httpClient,
                    verifyResult.refreshToken
                );
                const response = await client.listImages();
                images = response.data;
            });

            it("should return an empty list", () => {
                expect(images.images).toHaveLength(0);
            });
        });

        describe("when creating an image with minimal params", () => {
            let image: Image;

            beforeEach(async () => {

                // add free credits
                await backendService.resetFreeCredits();

                const response = await client.createImage({
                    params: {
                        prompt: "test",
                        negative_prompt: "foobar",
                        steps: 1,
                        width: 512,
                        height: 512,
                    },
                    label: "test",
                    parent: "",
                    model: "stable_diffusion",
                    count: 1,
                });
                image = response.data.images[0];
            });

            it("should return the image", () => {
                expect(image.id).toBeDefined();
                expect(image.params.prompt).toBe("test");
                expect(image.params.negative_prompt).toBe("foobar");
                expect(image.label).toBe("test");
                expect(image.params.steps).toBe(1);
                expect(image.parent).toBe("");
                expect(image.model).toBe("stable_diffusion");

                // check legacy fields
                const legacyImage = image as any;
                expect(legacyImage.phrases).toEqual(["test"]);
                expect(legacyImage.negative_phrases).toEqual(["foobar"]);
                expect(legacyImage.iterations).toBe(1);
            });

            describe("when checking the horde queue", () => {
                let req: HordeRequest;

                beforeEach(async () => {
                    req = await hordeQueue.popImage();
                });

                it("should return the image", () => {
                    expect(req).toBeTruthy();
                    expect(req.imageId).toEqual(image.id);
                    expect(req.prompt).toEqual("test");
                    expect(req.negativePrompt).toEqual("foobar");
                });
            });

            describe("when listing images", () => {
                let images: ImageList;

                beforeEach(async () => {
                    const response = await client.listImages();
                    images = response.data;
                });

                it("should return the image", () => {
                    expect(images.images).toHaveLength(1);
                    expect(images.images[0].id).toBe(image.id);
                    expect(images.images[0].params.prompt).toBe("test");
                    expect(images.images[0].params.negative_prompt).toBe(
                        "foobar"
                    );
                    expect(images.images[0].label).toBe("test");
                    expect(images.images[0].params.steps).toBe(1);
                    expect(images.images[0].parent).toBe("");
                    expect(images.images[0].status).toBe(StatusEnum.Pending);
                });
            });

            describe("when listing images with limited fields", () => {
                let images: ImageList;

                beforeEach(async () => {
                    const response = await client.listImages(
                        undefined,
                        undefined,
                        undefined,
                        undefined,
                        "id,status"
                    );
                    images = response.data;
                });

                it("should return the image", () => {
                    expect(images.images).toHaveLength(1);
                    expect(images.images[0].id).toBe(image.id);
                    expect(images.images[0].params).toBeUndefined();
                    expect(images.images[0].label).toBeUndefined();
                    expect(images.images[0].status).toBe(StatusEnum.Pending);
                });
            });

            describe("when getting the image by id", () => {
                let img: Image;

                beforeEach(async () => {
                    const response = await client.getImage(image.id);
                    img = response.data;
                });

                it("should return the image", () => {
                    expect(img.id).toBeDefined();
                    expect(img.params.prompt).toBe("test");
                    expect(img.params.negative_prompt).toBe("foobar");
                    expect(img.label).toBe("test");
                    expect(img.params.steps).toBe(1);
                    expect(img.parent).toBe("");
                });
            });

            describe("when getting image download urls", () => {
                let urls: ImageUrls;

                beforeEach(async () => {
                    const response = await client.getImageDownloadUrls(
                        image.id
                    );
                    urls = response.data;
                });

                it("should return the image download urls", () => {
                    expect(urls).toBeDefined();
                });
            });

            describe("when getting image upload urls", () => {
                let urls: ImageUrls;

                beforeEach(async () => {
                    const response = await client.getImageUploadUrls(image.id);
                    urls = response.data;
                });

                it("should return the image upload urls", () => {
                    expect(urls).toBeDefined();
                });
            });

            describe("when getting image upload urls as another user", () => {
                beforeEach(async () => {
                    await authenticateUser(
                        backendService,
                        httpClient2,
                        "test2@test.test"
                    );
                });

                // it should fail with 404
                it("should fail", async () => {
                    await expect(
                        client2.getImageUploadUrls(image.id)
                    ).rejects.toThrow(/404/);
                });
            });

            describe("when getting the image by id with another user", () => {
                beforeEach(async () => {
                    // authenticate as second user
                    await authenticateUser(
                        backendService,
                        httpClient2,
                        "test2@test.test"
                    );
                });

                it("should reject the call with not found", async () => {
                    await expect(client2.getImage(image.id)).rejects.toThrow(
                        /Request failed with status code 404/
                    );
                });
            });

            describe("when getting an image that doesn't exist", () => {
                it("should reject the call with not found", async () => {
                    await expect(
                        client.getImage("does-not-exist")
                    ).rejects.toThrow(/Request failed with status code 404/);
                });
            });

            describe("when updating an image", () => {
                let updatedImage: Image;

                beforeEach(async () => {
                    const response = await client.updateImage(image.id, {
                        label: "test2",
                        status: StatusEnum.Processing,
                    });
                    updatedImage = response.data;
                });

                it("should return the updated image", () => {
                    expect(updatedImage.id).toBe(image.id);
                    expect(updatedImage.label).toBe("test2");
                    expect(updatedImage.params.steps).toBe(1);
                    expect(updatedImage.status).toBe(StatusEnum.Processing);
                });

                describe("when listing images", () => {
                    let images: ImageList;

                    beforeEach(async () => {
                        const response = await client.listImages();
                        images = response.data;
                    });

                    it("should return the updated image", () => {
                        expect(images.images).toHaveLength(1);
                        expect(images.images[0].id).toBe(image.id);
                        expect(images.images[0].label).toBe("test2");
                        expect(images.images[0].params.steps).toBe(1);
                        expect(images.images[0].parent).toBe("");
                        expect(images.images[0].status).toBe(
                            StatusEnum.Processing
                        );
                    });
                });
            });

            describe("when updating an image as completed", () => {
                beforeEach(async () => {
                    await client.updateImage(image.id, {
                        label: "test2",
                        status: StatusEnum.Completed,
                    });
                });

                describe("when checking credits", () => {
                    let credits: Credits;

                    beforeEach(async () => {
                        const response = await client.getCredits();
                        credits = response.data;
                    });

                    it("should return the credits", () => {
                        expect(credits.free_credits).toBe(99);
                    });
                });
            });

            describe("when updating an image with an error", () => {
                // same as update image but error and status fields are set
                // just verify they come back the same
                let updatedImage: Image;

                beforeEach(async () => {
                    const response = await client.updateImage(image.id, {
                        status: StatusEnum.Error,
                        error: "test error",
                    });
                    updatedImage = response.data;
                });

                it("should return the updated image", () => {
                    expect(updatedImage.id).toBe(image.id);
                    expect(updatedImage.status).toBe(StatusEnum.Error);
                    expect(updatedImage.error).toBe("test error");
                });
            });

            describe("when getting image data that doesn't exist", () => {
                it("should reject the call with not found", async () => {
                    await expect(
                        client.getImageData("does-not-exist")
                    ).rejects.toThrow(/Request failed with status code 404/);
                });
            });

            describe("when getting thumbnail data that doesn't exist", () => {
                it("should reject the call with not found", async () => {
                    await expect(
                        client.getThumbnailData("does-not-exist")
                    ).rejects.toThrow(/Request failed with status code 404/);
                });
            });

            describe("when updating an image that doesn't exist", () => {
                it("should reject the call with not found", async () => {
                    await expect(
                        client.updateImage("does-not-exist", {
                            label: "test2",
                            status: StatusEnum.Processing,
                        })
                    ).rejects.toThrow(/Request failed with status code 404/);
                });
            });

            describe("when updating an image with encoded_image", () => {
                let savedImageData: Buffer;
                let savedThumbnailData: Buffer;

                beforeEach(async () => {
                    // read 512.png from file and base64 encode it
                    const imageData = fs.readFileSync("512.png");
                    const base64Image =
                        Buffer.from(imageData).toString("base64");
                    await client.updateImage(image.id, {
                        encoded_image: base64Image,
                    });
                });

                describe("when getting image data", () => {
                    let savedImageData: Buffer;
                    let savedThumbnailData: Buffer;

                    beforeEach(async () => {
                        // get image data
                        const imageDataResponse = await client.getImageData(
                            image.id
                        );
                        savedImageData = imageDataResponse.data;
                        const thumbnailDataResponse =
                            await client.getThumbnailData(image.id);
                        savedThumbnailData = thumbnailDataResponse.data;
                    });

                    it("should return the image data", () => {
                        expect(savedImageData).toBeDefined();
                        expect(savedThumbnailData).toBeDefined();
                        // thumbnail should be smaller
                        expect(savedThumbnailData.length).toBeLessThan(
                            savedImageData.length
                        );
                    });
                });

                // when creating a child image, the parent image data should be copied
                describe("when creating a child image", () => {
                    let childImage: Image;

                    beforeEach(async () => {
                        const response = await client.createImage({
                            parent: image.id,
                            params: {
                                prompt: "test2",
                                width: 512,
                                height: 512,
                                steps: 1,
                            },
                            label: "test2",
                            model: "stable_diffusion",
                            count: 1,
                        });
                        childImage = response.data.images[0];
                    });

                    describe("when getting image data", () => {
                        let savedImageData: Buffer;

                        beforeEach(async () => {
                            
                            savedImageData = fs.readFileSync(
                                path.join(
                                    "test_data",
                                    childImage.id + ".init_image.png"
                                )
                            )
                        });

                        it("should return the image data", () => {
                            expect(savedImageData).toBeDefined();
                            expect(savedImageData.length).toBeGreaterThan(0);
                        });
                    });
                });

                describe("when hard-deleting an image", () => {
                    beforeEach(async () => {
                        await client.deleteImage(image.id);
                        await client.deleteImage(image.id);
                    });

                    it("should remove the image and thumbnail files from the data folder", () => {
                        // data folder is "data_test"
                        const imagePath = path.join(
                            "test_data",
                            image.id + ".image.png"
                        );
                        expect(fs.existsSync(imagePath)).toBe(false);
                        const thumbnailPath = path.join(
                            "test_data",
                            image.id + ".thumbnail.png"
                        );
                        expect(fs.existsSync(thumbnailPath)).toBe(false);
                    });
                });
            }); // end of describe("when updating an image with encoded_image")

            describe("when listing images as a different user", () => {
                let images: ImageList;

                beforeEach(async () => {
                    // authenticate second user
                    await authenticateUser(
                        backendService,
                        httpClient2,
                        "test2@test"
                    );

                    const response = await client2.listImages();
                    images = response.data;
                });

                it("should return an empty list", () => {
                    expect(images.images).toHaveLength(0);
                });
            });

            describe("when updating an image belonging to a different user", () => {
                beforeEach(async () => {
                    // authenticate second user
                    await authenticateUser(
                        backendService,
                        httpClient2,
                        "test2@test"
                    );
                });

                it("should reject the request with not found error", async () => {
                    await expect(
                        client2.updateImage(image.id, {
                            label: "test2",
                            status: StatusEnum.Processing,
                        })
                    ).rejects.toThrow(/Request failed with status code 404/);
                });
            });

            describe("when deleting an image", () => {
                let images: ImageList;

                beforeEach(async () => {
                    await client.deleteImage(image.id);
                });

                describe("when listing images", () => {
                    let images: ImageList;

                    beforeEach(async () => {
                        const response = await client.listImages();
                        images = response.data;
                    });

                    it("deleted_at should be set", () => {
                        expect(images.images).toHaveLength(1);
                        expect(images.images[0].deleted_at).toBeDefined();
                    });

                    describe("when hard deleting an image (already soft deleted)", () => {
                        beforeEach(async () => {
                            await client.deleteImage(image.id);
                        });

                        describe("when listing images", () => {
                            beforeEach(async () => {
                                const response = await client.listImages();
                                images = response.data;
                            });

                            it("should not return the image", () => {
                                expect(images.images).toHaveLength(0);
                            });
                        });
                    });
                });
            });

            describe("when deleting an image as a different user", () => {
                beforeEach(async () => {
                    // authenticate second user
                    await authenticateUser(
                        backendService,
                        httpClient2,
                        "test2@test"
                    );
                });

                it("should reject the request with not found error", async () => {
                    await expect(client2.deleteImage(image.id)).rejects.toThrow(
                        /Request failed with status code 404/
                    );
                });

                it("should not have deleted the image", async () => {
                    // get image by id
                    const response = await client.getImage(image.id);
                    const img = response.data;
                    expect(img.id).toBe(image.id);
                });
            });

            describe("when deleting an image that doesn't exist", () => {
                it("should reject the request with not found error", async () => {
                    await expect(
                        client.deleteImage("does-not-exist")
                    ).rejects.toThrow(/Request failed with status code 404/);
                });
            });
        });

        describe("when creating an image with full params", () => {
            let image: Image;

            beforeEach(async () => {
                await backendService.resetFreeCredits();

                const response = await client.createImage({
                    params: {
                        prompt: "test",
                        negative_prompt: "foobar",
                        steps: 1,
                        width: 1024,
                        height: 1024,
                        augmentation: "remove_background",
                        cfg_scale: 10,
                        controlnet_type: "hed",
                        denoising_strength: 0.9,
                        seed: "1234",
                    },
                    label: "test",
                    parent: "",
                    model: "stable_diffusion",
                    count: 1,
                });
                image = response.data.images[0];
            });

            it("should return the image", () => {
                expect(image.id).toBeDefined();
                expect(image.label).toBe("test");
                expect(image.parent).toBe("");
                expect(image.model).toBe("stable_diffusion");

                expect(image.params.prompt).toBe("test");
                expect(image.params.negative_prompt).toBe("foobar");
                expect(image.params.steps).toBe(1);
                expect(image.params.width).toBe(1024);
                expect(image.params.height).toBe(1024);
                expect(image.params.augmentation).toBe("remove_background");
                expect(image.params.cfg_scale).toBe(10);
                expect(image.params.controlnet_type).toBe("hed");
                expect(image.params.denoising_strength).toBe(0.9);
                expect(image.params.seed).toBe("1234");
            });

            describe("when checking the horde queue", () => {
                let req: HordeRequest;

                beforeEach(async () => {
                    req = await hordeQueue.popImage();
                });

                it("should return the image", () => {
                    expect(req).toBeTruthy();
                    expect(req.imageId).toEqual(image.id);
                    expect(req.prompt).toEqual("test");
                    expect(req.negativePrompt).toEqual("foobar");
                    expect(req.augmentation).toEqual("remove_background");
                    expect(req.cfgScale).toEqual(10);
                    expect(req.controlnetType).toEqual("hed");
                    expect(req.denoisingStrength).toEqual(0.9);
                    expect(req.seed).toEqual("1234");
                });
            });
        });

        describe("when creating an image with legacy parameters", () => {
            let image: Image;

            beforeEach(async () => {

                await backendService.resetFreeCredits();

                const response = await client.createImage({
                    label: "test",
                    parent: "",
                    model: "stable_diffusion",
                    count: 1,
                    phrases: ["test"],
                    negative_phrases: ["foobar"],
                    iterations: 1,
                    width: 768,
                    height: 768,
                    stable_diffusion_strength: 0.5,
                } as any);
                image = response.data.images[0];
            });

            it("should return the image", () => {
                expect(image.id).toBeDefined();
                expect(image.params.prompt).toBe("test");
                expect(image.params.negative_prompt).toBe("foobar");
                expect(image.label).toBe("test");
                expect(image.params.steps).toBe(1);
                expect(image.parent).toBe("");
                expect(image.model).toBe("stable_diffusion");

                // check legacy fields
                const legacyImage = image as any;
                expect(legacyImage.phrases).toEqual(["test"]);
                expect(legacyImage.negative_phrases).toEqual(["foobar"]);
                expect(legacyImage.iterations).toBe(1);
                expect(legacyImage.stable_diffusion_strength).toBe(0.5);
                expect(legacyImage.width).toBe(768);
                expect(legacyImage.height).toBe(768);
            });
        });

        describe("when creating too many images", () => {
            it("should reject the request with too many requests error", async () => {
                await client.createImage({
                    label: "test",
                    params: {
                        steps: 1,
                        prompt: "test",
                    },
                    status: StatusEnum.Pending,
                    count: 10,
                    model: "stable_diffusion",
                });
                await expect(
                    client.createImage({
                        label: "test",
                        params: {
                            steps: 1,
                            prompt: "test",
                        },
                        status: StatusEnum.Pending,
                        count: 1,
                        model: "stable_diffusion",
                    })
                ).rejects.toThrow(/Request failed with status code 429/);
            });
        });

        describe("batch get images", () => {
            // before each - create 2 images
            let image1: Image;
            let image2: Image;

            beforeEach(async () => {
                // create image
                const response = await client.createImage({
                    label: "test",
                    params: {
                        steps: 1,
                        prompt: "test",
                    },
                    status: StatusEnum.Pending,
                    count: 2,
                    model: "stable_diffusion",
                });
                image1 = response.data.images[0];
                image2 = response.data.images[1];
            });

            describe("when getting images", () => {
                let images: ImageList;

                beforeEach(async () => {
                    const response = await client.batchGetImages(null, {
                        ids: [image1.id, image2.id],
                    });
                    images = response.data;
                });

                it("should return the images", () => {
                    expect(images.images).toHaveLength(2);
                    expect(images.images[0].id).toBe(image1.id);
                    expect(images.images[1].id).toBe(image2.id);
                });
            });

            describe("when getting images with limited fields", () => {
                let images: ImageList;

                beforeEach(async () => {
                    const response = await client.batchGetImages("id,status", {
                        ids: [image1.id, image2.id],
                    });
                    images = response.data;
                });

                it("should return the images", () => {
                    expect(images.images).toHaveLength(2);
                    expect(images.images[0].id).toBe(image1.id);
                    expect(images.images[0].status).toBe(StatusEnum.Pending);
                    expect(images.images[0].params).toBeUndefined();
                });
            });

            describe("when getting images that don't exist", () => {
                let images: ImageList;

                beforeEach(async () => {
                    const response = await client.batchGetImages(null, {
                        ids: [image1.id, image2.id, "does-not-exist"],
                    });
                    images = response.data;
                });

                it("should return only existent images images", () => {
                    expect(images.images).toHaveLength(2);
                    expect(images.images[0].id).toBe(image1.id);
                    expect(images.images[1].id).toBe(image2.id);
                });
            });

            describe("when getting images as another user", () => {
                let images: ImageList;

                beforeEach(async () => {
                    // authenticate second user
                    await authenticateUser(
                        backendService,
                        httpClient2,
                        "test2@test"
                    );
                });

                beforeEach(async () => {
                    const response = await client2.batchGetImages(null, {
                        ids: [image1.id, image2.id],
                    });
                    images = response.data;
                });

                it("should return no images", () => {
                    expect(images.images).toHaveLength(0);
                });
            });
        });

        describe("when creating an image with encoded_image", () => {
            let image: Image;

            beforeEach(async () => {
                // read 512.png from file and base64 encode it
                const imageData = fs.readFileSync("512.png");
                const base64Image = Buffer.from(imageData).toString("base64");
                const response = await client.createImage({
                    encoded_image: base64Image,
                    label: "test",
                    params: {
                        steps: 1,
                        prompt: "test",
                        width: 512,
                        height: 512,
                    },
                    model: "stable_diffusion",
                    count: 1,
                });
                image = response.data.images[0];
            });

            it("should save the image data", async () => {
                // get image data
                const imageDataResponse = await client.getImageData(image.id);
                const imageData = imageDataResponse.data;
                expect(imageData).toBeDefined();
                // thumbnail should be smaller
                const thumbnailDataResponse = await client.getThumbnailData(
                    image.id
                );
                const thumbnailData = thumbnailDataResponse.data;
                expect(thumbnailData).toBeDefined();
                expect(thumbnailData.length).toBeLessThan(imageData.length);
            });
        }); // end of describe "when creating an image with encoded_image"

        describe("when creating an image with encoded_mask", () => {
            let image: Image;

            beforeEach(async () => {
                // read 512.png from file and base64 encode it
                const imageData = fs.readFileSync("512.png");
                const base64Image = Buffer.from(imageData).toString("base64");
                const response = await client.createImage({
                    encoded_image: base64Image,
                    encoded_mask: base64Image,
                    label: "test",
                    model: "stable_diffusion",
                    count: 1,
                    params: {
                        steps: 1,
                        prompt: "test",
                        width: 512,
                        height: 512,
                    },
                });
                image = response.data.images[0];
            });

            it("should save the mask data", async () => {
                // get image data
                const maskDataResponse = await client.getMaskData(image.id);
                const maskData = maskDataResponse.data;
                expect(maskData).toBeDefined();
            });
        }); // end of describe "when creating an image with encoded_mask"

        describe("image pagination", () => {
            let images: Array<Image>;
            let listResponse: AxiosResponse<ImageList>;

            beforeEach(async () => {
                images = [];
                // create images
                for (let i = 0; i < 10; i++) {
                    const resp = await client.createImage({
                        label: "test",
                        params: {
                            steps: 1,
                            prompt: "test",
                            width: 512,
                            height: 512,
                        },
                        status: StatusEnum.Pending,
                        count: 1,
                        model: "stable_diffusion",
                    });
                    images.push(resp.data.images[0]);
                    await sleep(100);
                }
            });

            describe("when listing images with limit=2, direction=desc", () => {
                beforeEach(async () => {
                    listResponse = await client.listImages(
                        images[0].updated_at,
                        "",
                        2,
                        "asc"
                    );
                });

                it("should return the 2 oldest images", () => {
                    expect(listResponse.data.images).toHaveLength(2);
                    expect(listResponse.data.images[0].id).toBe(images[0].id);
                    expect(listResponse.data.images[1].id).toBe(images[1].id);
                });
            });

            describe("when listing images with limit=2, direction=asc", () => {
                beforeEach(async () => {
                    listResponse = await client.listImages(
                        images[9].updated_at,
                        "",
                        2,
                        "desc"
                    );
                });

                it("should return the 2 newest images", () => {
                    expect(listResponse.data.images).toHaveLength(2);
                    expect(listResponse.data.images[0].id).toBe(images[9].id);
                    expect(listResponse.data.images[1].id).toBe(images[8].id);
                });
            });

            describe("when listing images starting with the third image, limit=2, direction=asc", () => {
                beforeEach(async () => {
                    listResponse = await client.listImages(
                        images[2].updated_at,
                        "",
                        2,
                        "asc"
                    );
                });

                it("should return the third and fourth images", () => {
                    expect(listResponse.data.images).toHaveLength(2);
                    expect(listResponse.data.images[0].id).toBe(images[2].id);
                    expect(listResponse.data.images[1].id).toBe(images[3].id);
                });
            });

            describe("when listing images starting with the third image, no limit, direction=asc", () => {
                beforeEach(async () => {
                    listResponse = await client.listImages(
                        images[2].updated_at,
                        "",
                        undefined,
                        "asc"
                    );
                });

                it("should return the last 8 images", () => {
                    expect(listResponse.data.images).toHaveLength(8);
                    expect(listResponse.data.images[0].id).toBe(images[2].id);
                    expect(listResponse.data.images[7].id).toBe(images[9].id);
                });
            });

            describe("when listing images starting with the third image, no limit, direction=desc", () => {
                beforeEach(async () => {
                    listResponse = await client.listImages(
                        images[2].updated_at,
                        "",
                        undefined,
                        "desc"
                    );
                });

                it("should return the first 3 images", () => {
                    expect(listResponse.data.images).toHaveLength(3);
                    expect(listResponse.data.images[0].id).toBe(images[2].id);
                    expect(listResponse.data.images[2].id).toBe(images[0].id);
                });
            });
        });

        // is admin tests
        describe("when an admin user checks if they are an admin", () => {
            let response: AxiosResponse<IsAdminResponse>;

            beforeEach(async () => {
                await authenticateUser(
                    backendService,
                    httpClient,
                    "admin@test.test"
                );
                response = await client.isAdmin();
            });

            it("should return true", () => {
                expect(response.status).toBe(200);
                expect(response.data.is_admin).toBe(true);
            });
        });

        describe("when a non-admin user checks if they are an admin", () => {
            beforeEach(async () => {
                await authenticateUser(
                    backendService,
                    httpClient,
                    "test@test.test"
                );
            });

            it("should return false", async () => {
                const response = await client.isAdmin();
                expect(response.status).toBe(200);
                expect(response.data.is_admin).toBe(false);
            });
        });

        describe("deposits", () => {
            describe("when an admin user deposits credits", () => {
                let response: AxiosResponse<DepositCode>;

                beforeEach(async () => {
                    await authenticateUser(
                        backendService,
                        httpClient,
                        "admin@test.test"
                    );
                    response = await client.createDepositCode({
                        amount: 1000,
                    });
                });

                describe("when a user redeems the deposit code", () => {
                    beforeEach(async () => {
                        await authenticateUser(
                            backendService,
                            httpClient2,
                            "test@test.test"
                        );
                        await client2.redeemDepositCode(response.data.code);
                    });

                    describe("when getting the user's credits", () => {
                        let credits: Credits;

                        beforeEach(async () => {
                            const response = await client2.getCredits();
                            credits = response.data;
                        });

                        it("should return the credits", () => {
                            expect(credits.paid_credits).toBe(1000);
                        });
                    });

                    describe("when redeeming the deposit code again", () => {
                        it("should fail with 404", async () => {
                            await expect(
                                client2.redeemDepositCode(response.data.code)
                            ).rejects.toThrow(
                                /Request failed with status code 404/
                            );
                        });
                    });
                });

                // user tries to redeem expired code (clock advanced 7 days)
                describe("when a user tries to redeem an expired deposit code", () => {
                    beforeEach(async () => {
                        await authenticateUser(
                            backendService,
                            httpClient2,
                            "test@test.test"
                        );
                        clock.setNow(moment().add(7, "days"));
                    });

                    it("should fail with 404", async () => {
                        await expect(
                            client2.redeemDepositCode(response.data.code)
                        ).rejects.toThrow(
                            /Request failed with status code 404/
                        );
                    });
                });
            });

            // non-admin tries to create deposit code
            describe("when a non-admin user tries to create a deposit code", () => {
                it("should fail with 404", async () => {
                    await expect(
                        client.createDepositCode({
                            amount: 1000,
                        })
                    ).rejects.toThrow(/Request failed with status code 404/);
                });
            });

            // user tries to redeem non-existent code
            describe("when a user tries to redeem a non-existent deposit code", () => {
                it("should fail with 404", async () => {
                    await expect(
                        client.redeemDepositCode("does-not-exist")
                    ).rejects.toThrow(/Request failed with status code 404/);
                });
            });
        });

        describe("global settings", () => {
            // getting from an empty database should return the default settings
            // minimum worker allocations:
            // stable_diffusion: 0
            // stable_diffusion_inpainting: 0
            // swinir: 0
            describe("when getting the worker settings as admin with empty database", () => {
                let response: AxiosResponse<WorkerSettings>;

                beforeEach(async () => {
                    await authenticateUser(
                        backendService,
                        httpClient,
                        "admin@test.test"
                    );
                    response = (await client.getGlobalSettings(
                        "workers"
                    )) as any;
                });

                it("should return the default settings", () => {
                    expect(response.status).toBe(200);
                    expect(
                        response.data.settings_json.minimum_worker_allocations
                    ).toEqual({
                        stable_diffusion: 0,
                        stable_diffusion_inpainting: 0,
                        swinir: 0,
                    });
                });
            });

            describe("when getting the worker settings as a normal user", () => {
                beforeEach(async () => {
                    await authenticateUser(
                        backendService,
                        httpClient,
                        "test@test.test"
                    );
                });

                it("should return reject with 404", async () => {
                    await expect(
                        client.getGlobalSettings("workers")
                    ).rejects.toThrowError(
                        "Request failed with status code 404"
                    );
                });
            });

            describe("updating the worker settings", () => {
                let response: AxiosResponse<WorkerSettings>;

                beforeEach(async () => {
                    await authenticateUser(
                        backendService,
                        httpClient,
                        "admin@test.test"
                    );
                    response = (await client.updateGlobalSettings("workers", {
                        settings_json: {
                            minimum_worker_allocations: {
                                stable_diffusion: 1,
                                stable_diffusion_inpainting: 2,
                                swinir: 3,
                            },
                        },
                    })) as any;
                });

                it("should return the updated settings", () => {
                    expect(response.status).toBe(200);
                    expect(
                        response.data.settings_json.minimum_worker_allocations
                    ).toEqual({
                        stable_diffusion: 1,
                        stable_diffusion_inpainting: 2,
                        swinir: 3,
                    });
                });

                describe("getting the worker settings", () => {
                    let response: AxiosResponse<WorkerSettings>;

                    beforeEach(async () => {
                        response = (await client.getGlobalSettings(
                            "workers"
                        )) as any;
                    });

                    it("should return the updated settings", () => {
                        expect(response.status).toBe(200);
                        expect(
                            response.data.settings_json
                                .minimum_worker_allocations
                        ).toEqual({
                            stable_diffusion: 1,
                            stable_diffusion_inpainting: 2,
                            swinir: 3,
                        });
                    });
                });
            });
        });
    }); // end authenticated tests
});
