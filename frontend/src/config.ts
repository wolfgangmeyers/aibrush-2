export interface Config {
    apiUrl: string;
}

export function getConfig(): Config {
    if (process.env.ENV == "prod") {
        return {
            apiUrl: "https://aibrush.ngrok.io"
        };
    } else {
        return {
            apiUrl: "http://localhost:3000"
        };
    }
}
