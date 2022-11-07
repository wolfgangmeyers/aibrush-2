import fs from "fs";
import process from "process";

import { BackendService } from "./src/backend"
import { loadConfig } from "./src/config";
import { MetricsClient } from "./src/metrics";
import { Server } from "./src/server"
import { ScalingService, getScalingEngines } from "./src/scaling_service";

const config = loadConfig();

const metricsClient = new MetricsClient(config.newRelicLicenseKey)

const backendService = new BackendService(config, metricsClient)
const port =  parseInt(process.env.PORT || "3000")
const scalingEngines = getScalingEngines(backendService, "wolfgangmeyers/aibrush:latest", metricsClient);
const scalingService = new ScalingService(backendService, scalingEngines);
const server = new Server(config, backendService, port, metricsClient, scalingService);
server.init().then(() => {
    console.log("Server initialized")
    server.start().then(() => {
        console.log(`Server started on port ${port}`)
    })
})
