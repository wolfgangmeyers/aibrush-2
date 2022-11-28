import moment from "moment";
import { BackendService } from "./backend";
import { WorkerConfig, WorkerGpuConfig, WorkerStatusEnum } from "./client";

// map of model name -> count
export interface PendingImages {
    model: string;
    score: number; // count * (now - created_at)
}

export interface Worker {
    id: string;
    num_gpus: number;
    last_ping: number;
    status: WorkerStatusEnum;
}

const MODELS = [
    "stable_diffusion_text2im",
    "stable_diffusion_inpainting",
    "swinir",
]

export function calculateWorkDistribution(
    pending: PendingImages[],
    workers: Worker[],
    configs: WorkerConfig[],
): WorkerConfig[] {
    const workerAssignments: WorkerConfig[] = [];
    const configsByWorker: { [workerId: string]: WorkerConfig } = {};
    for (const config of configs) {
        configsByWorker[config.worker_id] = config;
    }
    if (pending.length > 0 && workers.length > 0) {
        let workerGpuCount = 0;
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
        for (let worker of workers) {
            workerGpuCount += worker.num_gpus;
        }
        // sort pending descending by score
        pending = pending.sort((a, b) => b.score - a.score);
        let totalPending = 0;
        for (let pendingImage of pending) {
            totalPending += pendingImage.score;
        }
        const desiredState: {[key: string]: number} = {};
        const actualState: {[key: string]: number} = {};
        for (let model of MODELS) {
            desiredState[model] = 0;
            actualState[model] = 0;
        }
        // if there are at least 3 gpus, assign at least one to each model
        // TODO: maybe in the future, make it a percentage of total gpus instead of just one
        if (workerGpuCount >= MODELS.length) {
            for (let model of MODELS) {
                desiredState[model] = 1;
                workerGpuCount -= 1;
            }
        }
        for (let pendingScore of pending) {
            const desiredGpus = Math.round(
                (pendingScore.score / totalPending) * workerGpuCount
            );
            desiredState[pendingScore.model] += desiredGpus;
            workerGpuCount -= desiredGpus;
        }
        console.log("desired state", desiredState);
        
        for (let worker of workers) {
            const config = configsByWorker[worker.id];
            for (let gpuConfig of config.gpu_configs) {
                const model = gpuConfig.model;
                actualState[model] += 1;
            }
        }
        console.log("actual state", actualState);
        let updatedWorkerIds: {[key: string]: boolean} = {};
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
            console.log("model", model, "delta", delta);
            if (delta > 0) {
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
    }
    return workerAssignments;
}


export class WorkDistributor {
    constructor(private backendService: BackendService) {

    }


}