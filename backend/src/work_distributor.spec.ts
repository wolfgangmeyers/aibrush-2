import moment from "moment";
import { hash } from "./auth";
import { BackendService } from "./backend";
import { WorkerConfig } from "./client";
import { FakeClock } from "./clock";
import { ConsoleLogger } from "./logs";
import { MetricsClient } from "./metrics";
import { sleep } from "./sleep";
import { TestHelper } from "./testHelper";
import {
    calculateWorkDistribution,
    MODELS,
    PendingImages,
    WorkDistributor,
    Worker,
} from "./work_distributor";
jest.setTimeout(60000);

describe("Work Distribution Calculations", () => {
    describe("no pending images, no workers", () => {
        it("should return an empty array", () => {
            const result = calculateWorkDistribution([], [], []);
            expect(result).toEqual([]);
        });
    });

    describe("no pending images, one worker", () => {
        it("should return an empty array", () => {
            const result = calculateWorkDistribution(
                [],
                [
                    {
                        id: "worker1",
                        num_gpus: 1,
                        last_ping: moment().valueOf(),
                        status: "idle",
                    },
                ],
                [
                    {
                        worker_id: "worker1",
                        gpu_configs: [
                            {
                                gpu_num: 0,
                                model: "stable_diffusion_text2im",
                            },
                        ],
                    },
                ]
            );
            expect(result).toEqual([]);
        });
    });

    describe("one pending image, no workers", () => {
        it("should return an empty array", () => {
            const result = calculateWorkDistribution(
                [
                    {
                        model: "stable_diffusion_text2im",
                        score: 1,
                    },
                ],
                [],
                []
            );
            expect(result).toEqual([]);
        });
    });

    describe("no pending images and three balanced workers", () => {
        it("should return an empty array", () => {
            const result = calculateWorkDistribution(
                [],
                [
                    {
                        id: "worker1",
                        num_gpus: 1,
                        last_ping: moment().valueOf(),
                        status: "idle",
                    },
                    {
                        id: "worker2",
                        num_gpus: 1,
                        last_ping: moment().valueOf(),
                        status: "idle",
                    },
                    {
                        id: "worker3",
                        num_gpus: 1,
                        last_ping: moment().valueOf(),
                        status: "idle",
                    },
                ],
                [
                    {
                        worker_id: "worker1",
                        gpu_configs: [
                            {
                                gpu_num: 0,
                                model: "stable_diffusion_text2im",
                            },
                        ],
                    },
                    {
                        worker_id: "worker2",
                        gpu_configs: [
                            {
                                gpu_num: 0,
                                model: "stable_diffusion_inpainting",
                            },
                        ],
                    },
                    {
                        worker_id: "worker3",
                        gpu_configs: [
                            {
                                gpu_num: 0,
                                model: "swinir",
                            },
                        ],
                    },
                ]
            );
            expect(result).toEqual([]);
        });
    });

    describe("one pending image and three balanced workers", () => {
        it("should return an empty array", () => {
            const result = calculateWorkDistribution(
                [
                    {
                        model: "stable_diffusion_text2im",
                        score: 1,
                    },
                ],
                [
                    {
                        id: "worker1",
                        num_gpus: 1,
                        last_ping: moment().valueOf(),
                        status: "idle",
                    },
                    {
                        id: "worker2",
                        num_gpus: 1,
                        last_ping: moment().valueOf(),
                        status: "idle",
                    },
                    {
                        id: "worker3",
                        num_gpus: 1,
                        last_ping: moment().valueOf(),
                        status: "idle",
                    },
                ],
                [
                    {
                        worker_id: "worker1",
                        gpu_configs: [
                            {
                                gpu_num: 0,
                                model: "stable_diffusion_text2im",
                            },
                        ],
                    },
                    {
                        worker_id: "worker2",
                        gpu_configs: [
                            {
                                gpu_num: 0,
                                model: "stable_diffusion_inpainting",
                            },
                        ],
                    },
                    {
                        worker_id: "worker3",
                        gpu_configs: [
                            {
                                gpu_num: 0,
                                model: "swinir",
                            },
                        ],
                    },
                ]
            );
            expect(result).toEqual([]);
        });
    });

    describe("one pending image and one 3-gpu balanced worker", () => {
        it("should return an empty array", () => {
            const result = calculateWorkDistribution(
                [
                    {
                        model: "stable_diffusion_text2im",
                        score: 1,
                    },
                ],
                [
                    {
                        id: "worker1",
                        num_gpus: 3,
                        last_ping: moment().valueOf(),
                        status: "idle",
                    },
                ],
                [
                    {
                        worker_id: "worker1",
                        gpu_configs: [
                            {
                                gpu_num: 0,
                                model: "stable_diffusion_text2im",
                            },
                            {
                                gpu_num: 1,
                                model: "stable_diffusion_inpainting",
                            },
                            {
                                gpu_num: 2,
                                model: "swinir",
                            },
                        ],
                    },
                ]
            );
            expect(result).toEqual([]);
        });
    });

    describe("no pending images and one 3-gpu unbalanced worker", () => {
        it("should rebalance the worker", () => {
            const result = calculateWorkDistribution(
                [],
                [
                    {
                        id: "worker1",
                        num_gpus: 3,
                        last_ping: moment().valueOf(),
                        status: "idle",
                    },
                ],
                [
                    {
                        worker_id: "worker1",
                        gpu_configs: [
                            {
                                gpu_num: 0,
                                model: "stable_diffusion_text2im",
                            },
                            {
                                gpu_num: 1,
                                model: "stable_diffusion_text2im",
                            },
                            {
                                gpu_num: 2,
                                model: "swinir",
                            },
                        ],
                    },
                ]
            );
            expect(result).toEqual([{
                worker_id: "worker1",
                gpu_configs: [
                    {
                        gpu_num: 0,
                        model: "stable_diffusion_inpainting",
                    },
                    {
                        gpu_num: 1,
                        model: "stable_diffusion_text2im",
                    },
                    {
                        gpu_num: 2,
                        model: "swinir",
                    },
                ],
            }]);
        });
    });

    describe("one pending image and one matching worker", () => {
        it("should return an empty array", () => {
            const result = calculateWorkDistribution(
                [
                    {
                        model: "stable_diffusion_text2im",
                        score: 1,
                    },
                ],
                [
                    {
                        id: "worker1",
                        num_gpus: 1,
                        last_ping: moment().valueOf(),
                        status: "idle",
                    },
                ],
                [
                    {
                        worker_id: "worker1",
                        gpu_configs: [
                            {
                                gpu_num: 0,
                                model: "stable_diffusion_text2im",
                            },
                        ],
                    },
                ]
            );
            expect(result).toEqual([]);
        });
    });

    describe("one pending image and one non-matching worker", () => {
        it("should return updated worker config", () => {
            const result = calculateWorkDistribution(
                [
                    {
                        model: "stable_diffusion_text2im",
                        score: 1,
                    },
                ],
                [
                    {
                        id: "worker1",
                        num_gpus: 1,
                        last_ping: moment().valueOf(),
                        status: "idle",
                    },
                ],
                [
                    {
                        worker_id: "worker1",
                        gpu_configs: [
                            {
                                gpu_num: 0,
                                model: "stable_diffusion_inpainting",
                            },
                        ],
                    },
                ]
            );
            expect(result).toEqual([
                {
                    worker_id: "worker1",
                    gpu_configs: [
                        {
                            gpu_num: 0,
                            model: "stable_diffusion_text2im",
                        },
                    ],
                },
            ]);
        });
    });

    // if only 2 workers, they are allocated as needed. Once 3 workers is hit,
    // the system will try to keep one of each model going and allocate the remainder
    // as needed.
    describe("one pending image, one matching worker, one non-matching worker", () => {
        it("should return updated worker config", () => {
            const result = calculateWorkDistribution(
                [
                    {
                        model: "stable_diffusion_text2im",
                        score: 1,
                    },
                ],
                [
                    {
                        id: "worker1",
                        num_gpus: 1,
                        last_ping: moment().valueOf(),
                        status: "idle",
                    },
                    {
                        id: "worker2",
                        num_gpus: 1,
                        last_ping: moment().valueOf(),
                        status: "idle",
                    },
                ],
                [
                    {
                        worker_id: "worker1",
                        gpu_configs: [
                            {
                                gpu_num: 0,
                                model: "stable_diffusion_text2im",
                            },
                        ],
                    },
                    {
                        worker_id: "worker2",
                        gpu_configs: [
                            {
                                gpu_num: 0,
                                model: "stable_diffusion_inpainting",
                            },
                        ],
                    },
                ]
            );
            expect(result).toEqual([
                {
                    worker_id: "worker2",
                    gpu_configs: [
                        {
                            gpu_num: 0,
                            model: "stable_diffusion_text2im",
                        },
                    ],
                },
            ]);
        });
    });

    describe("one pending image, one available non-matching worker", () => {
        // create a balanced 3gpu worker, and one gpu with the wrong model
        it("should return updated worker config", () => {
            const result = calculateWorkDistribution(
                [
                    {
                        model: "stable_diffusion_text2im",
                        score: 1,
                    },
                ],
                [
                    {
                        id: "worker1",
                        num_gpus: 3,
                        last_ping: moment().valueOf(),
                        status: "idle",
                    },
                    {
                        id: "worker2",
                        num_gpus: 1,
                        last_ping: moment().valueOf(),
                        status: "idle",
                    },
                ],
                [
                    {
                        worker_id: "worker1",
                        gpu_configs: [
                            {
                                gpu_num: 0,
                                model: "stable_diffusion_text2im",
                            },
                            {
                                gpu_num: 1,
                                model: "stable_diffusion_inpainting",
                            },
                            {
                                gpu_num: 2,
                                model: "swinir",
                            },
                        ],
                    },
                    {
                        worker_id: "worker2",
                        gpu_configs: [
                            {
                                gpu_num: 0,
                                model: "stable_diffusion_inpainting",
                            },
                        ],
                    },
                ]
            );
            expect(result).toEqual([
                {
                    worker_id: "worker1",
                    gpu_configs: [
                        {
                            gpu_num: 0,
                            model: "stable_diffusion_text2im",
                        },
                        {
                            gpu_num: 1,
                            model: "stable_diffusion_text2im",
                        },
                        {
                            gpu_num: 2,
                            model: "swinir",
                        },
                    ],
                },
            ]);
        });
    });

    // same as last test, but 3gpu worker isn't idle
    describe("one pending image, one available non-matching worker, one busy 3gpu worker", () => {
        it("should return updated worker config", () => {
            const result = calculateWorkDistribution(
                [
                    {
                        model: "stable_diffusion_text2im",
                        score: 1,
                    },
                ],
                [
                    {
                        id: "worker1",
                        num_gpus: 3,
                        last_ping: moment().valueOf(),
                        status: "active",
                    },
                    {
                        id: "worker2",
                        num_gpus: 1,
                        last_ping: moment().valueOf(),
                        status: "idle",
                    },
                ],
                [
                    {
                        worker_id: "worker1",
                        gpu_configs: [
                            {
                                gpu_num: 0,
                                model: "stable_diffusion_text2im",
                            },
                            {
                                gpu_num: 1,
                                model: "stable_diffusion_inpainting",
                            },
                            {
                                gpu_num: 2,
                                model: "swinir",
                            },
                        ],
                    },
                    {
                        worker_id: "worker2",
                        gpu_configs: [
                            {
                                gpu_num: 0,
                                model: "stable_diffusion_inpainting",
                            },
                        ],
                    },
                ]
            );
            expect(result).toEqual([
                {
                    worker_id: "worker2",
                    gpu_configs: [
                        {
                            gpu_num: 0,
                            model: "stable_diffusion_text2im",
                        },
                    ],
                },
            ]);
        });
    });

    describe("one pending image and unbalanced 3gpu worker", () => {
        it("should return updated worker config", () => {
            const result = calculateWorkDistribution(
                [
                    {
                        model: "stable_diffusion_text2im",
                        score: 1,
                    },
                ],
                [
                    {
                        id: "worker1",
                        num_gpus: 3,
                        last_ping: moment().valueOf(),
                        status: "idle",
                    },
                ],
                [
                    {
                        worker_id: "worker1",
                        gpu_configs: [
                            {
                                gpu_num: 0,
                                model: "stable_diffusion_text2im",
                            },
                            {
                                gpu_num: 1,
                                model: "stable_diffusion_inpainting",
                            },
                            {
                                gpu_num: 2,
                                model: "stable_diffusion_text2im",
                            },
                        ],
                    },
                ]
            );
            expect(result).toEqual([
                {
                    worker_id: "worker1",
                    gpu_configs: [
                        {
                            gpu_num: 0,
                            model: "swinir",
                        },
                        {
                            gpu_num: 1,
                            model: "stable_diffusion_inpainting",
                        },
                        {
                            gpu_num: 2,
                            model: "stable_diffusion_text2im",
                        },
                    ],
                },
            ]);
        });
    });
});

