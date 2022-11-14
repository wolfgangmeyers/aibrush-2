import {
    calculateScalingOperations,
    ScalingOperation,
    SCALEDOWN_COOLDOWN,
    GPUType,
    Worker,
    WORKER_TIMEOUT,
    RunpodEngine,
    TYPE_RUNPOD,
    RUNPOD_SCALING_EVENT,
    
} from "./runpod_engine";
import moment from "moment";
import {FakeClock, RealClock } from "./clock";
import { BackendService } from "./backend";
import { TestHelper } from "./testHelper";
import { MockRunpodApi } from "./runpod_client";
import { hash } from "./auth";
import { MetricsClient } from "./metrics";
import { ErrorFactory } from "./error_factory";

jest.setTimeout(60000);

interface TestCase {
    description: string;
    workers: Array<Worker>;
    gpuTypes: Array<GPUType>;
    targetGpus: number;
    lastScalingOperation: moment.Moment;
    expected: Array<ScalingOperation>;
}

function sortOps(operations: Array<ScalingOperation>): Array<ScalingOperation> {
    return operations.sort((a, b) => {
        if (a.targetId == b.targetId) {
            return a.gpuCount - b.gpuCount;
        } else {
            return a.targetId.localeCompare(b.targetId);
        }
    });
}

describe("Runpod Scaling Engine Calculations", () => {
    const testCases: Array<TestCase> = [
        {
            description: "current=0, available=0, target=0, no scaling operations",
            workers: [],
            gpuTypes: [],
            targetGpus: 0,
            lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
            expected: [],
        },
        {
            description: "current=1, available=0, target=0, scale down",
            workers: [
                {
                    id: "worker-1",
                    num_gpus: 1,
                    created_at: moment().valueOf(),
                },
            ],
            gpuTypes: [],
            targetGpus: 0,
            lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
            expected: [
                {
                    targetId: "worker-1",
                    operationType: "destroy",
                },
            ],
        },
        {
            description: "current=1, available=1, target=1, no scaling operations",
            workers: [
                {
                    id: "worker-1",
                    num_gpus: 1,
                    created_at: moment().valueOf(),
                },
            ],
            gpuTypes: [
                {
                    id: "NVIDIA GeForce RTX 3090",
                    lowestPrice: {
                        uninterruptablePrice: 0.45,
                        stockStatus: "Low",
                    },
                    maxGpuCount: 1,
                },
            ],
            targetGpus: 1,
            lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
            expected: [],
        },
        {
            description: "current=1,1, available=0, target=0, scale down",
            workers: [
                {
                    id: "worker-1",
                    num_gpus: 1,
                    created_at: moment().valueOf(),
                },
                {
                    id: "worker-2",
                    num_gpus: 1,
                    created_at: moment().valueOf(),
                },
            ],
            gpuTypes: [],
            targetGpus: 0,
            lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
            expected: [
                {
                    targetId: "worker-1",
                    operationType: "destroy",
                },
                {
                    targetId: "worker-2",
                    operationType: "destroy",
                },
            ],
        },
        {
            description: "current=1,1, available=0, target=1, scale down",
            workers: [
                {
                    id: "worker-1",
                    num_gpus: 1,
                    created_at: moment().valueOf(),
                },
                {
                    id: "worker-2",
                    num_gpus: 1,
                    created_at: moment().valueOf(),
                },
            ],
            gpuTypes: [],
            targetGpus: 1,
            lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
            expected: [
                {
                    targetId: "worker-2",
                    operationType: "destroy",
                },
            ],
        },
        {
            description: "current=2, available=0, target=1, no scaling operations",
            workers: [
                {
                    id: "worker-1",
                    num_gpus: 2,
                    created_at: moment().valueOf(),
                },
            ],
            gpuTypes: [],
            targetGpus: 1,
            lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
            expected: [],
        },
        {
            description: "current=2,3, target=1, scale down",
            workers: [
                {
                    id: "worker-1",
                    num_gpus: 2,
                    created_at: moment().valueOf(),
                },
                {
                    id: "worker-2",
                    num_gpus: 3,
                    created_at: moment().valueOf(),
                },
            ],
            gpuTypes: [],
            targetGpus: 1,
            lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
            expected: [
                {
                    targetId: "worker-2",
                    operationType: "destroy",
                },
            ],
        },
        {
            description: "current=3,2, target=1, scale down",
            workers: [
                {
                    id: "worker-1",
                    num_gpus: 3,
                    created_at: moment().valueOf(),
                },
                {
                    id: "worker-2",
                    num_gpus: 2,
                    created_at: moment().valueOf(),
                },
            ],
            gpuTypes: [],
            targetGpus: 2,
            lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
            expected: [
                {
                    targetId: "worker-1",
                    operationType: "destroy",
                },
            ],
        },
        {
            description: "current=2,2,2,1, target=3, scale down",
            workers: [
                {
                    id: "worker-1",
                    num_gpus: 2,
                    created_at: moment().valueOf(),
                },
                {
                    id: "worker-2",
                    num_gpus: 2,
                    created_at: moment().valueOf(),
                },
                {
                    id: "worker-3",
                    num_gpus: 2,
                    created_at: moment().valueOf(),
                },
                {
                    id: "worker-4",
                    num_gpus: 1,
                    created_at: moment().valueOf(),
                },
            ],
            gpuTypes: [],
            targetGpus: 3,
            lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
            expected: [
                {
                    targetId: "worker-3",
                    operationType: "destroy",
                },
                {
                    targetId: "worker-2",
                    operationType: "destroy",
                },
            ],
        },
        {
            description: "current=3,1, target=2, scale down",
            workers: [
                {
                    id: "worker-1",
                    num_gpus: 3,
                    created_at: moment().valueOf(),
                },
                {
                    id: "worker-2",
                    num_gpus: 1,
                    created_at: moment().valueOf(),
                },
            ],
            gpuTypes: [],
            targetGpus: 2,
            lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
            expected: [
                {
                    targetId: "worker-2",
                    operationType: "destroy",
                },
            ],
        },
        {
            description: "current=3,2, target=2, scale down",
            workers: [
                {
                    id: "worker-1",
                    num_gpus: 3,
                    created_at: moment().valueOf(),
                },
                {
                    id: "worker-2",
                    num_gpus: 2,
                    created_at: moment().valueOf(),
                },
            ],
            gpuTypes: [],
            targetGpus: 2,
            lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
            expected: [
                {
                    targetId: "worker-1",
                    operationType: "destroy",
                },
            ],
        },
        {
            description: "current=1, target=0, scaledown cooldown",
            workers: [
                {
                    id: "worker-1",
                    num_gpus: 1,
                    created_at: moment().valueOf(),
                },
            ],
            gpuTypes: [],
            targetGpus: 0,
            lastScalingOperation: moment()
                .subtract(SCALEDOWN_COOLDOWN)
                .add(1, "second"),
            expected: [],
        },
        {
            description:
                "current=1, target=1, worker timeout (failed to start)",
            workers: [
                {
                    id: "worker-1",
                    num_gpus: 1,
                    created_at: moment()
                        .subtract(WORKER_TIMEOUT)
                        .subtract(1, "second")
                        .valueOf(),
                    last_ping: null,
                },
            ],
            gpuTypes: [],
            targetGpus: 0,
            lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
            expected: [
                {
                    targetId: "worker-1",
                    operationType: "destroy",
                    block: true,
                },
            ],
        },
        {
            description: "current=1, target=1, worker timeout (died)",
            workers: [
                {
                    id: "worker-1",
                    num_gpus: 1,
                    created_at: moment().subtract(1, "days").valueOf(),
                    last_ping: moment()
                        .subtract(WORKER_TIMEOUT)
                        .subtract(1, "second")
                        .valueOf(),
                },
            ],
            gpuTypes: [],
            targetGpus: 0,
            lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
            expected: [
                {
                    targetId: "worker-1",
                    operationType: "destroy",
                    block: true,
                },
            ],
        },
        {
            description:
                "current=0, available=0 target=1, no scaling operations",
            workers: [],
            gpuTypes: [],
            targetGpus: 1,
            lastScalingOperation: moment(),
            expected: [],
        },
        {
            description: "current=0, available=1 target=1, scale up",
            workers: [],
            gpuTypes: [
                {
                    id: "NVIDIA GeForce RTX 3090",
                    maxGpuCount: 1,
                    lowestPrice: {
                        stockStatus: "Low",
                        uninterruptablePrice: 0.45,
                    }
                },
            ],
            targetGpus: 1,
            lastScalingOperation: moment(),
            expected: [
                {
                    targetId: "NVIDIA GeForce RTX 3090",
                    operationType: "create",
                    gpuCount: 1,
                },
            ],
        },
        {
            description: "current=0, available=1(5), target=4, scale up",
            workers: [],
            gpuTypes: [
                {
                    id: "NVIDIA GeForce RTX 3090",
                    maxGpuCount: 1,
                    lowestPrice: {
                        stockStatus: "Medium",
                        uninterruptablePrice: 0.45,
                    },
                },
            ],
            targetGpus: 4,
            lastScalingOperation: moment(),
            expected: [
                {
                    targetId: "NVIDIA GeForce RTX 3090",
                    operationType: "create",
                    gpuCount: 1,
                },
                {
                    targetId: "NVIDIA GeForce RTX 3090",
                    operationType: "create",
                    gpuCount: 1,
                },
                {
                    targetId: "NVIDIA GeForce RTX 3090",
                    operationType: "create",
                    gpuCount: 1,
                },
                {
                    targetId: "NVIDIA GeForce RTX 3090",
                    operationType: "create",
                    gpuCount: 1,
                }
            ],
        },
        {
            description: "current=0, available=4(1), target=5, scale up",
            workers: [],
            gpuTypes: [
                {
                    id: "NVIDIA GeForce RTX 3090",
                    maxGpuCount: 4,
                    lowestPrice: {
                        stockStatus: "Low",
                        uninterruptablePrice: 0.45,
                    },
                },
            ],
            targetGpus: 5,
            lastScalingOperation: moment(),
            expected: [
                {
                    targetId: "NVIDIA GeForce RTX 3090",
                    operationType: "create",
                    gpuCount: 4,
                },
            ],
        },
        {
            description: "current=0, available=4(5), target=5, scale up",
            workers: [],
            gpuTypes: [
                {
                    id: "NVIDIA GeForce RTX 3090",
                    maxGpuCount: 4,
                    lowestPrice: {
                        stockStatus: "Medium",
                        uninterruptablePrice: 0.45,
                    },
                },
            ],
            targetGpus: 5,
            lastScalingOperation: moment(),
            expected: [
                {
                    targetId: "NVIDIA GeForce RTX 3090",
                    operationType: "create",
                    gpuCount: 4,
                },
                {
                    targetId: "NVIDIA GeForce RTX 3090",
                    operationType: "create",
                    gpuCount: 4,
                }
            ],  
        },
        {
            description: "current=0, available=4(5),1(1), target=5, scale up",
            workers: [],
            gpuTypes: [
                {
                    id: "NVIDIA GeForce RTX 3090",
                    maxGpuCount: 4,
                    lowestPrice: {
                        stockStatus: "Medium",
                        uninterruptablePrice: 0.45,
                    },
                },
                {
                    id: "NVIDIA GeForce RTX 3090",
                    maxGpuCount: 1,
                    lowestPrice: {
                        stockStatus: "Low",
                        uninterruptablePrice: 0.45,
                    },
                },
            ],
            targetGpus: 5,
            lastScalingOperation: moment(),
            expected: [
                {
                    targetId: "NVIDIA GeForce RTX 3090",
                    operationType: "create",
                    gpuCount: 4,
                },
                {
                    targetId: "NVIDIA GeForce RTX 3090",
                    operationType: "create",
                    gpuCount: 1,
                },
            ],
        },
        {
            description: "current=0, available=4(5),1(5), target=5, scale up",
            workers: [],
            gpuTypes: [
                {
                    id: "NVIDIA GeForce RTX 3090",
                    maxGpuCount: 4,
                    lowestPrice: {
                        stockStatus: "Medium",
                        uninterruptablePrice: 0.45,
                    },
                },
                {
                    id: "NVIDIA GeForce RTX 3090",
                    maxGpuCount: 1,
                    lowestPrice: {
                        stockStatus: "Medium",
                        uninterruptablePrice: 0.45,
                    },
                },
            ],
            targetGpus: 5,
            lastScalingOperation: moment(),
            expected: [
                {
                    targetId: "NVIDIA GeForce RTX 3090",
                    operationType: "create",
                    gpuCount: 4,
                },
                {
                    targetId: "NVIDIA GeForce RTX 3090",
                    operationType: "create",
                    gpuCount: 1,
                },
            ],
        },
        {
            description: "current=0, available=4(1),1(5), target=5, scale up",
            workers: [],
            gpuTypes: [
                {
                    id: "NVIDIA GeForce RTX 3090",
                    maxGpuCount: 4,
                    lowestPrice: {
                        stockStatus: "Low",
                        uninterruptablePrice: 0.45,
                    },
                },
                {
                    id: "NVIDIA GeForce RTX 3090",
                    maxGpuCount: 1,
                    lowestPrice: {
                        stockStatus: "Medium",
                        uninterruptablePrice: 0.45,
                    },
                },
            ],
            targetGpus: 5,
            lastScalingOperation: moment(),
            expected: [
                {
                    targetId: "NVIDIA GeForce RTX 3090",
                    operationType: "create",
                    gpuCount: 4,
                },
                {
                    targetId: "NVIDIA GeForce RTX 3090",
                    operationType: "create",
                    gpuCount: 1,
                },
            ],
        },
        {
            description: "current=0, available=1(5), target=5, scale up",
            workers: [],
            gpuTypes: [
                {
                    id: "NVIDIA GeForce RTX 3090",
                    maxGpuCount: 1,
                    lowestPrice: {
                        stockStatus: "Medium",
                        uninterruptablePrice: 0.45,
                    },
                },
            ],
            targetGpus: 5,
            lastScalingOperation: moment(),
            expected: [
                {
                    targetId: "NVIDIA GeForce RTX 3090",
                    operationType: "create",
                    gpuCount: 1,
                },
                {
                    targetId: "NVIDIA GeForce RTX 3090",
                    operationType: "create",
                    gpuCount: 1,
                },
                {
                    targetId: "NVIDIA GeForce RTX 3090",
                    operationType: "create",
                    gpuCount: 1,
                },
                {
                    targetId: "NVIDIA GeForce RTX 3090",
                    operationType: "create",
                    gpuCount: 1,
                },
                {
                    targetId: "NVIDIA GeForce RTX 3090",
                    operationType: "create",
                    gpuCount: 1,
                },
            ],
        },
        {
            description: "current=0, available=2,3,4,1 target=5, scale up",
            workers: [],
            gpuTypes: [
                {
                    id: "NVIDIA GeForce RTX 3090",
                    maxGpuCount: 2,
                    lowestPrice: {
                        stockStatus: "Low",
                        uninterruptablePrice: 0.45,
                    },
                },
                {
                    id: "NVIDIA GeForce RTX 3090",
                    maxGpuCount: 3,
                    lowestPrice: {
                        stockStatus: "Low",
                        uninterruptablePrice: 0.45,
                    },
                },
                {
                    id: "NVIDIA GeForce RTX 3090",
                    maxGpuCount: 4,
                    lowestPrice: {
                        stockStatus: "Low",
                        uninterruptablePrice: 0.45,
                    },
                },
                {
                    id: "NVIDIA GeForce RTX 3090",
                    maxGpuCount: 1,
                    lowestPrice: {
                        stockStatus: "Low",
                        uninterruptablePrice: 0.45,
                    },
                },
            ],
            targetGpus: 5,
            lastScalingOperation: moment(),
            expected: [
                {
                    targetId: "NVIDIA GeForce RTX 3090",
                    operationType: "create",
                    gpuCount: 4,
                },
                {
                    targetId: "NVIDIA GeForce RTX 3090",
                    operationType: "create",
                    gpuCount: 1,
                },
            ],
        },
    ]

    for (let testCase of testCases) {
        it(testCase.description, () => {
            const actual = calculateScalingOperations(
                testCase.workers,
                testCase.gpuTypes,
                testCase.targetGpus,
                testCase.lastScalingOperation,
                new RealClock()
            );
            
            expect(
                sortOps(actual)
            ).toEqual(
                sortOps(testCase.expected)
            );
        })
    }
})

