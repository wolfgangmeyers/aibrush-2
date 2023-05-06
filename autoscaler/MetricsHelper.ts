import axios from "axios";

class MetricsHelper {
    private baseUrl: string;

    constructor(private apiKey: string, private accountId: string) {
        this.baseUrl = "https://api.newrelic.com/graphql";
    }

    private async query(queryString: string): Promise<number> {
        const query = `{
            actor {
              nrql(accounts: ${this.accountId}, query: "${queryString}") {
                results
              }
            }
          }`;

        try {
            const response = await axios.post(
                this.baseUrl,
                { query },
                {
                    headers: {
                        "API-key": this.apiKey,
                        "Content-Type": "application/json",
                    },
                }
            );
            const average =
                response.data.data.actor.nrql.results[0][
                    "average.extractfield(%,'max')"
                ];
            return average;
        } catch (error) {
            if (error.resposne) {
                console.log(error.response.data.errors);
            } else {
                console.log(error);
            }
            throw new Error("Failed to fetch metrics from New Relic");
        }
    }

    public async getCPUMetrics(): Promise<number> {
        const queryString =
            "SELECT average(%[max]) from Metric where metricName = 'server.cpu' since 1 minute ago";
        return await this.query(queryString);
    }

    public async getMemoryMetrics(): Promise<number> {
        const queryString =
            "SELECT average(%[max]) from Metric where metricName = 'server.mem' since 1 minute ago";
        return await this.query(queryString);
    }
}

export default MetricsHelper;