describe("backend pending image scores", () => {
    let backendService: BackendService;
    let testHelper: TestHelper;
    let databaseName: string;
    let adminUserId: string;

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
        await backendService.createUser("admin@test.test");
        adminUserId = hash("admin@test.test");
    });

    afterEach(async () => {
        await backendService.destroy();
        await sleep(100);
    });

    describe("no pending images", () => {
        it("should return empty array", async () => {
            const result = await backendService.getPendingImageScores();
            expect(result).toEqual([]);
        });
    });

    describe("one pending image", () => {
        beforeEach(async () => {
            await backendService.createImages(adminUserId, {
                phrases: ["test"],
                status: "pending",
                label: "",
                iterations: 50,
                model: "stable_diffusion_text2im",
            });
        });

        it("should return one pending image", async () => {
            const result = await backendService.getPendingImageScores();
            expect(result.length).toEqual(1);
            expect(result[0].model).toEqual("stable_diffusion_text2im");
            expect(result[0].score).toBeGreaterThan(0);
        });
    });

    describe("three pending images 2:1", () => {
        beforeEach(async () => {
            await backendService.createImages(adminUserId, {
                phrases: ["test"],
                status: "pending",
                label: "",
                iterations: 50,
                model: "stable_diffusion_inpainting",
                count: 1,
            });
            await backendService.createImages(adminUserId, {
                phrases: ["test"],
                status: "pending",
                label: "",
                iterations: 50,
                model: "stable_diffusion_text2im",
                count: 2,
            });
            await sleep(100);
        });

        it("should return scores", async () => {
            const result = await backendService.getPendingImageScores();
            expect(result.length).toEqual(2);
            expect(result[0].model).toEqual("stable_diffusion_text2im");
            expect(result[1].model).toEqual("stable_diffusion_inpainting");
            expect(result[0].score).toBeGreaterThan(result[1].score);
        });
    });

    describe("three pending images 2:1, age", () => {
        beforeEach(async () => {
            await backendService.createImages(adminUserId, {
                phrases: ["test"],
                status: "pending",
                label: "",
                iterations: 50,
                model: "stable_diffusion_inpainting",
                count: 1,
            });
            await sleep(100);
            await backendService.createImages(adminUserId, {
                phrases: ["test"],
                status: "pending",
                label: "",
                iterations: 50,
                model: "stable_diffusion_text2im",
                count: 2,
            });
        });

        it("should return scores", async () => {
            const result = await backendService.getPendingImageScores();
            expect(result.length).toEqual(2);
            // older image gets a higher score
            expect(result[0].model).toEqual("stable_diffusion_inpainting");
            expect(result[1].model).toEqual("stable_diffusion_text2im");
            expect(result[0].score).toBeGreaterThan(result[1].score);
        });
    });
});

