import moment from "moment";
import axios from "axios";

const NEW_RELIC_LICENSE_KEY = process.env.NEW_RELIC_LICENSE_KEY;
const NEW_RELIC_URL = "https://metric-api.newrelic.com/metric/v1";

interface Metric {
    name: string;
    value: any;
    attributes: any;
    timestamp: number; // unix timestamp
}

export class MetricsClient {
    // collect metrics into a batch, and send them to New Relic every 10 seconds
    private metrics: Metric[] = [];
    private interval: NodeJS.Timeout;
    private enabled = !!NEW_RELIC_LICENSE_KEY;

    constructor() {
        if (this.enabled) {
            this.interval = setInterval(() => this.sendMetrics(), 10000);
        }
    }

    public async sendMetrics() {
        if (!this.enabled) {
            const data = [
                {
                    metrics: this.metrics,
                },
            ];

            await axios.post(NEW_RELIC_URL, data, {
                headers: {
                    "Content-Type": "application/json",
                    "Api-Key": NEW_RELIC_LICENSE_KEY,
                },
            });

            this.metrics = [];
        }
    }

    public addMetric(name: string, value: any, attributes: any) {
        if (this.enabled) {
            this.metrics.push({
                name,
                value,
                attributes,
                timestamp: moment().unix(),
            });
        }
    }

    public async stop() {
        if (this.enabled) {
            clearInterval(this.interval);
            await this.sendMetrics();
        }
    }
}
