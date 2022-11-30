import Bugsnag from "@bugsnag/js";
import moment from "moment";
import { BackendService, SCALING_KEY } from "./backend";
import { RealClock } from "./clock";
import { EC2ClientImpl, Ec2Engine } from "./ec2_engine";
import { Logger } from "./logs";
import { MetricsClient } from "./metrics";
import { RunpodApi } from "./runpod_client";
import { RunpodEngine } from "./runpod_engine";
import { ScalingEngine } from "./scaling_engine";
import { VastAIApi } from "./vast_client";
import { VastEngine } from "./vast_engine";

export const SCALING_SERVICE_EVENT = "scaling_service_event";
const SCALING_SERVICE_COOLDOWN = 60 * 1000;

export function getScalingEngines(
    backendService: BackendService,
    metricsClient: MetricsClient,
    logger: Logger,
): ScalingEngine[] {
    const result: ScalingEngine[] = [];
    if (process.env.VAST_API_KEY) {
        for (let gpuType of ["RTX A5000", "RTX 3090", "RTX A6000"]) {
            result.push(
                new VastEngine(
                    new VastAIApi(process.env.VAST_API_KEY),
                    backendService,
                    new RealClock(),
                    metricsClient,
                    gpuType,
                )
            );
        }
    }
    if (process.env.RUNPOD_API_KEY) {
        for (let gpuType of ["NVIDIA RTX A5000", "NVIDIA GeForce RTX 3090", "NVIDIA RTX A6000"]) {
            result.push(
                new RunpodEngine(
                    new RunpodApi(process.env.RUNPOD_API_KEY),
                    backendService,
                    new RealClock(),
                    metricsClient,
                    logger,
                    gpuType as any,
                )
            )
        }
    }
    // // these are all A10G GPUs
    result.push(
        new Ec2Engine(
            new EC2ClientImpl(),
            backendService,
            new RealClock(),
            metricsClient,
            logger,
            "us-west-2"
        )
    )
    return result;
}

export class ScalingService {

    private runningHandle: NodeJS.Timer;

    /**
     * @param engines These will be filled to capacity in order
     */
    constructor(
        private backend: BackendService,
        private engines: ScalingEngine[],
        private logger: Logger,
    ) {}

    start() {
        if (this.runningHandle) {
            clearInterval(this.runningHandle);
        }
        this.runningHandle = setInterval(() => {
            this.scale();
        }, 1000 * 60 * 2);
    }

    stop() {
        if (this.runningHandle) {
            clearInterval(this.runningHandle);
        }
    }

    async scale() {
        try {
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
                this.logger.log("ScalingService.scale", {
                    activeOrders: activeOrders.length,
                    gpuCount: unallocated,
                });
                
                for (const engine of this.engines) {
                    const capacity = await engine.capacity();
                    if (unallocated <= 0) {
                        await engine.scale(0);
                        continue;
                    }
                    
                    // An attempt not to gobble up every single machine
                    // in a given engine with limited capacity
                    const maxAllocation = Math.ceil(
                        capacity * 1
                    );
                    let allocated = Math.min(unallocated, maxAllocation);
                    
                    allocated = await engine.scale(allocated);
                    unallocated -= allocated;
                }
            });
        } catch (e) {
            Bugsnag.notify(e, evt => {
                evt.context = "ScalingService.scale";
            })
        }
    }
}
