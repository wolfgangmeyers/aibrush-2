import { BackendService } from "./backend";
import { Boost } from "./client";
import { ConsoleLogger } from "./logs";
import { MetricsClient } from "./metrics";
import { sleep } from "./sleep";
import { TestHelper } from "./testHelper";
jest.setTimeout(60000);

describe("backend boost", () => {
    let backendService: BackendService;
    let testHelper: TestHelper;
    let databaseName: string;

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
    });

    afterEach(async () => {
        await backendService.destroy();
        await sleep(100);
    });

    describe("Getting a boost that doesn't exist", () => {
        it("should return a boost with level 0", async () => {
            const boost = await backendService.getBoost("user1");
            expect(boost).toEqual({
                user_id: "user1",
                activated_at: 0,
                balance: 0,
                level: 1,
                is_active: false,
            });
        });
    })

    describe("Depositing into a boost", () => {

        let boost: Boost;

        beforeEach(async () => {
            boost = await backendService.depositBoost("user1", 100, 1);
        });

        it("should return a boost with the correct balance and level", async () => {
            expect(boost.user_id).toEqual("user1");
            expect(boost.activated_at).toBeGreaterThan(0);
            expect(boost.balance).toEqual(100);
            expect(boost.level).toEqual(1);
            expect(boost.is_active).toEqual(true);
        });

        describe("Getting the boost", () => {
            it("should return the same boost", async () => {
                const boost2 = await backendService.getBoost("user1");
                expect(boost2).toEqual(boost);
            });
        });

        describe("listing active boosts", () => {
            it("should return the boost", async () => {
                const boosts = await backendService.listActiveBoosts();
                expect(boosts).toHaveLength(1);
                expect(boosts[0]).toEqual(boost);
            });
        });
    })

    describe("Activate, deactivate and reactivate boost", () => {
        let boost: Boost;

        beforeEach(async () => {
            boost = await backendService.depositBoost("user1", 100, 1);
        });

        it("should return a boost with the correct balance and level", async () => {
            expect(boost.user_id).toEqual("user1");
            expect(boost.activated_at).toBeGreaterThan(0);
            expect(boost.balance).toEqual(100);
            expect(boost.level).toEqual(1);
        });

        describe("Deactivate boost", () => {

            let boost2: Boost;

            beforeEach(async () => {
                await sleep(100);
                boost2 = await backendService.updateBoost("user1", 1, false);
            });

            it("should return a boost with the correct balance and level", async () => {
                
                expect(boost2.user_id).toEqual("user1");
                expect(boost2.activated_at).toBeGreaterThan(0);
                expect(boost2.balance).toEqual(0);
                expect(boost2.level).toEqual(1);
                expect(boost2.is_active).toEqual(false);
            });

            describe("Reactivate boost", () => {
                // should raise an error
                it("should throw an error", async () => {
                    await expect(backendService.updateBoost("user1", 1, true)).rejects.toThrow(/Cannot activate boost yet/);
                });
            });

            describe("Deposit reactivate override", () => {
                it("should return a boost with the correct balance and level", async () => {
                    await sleep(100);
                    const boost2 = await backendService.depositBoost("user1", 100, 1);
                    expect(boost2.user_id).toEqual("user1");
                    expect(boost2.activated_at).toBeGreaterThan(0);
                    expect(boost2.balance).toEqual(100);
                    expect(boost2.level).toEqual(1);
                    expect(boost2.is_active).toEqual(true);
                });
            })
        });
    })

    describe("Switch levels while inactive, then activate", () => {
        let boost: Boost;

        beforeEach(async () => {
            boost = await backendService.depositBoost("user1", 100, 1, false);
            boost = await backendService.updateBoost("user1", 2, false);
            boost = await backendService.updateBoost("user1", 2, true);
        });

        it("should return a boost with the correct balance and level", async () => {
            expect(boost.user_id).toEqual("user1");
            expect(boost.activated_at).toBeGreaterThan(0);
            expect(boost.balance).toEqual(100);
            expect(boost.level).toEqual(2);
            expect(boost.is_active).toEqual(true);
        });
    })

    describe("Activate, then switch levels", () => {
        let boost: Boost;

        it("should throw an error", async () => {
            boost = await backendService.depositBoost("user1", 100, 1, true);
            await expect(backendService.updateBoost("user1", 2, true)).rejects.toThrow(/Cannot change boost level yet/);
        });
    })

    describe("Multiple boost deposits with the same level", () => {
        let boost: Boost;

        beforeEach(async () => {
            boost = await backendService.depositBoost("user1", 100, 1);
            boost = await backendService.depositBoost("user1", 100, 1);
        });

        it("should return a boost with the correct balance and level", async () => {
            expect(boost.user_id).toEqual("user1");
            expect(boost.activated_at).toBeGreaterThan(0);
            // some time may have passed already
            expect(boost.balance).toBeGreaterThan(180);
            expect(boost.level).toEqual(1);
        });
    });

    describe("Multiple boost deposits with different levels", () => {
        let boost: Boost;

        beforeEach(async () => {
            boost = await backendService.depositBoost("user1", 100, 1);
            boost = await backendService.depositBoost("user1", 100, 2);
        });

        it("should return a boost with the correct balance and level", async () => {
            expect(boost.user_id).toEqual("user1");
            expect(boost.activated_at).toBeGreaterThan(0);
            // some time may have passed already
            expect(boost.balance).toBeGreaterThan(180);
            expect(boost.level).toEqual(2);
        });
    })

    describe("List active boosts with empty database", () => {
        it("should return an empty list", async () => {
            const boosts = await backendService.listActiveBoosts();
            expect(boosts).toEqual([]);
        });
    })

    describe("List active boosts", () => {
        let boost1: Boost;
        let boost2: Boost;
        let boost3: Boost;

        beforeEach(async () => {
            boost1 = await backendService.depositBoost("user1", 100, 1);
            boost2 = await backendService.depositBoost("user2", 1000, 2);
            boost3 = await backendService.depositBoost("user3", 10000, 3);

            await backendService.updateBoost("user3", 3, false);
            const boosts = await backendService.listActiveBoosts();
        });

        it("should return a list of boosts", async () => {
            await sleep(100);
            const boosts = await backendService.listActiveBoosts();
            // user1 boost is still at level 1 but has an effective balance of 0
            expect(boosts).toHaveLength(1);
            expect(boosts[0].user_id).toEqual("user2");
        });
    })

    describe("Activate boost with zero balance", () => {
        it("should throw an error", async () => {
            await expect(backendService.updateBoost("user1", 1, true)).rejects.toThrow(/Cannot activate boost with zero balance/);
        });
    })
})