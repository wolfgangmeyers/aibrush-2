import { Server as HTTPServer } from "http"
import express, { Express } from "express"
import cors from "cors"
import fs from "fs"
import path from "path"
import { createHttpTerminator, HttpTerminator } from "http-terminator"

import { BackendService } from "./backend";
import { Config } from "./config"
import { AuthHelper, authMiddleware } from "./auth"
import { ImageStatusEnum } from "./client"

export class Server {
    private server: HTTPServer;
    private app: Express;
    private terminator: HttpTerminator;
    private authHelper: AuthHelper;

    constructor(private config: Config, private backendService: BackendService, private port: string | number) {
        this.app = express()
        this.authHelper = new AuthHelper(config)
    }

    private isServiceAccount(userId: string): boolean {
        return this.config.serviceAccounts.indexOf(userId) != -1
    }

    async init() {
        await this.backendService.init();
        this.app.use(express.json({
            limit: "2mb",
        }))
        this.app.use(express.raw({
            type: "video/mp4",
            limit: "1024mb",
        }))
        this.app.use(cors())

        const spec = fs.readFileSync("./openapi.yaml")

        this.app.get("/openapi.yaml", (req, res) => {
            res.status(200).send(spec)
        })


        this.app.post("/api/auth/login", async (req, res) => {
            try {
                const token = await this.backendService.login(req.body.email)
                res.sendStatus(204)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.post("/api/auth/verify", async (req, res) => {
            try {
                const result = await this.backendService.verify(req.body.code)
                // if result is null, send 400
                if (!result) {
                    res.sendStatus(400)
                } else {
                    res.send(result)
                }
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.post("/api/auth/refresh", async (req, res) => {
            try {
                const result = await this.backendService.refresh(req.body.refreshToken)
                // if result is null, send 400
                if (!result) {
                    res.sendStatus(400)
                } else {
                    res.send(result)
                }
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        // allow anonymous access to image data. This is needed in order to
        // use these urls in image elements.

        // get image data by id
        this.app.get("/api/images/:id/image.jpg", async (req, res) => {
            try {
                // get image first and check created_by
                let image = await this.backendService.getImage(req.params.id)
                if (!image) {
                    res.status(404).send("not found")
                    return;
                }
                const imageData = await this.backendService.getImageData(req.params.id)
                res.setHeader("Content-Type", "image/jpeg")
                res.send(imageData)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        // get thumbnail data by id
        this.app.get("/api/images/:id/thumbnail.jpg", async (req, res) => {
            try {
                // get image first and check created_by
                let image = await this.backendService.getImage(req.params.id)
                if (!image) {
                    res.status(404).send("not found")
                    return;
                }
                const imageData = await this.backendService.getThumbnailData(req.params.id)
                res.setHeader("Content-Type", "image/jpeg")
                res.send(imageData)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.get("/api/images/:id/video.mp4", async (req, res) => {
            try {
                // get image first and check created_by
                let image = await this.backendService.getImage(req.params.id)
                if (!image) {
                    res.status(404).send("not found")
                    return;
                }
                const videoData = await this.backendService.getVideoData(req.params.id)
                // if videoData is null, return 404
                if (!videoData) {
                    res.status(404).send("not found")
                    return;
                }
                res.setHeader("Content-Type", "video/mp4")
                // content disposition attachment
                res.setHeader("Content-Disposition", `attachment; filename="${image.label.replace(" ", "_")}.mp4"`)
                res.send(videoData)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.get("/api/healthcheck", async (req, res) => {
            res.status(200).json({
                status: "ok"
            })
        })

        // anonymous access of static files
        this.app.use(express.static("./public"))

        // render index.html for frontend routes
        // /create-image, /images, /designer
        for (let route of ["/create-image", "/images", "/designer"]) {
            this.app.get(route, (req, res) => {
                res.sendFile(path.join(__dirname, "../public/index.html"))
            })
        }

        // authenticated routes only past this point
        this.app.use(authMiddleware(this.config))

        // list images
        this.app.get("/api/images", async (req, res) => {
            try {
                const user = this.authHelper.getUserFromRequest(req)
                // service accounts can't list images
                if (this.isServiceAccount(user)) {
                    res.json({
                        images: []
                    })
                    return
                }
                let cursor: number | undefined;
                try {
                    cursor = parseInt(req.query.cursor as string)
                } catch (err) { }
                // direction
                let direction: "asc" | "desc" | undefined = req.query.direction as any;
                let limit: number | undefined;
                try {
                    limit = parseInt(req.query.limit as string)
                } catch (err) { }

                let query = {
                    userId: user,
                    status: req.query.status as ImageStatusEnum,
                    cursor,
                    direction,
                    limit
                }

                const images = await this.backendService.listImages(query)
                res.json(images)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        // create image
        this.app.post("/api/images", async (req, res) => {
            try {
                const user = this.authHelper.getUserFromRequest(req)
                if (this.isServiceAccount(user)) {
                    res.sendStatus(403)
                    return
                }
                const image = await this.backendService.createImage(user, req.body)
                res.json(image)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        // get image by id
        this.app.get("/api/images/:id", async (req, res) => {
            try {
                const image = await this.backendService.getImage(req.params.id)
                // check created_by
                const user = this.authHelper.getUserFromRequest(req)
                if (!image || (!this.isServiceAccount(user) && image.created_by != user)) {
                    res.status(404).send("not found")
                    return
                }
                res.json(image)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        // update image by id
        this.app.patch("/api/images/:id", async (req, res) => {
            try {
                const user = this.authHelper.getUserFromRequest(req);
                // get image first and check created_by
                let image = await this.backendService.getImage(req.params.id)
                if (!image || (!this.isServiceAccount(user) && image.created_by !== user)) {
                    res.status(404).send("not found")
                    return;
                }
                image = await this.backendService.updateImage(req.params.id, req.body)
                res.json(image)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        // delete image
        this.app.delete("/api/images/:id", async (req, res) => {
            try {
                // get image first and check created_by
                let image = await this.backendService.getImage(req.params.id)
                if (!image || image.created_by !== this.authHelper.getUserFromRequest(req)) {
                    res.status(404).send("not found")
                    return;
                }
                await this.backendService.deleteImage(req.params.id)
                res.sendStatus(204)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.put("/api/images/:id/video.mp4", async (req, res) => {
            try {
                // get image first and check created_by
                let image = await this.backendService.getImage(req.params.id)
                if (!image) {
                    res.status(404).send("not found")
                    return;
                }
                const user = this.authHelper.getUserFromRequest(req)
                // only service account can update video data
                if (!this.isServiceAccount(user)) {
                    res.sendStatus(404)
                    return;
                }
                await this.backendService.updateVideoData(req.params.id, req.body)
                res.sendStatus(204)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.put("/api/process-image", async (req, res) => {
            try {
                const user = this.authHelper.getUserFromRequest(req)

                // only service accounts can process images
                if (!this.isServiceAccount(user)) {
                    res.sendStatus(403)
                    return
                }
                const image = await this.backendService.processImage(req.body.zoom_supported)
                res.json(image)
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