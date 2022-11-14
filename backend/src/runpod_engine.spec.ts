import {
    calculateScalingOperations,
    ScalingOperation,
    SCALEDOWN_COOLDOWN,
    GPUType,
    Worker,
    WORKER_TIMEOUT,
    
} from "./runpod_engine";
import moment from "moment";
import {FakeClock, RealClock } from "./clock";

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