describe("RunpodEngine", () => {
    let backendService: BackendService;
    let runpodEngine: RunpodEngine;
    let testHelper: TestHelper;
    let databaseName: string;
    let mockRunpodClient: MockRunpodApi;
    let clock: FakeClock;

    const adminId = hash("admin@test.test");

    beforeAll(async () => {
        testHelper = new TestHelper();
        await testHelper.cleanupDatabases();
    });

    beforeEach(async () => {
        databaseName = await testHelper.createTestDatabase();
        await testHelper.cleanupTestFiles();
        const config = testHelper.createConfig(databaseName);
        backendService = new BackendService(config, new MetricsClient(""));
        await backendService.init();
        mockRunpodClient = new MockRunpodApi();
        clock = new FakeClock(moment());
        runpodEngine = new RunpodEngine(
            mockRunpodClient,
            backendService,
            clock,
            new MetricsClient(""),
            "NVIDIA GeForce RTX 3090",
        );
        await backendService.createUser("admin@test.test");
    });

    afterEach(async () => {
        await backendService.destroy();
    });

    describe("scale with no workers, no gpus and no orders", () => {
        it("should not scale", async () => {
            expect(await runpodEngine.scale(0)).toEqual(0);
            expect(mockRunpodClient._pods).toEqual([]);
            const workerResult = await backendService.listWorkers();
            expect(workerResult).toEqual([]);
        });
    });

    describe("scale with no workers, no gpus and one order", () => {
        it("should not scale", async () => {
            expect(await runpodEngine.scale(1)).toEqual(0);
            expect(mockRunpodClient._pods).toEqual([]);
            const workerResult = await backendService.listWorkers();
            expect(workerResult).toEqual([]);
        })
    })

    describe("scale with no workers, one gpu and no orders", () => {
        it("should not scale", async () => {
            mockRunpodClient._gpuTypes = [
                {
                    id: "NVIDIA GeForce RTX 3090",
                    maxGpuCount: 1,
                    lowestPrice: {
                        stockStatus: "Low",
                        uninterruptablePrice: 0.45,
                    },
                },
            ];
            expect(await runpodEngine.scale(0)).toEqual(0);
            expect(mockRunpodClient._pods).toEqual([]);
            const workerResult = await backendService.listWorkers();
            expect(workerResult).toEqual([]);
        });
    })

    describe("scale with no workers, one gpu, and one order", () => {
        it("should scale up", async () => {
            mockRunpodClient._gpuTypes = [
                {
                    id: "NVIDIA GeForce RTX 3090",
                    maxGpuCount: 1,
                    lowestPrice: {
                        stockStatus: "Low",
                        uninterruptablePrice: 0.45,
                    },
                },
            ];
            expect(await runpodEngine.scale(1)).toEqual(1);
            const workerResult = await backendService.listWorkers();
            expect(workerResult.length).toEqual(1);
            const worker = workerResult[0];
            expect(worker.login_code).toBeTruthy();
            expect(worker.cloud_instance_id).toEqual("pod-id");
            expect(worker.engine).toEqual(TYPE_RUNPOD);
            expect(worker.num_gpus).toEqual(1);
            expect(mockRunpodClient._pods).toEqual([
                {
                    id: "pod-id",
                    name: "AiBrush Worker",
                    runtime: {
                        container: {
                            cpuPercent: 0,
                            memoryPercent: 0,
                        },
                        gpus: [],
                        ports: [],
                        uptimeInSeconds: 0,
                    }
                },
            ]);

        });
    })

    describe("scale with one worker, one offer and one order", () => {
        it("should not scale", async () => {
            mockRunpodClient._gpuTypes = [
                {
                    id: "NVIDIA GeForce RTX 3090",
                    maxGpuCount: 2,
                    lowestPrice: {
                        stockStatus: "Low",
                        uninterruptablePrice: 0.45,
                    },
                },
            ];
            mockRunpodClient._pods = [
                {
                    id: "pod-id",
                    name: "AiBrush Worker",
                    runtime: {
                        container: {
                            cpuPercent: 0,
                            memoryPercent: 0,
                        },
                        gpus: [],
                        ports: [],
                        uptimeInSeconds: 0,
                    }
                },
            ];
            const worker = await backendService.createWorker("existing");
            await backendService.updateWorkerDeploymentInfo(
                worker.id,
                TYPE_RUNPOD,
                2,
                "pod-id"
            );
            expect(await runpodEngine.scale(1)).toEqual(1);
            expect(mockRunpodClient._pods).toEqual([
                {
                    id: "pod-id",
                    name: "AiBrush Worker",
                    runtime: {
                        container: {
                            cpuPercent: 0,
                            memoryPercent: 0,
                        },
                        gpus: [],
                        ports: [],
                        uptimeInSeconds: 0,
                    }
                },
            ]);
            const workerResult = await backendService.listWorkers();
            expect(workerResult.length).toEqual(1);
        });
    });

    describe("scale with one worker, no offers and no orders", () => {
        it("should scale down", async () => {
            mockRunpodClient._pods = [
                {
                    id: "pod-id",
                    name: "AiBrush Worker",
                    runtime: {
                        container: {
                            cpuPercent: 0,
                            memoryPercent: 0,
                        },
                        gpus: [],
                        ports: [],
                        uptimeInSeconds: 0,
                    }
                },
            ];
            const worker = await backendService.createWorker("existing");
            await backendService.updateWorkerDeploymentInfo(
                worker.id,
                TYPE_RUNPOD,
                2,
                "pod-id"
            );
            // set the last scaling operation to 10 minutes ago
            await backendService.setLastEventTime(
                RUNPOD_SCALING_EVENT,
                clock.now().subtract(10, "minutes").valueOf()
            );
            expect(await runpodEngine.scale(0)).toEqual(0);
            expect(mockRunpodClient._pods).toEqual([]);
            const workerResult = await backendService.listWorkers();
            expect(workerResult.length).toEqual(0);
        });
    });

    // refactor to runpod
    describe("scale with one worker, no offers and no orders, cooldown in effect", () => {
        it("should not scale down", async () => {
            mockRunpodClient._pods = [
                {
                    id: "pod-id",
                    name: "AiBrush Worker",
                    runtime: {
                        container: {
                            cpuPercent: 0,
                            memoryPercent: 0,
                        },
                        gpus: [],
                        ports: [],
                        uptimeInSeconds: 0,
                    }
                },
            ];
            const worker = await backendService.createWorker("existing");
            await backendService.updateWorkerDeploymentInfo(
                worker.id,
                TYPE_RUNPOD,
                2,
                "pod-id"
            );
            // set the last scaling operation to 1 minute ago
            await backendService.setLastEventTime(
                RUNPOD_SCALING_EVENT,
                clock.now().subtract(1, "minutes").valueOf()
            );
            expect(await runpodEngine.scale(0)).toEqual(1);
            expect(mockRunpodClient._pods).toEqual([
                {
                    id: "pod-id",
                    name: "AiBrush Worker",
                    runtime: {
                        container: {
                            cpuPercent: 0,
                            memoryPercent: 0,
                        },
                        gpus: [],
                        ports: [],
                        uptimeInSeconds: 0,
                    }
                },
            ]);
            const workerResult = await backendService.listWorkers();
            expect(workerResult.length).toEqual(1);
        });
    });

    // refactor to runpod
    describe("scale with one worker(timeout), no offers and one order", () => {
        it("should destroy the timed out worker", async () => {
            mockRunpodClient._pods = [
                {
                    id: "pod-id",
                    name: "AiBrush Worker",
                    runtime: {
                        container: {
                            cpuPercent: 0,
                            memoryPercent: 0,
                        },
                        gpus: [],
                        ports: [],
                        uptimeInSeconds: 0,
                    }
                },
            ];
            const worker = await backendService.createWorker("existing");
            await backendService.updateWorkerDeploymentInfo(
                worker.id,
                TYPE_RUNPOD,
                2,
                "pod-id"
            );
            clock._now = moment().add(10, "minutes");
            expect(await runpodEngine.scale(1)).toEqual(0);
            expect(mockRunpodClient._pods).toEqual([]);
            const workerResult = await backendService.listWorkers();
            expect(workerResult.length).toEqual(0);
            const isBlocked = await backendService.isWorkerBlocked(
                "pod-id",
                TYPE_RUNPOD,
                clock.now()
            );
            // runpod doesn't support blocking
            expect(isBlocked).toEqual(false);
        });
    });

    // refactor to runpod
    describe("scale with no workers, one gpu, and one order, provision error", () => {
        it("should not scale up", async () => {
            mockRunpodClient._pods = []
            mockRunpodClient._gpuTypes = [
                {
                    id: "NVIDIA GeForce RTX 3090",
                    maxGpuCount: 1,
                    lowestPrice: {
                        stockStatus: "Low",
                        uninterruptablePrice: 0.45,
                    },
                },
            ];

            mockRunpodClient.errFactory = new ErrorFactory([new Error("nope")]);
            expect(await runpodEngine.scale(1)).toEqual(0);
            expect(mockRunpodClient._pods).toEqual([]);
            const workerResult = await backendService.listWorkers();
            expect(workerResult.length).toEqual(0);
        });
    });
})