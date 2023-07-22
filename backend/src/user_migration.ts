import process from "process";

import * as AWS from "aws-sdk";
import { BackendService } from "./backend";
import { loadConfig } from "./config";
import { MetricsClient } from "./metrics";
import { LogsClient } from "./logs";
import { Migrator } from "./user_migrator";

const config = loadConfig();

const metricsClient = new MetricsClient(config.newRelicLicenseKey);
const loggingClient = new LogsClient(config.newRelicLicenseKey);
const s3 = new AWS.S3({
    region: "us-west-2",
});

const backendService = new BackendService(config, metricsClient, loggingClient);
const migrator = new Migrator(backendService, s3, config.s3Bucket);

const main = async () => {
    await backendService.init();
    // const user = await backendService.getUser(process.argv[2]);
    // await migrator.notifyUser(user);
    await migrator.notifyAllUsers();
    process.exit(0);
};

main();
