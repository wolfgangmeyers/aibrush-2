import { GlobalSettings } from "../client/api";

export interface MinimumWorkerAllocations {
    [model: string]: number;
}

export interface WorkerSettingsJson {
    minimum_worker_allocations: MinimumWorkerAllocations;
}

export interface WorkerSettings extends GlobalSettings {
    settings_json: WorkerSettingsJson;
}