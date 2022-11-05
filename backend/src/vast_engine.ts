import moment from "moment";
import { VastAIApi } from "./vast";

export const SCALEDOWN_COOLDOWN = moment.duration(10, "minutes");
export const MAX_COST_PER_GPU = 0.5;

export interface ScalingOperation {
    targetId: string;
    operationType: "create" | "destroy";
}

export interface Offer {
    id: number;
    num_gpus: number;
    dph_total: number;
}

export interface Worker {
    id: string;
    num_gpus: number;
    created_at: number;
}

export function calculateScalingOperations(
    workers: Array<Worker>,
    offers: Array<Offer>,
    targetGpus: number,
    lastScalingOperation: moment.Moment
): Array<ScalingOperation> {
    // add up the number of gpus in the workers (some may be null if not deployed)
    let numGpus = 0;
    const operations: Array<ScalingOperation> = [];
    for (const worker of workers) {
        if (worker.num_gpus) {
            numGpus += worker.num_gpus;
        }
    }
    // if we are at the target, no scaling operations
    if (numGpus === targetGpus) {
        return [];
    }

    if (numGpus > targetGpus) {
        if (
            moment().diff(lastScalingOperation, "milliseconds") >
            SCALEDOWN_COOLDOWN.asMilliseconds()
        ) {
            scaleDown(workers, numGpus, targetGpus, operations);
        }
    } else {
        scaleUp(offers, numGpus, targetGpus, operations);
    }
    return operations;
}

export class VastEngine {
    private client: VastAIApi;

    constructor(private apiKey: string) {
        this.client = new VastAIApi(apiKey);
    }
}

function scaleDown(
    workers: Worker[],
    numGpus: number,
    targetGpus: number,
    operations: ScalingOperation[]
) {
    // if we are above the target, scale down but not below the target.
    const workersByGPUCount = {};
    for (const worker of workers) {
        if (worker.num_gpus) {
            if (!workersByGPUCount[worker.num_gpus]) {
                workersByGPUCount[worker.num_gpus] = [];
            }
            workersByGPUCount[worker.num_gpus].push(worker);
        }
    }
    // sort by gpu count in descending order
    const gpuCounts = Object.keys(workersByGPUCount)
        .map((x) => parseInt(x))
        .sort((a, b) => b - a);
    let completed = false;
    while (!completed) {
        let destroyed = false;
        for (const gpuCount of gpuCounts) {
            const workers = workersByGPUCount[gpuCount];
            if (workers.length > 0 && numGpus - gpuCount >= targetGpus) {
                const worker = workers.pop();
                operations.push({
                    targetId: worker.id,
                    operationType: "destroy",
                });
                numGpus -= gpuCount;
                destroyed = true;
                if (numGpus === targetGpus) {
                    completed = true;
                }
                break;
            }
        }
        // if we didn't destroy anything, we are done
        if (!destroyed) {
            completed = true;
        }
    }
    return numGpus;
}

function scaleUp(
    offers: Offer[],
    numGpus: number,
    targetGpus: number,
    operations: ScalingOperation[]
) {
    //  scale up at least to the target, maybe over
    offers = offers.filter(
        (offer) => offer.dph_total / offer.num_gpus <= MAX_COST_PER_GPU
    );
    if (offers.length === 0) {
        // TODO: emit a metric for this?
        console.log("No offers available to scale up");
    } else {
        const offersByGPUCount: { [key: number]: Offer[] } = {};
        for (const offer of offers) {
            if (!offersByGPUCount[offer.num_gpus]) {
                offersByGPUCount[offer.num_gpus] = [];
            }
            offersByGPUCount[offer.num_gpus].push(offer);
            // sort by dph_total / num_gpus in descending order (pop)
            offersByGPUCount[offer.num_gpus].sort(
                (a, b) => b.dph_total / b.num_gpus - a.dph_total / a.num_gpus
            );
        }
        // sort by gpu count in ascending order
        const gpuCounts = Object.keys(offersByGPUCount)
            .map((x) => parseInt(x))
            .sort((a, b) => a - b);
        let completed = false;
        while (!completed) {
            let gpuSize = 0;
            for (const gpuCount of gpuCounts) {
                const offers = offersByGPUCount[gpuCount];
                if (offers.length > 0 && numGpus < targetGpus) {
                    gpuSize = gpuCount;
                    if (numGpus + gpuCount >= targetGpus) {
                        gpuSize = targetGpus - numGpus;
                        numGpus += gpuSize;
                        completed = true;
                        operations.push({
                            targetId: offers.pop().id.toString(),
                            operationType: "create",
                        });
                        break;
                    }
                }
            }
            if (!completed) {
                if (gpuSize == 0) {
                    completed = true;
                    console.log("offers exhausted");
                } else {
                    const largestOffer = offersByGPUCount[gpuSize].pop();
                    numGpus += gpuSize;
                    operations.push({
                        targetId: largestOffer.id.toString(),
                        operationType: "create",
                    });
                }
            }
        }
    }
}
