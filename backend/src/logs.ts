import moment from "moment";
import axios from "axios";

const NEW_RELIC_URL = "https://log-api.newrelic.com/log/v1";

interface LogMessage {
    timestamp: number;
    message: string;
    attributes?: any;
}

interface LogBatch {
    common?: {
        attributes: any;
    };
    logs: LogMessage[];
}

export interface Logger {
    log(message: string, attributes?: any): void;
}

export class ConsoleLogger {
    public log(message: string, attributes?: any) {
        console.log(message, attributes);
    }
}

export class LogsClient {
    private logs: LogMessage[] = [];
    private interval: NodeJS.Timeout;

    private get enabled() {
        return !!this.newRelicLicenseKey;
    }

    constructor(private newRelicLicenseKey: string) {
        if (this.enabled) {
            this.interval = setInterval(() => this.sendLogs(), 10000);
        }
    }

    private async sendLogs() {
        if (this.enabled) {
            if (this.logs.length > 0) {
                const data: LogBatch = {
                    common: {
                        attributes: {
                            service: "AiBrush",
                        },
                    },
                    logs: this.logs,
                };
                this.logs = [];
    
                await axios.post(NEW_RELIC_URL, [data], {
                    headers: {
                        "Content-Type": "application/json",
                        "Api-Key": this.newRelicLicenseKey,
                    },
                });
                // console.log("Exported logs: ", data);
            }
        }
    }

    public log(message: string, attributes?: any) {
        console.log(message, attributes);
        if (this.enabled) {
            this.logs.push({
                timestamp: moment().unix(),
                message,
                attributes,
            });
        } else {
            
        }
    }

    public async stop() {
        if (this.enabled) {
            clearInterval(this.interval);
            await this.sendLogs();
        }
    }
}
