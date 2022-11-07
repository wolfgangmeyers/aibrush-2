import moment from "moment";
import { BackendService, SCALING_KEY } from "./backend";
import { RealClock } from "./clock";
import { MetricsClient } from "./metrics";
import { ScalingEngine } from "./scaling_engine";
import { VastAIApi } from "./vast_client";
import { VastEngine } from "./vast_engine";

export const SCALING_SERVICE_EVENT = "scaling_service_event";
const SCALING_SERVICE_COOLDOWN = 60 * 1000;

export function getScalingEngines(
    backendService: BackendService,
    workerImage: string,
    metricsClient: MetricsClient
): ScalingEngine[] {
    const result: ScalingEngine[] = [];
    if (process.env.VAST_API_KEY) {
        result.push(
            new VastEngine(
                new VastAIApi(process.env.VAST_API_KEY),
                backendService,
                workerImage,
                new RealClock(),
                metricsClient
            )
        );
    }
    return result;
}

export class ScalingService {

    private runningHandle: NodeJS.Timer;

    /**
     * @param engines These will be filled to capacity in order
     */
    constructor(
        private backend: BackendService,
        private engines: ScalingEngine[]
    ) {}

    start() {
        if (this.runningHandle) {
            clearInterval(this.runningHandle);
        }
        this.runningHandle = setInterval(() => {
            this.scale();
        }, 1000 * 60);
    }

    stop() {
        if (this.runningHandle) {
            clearInterval(this.runningHandle);
        }
    }

    async scale() {
        await this.backend.withLock(SCALING_KEY, async () => {
            const lastScalingEvent = await this.backend.getLastEventTime(
                SCALING_SERVICE_EVENT
            );
            if (
                moment().valueOf() - lastScalingEvent <
                SCALING_SERVICE_COOLDOWN
            ) {
                return;
            }
            await this.backend.setLastEventTime(
                SCALING_SERVICE_EVENT,
                moment().valueOf()
            );
            const activeOrders = await this.backend.listOrders(true);
            let unallocated = 0;
            for (let order of activeOrders) {
                unallocated += order.gpu_count;
            }
            
            for (const engine of this.engines) {
                if (unallocated <= 0) {
                    await engine.scale(0);
                    continue;
                }
                const capacity = await engine.capacity();
                // An attempt not to gobble up every single machine
                // in a given engine with limited capacity
                const maxAllocation = Math.ceil(
                    capacity * engine.maxAllocationPercentage
                );
                const allocated = Math.min(unallocated, maxAllocation);
                unallocated -= allocated;
                await engine.scale(allocated);
            }
        });
    }
}
