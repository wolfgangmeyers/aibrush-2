import moment from "moment";
import { Worker } from "./client";
import { Offer, VastAIApi } from "./vast";

export interface ScalingOperation {
    targetId: string;
    operationType: "create" | "destroy";
}

export function calculateScalingOperations(
    workers: Array<Worker>,
    offers: Array<Offer>,
    targetGpus: number,
): Array<ScalingOperation> {
    // add up the number of gpus in the workers (some may be null if not deployed)
    throw new Error("Not yet implemented");
}

export class VastEngine {

    private client: VastAIApi;

    constructor(private apiKey: string) {
        this.client = new VastAIApi(apiKey);
    }
}