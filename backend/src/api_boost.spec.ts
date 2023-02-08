import { AxiosResponse } from "axios";
import { BackendService } from "./backend";
import { Boost, BoostList, UpdateBoostResponse } from "./client";
import { ConsoleLogger } from "./logs";
import { MetricsClient } from "./metrics";
import { Server } from "./server";
import { sleep } from "./sleep";
import { Session, TestHelper } from "./testHelper";

jest.setTimeout(60000);

describe("boosts", () => {
    let backendService: BackendService;
    let server: Server;
    let testHelper: TestHelper;
    let session: Session;
    let adminSession: Session;
    let databaseName: string;

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
        server = new Server(
            config,
            backendService,
            35456,
            new MetricsClient(""),
            new ConsoleLogger(),
            null,
        );
        await server.init();
        await server.start();
        session = testHelper.createSession();
        adminSession = testHelper.createSession();
        await backendService.createUser("admin@test.test");
    });

    afterEach(async () => {
        await server.stop();
        await sleep(100);
    });

    beforeEach(async () => {
        await testHelper.authenticateUser(
            backendService,
            session.httpClient,
            "test@test.test"
        );
        await testHelper.authenticateUser(
            backendService,
            adminSession.httpClient,
            "admin@test.test"
        );
    });

    describe("default boost", () => {
        let boostResult: AxiosResponse<Boost>;

        beforeEach(async () => {
            boostResult = await session.client.getBoost();
        });

        it("Should return a boost level of 0 and balance of 0", () => {
            expect(boostResult.data.balance).toBe(0);
            expect(boostResult.data.level).toBe(1);
            expect(boostResult.data.is_active).toBe(false);
        });
    });

    describe("getting boost for a specific user as an admin", () => {
        let boostResult: AxiosResponse<Boost>;

        beforeEach(async () => {
            boostResult = await adminSession.client.getBoostForUser(
                "test@test.test"
            );
        });

        it("Should return a boost level of 0 and balance of 0", () => {
            expect(boostResult.data.balance).toBe(0);
            expect(boostResult.data.level).toBe(1);
            expect(boostResult.data.is_active).toBe(false);
        });
    });

    describe("getting boost for a specific user as non-admin", () => {
        it("Should return reject with 404 error", async () => {
            await expect(
                session.client.getBoostForUser("admin@test.test")
            ).rejects.toThrowError("Request failed with status code 404");
        });
    });

    describe("listing boosts as an admin", () => {
        let boostResult: AxiosResponse<BoostList>;

        beforeEach(async () => {
            boostResult = await adminSession.client.listBoosts();
        });

        it("Should return a list of boosts", () => {
            expect(boostResult.data.boosts.length).toBe(0);
        });
    })

    describe("listing boosts as non-admin", () => {
        it("Should return reject with 404 error", async () => {
            await expect(
                session.client.listBoosts()
            ).rejects.toThrowError("Request failed with status code 404");
        });
    });

    describe("depositing boost as an admin", () => {
        let boostResult: AxiosResponse<Boost>;

        beforeEach(async () => {
            boostResult = await adminSession.client.depositBoost(
                "test@test.test",
                {
                    amount: 10000,
                    level: 1,
                }
            );
        });

        it("Should return a boost level of 1 and balance of 10000", () => {
            expect(boostResult.data.balance).toBe(10000);
            expect(boostResult.data.level).toBe(1);
        });

        describe("getting current boost for affected user", () => {
            let boostResult: AxiosResponse<Boost>;

            beforeEach(async () => {
                boostResult = await session.client.getBoost();
            });

            it("Should return a boost level of 1 and balance of 10000", () => {
                expect(boostResult.data.balance).toBe(10000);
                expect(boostResult.data.level).toBe(1);
            });
        });

        describe("deactivating boost after deposit", () => {
            let updateBoostResult: AxiosResponse<UpdateBoostResponse>;

            beforeEach(async () => {
                updateBoostResult = await session.client.updateBoost({
                    level: 1,
                    is_active: false,
                });
            });

            it("Should return a boost level of 1, non-active and balance of 10000", () => {
                expect(updateBoostResult.data.level).toBe(1);
                expect(updateBoostResult.data.is_active).toBe(false);
                // balance should be > 9900, some balance is consumed
                // by time that the boost was active
                expect(updateBoostResult.data.balance).toBeGreaterThan(9900);
            });

            describe("re-activating boost before cooldown", () => {
                let updateBoostResult: AxiosResponse<UpdateBoostResponse>;

                beforeEach(async () => {
                    updateBoostResult = await session.client.updateBoost({
                        level: 1,
                        is_active: true,
                    });
                });

                it("Should return error 'Cannot activate boost before cooldown'", () => {
                    expect(updateBoostResult.data.error).toBe(
                        "Cannot activate boost yet"
                    );
                });
            })

            describe("listing boosts as an admin", () => {
                let boostResult: AxiosResponse<BoostList>;
        
                beforeEach(async () => {
                    boostResult = await adminSession.client.listBoosts();
                });
        
                it("Should return a list of boosts", () => {
                    expect(boostResult.data.boosts.length).toBe(0);
                });
            })
        })

        describe("listing boosts as an admin", () => {
            let boostResult: AxiosResponse<BoostList>;
    
            beforeEach(async () => {
                boostResult = await adminSession.client.listBoosts();
            });
    
            it("Should return a list of boosts", () => {
                expect(boostResult.data.boosts.length).toBe(1);
            });
        })
    });

    describe("depositing boost as a non-admin", () => {
        it("Should return reject with 404 error", async () => {
            await expect(
                session.client.depositBoost("test@test.test", {
                    amount: 10000,
                    level: 1,
                })
            ).rejects.toThrowError("Request failed with status code 404");
        });
    });

    describe("user activates boost with zero balance", () => {
        let updateBoostResult: AxiosResponse<UpdateBoostResponse>;

        beforeEach(async () => {
            updateBoostResult = await session.client.updateBoost({
                level: 1,
                is_active: true,
            });
        });

        it("Should return error 'Cannot activate boost with zero balance'", () => {
            expect(updateBoostResult.data.error).toBe(
                "Cannot activate boost with zero balance"
            );
        });
    })
});
