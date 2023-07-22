export interface Config {
    apiUrl: string;
}

export function getConfig(): Config {
    // if (process.env.REACT_APP_ENV === "prod") {
    //     return {
    //         apiUrl: "https://aibrush.ngrok.io"
    //     };
    // } else if (process.env.REACT_APP_ENV === "alt") {
    //     return {
    //         apiUrl: ""
    //     };
    // } else {
    //     return {
    //         apiUrl: "http://localhost:3000"
    //     };
    // }
    return {
        apiUrl: ""
    };
}
