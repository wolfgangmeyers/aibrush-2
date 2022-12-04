import Bugsnag from "@bugsnag/js";
import moment from "moment";
import { BackendService, WORK_DISTRIBUTION_KEY } from "./backend";
import { WorkerConfig, WorkerGpuConfig, WorkerStatusEnum } from "./client";

export const WORK_DISTRIBUTION_EVENT = "work_distribution_event";
const DEFAULT_WORK_DISTRIBUTION_COOLDOWN = 60 * 1000;
const QUICK_WORK_DISTRIBUTION_COOLDOWN = 10 * 1000;

// map of model name -> count
export interface PendingImages {
    model: string;
    score: number; // count * (now - created_at)
}

export interface Worker {
    id: string;
    num_gpus?: number;
    last_ping?: number;
    status?: WorkerStatusEnum;
}

export const MODELS = [
    "stable_diffusion_text2im",
    "stable_diffusion_inpainting",
    "swinir",
];

const DEFAULT_MODEL_DISTRIBUTION = {
    stable_diffusion_text2im: 65,
    stable_diffusion_inpainting: 30,
    swinir: 5,
};

function calculateActualState(
    workers: Worker[],
    configsByWorker: { [workerId: string]: WorkerConfig }
): { [key: string]: number } {
    const actualState: { [key: string]: number } = {};
    for (let model of MODELS) {
        actualState[model] = 0;
    }
    for (let worker of workers) {
        const config = configsByWorker[worker.id];
        for (let gpuConfig of config.gpu_configs) {
            const model = gpuConfig.model;
            actualState[model] += 1;
        }
    }
    return actualState;
}

function calculateDesiredState(
    pending: PendingImages[],
    workers: Worker[],
    configsByWorker: { [workerId: string]: WorkerConfig }
): { [key: string]: number } {
    pending = pending.sort((a, b) => b.score - a.score);
    const actualState = calculateActualState(workers, configsByWorker);
    const desiredState: { [key: string]: number } = {};
    for (let model of MODELS) {
        desiredState[model] = 0;
    }
    let workerGpuCount = 0;
    for (let worker of workers) {
        workerGpuCount += (worker.num_gpus || 1);
    }

    if (pending.length > 0) {
        // console.log("pending", pending);
        // if there are at least 3 gpus, assign at least one to each model
        // TODO: maybe in the future, make it a percentage of total gpus instead of just one
        if (workerGpuCount >= MODELS.length) {
            for (let model of MODELS) {
                desiredState[model] = 1;
                workerGpuCount -= 1;
            }
        }

        let totalPending = 0;
        for (let pendingImage of pending) {
            totalPending += pendingImage.score;
        }
        for (let pendingScore of pending) {
            const desiredGpus = Math.min(
                Math.ceil((pendingScore.score / totalPending) * workerGpuCount),
                workerGpuCount
            );
            desiredState[pendingScore.model] += desiredGpus;
            workerGpuCount -= desiredGpus;
        }
    } else if (workerGpuCount >= MODELS.length) {
        // if there are at least 3 gpus, assign at least one to each model
        // TODO: maybe in the future, make it a percentage of total gpus instead of just one
        for (let model of MODELS) {
            desiredState[model] = 1;
            workerGpuCount -= 1;
        }
        for (let model of MODELS) {
            const desiredGpus = Math.min(
                Math.ceil(
                    (DEFAULT_MODEL_DISTRIBUTION[model] / 100) * workerGpuCount
                ),
                workerGpuCount
            );
            desiredState[model] += desiredGpus;
            workerGpuCount -= desiredGpus;
        }
    } else {
        // don't try to adjust the state if there are no pending images
        // and less than 3 workers. This prevents unnecessary thrashing.
        return actualState;
    }
    return desiredState;
}

