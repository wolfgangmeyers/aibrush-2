import { calculateScalingOperations, ScalingOperation, SCALEDOWN_COOLDOWN, Offer, Worker, WORKER_TIMEOUT, VastEngine, TYPE_VASTAI } from "./vast_engine";
import moment from "moment";
import * as uuid from "uuid";

import { BackendService } from "./backend";
import { MetricsClient } from "./metrics";
import { Server } from "./server";
import { sleep } from "./sleep";
import { Session, TestHelper } from "./testHelper";
import { MockVastAPI } from "./vast_client";
import { hash } from "./auth";
import { FakeClock, RealClock } from "./clock";

jest.setTimeout(60000);

interface TestCase {
    description: string;
    workers: Array<Worker>;
    offers: Array<Offer>;
    targetGpus: number;
    lastScalingOperation: moment.Moment;
    expected: Array<ScalingOperation>;
}

describe("Vast Scaling Engine Calculations", () => {
    const testCases: Array<TestCase> = [{
        description: "current=0, target=0, no scaling operations",
        workers: [],
        offers: [],
        targetGpus: 0,
        lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
        expected: [],
    }, {
        description: "current=1, target=0, scale down",
        workers: [{
            id: "worker-1",
            num_gpus: 1,
            created_at: moment().valueOf(),
        }],
        offers: [],
        targetGpus: 0,
        lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
        expected: [{
            targetId: "worker-1",
            operationType: "destroy",
        }],
    }, {
        description: "current=1, target=1, no scaling operations",
        workers: [{
            id: "worker-1",
            num_gpus: 1,
            created_at: moment().valueOf(),
        }],
        offers: [],
        targetGpus: 1,
        lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
        expected: [],
    }, {
        description: "current=1,1, target=0, scale down",
        workers: [{
            id: "worker-1",
            num_gpus: 1,
            created_at: moment().valueOf(),
        }, {
            id: "worker-2",
            num_gpus: 1,
            created_at: moment().valueOf(),
        }],
        offers: [],
        targetGpus: 0,
        lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
        expected: [{
            targetId: "worker-1",
            operationType: "destroy",
        }, {
            targetId: "worker-2",
            operationType: "destroy",
        }],
    }, {
        description: "current=1,1, target=1, scale down",
        workers: [{
            id: "worker-1",
            num_gpus: 1,
            created_at: moment().valueOf(),
        }, {
            id: "worker-2",
            num_gpus: 1,
            created_at: moment().valueOf(),
        }],
        offers: [],
        targetGpus: 1,
        lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
        expected: [{
            targetId: "worker-2",
            operationType: "destroy",
        }],
    }, {
        description: "current=2, target=1, no scaling operations",
        workers: [{
            id: "worker-1",
            num_gpus: 2,
            created_at: moment().valueOf(),
        }],
        offers: [],
        targetGpus: 1,
        lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
        expected: [],
    }, {
        description: "current=2,3, target=1, scale down",
        workers: [{
            id: "worker-1",
            num_gpus: 2,
            created_at: moment().valueOf(),
        }, {
            id: "worker-2",
            num_gpus: 3,
            created_at: moment().valueOf(),
        }],
        offers: [],
        targetGpus: 1,
        lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
        expected: [{
            targetId: "worker-2",
            operationType: "destroy",
        }],
    }, {
        description: "current=3,2, target=1, scale down",
        workers: [{
            id: "worker-1",
            num_gpus: 3,
            created_at: moment().valueOf(),
        }, {
            id: "worker-2",
            num_gpus: 2,
            created_at: moment().valueOf(),
        }],
        offers: [],
        targetGpus: 2,
        lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
        expected: [{
            targetId: "worker-1",
            operationType: "destroy",
        }],
    }, {
        description: "current=2,2,2,1, target=3, scale down",
        workers: [{
            id: "worker-1",
            num_gpus: 2,
            created_at: moment().valueOf(),
        }, {
            id: "worker-2",
            num_gpus: 2,
            created_at: moment().valueOf(),
        }, {
            id: "worker-3",
            num_gpus: 2,
            created_at: moment().valueOf(),
        }, {
            id: "worker-4",
            num_gpus: 1,
            created_at: moment().valueOf(),
        }],
        offers: [],
        targetGpus: 3,
        lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
        expected: [{
            targetId: "worker-3",
            operationType: "destroy",
        }, {
            targetId: "worker-2",
            operationType: "destroy",
        }],
    }, {
        description: "current=3,1, target=2, scale down",
        workers: [{
            id: "worker-1",
            num_gpus: 3,
            created_at: moment().valueOf(),
        }, {
            id: "worker-2",
            num_gpus: 1,
            created_at: moment().valueOf(),
        }],
        offers: [],
        targetGpus: 2,
        lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
        expected: [{
            targetId: "worker-2",
            operationType: "destroy",
        }],
    }, {
        description: "current=3,2, target=2, scale down",
        workers: [{
            id: "worker-1",
            num_gpus: 3,
            created_at: moment().valueOf(),
        }, {
            id: "worker-2",
            num_gpus: 2,
            created_at: moment().valueOf(),
        }],
        offers: [],
        targetGpus: 2,
        lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
        expected: [{
            targetId: "worker-1",
            operationType: "destroy",
        }],
    }, {
        description: "current=1, target=0, scaledown cooldown",
        workers: [{
            id: "worker-1",
            num_gpus: 1,
            created_at: moment().valueOf(),
        }],
        offers: [],
        targetGpus: 0,
        lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN).add(1, "second"),
        expected: [],
    }, {
        description: "current=1, target=1, worker timeout (failed to start)",
        workers: [{
            id: "worker-1",
            num_gpus: 1,
            created_at: moment().subtract(WORKER_TIMEOUT).subtract(1, "second").valueOf(),
            last_ping: null,
        }],
        offers: [],
        targetGpus: 0,
        lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
        expected: [{
            targetId: "worker-1",
            operationType: "destroy",
            block: true,
        }],
    }, {
        description: "current=1, target=1, worker timeout (died)",
        workers: [{
            id: "worker-1",
            num_gpus: 1,
            created_at: moment().subtract(1, "days").valueOf(),
            last_ping: moment().subtract(WORKER_TIMEOUT).subtract(1, "second").valueOf(),
        }],
        offers: [],
        targetGpus: 0,
        lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN),
        expected: [{
            targetId: "worker-1",
            operationType: "destroy",
            block: true,
        }],
    }, {
        description: "current=0, available=0 target=1, no scaling operations",
        workers: [],
        offers: [],
        targetGpus: 1,
        lastScalingOperation: moment(),
        expected: [],
    }, {
        description: "current=0, available=1(overpriced) target=1, no scaling operations",
        workers: [],
        offers: [{
            id: 1,
            num_gpus: 1,
            dph_total: 0.51,
        }],
        targetGpus: 1,
        lastScalingOperation: moment(),
        expected: [],
    }, {
        description: "current=0, available=4(overpriced) target=2, no scaling operations",
        workers: [],
        offers: [{
            id: 1,
            num_gpus: 4,
            dph_total: 2.01,
        }],
        targetGpus: 1,
        lastScalingOperation: moment(),
        expected: [],
    }, {
        description: "current=0, available=1 target=1, scale up",
        workers: [],
        offers: [{
            id: 1,
            num_gpus: 1,
            dph_total: 0.3,
        }],
        targetGpus: 1,
        lastScalingOperation: moment(),
        expected: [{
            targetId: "1",
            operationType: "create",
        }],
    }, {
        description: "current=0, available=1,2 target=1, scale up",
        workers: [],
        offers: [{
            id: 1,
            num_gpus: 1,
            dph_total: 0.3,
        }, {
            id: 2,
            num_gpus: 2,
            dph_total: 0.6,
        }],
        targetGpus: 1,
        lastScalingOperation: moment(),
        expected: [{
            targetId: "1",
            operationType: "create",
        }],
    }, {
        description: "current=0, available=2,1 target=1, scale up",
        workers: [],
        offers: [{
            id: 1,
            num_gpus: 2,
            dph_total: 0.6,
        }, {
            id: 2,
            num_gpus: 1,
            dph_total: 0.3,
        }],
        targetGpus: 1,
        lastScalingOperation: moment(),
        expected: [{
            targetId: "2",
            operationType: "create",
        }],
    }, {
        description: "current=0, available=2,2 target=1, scale up",
        workers: [],
        offers: [{
            id: 1,
            num_gpus: 2,
            dph_total: 0.6,
        }, {
            id: 2,
            num_gpus: 2,
            dph_total: 0.61,
        }],
        targetGpus: 1,
        lastScalingOperation: moment(),
        expected: [{
            targetId: "1",
            operationType: "create",
        }],
    }, {
        description: "current=0, available=2,2 target=3, scale up",
        workers: [],
        offers: [{
            id: 1,
            num_gpus: 2,
            dph_total: 0.6,
        }, {
            id: 2,
            num_gpus: 2,
            dph_total: 0.61,
        }],
        targetGpus: 3,
        lastScalingOperation: moment(),
        expected: [{
            targetId: "1",
            operationType: "create",
        }, {
            targetId: "2",
            operationType: "create",
        }],
    }, {
        description: "current=0, available=2,2 target=4, scale up",
        workers: [],
        offers: [{
            id: 1,
            num_gpus: 2,
            dph_total: 0.6,
        }, {
            id: 2,
            num_gpus: 2,
            dph_total: 0.61,
        }],
        targetGpus: 4,
        lastScalingOperation: moment(),
        expected: [{
            targetId: "1",
            operationType: "create",
        }, {
            targetId: "2",
            operationType: "create",
        }],
    }, {
        description: "current=0, available=2,2 target=5, scale up",
        workers: [],
        offers: [{
            id: 1,
            num_gpus: 2,
            dph_total: 0.6,
        }, {
            id: 2,
            num_gpus: 2,
            dph_total: 0.61,
        }],
        targetGpus: 5,
        lastScalingOperation: moment(),
        expected: [{
            targetId: "1",
            operationType: "create",
        }, {
            targetId: "2",
            operationType: "create",
        }],
    }, {
        description: "current=0, available=2,3 target=5, scale up",
        workers: [],
        offers: [{
            id: 1,
            num_gpus: 2,
            dph_total: 0.6,
        }, {
            id: 2,
            num_gpus: 3,
            dph_total: 0.91,
        }],
        targetGpus: 6,
        lastScalingOperation: moment(),
        expected: [{
            targetId: "2",
            operationType: "create",
        }, {
            targetId: "1",
            operationType: "create",
        }],
    }, {
        description: "current=0, available=2,3,4,1 target=5, scale up",
        workers: [],
        offers: [{
            id: 1,
            num_gpus: 2,
            dph_total: 0.6,
        }, {
            id: 2,
            num_gpus: 3,
            dph_total: 0.91,
        }, {
            id: 3,
            num_gpus: 4,
            dph_total: 1.21,
        }, {
            id: 4,
            num_gpus: 1,
            dph_total: 0.31,
        }],
        targetGpus: 5,
        lastScalingOperation: moment(),
        expected: [{
            targetId: "3",
            operationType: "create",
        }, {
            targetId: "4",
            operationType: "create",
        }],
    }];
    for (let testCase of testCases) {
        it(testCase.description, () => {
            const actual = calculateScalingOperations(
                testCase.workers,
                testCase.offers,
                testCase.targetGpus,
                testCase.lastScalingOperation,
                new RealClock(),
            );
            expect(actual.sort((a, b) => a.targetId.localeCompare(b.targetId))).toEqual(testCase.expected.sort((a, b) => a.targetId.localeCompare(b.targetId)));
        });
    }
});

