import { Server as HTTPServer } from "http"
import express, { Express } from "express"
import cors from "cors"
import fs from "fs"
import path from "path"
import { createHttpTerminator, HttpTerminator } from "http-terminator"

import { BackendService } from "./backend";
import { Config } from "./config"
import { AuthHelper, AuthJWTPayload, authMiddleware, ServiceAccountConfig, hash } from "./auth"
import { ImageStatusEnum } from "./client"

export class Server {
    private server: HTTPServer;
    private app: Express;
    private terminator: HttpTerminator;
    private authHelper: AuthHelper;
    cleanupHandle: NodeJS.Timer
    private hashedServiceAccounts: { [key: string]: boolean } = {}

    constructor(private config: Config, private backendService: BackendService, private port: string | number) {
        this.app = express()
        this.authHelper = new AuthHelper(config)
        for (let serviceAccount of this.config.serviceAccounts || []) {
            this.hashedServiceAccounts[hash(serviceAccount)] = true
        }
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
        // /create-image, /images, /designer
        for (let route of ["/create-image", "/images", "/designer", "/suggestions", "/worker-config"]) {
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

                let query = {
                    userId: jwt.userId,
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
                const jwt = this.authHelper.getJWTFromRequest(req)
                const image = await this.backendService.createImage(jwt.userId, req.body)
                res.json(image)
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
                await this.backendService.deleteImage(req.params.id)
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

        this.app.get("/api/suggestion-seeds", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                const seeds = await this.backendService.listSuggestionSeeds(jwt.userId)
                res.json(seeds)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.post("/api/suggestion-seeds", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                const seed = await this.backendService.createSuggestionSeed(jwt.userId, req.body)
                res.json(seed)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        // get suggestion seed by id
        this.app.get("/api/suggestion-seeds/:id", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                let user = jwt.userId
                if (this.serviceAccountType(jwt) == "public") {
                    user = undefined
                }
                const seed = await this.backendService.getSuggestionSeed(req.params.id, user)
                if (!seed) {
                    console.log(`user ${jwt.userId} get suggestion seed ${req.params.id} not found`)
                    res.status(404).send("not found")
                    return
                }
                res.json(seed)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        // update suggestion seed by id (patch)
        this.app.patch("/api/suggestion-seeds/:id", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                const updatedSeed = await this.backendService.updateSuggestionSeed(req.params.id, jwt.userId, req.body)
                if (!updatedSeed) {
                    console.log(`user ${jwt.userId} tried to update suggestion seed ${req.params.id} not found`)
                    res.status(404).send("not found")
                    return
                }
                res.json(updatedSeed)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        // delete suggestion seed
        this.app.delete("/api/suggestion-seeds/:id", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                const success = await this.backendService.deleteSuggestionSeed(req.params.id, jwt.userId)
                if (!success) {
                    console.log(`user ${jwt.userId} tried to delete suggestion seed ${req.params.id} not found`)
                    res.status(404).send("not found")
                    return
                }
                res.sendStatus(204)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        // list suggestions jobs
        this.app.get("/api/suggestions-jobs", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                const jobs = await this.backendService.listSuggestionsJobs(jwt.userId)
                res.json(jobs)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        // create suggestions job
        this.app.post("/api/suggestions-jobs", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                // get suggestion seed
                const seed = await this.backendService.getSuggestionSeed(req.body.seed_id, jwt.userId)
                if (!seed) {
                    console.log(`user ${jwt.userId} tried to create suggestions job for seed ${req.body.seed_id} not found`)
                    res.status(404).send("not found")
                    return
                }
                const job = await this.backendService.createSuggestionsJob(jwt.userId, req.body)
                res.json(job)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        // get suggestions job by id
        this.app.get("/api/suggestions-jobs/:id", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                let user = jwt.userId
                if (this.serviceAccountType(jwt) == "public") {
                    user = undefined
                }
                const job = await this.backendService.getSuggestionsJob(req.params.id, user)
                if (!job) {
                    console.log(`user ${jwt.userId} tried to get suggestions job ${req.params.id} not found`)
                    res.status(404).send("not found")
                    return
                }
                res.json(job)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        // update suggestions job by id (patch)
        this.app.patch("/api/suggestions-jobs/:id", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                let user = jwt.userId
                if (this.serviceAccountType(jwt) == "public") {
                    user = undefined
                }
                const updatedJob = await this.backendService.updateSuggestionsJob(req.params.id, user, req.body)
                if (!updatedJob) {
                    console.log(`user ${jwt.userId} tried to update suggestions job ${req.params.id} not found`)
                    res.status(404).send("not found")
                    return
                }
                res.json(updatedJob)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        // delete suggestions job
        this.app.delete("/api/suggestions-jobs/:id", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                const success = await this.backendService.deleteSuggestionsJob(req.params.id, jwt.userId)
                if (!success) {
                    console.log(`user ${jwt.userId} tried to delete suggestions job ${req.params.id} not found`)
                    res.status(404).send("not found")
                    return
                }
                res.sendStatus(204)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.post("/api/process-suggestion-job", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                // make sure user is a service acct
                if (!this.serviceAccountType(jwt)) {
                    console.log(`user ${jwt.userId} tried to process suggestions job`)
                    res.sendStatus(403)
                    return
                }
                // TODO: privatize suggestions jobs
                const job = await this.backendService.processSuggestionsJob()
                res.json(job)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.post("/api/svg-jobs", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                const job = await this.backendService.createSvgJob(jwt.userId, req.body)
                res.json(job)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.get("/api/svg-jobs/:id", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                let user = jwt.userId
                if (this.serviceAccountType(jwt) == "public") {
                    user = undefined
                }
                const job = await this.backendService.getSvgJob(req.params.id, user)
                if (!job) {
                    console.log(`user ${jwt.userId} tried to get svg job ${req.params.id} not found`)
                    res.status(404).send("not found")
                    return
                }
                res.json(job)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.post("/api/process-svg-job", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                // make sure user is a service acct
                if (!this.serviceAccountType(jwt)) {
                    console.log(`user ${jwt.userId} tried to process svg job but is not a service account`)
                    res.sendStatus(403)
                    return
                }
                let user: string = undefined;
                if (jwt.serviceAccountConfig?.type == "private") {
                    user = jwt.userId;
                }
                const job = await this.backendService.processSvgJob(user)
                res.json(job)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.get("/api/svg-jobs/:id/result.svg", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                const result = await this.backendService.getSvgJobResult(req.params.id)
                res.status(200).send(result)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.patch("/api/svg-jobs/:id", async (req, res) => {
            try {
                const job = await this.backendService.getSvgJob(req.params.id)
                if (!job) {
                    console.log(`user tried to update svg job ${req.params.id} not found`)
                    res.status(404).send("not found")
                    return
                }
                const jwt = this.authHelper.getJWTFromRequest(req)
                // if this isn't a service account, make sure the job is owned by the user
                if (!this.serviceAccountType(jwt) && job.created_by != jwt.userId) {
                    console.log(`user ${jwt.userId} tried to update svg job ${req.params.id} but job is not owned by user`)
                    res.sendStatus(404)
                    return
                }
                const result = await this.backendService.updateSvgJob(req.params.id, req.body)
                res.send(result)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.delete("/api/svg-jobs/:id", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)

                const job = await this.backendService.getSvgJob(req.params.id)
                if (!job) {
                    console.log(`user tried to delete svg job ${req.params.id} not found`)
                    res.status(404).send("not found")
                    return
                }

                // user must own the job in order to delete it
                if (job.created_by != jwt.userId) {
                    console.log(`user ${jwt.userId} tried to delete svg job ${req.params.id} but job is not owned by user`)
                    res.sendStatus(404)
                    return
                }
                await this.backendService.deleteSvgJob(req.params.id)
                res.sendStatus(204)
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

        this.app.get("/api/workflows", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                const workflows = await this.backendService.getWorkflows(jwt.userId)
                res.json(workflows)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.post("/api/workflows", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                const workflow = await this.backendService.createWorkflow(req.body, jwt.userId)
                res.status(201).json(workflow)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.get("/api/workflows/:id", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                let userId = jwt.userId
                if (this.isPublicServiceAccount(jwt)) {
                    userId = undefined
                }
                const workflow = await this.backendService.getWorkflow(req.params.id, userId)
                if (!workflow) {
                    console.log(`user ${jwt.userId} tried to get workflow ${req.params.id} but it does not exist`)
                    res.sendStatus(404)
                    return
                }
                res.json(workflow)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.put("/api/workflows/:id", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                
                let userId = jwt.userId
                if (this.serviceAccountType(jwt) == "public") {
                    userId = undefined
                }
                if (!await this.backendService.getWorkflow(req.params.id, userId)) {
                    console.log(`user ${jwt.userId} tried to update workflow ${req.params.id} but it does not exist`)
                    res.sendStatus(404)
                    return
                }
                const workflow = await this.backendService.updateWorkflow(req.params.id, req.body, userId)
                if (!workflow) {
                    console.log(`user ${jwt.userId} tried to update workflow ${req.params.id} but it does not exist`)
                    res.sendStatus(404)
                    return
                }
                res.json(workflow)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.delete("/api/workflows/:id", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                let userId = jwt.userId
                if (this.serviceAccountType(jwt) == "public") {
                    userId = undefined
                }
                if (!await this.backendService.getWorkflow(req.params.id, userId)) {
                    console.log(`user ${jwt.userId} tried to delete workflow ${req.params.id} but it does not exist`)
                    res.sendStatus(404)
                    return
                }
                await this.backendService.deleteWorkflow(req.params.id, userId)
                res.sendStatus(204)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })

        this.app.put("/api/process-workflow", async (req, res) => {
            try {
                const jwt = this.authHelper.getJWTFromRequest(req)
                let user = jwt.userId
                if (this.serviceAccountType(jwt) == "public") {
                    user = undefined
                }
                const workflow = await this.backendService.processWorkflow(user)
                res.json(workflow)
            } catch (err) {
                console.error(err)
                res.sendStatus(500)
            }
        })
        // end workflows
    }

    start() {
        return new Promise<void>(resolve => {
            this.server = this.app.listen(this.port as number, "0.0.0.0", () => {
                resolve()
            })
            this.terminator = createHttpTerminator({ server: this.server, gracefulTerminationTimeout: 100 })

            this.cleanupHandle = setInterval(() => {
                console.log("timer callback")
                this.backendService.cleanupStuckImages()
                this.backendService.cleanupSuggestionsJobs()
                this.backendService.cleanupSvgJobs()
            }, 1000 * 60)
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