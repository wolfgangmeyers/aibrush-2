import fs from "fs";

import { BackendService } from "./src/backend"
import { loadConfig } from "./src/config";
import { Server } from "./src/server"

const config = loadConfig();

const backendService = new BackendService(config)
const server = new Server(config, backendService, 3000)

server.init().then(() => {
    console.log("Server initialized")
    server.start().then(() => {
        console.log("Server started on port 3000")
    })
})