describe("VastEngine", () => {
    let backendService: BackendService;
    let vastEngine: VastEngine;
    let testHelper: TestHelper;
    let databaseName: string;
    let mockVastClient: MockVastAPI;
    let clock: FakeClock;

    const adminId = hash("admin@test.test")

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
        mockVastClient = new MockVastAPI();
        clock = new FakeClock(moment());
        vastEngine = new VastEngine(mockVastClient, backendService, "wolfgangmeyers/aibrush:latest", clock, new MetricsClient(""));
        await backendService.createUser("admin@test.test");
    });

    afterEach(async () => {
        await backendService.destroy();
    });

    describe("scale with no workers, no offers and no orders", () => {
        it("should not scale", async () => {
            await vastEngine.scale(0);
            expect(mockVastClient.instances).toEqual([]);
            expect(mockVastClient.offers).toEqual([]);
            const workerResult = await backendService.listWorkers();
            expect(workerResult).toEqual([]);
        });
    })

    describe("scale with no workers, no offers and one order", () => {
        it("should not scale", async () => {
            await vastEngine.scale(1);
            expect(mockVastClient.instances).toEqual([]);
            expect(mockVastClient.offers).toEqual([]);
            const workerResult = await backendService.listWorkers();
            expect(workerResult).toEqual([]);
        });
    });

    describe("scale with no workers, one offer and no orders", () => {
        it("should not scale", async () => {
            mockVastClient._offers = [{
                id: 1,
                num_gpus: 1,
                dph_total: 0.3,
            }]
            await vastEngine.scale(0);
            expect(mockVastClient.instances).toEqual([]);
            expect(mockVastClient.offers).toEqual([{
                id: 1,
                num_gpus: 1,
                dph_total: 0.3,
            }]);
            const workerResult = await backendService.listWorkers();
            expect(workerResult).toEqual([]);
        });
    });

    describe("scale with no workers, one offer and one order", () => {
        it("should scale up", async () => {
            mockVastClient._offers = [{
                id: 1,
                num_gpus: 1,
                dph_total: 0.3,
            }]
            await vastEngine.scale(1);
            const workerResult = await backendService.listWorkers();
            expect(workerResult.length).toEqual(1);
            const worker = workerResult[0];
            expect(worker.login_code).toBeTruthy();
            expect(worker.cloud_instance_id).toEqual("1");
            expect(worker.engine).toEqual(TYPE_VASTAI);
            expect(worker.num_gpus).toEqual(1);
            expect(mockVastClient.instances).toEqual([{
                id: 1,
                actual_status: "active",
                intended_status: "active",
                cur_state: "active",
                next_state: "active",
                image: "wolfgangmeyers/aibrush:latest",
                onStart: "/app/aibrush-2/worker/images_worker.sh",
                env: {
                    "WORKER_LOGIN_CODE": worker.login_code,
                },
            }]);
            expect(mockVastClient.offers).toEqual([]);
        });
    });

    describe("scale with one worker, one offer and one order", () => {
        it("should not scale", async () => {
            mockVastClient._offers = [{
                id: 2,
                num_gpus: 1,
                dph_total: 0.3,
            }]
            mockVastClient._instances = [{
                id: 1,
                num_gpus: 1,
                dph_total: 0.3,
            }]
            const worker = await backendService.createWorker("existing");
            await backendService.updateWorkerDeploymentInfo(worker.id, TYPE_VASTAI, 2, "1");
            await vastEngine.scale(1);
            expect(mockVastClient.instances).toEqual([{
                id: 1,
                num_gpus: 1,
                dph_total: 0.3,
            }]);
            expect(mockVastClient.offers).toEqual([{
                id: 2,
                num_gpus: 1,
                dph_total: 0.3,
            }]);
            const workerResult = await backendService.listWorkers();
            expect(workerResult.length).toEqual(1);
        });
    });

    describe("scale with one worker, no offers and no orders", () => {
        it("should scale down", async () => {
            mockVastClient._instances = [{
                id: 1,
                num_gpus: 1,
                dph_total: 0.3,
            }]
            const worker = await backendService.createWorker("existing");
            await backendService.updateWorkerDeploymentInfo(worker.id, TYPE_VASTAI, 2, "1");
            // set the last scaling operation to 10 minutes ago
            vastEngine.lastScalingOperation = clock.now().subtract(10, "minutes");
            await vastEngine.scale(0);
            expect(mockVastClient.instances).toEqual([]);
            expect(mockVastClient.offers).toEqual([]);
            const workerResult = await backendService.listWorkers();
            expect(workerResult.length).toEqual(0);
        });
    });

    describe("scale with one worker, no offers and no orders, cooldown in effect", () => {
        it("should not scale down", async () => {
            mockVastClient._instances = [{
                id: 1,
                num_gpus: 1,
                dph_total: 0.3,
            }]
            const worker = await backendService.createWorker("existing");
            await backendService.updateWorkerDeploymentInfo(worker.id, TYPE_VASTAI, 2, "1");
            // set the last scaling operation to 1 minute ago
            vastEngine.lastScalingOperation = moment().subtract(1, "minutes");
            await vastEngine.scale(0);
            expect(mockVastClient.instances).toEqual([{
                id: 1,
                num_gpus: 1,
                dph_total: 0.3,
            }]);
            expect(mockVastClient.offers).toEqual([]);
            const workerResult = await backendService.listWorkers();
            expect(workerResult.length).toEqual(1);
        })
    })

    describe("scale with one worker(timeout), no offers and one order", () => {
        it("should destroy the timed out worker", async () => {
            mockVastClient._instances = [{
                id: 1,
                num_gpus: 1,
                dph_total: 0.3,
            }]
            const worker = await backendService.createWorker("existing");
            await backendService.updateWorkerDeploymentInfo(worker.id, TYPE_VASTAI, 2, "1");
            clock._now = moment().add(10, "minutes");
            await vastEngine.scale(1);
            expect(mockVastClient.instances).toEqual([]);
            expect(mockVastClient.offers).toEqual([]);
            const workerResult = await backendService.listWorkers();
            expect(workerResult.length).toEqual(0);
            const isBlocked = await backendService.isWorkerBlocked("1", TYPE_VASTAI, clock.now());
            expect(isBlocked).toEqual(true);
        });
    })

    describe("scale with no workers, one offer (blocked), and one order", () => {
        it("should not scale up", async () => {
            mockVastClient._offers = [{
                id: 1,
                num_gpus: 1,
                dph_total: 0.3,
            }]
            await backendService.blockWorker("1", TYPE_VASTAI, clock.now());
            await vastEngine.scale(1);
            expect(mockVastClient.instances).toEqual([]);
            expect(mockVastClient.offers).toEqual([{
                id: 1,
                num_gpus: 1,
                dph_total: 0.3,
            }]);
            const workerResult = await backendService.listWorkers();
            expect(workerResult.length).toEqual(0);
        });
    })
});
