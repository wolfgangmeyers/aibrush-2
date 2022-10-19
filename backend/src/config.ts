import fs from "fs";
import dotenv from "dotenv";
import { bool } from "aws-sdk/clients/signer";
dotenv.config();

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
    adminUsers: string[];
    assetsBaseUrl: string;
    disableCleanupJob?: bool;
    newRelicLicenseKey?: string;
}

export const loadConfig = (): Config => {
    // Load config from environment variables
    const config: Config = {
        secret: process.env.SECRET,
        smtpHost: process.env.SMTP_HOST,
        smtpPort: parseInt(process.env.SMTP_PORT, 10),
        smtpUser: process.env.SMTP_USER,
        smtpPassword: process.env.SMTP_PASSWORD,
        smtpFrom: process.env.SMTP_FROM,
        databaseUrl: process.env.DATABASE_URL,
        databaseSsl: process.env.DATABASE_SSL === "true",
        dataFolderName: process.env.DATA_FOLDER_NAME,
        s3Bucket: process.env.S3_BUCKET,
        s3Region: process.env.S3_REGION,
        loginCodeExpirationSeconds: parseInt(process.env.LOGIN_CODE_EXPIRATION_SECONDS, 10),
        userAccessTokenExpirationSeconds: parseInt(process.env.USER_ACCESS_TOKEN_EXPIRATION_SECONDS, 10),
        serviceAccountAccessTokenExpirationSeconds: parseInt(process.env.SERVICE_ACCOUNT_ACCESS_TOKEN_EXPIRATION_SECONDS, 10),
        serviceAccounts: process.env.SERVICE_ACCOUNTS ? process.env.SERVICE_ACCOUNTS.split(",") : [],
        adminUsers: process.env.ADMIN_USERS ? process.env.ADMIN_USERS.split(",").map(u => u.toLowerCase().trim()) : [],
        assetsBaseUrl: process.env.ASSETS_BASE_URL || "/api/images",
        newRelicLicenseKey: process.env.NEW_RELIC_LICENSE_KEY,
    };
    return config;
}
