import express from "express"
import cors from "cors"
import * as OpenApiValidator from "express-openapi-validator"

import { BackendService } from "./src/backend"
import { Server } from "./src/server"

const databaseName = process.env.DATABASE_NAME || "aibrush_backend_2"
const backendService = new BackendService(databaseName, "data")
const server = new Server(backendService, 3000)

server.init().then(() => {
    console.log("Server initialized")
    server.start().then(() => {
        console.log("Server started on port 3000")
    })
})
