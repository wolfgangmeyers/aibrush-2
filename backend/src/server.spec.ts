import * as uuid from 'uuid'
import moment from 'moment'
import axios, { AxiosResponse } from "axios"
import fs from "fs"

import { Server } from "./server"
import { BackendService } from "./backend"
import { AIBrushApi, ImageList, Image, CreateImageInput, UpdateImageInput } from "./client/api"

import nodemailer from "nodemailer";

describe("server", () => {
    let server: Server
    let client: AIBrushApi

    beforeAll(async () => {
        const backendService = new BackendService({
            secret: "test",
            smtpHost: "localhost",
            smtpPort: 1025,
            smtpFrom: "noreply@test.aibrush.art",
            databaseName: "aibrush_test_2",
            dataFolderName: "test_data"
        })
        const databases = await backendService.listDatabases()
        for (const db of databases) {
            if (db.startsWith("aibrush_test_")) {
                await backendService.dropDatabase(db)
            }
        }
    })

    beforeEach(async () => {
        // remove all files in data folder
        try {
            const files = fs.readdirSync("./data_test")
            for (const file of files) {
                fs.unlinkSync("./data/" + file)
            }
        } catch {}


        // const sockfile = `/tmp/aibrush-backend-${uuid.v4()}.sock`

        const databaseName = `aibrush_test_${moment().valueOf()}`
        const backendService = new BackendService({
            secret: "test",
            smtpHost: "localhost",
            smtpFrom: "noreply@test.aibrush.art",
            smtpPort: 1025,
            databaseName: databaseName,
            dataFolderName: "test_data"
        })

        server = new Server(backendService, 35456)
        await server.init()
        await server.start()

        const httpClient = axios.create({
        })
        client = new AIBrushApi(undefined, "http://localhost:35456", httpClient)
    })

    afterEach(async () => {
        await server.stop()
    })

    describe("when user is unauthenticated", () => {
        describe("when listing images", () => {
            it("should return 401", async () => {
                let error: any;
                try {
                    await client.listImages()
                } catch (e) {
                    error = e
                }
                expect(error).toBeDefined();
                expect(error.response.status).toBe(401)
            })
        })
    })
})