describe("WorkDistributor", () => {
    let backendService: BackendService;
    let testHelper: TestHelper;
    let databaseName: string;
    let adminUserId: string;
    let workDistributor: WorkDistributor;
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
        backendService = new BackendService(config, new MetricsClient(""), new ConsoleLogger(), clock);
        await backendService.init();
        await backendService.createUser("admin@test.test");
        workDistributor = new WorkDistributor(backendService);
        adminUserId = hash("admin@test.test");
    });

    afterEach(async () => {
        await backendService.destroy();
        await sleep(100);
    });

    async function getWorkDistribution(): Promise<{[key: string]: number}> {
        const workers = await backendService.listWorkers();
        const workerConfigs = await Promise.all(workers.map((w) => backendService.getWorkerConfig(w.id)));
        const workerConfigsByWorkerId = workerConfigs.reduce((acc, w) => {
            acc[w.worker_id] = w;
            return acc;
        }, {} as {[key: string]: WorkerConfig});
        const result: {[key: string]: number} = {};
        for (let model of MODELS) {
            result[model] = 0;
        }
        for (const worker of workers) {
            const workerConfig = workerConfigsByWorkerId[worker.id];
            for (let gpuConfig of workerConfig.gpu_configs) {
                result[gpuConfig.model] += 1;
            }
        }
        return result;
    }

    describe("no pending images, no workers", () => {
        it("should return no distribution", async () => {
            await workDistributor.distributeWork();
            const workDistribution = await getWorkDistribution();
            expect(workDistribution).toEqual({
                "stable_diffusion_inpainting": 0,
                "stable_diffusion_text2im": 0,
                "swinir": 0,
            });
        });
    })

    describe("no pending images, 2-gpu worker with same model", () => {
        it("should leave distribution unchanged", async () => {
            const worker = await backendService.createWorker("test worker");
            // ping
            await backendService.updateWorker(worker.id, {
                status: "idle",
            })
            await backendService.updateWorkerDeploymentInfo(worker.id, "testengine", 2, "asdf", "RTX 3090");
            // worker config defaults to text2im for each gpu
            await workDistributor.distributeWork();
            const workDistribution = await getWorkDistribution();
            expect(workDistribution).toEqual({
                "stable_diffusion_inpainting": 0,
                "stable_diffusion_text2im": 2,
                "swinir": 0,
            });
        })
    });

    describe("no pending images, 3-gpu worker with same model", () => {
        it("should rebalance the worker", async () => {
            const worker = await backendService.createWorker("test worker");
            // ping
            await backendService.updateWorker(worker.id, {
                status: "idle",
            })
            await backendService.updateWorkerDeploymentInfo(worker.id, "testengine", 3, "asdf", "RTX 3090");
            // worker config defaults to text2im for each gpu
            await workDistributor.distributeWork();
            const workDistribution = await getWorkDistribution();
            expect(workDistribution).toEqual({
                "stable_diffusion_inpainting": 1,
                "stable_diffusion_text2im": 1,
                "swinir": 1,
            });
        });
    })

    describe("no pending images, 1gpu worker with >10m ping, 2gpu worker with same model", () => {
        it("should not rebalance the workers", async () => {
            const worker1 = await backendService.createWorker("test worker 1");
            // ping
            await backendService.updateWorker(worker1.id, {
                status: "idle",
            })
            await backendService.updateWorkerDeploymentInfo(worker1.id, "testengine", 1, "asdf", "RTX 3090");
            // worker config defaults to text2im for each gpu
            const worker2 = await backendService.createWorker("test worker 2");
            // ping
            await backendService.updateWorker(worker2.id, {
                status: "idle",
            })
            await backendService.updateWorkerDeploymentInfo(worker2.id, "testengine", 2, "asdf", "RTX 3090");

            // advance clock by 11m
            let now = clock.now();
            now = now.add(11, "minutes");
            clock.setNow(now)
            // ping
            await backendService.updateWorker(worker2.id, {
                status: "idle",
            })
            await backendService.updateWorkerDeploymentInfo(worker2.id, "testengine", 2, "asdf", "RTX 3090");

            // worker config defaults to text2im for each gpu
            await workDistributor.distributeWork();
            const workDistribution = await getWorkDistribution();
            expect(workDistribution).toEqual({
                "stable_diffusion_inpainting": 0,
                "stable_diffusion_text2im": 3,
                "swinir": 0,
            });
        });
    })

    describe("no pending images, 4-gpu worker with the same model", () => {
        it("should rebalance the worker", async () => {
            const worker = await backendService.createWorker("test worker");
            // ping
            await backendService.updateWorker(worker.id, {
                status: "idle",
            })
            await backendService.updateWorkerDeploymentInfo(worker.id, "testengine", 4, "asdf", "RTX 3090");
            // worker config defaults to text2im for each gpu
            await workDistributor.distributeWork();
            const workDistribution = await getWorkDistribution();
            expect(workDistribution).toEqual({
                "stable_diffusion_inpainting": 1,
                "stable_diffusion_text2im": 2,
                "swinir": 1,
            });
        });
    })

    describe("no pending images, 6-gpu worker with the same model", () => {
        it("should rebalance the worker", async () => {
            const worker = await backendService.createWorker("test worker");
            // ping
            await backendService.updateWorker(worker.id, {
                status: "idle",
            })
            await backendService.updateWorkerDeploymentInfo(worker.id, "testengine", 6, "asdf", "RTX 3090");
            // worker config defaults to text2im for each gpu
            await workDistributor.distributeWork();
            const workDistribution = await getWorkDistribution();
            expect(workDistribution).toEqual({
                "stable_diffusion_inpainting": 2,
                "stable_diffusion_text2im": 3,
                "swinir": 1,
            });
        });
    })

    describe("one pending image, 6-gpu worker balanced", () => {
        it("should redistribute the worker", async () => {
            const worker = await backendService.createWorker("test worker");
            // ping
            await backendService.updateWorker(worker.id, {
                status: "idle",
            })
            await backendService.updateWorkerDeploymentInfo(worker.id, "testengine", 6, "asdf", "RTX 3090");
            await backendService.upsertWorkerConfig(worker.id, {
                gpu_configs: [{
                    model: "stable_diffusion_text2im",
                    gpu_num: 0,
                },
                {
                    model: "stable_diffusion_text2im",
                    gpu_num: 1,
                },
                {
                    model: "stable_diffusion_inpainting",
                    gpu_num: 2,
                },
                {
                    model: "stable_diffusion_inpainting",
                    gpu_num: 3,
                },
                {
                    model: "swinir",
                    gpu_num: 4,
                },
                {
                    model: "swinir",
                    gpu_num: 5,
                }],
            });
            await backendService.createImages(adminUserId, {
                phrases: ["test"],
                status: "pending",
                label: "",
                iterations: 50,
                model: "stable_diffusion_text2im",
            });
            
            // worker config defaults to text2im for each gpu
            await workDistributor.distributeWork();
            const workDistribution = await getWorkDistribution();
            expect(workDistribution).toEqual({
                "stable_diffusion_inpainting": 1,
                "stable_diffusion_text2im": 4,
                "swinir": 1,
            });
        });
    })
});
