import moment from "moment";
import axios from "axios";

const NEW_RELIC_URL = "https://metric-api.newrelic.com/metric/v1";

interface Metric {
    name: string;
    value: any;
    type: "gauge" | "count";
    attributes: any;
    timestamp: number; // unix timestamp
    [key: string]: any;
}

export class MetricsClient {
    // collect metrics into a batch, and send them to New Relic every 10 seconds
    private metrics: Metric[] = [];
    private interval: NodeJS.Timeout;

    private get enabled() {
        return !!this.newRelicLicenseKey;
    }

    constructor(private newRelicLicenseKey: string) {
        if (this.enabled) {
            this.interval = setInterval(() => this.sendMetrics(), 10000);
        }
    }

    private async sendMetrics() {
        if (this.enabled) {
            if (this.metrics.length > 0) {
                const metricTypes: { [key: string]: number } = {};
                for (let metric of this.metrics) {
                    metricTypes[metric.name] = (metricTypes[metric.type] || 0) + 1;
                }
                const data = [
                    {
                        metrics: this.metrics,
                    },
                ];
                this.metrics = [];
    
                await axios.post(NEW_RELIC_URL, data, {
                    headers: {
                        "Content-Type": "application/json",
                        "Api-Key": this.newRelicLicenseKey,
                    },
                });
                // console.log("Exported metrics: ", metricTypes);
            }
            
            
        }
    }

    public addMetric(name: string, value: any, type: "gauge" | "count", attributes: any) {
        if (this.enabled) {
            this.metrics.push({
                name,
                value,
                type,
                attributes: attributes,
                "interval.ms": 10000,
                timestamp: moment().unix(),
            });
        } else {
            // console.log("Metric: ", name, value, attributes);
        }
    }

    public async stop() {
        if (this.enabled) {
            clearInterval(this.interval);
            await this.sendMetrics();
        }
    }
}
