import { AxiosResponse } from "axios";
import { BackendService } from "./backend";
import { Credits, StatusEnum } from "./client";
import { MockHordeQueue } from "./horde_queue";
import { ConsoleLogger } from "./logs";
import { MetricsClient } from "./metrics";
import { sleep } from "./sleep";
import { TestHelper } from "./testHelper";
jest.setTimeout(60000);

describe("backend notifications", () => {
    let backendService: BackendService;
    let testHelper: TestHelper;
    let databaseName: string;
    let hordeQueue: MockHordeQueue;
    let paidHordeQueue: MockHordeQueue;

    beforeAll(async () => {
        testHelper = new TestHelper();
        await testHelper.cleanupDatabases();
    });

    beforeEach(async () => {
        databaseName = await testHelper.createTestDatabase();
        await testHelper.cleanupTestFiles();
        const config = testHelper.createConfig(databaseName);
        backendService = new BackendService(
            config,
            new MetricsClient(""),
            new ConsoleLogger()
        );
        await backendService.init();
        hordeQueue = new MockHordeQueue();
        paidHordeQueue = new MockHordeQueue();
        backendService.setHordeQueueForTesting(hordeQueue);
        backendService.setPaidHordeQueueForTesting(paidHordeQueue);

        await backendService.createUser("test@test.test");
    });

    afterEach(async () => {
        await backendService.destroy();
        await sleep(100);
    });

    describe("create an image with no credits", () => {

        beforeEach(async () => {
            await backendService.deductCredits("test@test.test", 100);
        });

        it("should fail with an error", async () => {
            await expect(
                backendService.createImages("test@test.test", {
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
                })
            ).rejects.toThrow("No credits");
        });
    });

    describe("create a 512x512 image with free credits", () => {
        let credits: Credits;

        beforeEach(async () => {
            await backendService.resetFreeCredits();
            const images = await backendService.createImages("test@test.test", {
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
            await backendService.updateImage(images[0].id, {
                status: StatusEnum.Completed,
            });

            credits = await backendService.getCredits("test@test.test");
        });

        it("should deduct 1 credit", () => {
            expect(credits.free_credits).toEqual(99);
        });

        it("should submit through free horde queue", async () => {
            let image = await hordeQueue.popImage();
            expect(image).toBeDefined();
            image = await paidHordeQueue.popImage();
            expect(image).toBeUndefined();
        });
    });

    describe("create a 512x512 image with paid credits", () => {
        let credits: Credits;

        beforeEach(async () => {
            const code = await backendService.createDepositCode({
                amount: 100,
            });
            await backendService.redeemDepositCode(code.code, "test@test.test");
            const images = await backendService.createImages("test@test.test", {
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
            await backendService.updateImage(images[0].id, {
                status: StatusEnum.Completed,
            });

            credits = await backendService.getCredits("test@test.test");
        });

        it("should deduct 1 credit", () => {
            expect(credits.paid_credits).toEqual(99);
        });

        it("should submit through paid horde queue", async () => {
            let image = await hordeQueue.popImage();
            expect(image).toBeUndefined();
            image = await paidHordeQueue.popImage();
            expect(image).toBeDefined();
        });
    });

    // overdraft credits
    describe("overdraft paid credits", () => {
        let credits: Credits;

        beforeEach(async () => {
            const code = await backendService.createDepositCode({
                amount: 1,
            });
            await backendService.redeemDepositCode(code.code, "test@test.test");
            const images = await backendService.createImages("test@test.test", {
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
                count: 2,
            });
            for (let i = 0; i < 2; i++) {
                await backendService.updateImage(images[i].id, {
                    status: StatusEnum.Completed,
                });
            }

            credits = await backendService.getCredits("test@test.test");
        });

        it("paid credits should not be negative", () => {
            expect(credits.paid_credits).toEqual(0);
        });
    });

    // mix paid and free credits
    describe("mix paid and free credits", () => {
        let credits: Credits;

        beforeEach(async () => {
            await backendService.resetFreeCredits();
            const code = await backendService.createDepositCode({
                amount: 1,
            });
            await backendService.redeemDepositCode(code.code, "test@test.test");
            const images = await backendService.createImages("test@test.test", {
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
                count: 2,
            });
            for (let i = 0; i < 2; i++) {
                await backendService.updateImage(images[i].id, {
                    status: StatusEnum.Completed,
                });
            }

            credits = await backendService.getCredits("test@test.test");
        });

        it("should deduct from paid credits first, then free credits", () => {
            expect(credits.paid_credits).toEqual(0);
            expect(credits.free_credits).toEqual(99);
        });
    });

    // large images
    describe("creating a 1024x1024 image", () => {
        let credits: Credits;

        beforeEach(async () => {
            await backendService.resetFreeCredits();
            const images = await backendService.createImages("test@test.test", {
                params: {
                    prompt: "test",
                    negative_prompt: "foobar",
                    steps: 1,
                    width: 1024,
                    height: 1024,
                },
                label: "test",
                parent: "",
                model: "stable_diffusion",
                count: 1,
            });
            await backendService.updateImage(images[0].id, {
                status: StatusEnum.Completed,
            });

            credits = await backendService.getCredits("test@test.test");
        });

        it("should deduct 4 credits", () => {
            expect(credits.free_credits).toEqual(96);
        });
    });
});
