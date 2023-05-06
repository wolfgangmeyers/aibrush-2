import { AxiosResponse } from "axios";
import moment from "moment";
import { hash } from "./auth";
import { BackendService } from "./backend";
import { Credits, StatusEnum } from "./client";
import { FakeClock } from "./clock";
import { MockHordeQueue } from "./horde_queue";
import { ConsoleLogger } from "./logs";
import { MetricsClient } from "./metrics";
import { sleep } from "./sleep";
import { MockStripeHelper } from "./stripe_helper";
import { TestHelper } from "./testHelper";
jest.setTimeout(60000);

describe("backend stripe sessions", () => {
    let backendService: BackendService;
    let testHelper: TestHelper;
    let databaseName: string;
    let hordeQueue: MockHordeQueue;
    let paidHordeQueue: MockHordeQueue;
    let clock: FakeClock;

    beforeAll(async () => {
        testHelper = new TestHelper();
        await testHelper.cleanupDatabases();
    });

    beforeEach(async () => {
        databaseName = await testHelper.createTestDatabase();
        await testHelper.cleanupTestFiles();
        const config = testHelper.createConfig(databaseName);
        clock = new FakeClock(moment());
        backendService = new BackendService(
            config,
            new MetricsClient(""),
            new ConsoleLogger(),
            clock,
        );
        await backendService.init();
        hordeQueue = new MockHordeQueue();
        paidHordeQueue = new MockHordeQueue();
        backendService.setStripeHelperForTesting(new MockStripeHelper());

        await backendService.createUser("test@test.test");
    });

    afterEach(async () => {
        await backendService.destroy();
        await sleep(100);
    });

    describe("create a stripe session", () => {
        let sessionId: string;

        beforeEach(async () => {
            const result = await backendService.createStripeSession(
                "test@test.test",
                {
                    product_id: "starter",
                    success_url: "http://localhost:3001/stripe-success",
                    cancel_url: "http://localhost:3001/stripe-cancel",
                }
            );
            sessionId = result.session_id;
        });

        it("should return a session id", async () => {
            expect(sessionId).toBe("mock-session-id");
        });

        describe("get user for stripe session", () => {
            let userId: string;

            beforeEach(async () => {
                userId = await backendService.getUserForStripeSession(
                    sessionId
                );
            });

            it("should return the user id", async () => {
                expect(userId).toBe(hash("test@test.test"));
            });
        });

        describe("cleanup stripe sessions", () => {
            beforeEach(async () => {
                clock.setNow(moment().add(25, "hours"));
                await backendService.cleanupStripeSessions();
            });

            it("should remove the session", async () => {
                const userId = await backendService.getUserForStripeSession(
                    sessionId
                );
                expect(userId).toBeNull();
            });
        });
    });
});
