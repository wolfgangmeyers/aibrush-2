export interface Config {
    secret: string;
    smtpHost: string;
    smtpPort: number;
    smtpUser?: string;
    smtpPassword?: string;
    smtpFrom: string;
    databaseName: string;
    dataFolderName: string;
    loginCodeExpirationSeconds: number;
}