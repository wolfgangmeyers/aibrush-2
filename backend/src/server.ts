import { Server as HTTPServer } from "http"
import express, { Express } from "express"
import cors from "cors"
import fs from "fs"
import path from "path"
import { createHttpTerminator, HttpTerminator } from "http-terminator"
import moment from "moment";

import { sleep } from "./sleep";
import { BackendService } from "./backend";
import { Config } from "./config"
import { AuthHelper, AuthJWTPayload, authMiddleware, ServiceAccountConfig, hash } from "./auth"
import { ImageStatusEnum } from "./client"
import { MetricsClient } from "./metrics"

export class Server {
    private server: HTTPServer;
    private app: Express;
    private terminator: HttpTerminator;
    private authHelper: AuthHelper;
    cleanupHandle: NodeJS.Timer
    private hashedServiceAccounts: { [key: string]: boolean } = {}
    private metricsClient: MetricsClient;

    constructor(private config: Config, private backendService: BackendService, private port: string | number) {
        this.app = express()
        this.authHelper = new AuthHelper(config)
        for (let serviceAccount of this.config.serviceAccounts || []) {
            this.hashedServiceAccounts[hash(serviceAccount)] = true
        }

        this.metricsClient = new MetricsClient(this.config.newRelicLicenseKey)
    }

    private serviceAccountType(jwt: AuthJWTPayload): "public" | "private" | undefined {
        if (this.hashedServiceAccounts[jwt.userId]) {
            return "public"
        }
        if (jwt.serviceAccountConfig) {
            return jwt.serviceAccountConfig.type
        }
        return undefined;
    }

    private isPublicServiceAccount(jwt: AuthJWTPayload): boolean {
        return this.serviceAccountType(jwt) === "public"
    }

