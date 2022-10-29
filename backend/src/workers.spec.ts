import axios, { Axios, AxiosInstance, AxiosResponse } from "axios";

import { Server } from "./server";
import { BackendService } from "./backend";
import {
    LoginResult,
    Worker,
    WorkerConfig,
    WorkerList,
    WorkerLoginCode,
    WorkerStatusEnum,
} from "./client/api";

import { sleep } from "./sleep";
import { Session, TestHelper } from "./testHelper";
import { MetricsClient } from "./metrics";

jest.setTimeout(60000);

describe("workers", () => {
    let backendService: BackendService;
    let server: Server;
    let session: Session;
    // second user
    let session2: Session;
    let adminSession: Session;

    let databaseName: string;

    let testHelper: TestHelper;

    beforeAll(async () => {
        testHelper = new TestHelper();
        await testHelper.cleanupDatabases();
    });

    beforeEach(async () => {
        databaseName = await testHelper.createTestDatabase();
        await testHelper.cleanupTestFiles();
        const config = testHelper.createConfig(databaseName);
        backendService = new BackendService(config, new MetricsClient(""));
        server = new Server(
            config,
            backendService,
            35456,
            new MetricsClient("")
        );
        await server.init();
        await server.start();
        session = testHelper.createSession();
        session2 = testHelper.createSession();
        adminSession = testHelper.createSession();
    });

    afterEach(async () => {
        await server.stop();
        await sleep(100);
    });

    describe("workers", () => {
        beforeEach(async () => {
            await testHelper.authenticateUser(
                backendService,
                session.httpClient,
                "test@test.test"
            );
            await testHelper.authenticateUser(
                backendService,
                session2.httpClient,
                "test2@test.test"
            );
            await testHelper.authenticateUser(
                backendService,
                adminSession.httpClient,
                "admin@test.test"
            );
        });

        // when listing workers in an empty database
        describe("when listing workers in an empty database as admin", () => {
            let workers: AxiosResponse<WorkerList>;

            beforeEach(async () => {
                workers = await adminSession.client.getWorkers();
            });

            it("should return an empty list", () => {
                expect(workers.data.workers).toHaveLength(0);
            });
        });

        describe("when creating a worker as admin", () => {
            let worker: AxiosResponse<Worker>;
            beforeEach(async () => {
                worker = await adminSession.client.createWorker({
                    display_name: "test",
                });
            });

            it("should return a worker", () => {
                expect(worker.data.id).toBeDefined();
                expect(worker.data.display_name).toEqual("test");
                expect(worker.data.created_at).toBeDefined();
                expect(worker.data.last_ping).toBeNull();
                expect(worker.data.status).toEqual(WorkerStatusEnum.Inactive);
                expect(worker.data.login_code).toEqual("");
            });

            describe("when generating a login code", () => {
                let loginCode: AxiosResponse<WorkerLoginCode>;

                beforeEach(async () => {
                    loginCode =
                        await adminSession.client.generateWorkerLoginCode(
                            worker.data.id
                        );
                });

                it("should return a login code", () => {
                    expect(loginCode.data.login_code).toBeDefined();
                });

                describe("when a worker logs in using the code", () => {
                    let workerSession: Session;
                    let authResult: AxiosResponse<LoginResult>;

                    beforeEach(async () => {
                        workerSession = testHelper.createSession();
                        authResult = await workerSession.client.loginAsWorker(
                            loginCode.data
                        );
                        workerSession.httpClient.defaults.headers.common[
                            "Authorization"
                        ] = `Bearer ${authResult.data.accessToken}`;
                    });

                    it("should return a valid token", () => {
                        expect(authResult.data.accessToken).toBeDefined();
                    });
                });
            });

            describe("when updating the worker as admin", () => {
                let updatedWorker: AxiosResponse<Worker>;
                beforeEach(async () => {
                    updatedWorker = await adminSession.client.updateWorker(
                        worker.data.id,
                        {
                            display_name: "updated",
                        }
                    );
                });

                it("should return the updated worker", () => {
                    expect(updatedWorker.data.id).toEqual(worker.data.id);
                    expect(updatedWorker.data.display_name).toEqual("updated");
                });
            })

            describe("when updating the worker as a normal user", () => {
                // non-admin user should not be able to update the worker
                it("should return a 403", async () => {
                    await expect(
                        session.client.updateWorker(worker.data.id, {
                            display_name: "updated",
                        })
                    ).rejects.toThrow(/Request failed with status code 403/);
                });
            })

            describe("when getting worker config", () => {
                let workerConfig: AxiosResponse<WorkerConfig>;
                beforeEach(async () => {
                    workerConfig = await adminSession.client.getWorkerConfig(
                        worker.data.id
                    );
                });

                it("should return a valid config", () => {
                    // check defaults
                    expect(workerConfig.data.model).toEqual("stable_diffusion_text2im");
                    expect(workerConfig.data.pool_assignment).toEqual("public");
                    expect(workerConfig.data.worker_id).toEqual(worker.data.id);
                });  
            })

            describe("when updating worker config as admin", () => {
                let workerConfig: AxiosResponse<WorkerConfig>;
                beforeEach(async () => {
                    workerConfig = await adminSession.client.updateWorkerConfig(
                        worker.data.id,
                        {
                            model: "stable_diffusion_1.5",
                            pool_assignment: "lightning",
                        }
                    );
                });

                it("should return a valid config", () => {
                    expect(workerConfig.data.model).toEqual("stable_diffusion_1.5");
                    expect(workerConfig.data.pool_assignment).toEqual("lightning");
                });

                describe("when getting worker config", () => {
                    let workerConfig: AxiosResponse<WorkerConfig>;
                    beforeEach(async () => {
                        workerConfig = await adminSession.client.getWorkerConfig(
                            worker.data.id
                        );
                    });

                    it("should return a valid config", () => {
                        expect(workerConfig.data.model).toEqual("stable_diffusion_1.5");
                        expect(workerConfig.data.pool_assignment).toEqual("lightning");
                    });  
                })

                describe("after deleting the worker", () => {
                    beforeEach(async () => {
                        await adminSession.client.deleteWorker(worker.data.id);
                    });

                    it("should return a 404", async () => {
                        await expect(
                            adminSession.client.getWorker(worker.data.id)
                        ).rejects.toThrow(/Request failed with status code 404/);
                    });
                })
            })

            describe("when updating worker config as a normal user", () => {
                // non-admin user should not be able to update the worker
                it("should return a 403", async () => {
                    await expect(
                        session.client.updateWorkerConfig(worker.data.id, {
                            model: "stable_diffusion_1.5",
                            pool_assignment: "lightning",
                        })
                    ).rejects.toThrow(/Request failed with status code 403/);
                });
            })

            describe("when deleting the worker as admin", () => {
                beforeEach(async () => {
                    await adminSession.client.deleteWorker(worker.data.id);
                });

                it("should return a 200", () => {
                    // no-op
                });

                describe("when listing workers", () => {
                    let workers: AxiosResponse<WorkerList>;

                    beforeEach(async () => {
                        workers = await adminSession.client.getWorkers();
                    });

                    it("should return an empty list", () => {
                        expect(workers.data.workers).toHaveLength(0);
                    });
                });
            })

            describe("when deleting the worker as a normal user", () => {
                // non-admin user should not be able to delete the worker
                it("should return a 403", async () => {
                    await expect(
                        session.client.deleteWorker(worker.data.id)
                    ).rejects.toThrow(/Request failed with status code 403/);
                });
            });
        });

        describe("when a worker logs in using an invalid code", () => {
            let workerSession: Session;
            let authResult: AxiosResponse<LoginResult>;

            beforeEach(async () => {
                workerSession = testHelper.createSession();
                authResult = await workerSession.client.loginAsWorker({
                    login_code: "invalid",
                });
            });

            it("should return null", () => {
                expect(authResult.data).toBeNull();
            });
        })

        describe("when listing workers in an empty database as normal user", () => {
            let promise: Promise<AxiosResponse<WorkerList>>;

            beforeEach(async () => {
                promise = session.client.getWorkers();
            });

            it("should fail with 403", async () => {
                await expect(promise).rejects.toThrow(
                    /Request failed with status code 403/
                );
            });
        });
    });
});
