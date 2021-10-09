import { Server as HTTPServer } from "http"
import express, { Express } from "express"
import cors from "cors"
import fs from "fs"
import { createHttpTerminator, HttpTerminator } from "http-terminator"

import { BackendService } from "./backend";
import { Config } from "./config"
import { authMiddleware } from "./auth"

export class Server {
    private server: HTTPServer;
    private app: Express;
    private terminator: HttpTerminator;

    constructor(private config: Config, private backendService: BackendService, private port: string | number) {
        this.app = express()
    }

    async init() {
        await this.backendService.init();
        this.app.use(express.json({
            limit: "2mb",
        }))
        this.app.use(cors())

        const spec = fs.readFileSync("./openapi.yaml")

        this.app.get("/openapi.yaml", (req, res) => {
            res.status(200).send(spec)
        })


        this.app.post("/auth/login", async (req, res) => {
            try {
                const token = await this.backendService.login(req.body.email)
                res.sendStatus(204)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        // authenticated routes only past this point
        this.app.use(authMiddleware(this.config))

        // list images
        this.app.get("/images", async (req, res) => {
            try {
                const images = await this.backendService.listImages()
                res.json(images)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        // get image by id
        this.app.get("/images/:id", async (req, res) => {
            try {
                const image = await this.backendService.getImage(req.params.id, req.query.download as ("thumbnail" | "image" | "latents"))
                res.json(image)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        // delete image
        this.app.delete("/images/:id", async (req, res) => {
            try {
                await this.backendService.deleteImage(req.params.id)
                res.sendStatus(204)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

    }

    start() {
        return new Promise<void>(resolve => {
            this.server = this.app.listen(this.port as number, "0.0.0.0", () => {

                resolve()
            })
            this.terminator = createHttpTerminator({ server: this.server, gracefulTerminationTimeout: 100 })
        })
    }

    async stop() {
        await this.backendService.destroy()
        if (this.terminator) {
            await this.terminator.terminate()
        }
    }
}