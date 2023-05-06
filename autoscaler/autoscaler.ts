import MetricsHelper from "./MetricsHelper";
import HerokuHelper from "./HerokuHelper";
import moment from "moment";

interface AutoscalerConfiguration {
    minCpu: number;
    maxCpu: number;
    minMem: number;
    maxMem: number;
}

class Autoscaler {
    private metricsHelper: MetricsHelper;
    private herokuHelper: HerokuHelper;
    private config: AutoscalerConfiguration;
    private lastScalingEvent: moment.Moment | null;

    constructor(
        metricsHelper: MetricsHelper,
        herokuHelper: HerokuHelper,
        config: AutoscalerConfiguration
    ) {
        this.metricsHelper = metricsHelper;
        this.herokuHelper = herokuHelper;
        this.config = config;
        this.lastScalingEvent = null;
    }

    private shouldScaleUp(cpu: number, mem: number): boolean {
        return cpu > this.config.maxCpu || mem > this.config.maxMem;
    }

    private shouldScaleDown(cpu: number, mem: number): boolean {
        return (
            cpu < this.config.minCpu &&
            mem < this.config.minMem &&
            this.lastScalingEvent &&
            moment().diff(this.lastScalingEvent, "minutes") >= 5
        );
    }

    public async performAutoscaling(): Promise<void> {
        const cpu = await this.metricsHelper.getCPUMetrics();
        const mem = await this.metricsHelper.getMemoryMetrics();

        if (this.shouldScaleUp(cpu, mem)) {
            const currentDynoCount = await this.herokuHelper.getDynoCount();
            await this.herokuHelper.setDynoCount(currentDynoCount + 1);
            console.log(`Scaled up: CPU=${cpu}, Memory=${mem}`);
            this.lastScalingEvent = moment();
        } else if (this.shouldScaleDown(cpu, mem)) {
            const currentDynoCount = await this.herokuHelper.getDynoCount();
            if (currentDynoCount > 1) {
                await this.herokuHelper.setDynoCount(currentDynoCount - 1);
                console.log(`Scaled down: CPU=${cpu}, Memory=${mem}`);
            }
            this.lastScalingEvent = moment();
        } else {
            console.log(`No scaling action: CPU=${cpu}, Memory=${mem}`);
        }
    }
}

export default Autoscaler;
