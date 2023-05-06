import axios from "axios";

class HerokuHelper {
    private apiKey: string;
    private appName: string;
    private baseUrl: string;

    constructor(apiKey: string, appName: string) {
        this.apiKey = apiKey;
        this.appName = appName;
        this.baseUrl = "https://api.heroku.com";
    }

    public async getDynoCount(processType: string = "web"): Promise<number> {
        const response = await axios.get(
            `${this.baseUrl}/apps/${this.appName}/formation`,
            {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    Accept: "application/vnd.heroku+json; version=3",
                },
            }
        );

        const formation = response.data;
        const webFormation = formation.find(
            (item: any) => item.type === processType
        );
        return webFormation.quantity;
    }

    public async setDynoCount(
        count: number,
        processType: string = "web"
    ): Promise<void> {
        await axios.patch(
            `${this.baseUrl}/apps/${this.appName}/formation/${processType}`,
            {
                quantity: count,
            },
            {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    Accept: "application/vnd.heroku+json; version=3",
                },
            }
        );

        console.log(`Dynos scaled to ${count}`);
    }
}

export default HerokuHelper;
