import { calculateScalingOperations, ScalingOperation, SCALEDOWN_COOLDOWN, Offer, Worker } from "./vast_engine";
import moment from "moment";
import * as uuid from "uuid";

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
            created_at: moment().unix(),
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
            created_at: moment().unix(),
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
            created_at: moment().unix(),
        }, {
            id: "worker-2",
            num_gpus: 1,
            created_at: moment().unix(),
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
            created_at: moment().unix(),
        }, {
            id: "worker-2",
            num_gpus: 1,
            created_at: moment().unix(),
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
            created_at: moment().unix(),
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
            created_at: moment().unix(),
        }, {
            id: "worker-2",
            num_gpus: 3,
            created_at: moment().unix(),
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
            created_at: moment().unix(),
        }, {
            id: "worker-2",
            num_gpus: 2,
            created_at: moment().unix(),
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
            created_at: moment().unix(),
        }, {
            id: "worker-2",
            num_gpus: 2,
            created_at: moment().unix(),
        }, {
            id: "worker-3",
            num_gpus: 2,
            created_at: moment().unix(),
        }, {
            id: "worker-4",
            num_gpus: 1,
            created_at: moment().unix(),
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
            created_at: moment().unix(),
        }, {
            id: "worker-2",
            num_gpus: 1,
            created_at: moment().unix(),
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
            created_at: moment().unix(),
        }, {
            id: "worker-2",
            num_gpus: 2,
            created_at: moment().unix(),
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
            created_at: moment().unix(),
        }],
        offers: [],
        targetGpus: 0,
        lastScalingOperation: moment().subtract(SCALEDOWN_COOLDOWN).add(1, "second"),
        expected: [],
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
            );
            expect(actual.sort((a, b) => a.targetId.localeCompare(b.targetId))).toEqual(testCase.expected.sort((a, b) => a.targetId.localeCompare(b.targetId)));
        });
    }
});