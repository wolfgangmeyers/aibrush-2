import fs from "fs";

export interface Config {
    secret: string;
    smtpHost: string;
    smtpPort: number;
    smtpUser?: string;
    smtpPassword?: string;
    smtpFrom: string;
    databaseUrl: string;
    databaseSsl: boolean;
    dataFolderName?: string;
    s3Bucket?: string;
    s3Region?: string;
    loginCodeExpirationSeconds: number;
    userAccessTokenExpirationSeconds: number;
    serviceAccountAccessTokenExpirationSeconds: number;
    serviceAccounts: string[];
    userWhitelist: string[];
}

export const loadConfig = (): Config => {
    return JSON.parse(fs.readFileSync(__dirname + "/../aibrush-config.json").toString());
}
