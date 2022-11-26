import { BackendService } from "./backend";
import { ConsoleLogger } from "./logs";
import { MetricsClient } from "./metrics";
import { sleep } from "./sleep";
import { TestHelper } from "./testHelper";
jest.setTimeout(60000);

describe("backend notifications", () => {
    let backendService: BackendService;
    let testHelper: TestHelper;
    let databaseName: string;

    let notifications: string[] = [];

    beforeAll(async () => {
        testHelper = new TestHelper();
        await testHelper.cleanupDatabases();
    });

    beforeEach(async () => {
        databaseName = await testHelper.createTestDatabase();
        await testHelper.cleanupTestFiles();
        const config = testHelper.createConfig(databaseName);
        backendService = new BackendService(config, new MetricsClient(""), new ConsoleLogger());
        await backendService.init();
        notifications = [];
    });

    afterEach(async () => {
        await backendService.destroy();
        await sleep(100);
    });

    describe("notify with no subscriptions", () => {
        it("should not send any notifications", async () => {
            await backendService.notify("test", "test");
            expect(notifications).toEqual([]);
        });
    })

    describe("notify with one subscription", () => {
        beforeEach(async () => {
            await backendService.listen("test", message => {
                notifications.push(message);
            })
        });

        it("should send one notification", async () => {
            await backendService.notify("test", "test");
            await sleep(100);
            expect(notifications).toEqual(["test"]);
        });
    })

    describe("notify with two subscriptions", () => {
        beforeEach(async () => {
            await backendService.listen("test", message => {
                notifications.push(message);
            })
            await backendService.listen("test", message => {
                notifications.push(message);
            })
        });

        it("should send two notifications", async () => {
            await backendService.notify("test", "test");
            await sleep(100);
            expect(notifications).toEqual(["test", "test"]);
        });
    });

    describe("subscribe and unsubscribe", () => {

        beforeEach(async () => {
            const handler = (message: string) => {
                notifications.push(message);
            }
            await backendService.listen("test", handler)
            await backendService.unlisten("test", handler)
        });

        it("should not send any notifications", async () => {
            await backendService.notify("test", "test");
            await sleep(100);
            expect(notifications).toEqual([]);
        });
    })
})