export function calculateWorkDistribution(
    pending: PendingImages[],
    workers: Worker[],
    configs: WorkerConfig[]
): WorkerConfig[] {
    if (workers.length === 0) {
        return [];
    }
    const workerAssignments: WorkerConfig[] = [];
    const configsByWorker: { [workerId: string]: WorkerConfig } = {};
    for (const config of configs) {
        configsByWorker[config.worker_id] = config;
    }
    // sort workers by status (idle first)
    workers.sort((a, b) => {
        if (a.status === b.status) {
            // order by worker id if status is the same
            return a.id.localeCompare(b.id);
        }
        if (a.status === "idle") {
            return -1;
        }
        return 1;
    });
    const desiredState = calculateDesiredState(
        pending,
        workers,
        configsByWorker
    );
    const actualState = calculateActualState(workers, configsByWorker);

    // console.log("desired state", desiredState);
    // console.log("actual state", actualState);

    let updatedWorkerIds: { [key: string]: boolean } = {};
    // first unassign gpu models, then reassign
    for (let model of MODELS) {
        let delta = desiredState[model] - actualState[model];
        if (delta < 0) {
            for (let worker of workers) {
                const config = configsByWorker[worker.id];
                for (let gpuConfig of config.gpu_configs) {
                    if (gpuConfig.model === model) {
                        gpuConfig.model = "";
                        delta += 1;
                        updatedWorkerIds[worker.id] = true;
                        if (delta === 0) {
                            break;
                        }
                    }
                }
                if (delta === 0) {
                    break;
                }
            }
        }
    }
    // reassign gpu models
    for (let model of MODELS) {
        let delta = desiredState[model] - actualState[model];
        if (delta > 0) {
            // TODO: emit a metric for the switching of worker models
            for (let worker of workers) {
                const config = configsByWorker[worker.id];
                for (let gpuConfig of config.gpu_configs) {
                    if (gpuConfig.model === "") {
                        gpuConfig.model = model;
                        delta -= 1;
                        if (delta === 0) {
                            break;
                        }
                    }
                }
                if (delta === 0) {
                    break;
                }
            }
        }
    }
    for (let worker of workers) {
        if (updatedWorkerIds[worker.id]) {
            workerAssignments.push(configsByWorker[worker.id]);
        }
    }
    return workerAssignments;
}

export class WorkDistributor {
    private runningHandle: NodeJS.Timer;

    constructor(private backendService: BackendService) {}

    start() {
        if (this.runningHandle) {
            clearInterval(this.runningHandle);
        }
        this.runningHandle = setInterval(() => {
            this.distributeWork();
        }, 1000 * 10);
    }

    stop() {
        if (this.runningHandle) {
            clearInterval(this.runningHandle);
        }
    }

    async distributeWork() {
        try {
            await this.backendService.withLock(WORK_DISTRIBUTION_KEY, async () => {
                const lastEvent = await this.backendService.getLastEventTime(
                    WORK_DISTRIBUTION_EVENT
                );
                // filter out workers with old ping
                const workers = (await this.backendService.listWorkers());
                // calculate cooldown
                let totalGpus = 0;
                for (let worker of workers) {
                    totalGpus += (worker.num_gpus || 1);
                }
                const cooldown = totalGpus >= MODELS.length ? DEFAULT_WORK_DISTRIBUTION_COOLDOWN : QUICK_WORK_DISTRIBUTION_COOLDOWN;
                if (lastEvent && moment().diff(moment(lastEvent), "milliseconds") < cooldown) {
                    // console.log("Work distributor not running because cooldown has not expired");
                    return;
                }
                await this.backendService.setLastEventTime(WORK_DISTRIBUTION_EVENT, moment().valueOf());
                // console.log("Running work distributor");
                const pending = await this.backendService.getPendingImageScores();
                const configs = await Promise.all(
                    workers.map((worker) =>
                        this.backendService.getWorkerConfig(worker.id)
                    )
                );
                const workerAssignments = calculateWorkDistribution(
                    pending,
                    workers,
                    configs
                );
                // console.log("worker assignments", workerAssignments);
                for (let workerAssignment of workerAssignments) {
                    await this.backendService.upsertWorkerConfig(
                        workerAssignment.worker_id,
                        workerAssignment
                    );
                }
            });
            
        } catch (e) {
            Bugsnag.notify(e);
        }
    }
}