    async init() {
        await this.backendService.init();
        this.app.use(express.json({
            limit: "10mb",
        }))
        this.app.use(express.raw({
            type: "video/mp4",
            limit: "1024mb",
        }))
        this.app.use(cors())

        const spec = fs.readFileSync("./openapi.yaml")

        // refactor
        this.app.use((req, res, next) => {
            const start = moment()
            let err: any;
            res.on("finish", () => {
                const end = moment()
                const duration = end.diff(start, "milliseconds")
                this.metricsClient.addMetric("api.request", 1, "count", {
                    path: req.path,
                    method: req.method,
                    status: res.statusCode,
                    duration,
                    error: err ? err.message : undefined,
                })
            })
            next()
        })

        this.app.get("/openapi.yaml", (req, res) => {
            res.status(200).send(spec)
        })


        this.app.post("/api/auth/login", async (req, res) => {
            try {
                const token = await this.backendService.login(req.body.email, true, req.body.invite_code)
                res.sendStatus(204)
            } catch (err) {
                // if "User not allowed" then return 403
                if (err.message === "User not allowed") {
                    console.log("User not allowed: " + req.body.email)
                    res.sendStatus(403)
                    return
                }
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
        this.app.get("/api/images/:id.image.jpg", async (req, res) => {
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
        this.app.get("/api/images/:id.thumbnail.jpg", async (req, res) => {
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

        this.app.get("/api/images/:id.npy", async (req, res) => {
            try {
                // get image first and check created_by
                let image = await this.backendService.getImage(req.params.id)
                if (!image) {
                    res.status(404).send("not found")
                    return;
                }
                const npyData = await this.backendService.getNpyData(req.params.id)
                if (!npyData) {
                    res.status(404).send("not found")
                    return;
                }
                res.setHeader("Content-Type", "application/octet-stream")
                res.send(npyData)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.get("/api/images/:id.mask.jpg", async (req, res) => {
            try {
                // get image first and check created_by
                let image = await this.backendService.getImage(req.params.id)
                if (!image) {
                    res.status(404).send("not found")
                    return;
                }
                const maskData = await this.backendService.getMaskData(req.params.id)
                if (!maskData) {
                    res.status(404).send("not found")
                    return;
                }
                res.setHeader("Content-Type", "image/jpeg")
                res.send(maskData)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.get("/api/images/:id.mp4", async (req, res) => {
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

        this.app.get("/api/assets-url", async (req, res) => {
            const assetsUrl = this.config.assetsBaseUrl;
            res.send({
                assets_url: assetsUrl
            });
        })

        this.app.get("/api/healthcheck", async (req, res) => {
            res.status(200).json({
                status: "ok"
            })
        })

        // anonymous access of static files
        this.app.use(express.static("./public"))

        function getIndexHtmlPath(): string {
            if (__dirname.indexOf("dist") == -1) {
                return path.join(__dirname, "../public/index.html")
            }
            return path.join(__dirname, "../../public/index.html")
        }

        // render index.html for frontend routes
        for (let route of ["/worker-config", "/admin", "/images/:id", "/image-editor/:id", "/deleted-images"]) {
            this.app.get(route, (req, res) => {
                res.sendFile(getIndexHtmlPath())
            })
            this.app.get(route + "/", (req, res) => {
                res.sendFile(getIndexHtmlPath())
            })
        }

        this.app.get("/api/features", async (req, res) => {
            try {
                const features = await this.backendService.getFeatures()
                res.json(features)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        // authenticated routes only past this point
        this.app.use(authMiddleware(this.config))

        // list images
        this.app.get("/api/images", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                // service accounts can't list images
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
                let filter: string | undefined = req.query.filter as any;

                let query = {
                    userId: jwt.userId,
                    status: req.query.status as ImageStatusEnum,
                    cursor,
                    direction,
                    limit,
                    filter
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
                const jwt = this.authHelper.getJWTFromRequest(req)
                const images = await this.backendService.createImages(jwt.userId, req.body)
                res.json({
                    images
                })
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        // get image by id
        this.app.get("/api/images/:id", async (req, res) => {
            try {
                // check created_by
                const jwt = this.authHelper.getJWTFromRequest(req)
                const image = await this.backendService.getImage(req.params.id)
                if (!image) {
                    console.log(`user ${jwt.userId} tried to get image ${req.params.id} which does not exist`)
                    res.status(404).send("not found")
                    return;
                }

                if (!this.isPublicServiceAccount(jwt) && image.created_by != jwt.userId) {
                    console.log(`user ${jwt.userId} tried to get image ${req.params.id} but not authorized`)
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
                const jwt = this.authHelper.getJWTFromRequest(req)
                // get image first and check created_by
                let image = await this.backendService.getImage(req.params.id)
                if (!image) {
                    console.log(`user ${jwt.userId} tried to update image ${req.params.id} which does not exist`)
                    res.status(404).send("not found")
                    return;
                }
                if (!this.isPublicServiceAccount(jwt) && image.created_by !== jwt.userId) {
                    console.log(`user ${jwt.userId} tried to update image ${req.params.id} but not authorized`)
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
                const jwt = this.authHelper.getJWTFromRequest(req)
                let image = await this.backendService.getImage(req.params.id)
                if (!image) {
                    console.log(`user ${jwt.userId} tried to delete image ${req.params.id} which does not exist`)
                    res.status(404).send("not found")
                    return;
                }
                if (image.created_by !== jwt.userId) {
                    console.log(`user ${jwt.userId} tried to delete image ${req.params.id} but not authorized`)
                    res.status(404).send("not found")
                    return;
                }
                if (image.deleted_at) {
                    await this.backendService.hardDeleteImage(req.params.id)
                } else {
                    await this.backendService.deleteImage(req.params.id)
                }
                
                res.sendStatus(204)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.put("/api/images/:id.mp4", async (req, res) => {
            try {
                // get image first and check created_by
                let image = await this.backendService.getImage(req.params.id)
                if (!image) {
                    res.status(404).send("not found")
                    return;
                }
                const jwt = this.authHelper.getJWTFromRequest(req)
                // only service account can update video data
                if (!this.serviceAccountType(jwt)) {
                    console.log(`${jwt.userId} attempted to update video data but is not a service acct`)
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
                const jwt = this.authHelper.getJWTFromRequest(req)

                // only service accounts can process images
                if (!this.serviceAccountType(jwt)) {
                    console.log(`${jwt.userId} attempted to process image but is not a service acct`)
                    res.sendStatus(403)
                    return
                }
                let user: string = undefined;
                if (jwt.serviceAccountConfig?.type == "private") {
                    user = jwt.userId;
                }
                const image = await this.backendService.processImage(req.body.zoom_supported, user)
                res.json(image)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.post("/api/auth/service-accounts", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                // service accounts can't create new service accounts
                if (this.serviceAccountType(jwt)) {
                    res.sendStatus(403)
                    return
                }
                const serviceAccountConfig = req.body as ServiceAccountConfig
                // only admins can create public service accounts
                if (!await this.backendService.isUserAdmin(jwt.userId)) {
                    serviceAccountConfig.type = "private"
                }
                const result = await this.backendService.createServiceAccountCreds(jwt.userId, serviceAccountConfig)
                res.json(result)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.post("/api/invite-codes", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                // service accounts can't create invite codes
                if (this.serviceAccountType(jwt)) {
                    res.sendStatus(403)
                    return
                }
                if (!await this.backendService.isUserAdmin(jwt.userId)) {
                    console.log(`user ${jwt.userId} tried to create invite code but is not an admin`)
                    res.sendStatus(404)
                    return
                }
                const inviteCode = await this.backendService.createInviteCode()
                res.status(201).json(inviteCode)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.get("/api/is-admin", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                const isAdmin = await this.backendService.isUserAdmin(jwt.userId)
                res.json({ is_admin: isAdmin })
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

            if (this.config.disableCleanupJob) {
                return;
            }
            const cleanup = async () => {
                console.log("cleanup process running")
                await this.backendService.cleanup()
                console.log("cleanup complete")
            }
            sleep(Math.random() * 1000).then(() => {
                this.cleanupHandle = setInterval(() => {
                    cleanup()
                }, 1000 * 60)
                cleanup()
            })
            
        })
    }

    async stop() {
        await this.backendService.destroy()
        if (this.terminator) {
            await this.terminator.terminate()
        }
        if (this.cleanupHandle) {
            clearInterval(this.cleanupHandle)
            this.cleanupHandle = undefined
        }
    }
}