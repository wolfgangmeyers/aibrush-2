import fs from "fs";
import process from "process";

import { BackendService } from "./src/backend"
import { loadConfig } from "./src/config";
import { Server } from "./src/server"

const config = loadConfig();

const backendService = new BackendService(config)
const port =  parseInt(process.env.PORT || "3000")
const server = new Server(config, backendService, port)

server.init().then(() => {
    console.log("Server initialized")
    server.start().then(() => {
        console.log(`Server started on port ${port}`)
    })
})
