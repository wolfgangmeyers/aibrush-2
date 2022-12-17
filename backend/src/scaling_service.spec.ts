import moment from "moment";
import { hash } from "./auth";
import { BackendService } from "./backend";
import { ConsoleLogger } from "./logs";
import { MetricsClient } from "./metrics";
import { FakeScalingEngine } from "./scaling_engine";
import { ScalingService, SCALING_SERVICE_EVENT } from "./scaling_service";
import { TestHelper } from "./testHelper";

describe("ScalingService", () => {
    let backendService: BackendService;
    let testHelper: TestHelper;
    let databaseName: string;
    let scalingEngine1: FakeScalingEngine;
    let scalingEngine2: FakeScalingEngine;
    let scalingService: ScalingService;

    const adminId = hash("admin@test.test")

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
        await backendService.createUser("admin@test.test");
        scalingEngine1 = new FakeScalingEngine(5);
        scalingEngine2 = new FakeScalingEngine(10);
        scalingService = new ScalingService(backendService, [scalingEngine1, scalingEngine2], new ConsoleLogger());
    });

    afterEach(async () => {
        await backendService.destroy();
    });

    describe("4 gpu-1 boosts, engine 1 underflow", () => {
        beforeEach(async () => {
            for (let i = 0; i < 4; i++) {
                await backendService.depositBoost(`user-${i}`, 1000, 2);
            }
            await scalingService.scale();
        })

        it("Should scale engine 1 to 4, engine 2 to 0", async () => {
            expect(scalingEngine1._scale).toBe(4);
            expect(scalingEngine2._scale).toBe(0);
        })
    })

    describe("3 gpu-1 1 gpu-2 orders, engine 1 at capacity", () => {
        beforeEach(async () => {
            for (let i = 0; i < 3; i++) {
                await backendService.depositBoost(`user-${i}`, 1000, 2);
            }
            await backendService.depositBoost(`user-3`, 1000, 4);
            await scalingService.scale();
        })

        it("Should scale engine 1 to 5, engine 2 to 0", async () => {
            expect(scalingEngine1._scale).toBe(5);
            expect(scalingEngine2._scale).toBe(0);
        })
    })

    describe("1 gpu-4 2 gpu-1, engine 1 at capacity, engine 2 at 1", () => {
        beforeEach(async () => {
            await backendService.depositBoost(`user-999`, 1000, 8);
            for (let i = 0; i < 2; i++) {
                await backendService.depositBoost(`user-${i}`, 1000, 2);
            }
            await scalingService.scale();
        })

        it("Should scale engine 1 to 5, engine 2 to 1", async () => {
            expect(scalingEngine1._scale).toBe(5);
            expect(scalingEngine2._scale).toBe(1);
        })
    })

    describe("all at capacity", () => {
        beforeEach(async () => {
            for (let i = 0; i < 15; i++) {
                await backendService.depositBoost(`user-${i}`, 1000, 2);
            }
            await scalingService.scale();
        })

        it("Should scale engine 1 to 5, engine 2 to 5", async () => {
            expect(scalingEngine1._scale).toBe(5);
            expect(scalingEngine2._scale).toBe(10);
        })
    })

    describe("above capacity", () => {
        beforeEach(async () => {
            for (let i = 0; i < 20; i++) {
                await backendService.depositBoost(`user-${i}`, 1000, 2);
            }
            await scalingService.scale();
        })

        it("Should scale engine 1 to 5, engine 2 to 5", async () => {
            expect(scalingEngine1._scale).toBe(5);
            expect(scalingEngine2._scale).toBe(10);
        })
    })

    describe("failover capacity", () => {
        // when an engine returns a different number than the
        // requested scale, the scaling service will adjust.
        beforeEach(async () => {
            for (let i = 0; i < 4; i++) {
                await backendService.depositBoost(`user-${i}`, 1000, 2);
            }
            scalingEngine1.returnScale = 3;
            await scalingService.scale();
        })

        it("Should scale engine 1 to 3, engine 2 to 1", async () => {
            expect(scalingEngine1._scale).toBe(4);
            expect(scalingEngine2._scale).toBe(1);
        })
    })

    describe("scaling synchronization cooldown (before)", () => {
        beforeEach(async () => {
            for (let i = 0; i < 15; i++) {
                await backendService.depositBoost(`user-${i}`, 1000, 2);
            }
            await scalingService.scale();
        })

        it("Should not scale due to cooldown", async () => {
            expect(scalingEngine1._scale).toBe(5);
            expect(scalingEngine2._scale).toBe(10);
            const lastEvent = await backendService.getLastEventTime(SCALING_SERVICE_EVENT);
            expect(moment().valueOf() - lastEvent).toBeLessThan(100);
        })
    })

    describe("scaling synchronization cooldown (after)", () => {
        beforeEach(async () => {
            for (let i = 0; i < 5; i++) {
                await backendService.depositBoost(`user-${i}`, 1000, 2);
            }
            await backendService.setLastEventTime(SCALING_SERVICE_EVENT, moment().valueOf())
            await scalingService.scale();
        })

        it("Should not scale due to cooldown", async () => {
            expect(scalingEngine1._scale).toEqual(-1)
            expect(scalingEngine2._scale).toEqual(-1)
        })
    })

    describe("scaling synchronization cooldown (after 1 minute)", () => {
        beforeEach(async () => {
            for (let i = 0; i < 15; i++) {
                await backendService.depositBoost(`user-${i}`, 1000, 2);
            }
            await backendService.setLastEventTime(SCALING_SERVICE_EVENT, moment().subtract(1, "minutes").valueOf())
            await scalingService.scale();
        })

        it("Should not scale due to cooldown", async () => {
            expect(scalingEngine1._scale).toBe(5);
            expect(scalingEngine2._scale).toBe(10);
        })
    })
})