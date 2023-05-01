import process from "process";

import { BackendService } from "./src/backend";
import { loadConfig } from "./src/config";
import { MetricsClient } from "./src/metrics";
import { Server } from "./src/server";
import { LogsClient } from "./src/logs";

const config = loadConfig();

const metricsClient = new MetricsClient(config.newRelicLicenseKey);
const loggingClient = new LogsClient(config.newRelicLicenseKey);

const backendService = new BackendService(config, metricsClient, loggingClient);
const port = parseInt(process.env.PORT || "3000");

const server = new Server(
    config,
    backendService,
    port,
    metricsClient,
    loggingClient,
);
server.init().then(() => {
    console.log("Server initialized");
    server.start().then(() => {
        console.log(`Server started on port ${port}`);
    });
});
