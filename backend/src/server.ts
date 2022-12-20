import { Server as HTTPServer } from "http";
import express, { Express } from "express";
import ws from "ws";
import cors from "cors";
import fs from "fs";
import path from "path";
import { createHttpTerminator, HttpTerminator } from "http-terminator";
import moment from "moment";
import os from "os";
import * as uuid from "uuid";
import Bugsnag from "@bugsnag/js";
import BugsnagPluginExpress from "@bugsnag/plugin-express";

if (process.env.BUGSNAG_API_KEY) {
    Bugsnag.start({
        apiKey: process.env.BUGSNAG_API_KEY,
        plugins: [BugsnagPluginExpress],
    });
}

import { sleep } from "./sleep";
import { BackendService, UserError } from "./backend";
import { Config } from "./config";
import {
    AuthHelper,
    AuthJWTPayload,
    authMiddleware,
    ServiceAccountConfig,
    hash,
} from "./auth";
import {
    AddMetricsInput,
    DepositRequest,
    ImageStatusEnum,
    UpsertWorkerConfigInput,
    UpsertWorkerInput,
} from "./client";
import { MetricsClient } from "./metrics";
import { ScalingService } from "./scaling_service";
import { Logger } from "./logs";
import { WorkDistributor } from "./work_distributor";
import { BOOST_LEVELS } from "./boost";

export class Server {
    private server: HTTPServer;
    private wsServer: ws.Server;
    private app: Express;
    private terminator: HttpTerminator;
    private authHelper: AuthHelper;
    cleanupHandle: NodeJS.Timer;
    metricsHandle: NodeJS.Timer;
    private hashedServiceAccounts: { [key: string]: boolean } = {};
    private serverId: string = uuid.v4();

    constructor(
        private config: Config,
        private backendService: BackendService,
        private port: string | number,
        private metricsClient: MetricsClient,
        private logger: Logger,
        private scalingService: ScalingService,
        private workDistributor: WorkDistributor
    ) {
        this.app = express();
        this.authHelper = new AuthHelper(
            config,
            () => moment().valueOf(),
            logger
        );
        for (let serviceAccount of this.config.serviceAccounts || []) {
            this.hashedServiceAccounts[hash(serviceAccount)] = true;
        }
        this.wsServer = new ws.Server({ noServer: true });
    }

    private serviceAccountType(
        jwt: AuthJWTPayload
    ): "public" | "private" | undefined {
        if (this.hashedServiceAccounts[jwt.userId]) {
            return "public";
        }
        if (jwt.serviceAccountConfig) {
            return jwt.serviceAccountConfig.type;
        }
        return undefined;
    }

    private isPublicServiceAccount(jwt: AuthJWTPayload): boolean {
        return this.serviceAccountType(jwt) === "public";
    }

    async init() {
        this.logger.log("Backend service initializing");
        await this.backendService.init();
        this.logger.log("Backend service initialized");

        // TODO: move this into another object
        // Set up a headless websocket server that prints any
        // events that come in.
        this.wsServer.on("connection", (socket, request) => {
            let userId: string;
            let workerId: string;

            const handler = (message: string) => {
                console.log("handler called");
                if (socket.readyState === ws.OPEN) {
                    console.log("sending message");
                    socket.send(message);
                }
            };

            socket.onmessage = async (buf) => {
                try {
                    const message = buf.data.toString("utf-8");
                    if (!userId && !workerId) {
                        const authResult = this.authHelper.verifyToken(
                            message,
                            "access"
                        );
                        if (!authResult) {
                            throw new Error("bad token");
                        }
                        console.log("Socket authenticated");
                        if (authResult.serviceAccountConfig) {
                            workerId = authResult.serviceAccountConfig.workerId;
                            await this.backendService.listen(
                                "WORKERS",
                                handler
                            );
                            await this.backendService.listen(workerId, handler);
                        } else {
                            userId = authResult.userId;
                            await this.backendService.listen(userId, handler);
                        }
                        socket.send(
                            JSON.stringify({
                                connected: true,
                            })
                        );
                    }
                } catch (err) {
                    console.error(err);
                    socket.close();
                }
            };

            socket.onclose = async () => {
                console.log("socket closed");
                if (workerId) {
                    await this.backendService.unlisten("WORKERS", handler);
                    await this.backendService.unlisten(workerId, handler);
                } else if (userId) {
                    await this.backendService.unlisten(userId, handler);
                }
            };
        });

        let middleware: any;

        if (process.env.BUGSNAG_API_KEY) {
            middleware = Bugsnag.getPlugin("express");
            this.app.use(middleware.requestHandler);
        }

        this.app.use(
            express.json({
                limit: "10mb",
            })
        );
        this.app.use(
            express.raw({
                type: "image/png",
                limit: "50mb",
            })
        );
        this.app.use(cors());

        // implement and add middleware to force https only when the host is not localhost
        this.app.use((req, res, next) => {
            if (
                req.headers["x-forwarded-proto"] === "http" &&
                req.hostname !== "localhost"
            ) {
                res.redirect("https://" + req.headers.host + req.url);
            } else {
                next();
            }
        });

        const spec = fs.readFileSync("./openapi.yaml");

        this.app.get("/api/healthcheck", async (req, res) => {
            res.status(200).json({
                status: "ok",
            });
        });

        const withMetrics = (
            route: string,
            fn: (req: express.Request, res: express.Response) => Promise<void>
        ) => {
            return async (req: express.Request, res: express.Response) => {
                const start = moment();
                let err: any;
                try {
                    await fn(req, res);
                } catch (e) {
                    err = e;
                    Bugsnag.notify(e);
                    console.error(e);
                    try {
                        res.sendStatus(400);
                    } catch (_) {}
                } finally {
                    const end = moment();
                    const duration = end.diff(start, "milliseconds");
                    this.metricsClient.addMetric("api.request", 1, "count", {
                        path: route,
                        method: req.method,
                        status: res.statusCode,
                        duration,
                        error: err ? err.message : undefined,
                    });
                }
            };
        };

        this.app.get("/openapi.yaml", (req, res) => {
            res.status(200).send(spec);
        });

        this.app.post(
            "/api/auth/login",
            withMetrics("/api/auth/login", async (req, res) => {
                try {
                    const token = await this.backendService.login(
                        req.body.email,
                        true
                    );
                    res.sendStatus(204);
                } catch (err) {
                    // if "User not allowed" then return 403
                    if (err.message === "User not allowed") {
                        this.logger.log("User not allowed: " + req.body.email);
                        res.sendStatus(403);
                        return;
                    }
                    throw err;
                }
            })
        );

        this.app.post(
            "/api/auth/verify",
            withMetrics("/api/auth/verify", async (req, res) => {
                const result = await this.backendService.verify(req.body.code);
                // if result is null, send 400
                if (!result) {
                    res.sendStatus(400);
                } else {
                    res.send(result);
                }
            })
        );

        this.app.post(
            "/api/auth/refresh",
            withMetrics("/api/auth/refresh", async (req, res) => {
                const result = await this.backendService.refresh(
                    req.body.refreshToken
                );
                // if result is null, send 400
                if (!result) {
                    res.sendStatus(400);
                } else {
                    res.send(result);
                }
            })
        );

        this.app.post(
            "/api/discord-login",
            withMetrics("/api/discord-login", async (req, res) => {
                const result = await this.backendService.discordLogin(
                    req.body.code
                );
                if (result) {
                    res.send(result);
                    return;
                }
                res.sendStatus(400);
            })
        );

        // allow anonymous access to image data. This is needed in order to
        // use these urls in image elements.

        // get image data by id
        this.app.get(
            "/api/images/:id.image.png",
            withMetrics("/api/images/:id.image.png", async (req, res) => {
                // get image first and check created_by
                let image = await this.backendService.getImage(req.params.id);
                if (!image) {
                    res.status(404).send("not found");
                    return;
                }
                const imageData = await this.backendService.getImageData(
                    req.params.id
                );
                res.setHeader("Content-Type", "image/png");
                res.send(imageData);
            })
        );

        // get thumbnail data by id
        this.app.get(
            "/api/images/:id.thumbnail.png",
            withMetrics("/api/images/:id.thumbnail.png", async (req, res) => {
                // get image first and check created_by
                let image = await this.backendService.getImage(req.params.id);
                if (!image) {
                    res.status(404).send("not found");
                    return;
                }
                const imageData = await this.backendService.getThumbnailData(
                    req.params.id
                );
                res.setHeader("Content-Type", "image/png");
                res.send(imageData);
            })
        );

        this.app.get(
            "/api/images/:id.npy",
            withMetrics("/api/images/:id.npy", async (req, res) => {
                // get image first and check created_by
                let image = await this.backendService.getImage(req.params.id);
                if (!image) {
                    res.status(404).send("not found");
                    return;
                }
                const npyData = await this.backendService.getNpyData(
                    req.params.id
                );
                if (!npyData) {
                    res.status(404).send("not found");
                    return;
                }
                res.setHeader("Content-Type", "application/octet-stream");
                res.send(npyData);
            })
        );

        this.app.get(
            "/api/images/:id.mask.png",
            withMetrics("/api/images/:id.mask.png", async (req, res) => {
                // get image first and check created_by
                let image = await this.backendService.getImage(req.params.id);
                if (!image) {
                    res.status(404).send("not found");
                    return;
                }
                const maskData = await this.backendService.getMaskData(
                    req.params.id
                );
                if (!maskData) {
                    res.status(404).send("not found");
                    return;
                }
                res.setHeader("Content-Type", "image/png");
                res.send(maskData);
            })
        );

        this.app.get(
            "/api/images/:id.mp4",
            withMetrics("/api/images/:id.mp4", async (req, res) => {
                // get image first and check created_by
                let image = await this.backendService.getImage(req.params.id);
                if (!image) {
                    res.status(404).send("not found");
                    return;
                }
                const videoData = await this.backendService.getVideoData(
                    req.params.id
                );
                // if videoData is null, return 404
                if (!videoData) {
                    res.status(404).send("not found");
                    return;
                }
                res.setHeader("Content-Type", "video/mp4");
                // content disposition attachment
                res.setHeader(
                    "Content-Disposition",
                    `attachment; filename="${image.label.replace(
                        " ",
                        "_"
                    )}.mp4"`
                );
                res.send(videoData);
            })
        );

        this.app.get(
            "/api/assets-url",
            withMetrics("/api/assets-url", async (req, res) => {
                const assetsUrl = this.config.assetsBaseUrl;
                res.send({
                    assets_url: assetsUrl,
                });
            })
        );

        // anonymous access of static files
        this.app.use(express.static("./public"));

        function getIndexHtmlPath(): string {
            if (__dirname.indexOf("dist") == -1) {
                return path.join(__dirname, "../public/index.html");
            }
            return path.join(__dirname, "../../public/index.html");
        }

        // render index.html for frontend routes
        for (let route of [
            "/worker-config",
            "/admin",
            "/images/:id",
            "/image-editor/:id",
            "/deleted-images",
            "/orders",
        ]) {
            this.app.get(
                route,
                withMetrics(route, async (req, res) => {
                    res.sendFile(getIndexHtmlPath());
                })
            );
            this.app.get(
                route + "/",
                withMetrics(route, async (req, res) => {
                    res.sendFile(getIndexHtmlPath());
                })
            );
        }

        this.app.get(
            "/api/features",
            withMetrics("/api/features", async (req, res) => {
                const features = await this.backendService.getFeatures();
                res.json(features);
            })
        );

        this.app.post(
            "/api/worker-login",
            withMetrics("/api/worker-login", async (req, res) => {
                const loginCode = req.body.login_code;
                const auth = await this.backendService.loginAsWorker(loginCode);
                res.json(auth);
            })
        );

        // only open these routes in dev mode
        if (process.env.AIBRUSH_DEV_MODE === "true") {
            console.log("Dev routes enabled");
            this.app.put(
                "/api/images/:id.image.png",
                withMetrics("/api/images/:id.image.png", async (req, res) => {
                    // get image first and check created_by
                    let image = await this.backendService.getImage(
                        req.params.id
                    );
                    if (!image) {
                        res.status(404).send("not found");
                        return;
                    }
                    // base64 encode binary image data from request
                    const data = Buffer.from(req.body).toString("base64");
                    image = await this.backendService.updateImage(
                        req.params.id,
                        {
                            encoded_image: data,
                        },
                        null
                    );
                    if (image == null) {
                        res.status(404).send("not found");
                        return;
                    }
                    res.sendStatus(201);
                })
            );

            // no-op. This is handled by updating the image data...
            // in production these will be S3 calls
            this.app.put(
                "/api/images/:id.thumbnail.png",
                withMetrics(
                    "/api/images/:id.thumbnail.png",
                    async (req, res) => {
                        res.sendStatus(201);
                    }
                )
            );
        }
        // end dev-only routes

        // authenticated routes only past this point
        this.app.use(authMiddleware(this.config, this.logger));

        // list images
        this.app.get(
            "/api/images",
            withMetrics("/api/images", async (req, res) => {
                try {
                    console.log("Getting jwt from request");
                    const jwt = this.authHelper.getJWTFromRequest(req);
                    // service accounts can't list images
                    if (jwt.serviceAccountConfig) {
                        res.status(403).send("Forbidden");
                        this.logger.log(
                            "Service account tried to list images",
                            jwt
                        );
                        return;
                    }
                    let cursor: number | undefined;
                    try {
                        cursor = parseInt(req.query.cursor as string);
                    } catch (err) {}
                    // direction
                    let direction: "asc" | "desc" | undefined = req.query
                        .direction as any;
                    let limit: number | undefined;
                    try {
                        limit = parseInt(req.query.limit as string);
                    } catch (err) {}
                    let filter: string | undefined = req.query.filter as any;

                    let query = {
                        userId: jwt.userId,
                        status: req.query.status as ImageStatusEnum,
                        cursor,
                        direction,
                        limit,
                        filter,
                    };

                    const images = await this.backendService.listImages(query);
                    res.json(images);
                } catch (err) {
                    console.error(err);
                }
            })
        );

        // create image
        this.app.post(
            "/api/images",
            withMetrics("/api/images", async (req, res) => {
                const jwt = this.authHelper.getJWTFromRequest(req);
                if (jwt.serviceAccountConfig) {
                    res.status(403).send("Forbidden");
                    this.logger.log(
                        "Service account tried to create image",
                        jwt
                    );
                    return;
                }
                const images = await this.backendService.createImages(
                    jwt.userId,
                    req.body
                );
                res.json({
                    images,
                });
            })
        );

        // get image by id
        this.app.get(
            "/api/images/:id",
            withMetrics("/api/images/:id", async (req, res) => {
                // check created_by
                const jwt = this.authHelper.getJWTFromRequest(req);
                const image = await this.backendService.getImage(req.params.id);
                if (!image) {
                    this.logger.log(
                        `user ${jwt.userId} tried to get image ${req.params.id} which does not exist`
                    );
                    res.status(404).send("not found");
                    return;
                }

                if (
                    !this.isPublicServiceAccount(jwt) &&
                    image.created_by != jwt.userId
                ) {
                    this.logger.log(
                        `user ${jwt.userId} tried to get image ${req.params.id} but not authorized`
                    );
                    res.status(404).send("not found");
                    return;
                }
                res.json(image);
            })
        );

        // update image by id
        this.app.patch(
            "/api/images/:id",
            withMetrics("/api/images/:id", async (req, res) => {
                const jwt = this.authHelper.getJWTFromRequest(req);
                // get image first and check created_by
                let image = await this.backendService.getImage(req.params.id);
                if (!image) {
                    this.logger.log(
                        `user ${jwt.userId} tried to update image ${req.params.id} which does not exist`
                    );
                    res.status(404).send("not found");
                    return;
                }
                if (
                    !this.isPublicServiceAccount(jwt) &&
                    image.created_by !== jwt.userId
                ) {
                    this.logger.log(
                        `user ${jwt.userId} tried to update image ${req.params.id} but not authorized`
                    );
                    res.status(404).send("not found");
                    return;
                }
                image = await this.backendService.updateImage(
                    req.params.id,
                    req.body,
                    jwt.serviceAccountConfig?.workerId
                );
                if (image == null) {
                    res.status(404).send("not found");
                    return;
                }
                res.json(image);
            })
        );

        // delete image
        this.app.delete(
            "/api/images/:id",
            withMetrics("/api/images/:id", async (req, res) => {
                // get image first and check created_by
                const jwt = this.authHelper.getJWTFromRequest(req);
                if (jwt.serviceAccountConfig) {
                    res.status(403).send("Forbidden");
                    this.logger.log(
                        "Service account tried to delete image",
                        jwt
                    );
                    return;
                }
                let image = await this.backendService.getImage(req.params.id);
                if (!image) {
                    this.logger.log(
                        `user ${jwt.userId} tried to delete image ${req.params.id} which does not exist`
                    );
                    res.status(404).send("not found");
                    return;
                }
                if (image.created_by !== jwt.userId) {
                    this.logger.log(
                        `user ${jwt.userId} tried to delete image ${req.params.id} but not authorized`
                    );
                    res.status(404).send("not found");
                    return;
                }
                if (image.deleted_at) {
                    await this.backendService.hardDeleteImage(req.params.id);
                } else {
                    await this.backendService.deleteImage(req.params.id);
                }

                res.sendStatus(204);
            })
        );

        this.app.get(
            "/api/images/:id/download-urls",
            withMetrics("/api/images/:id/download-urls", async (req, res) => {
                const jwt = this.authHelper.getJWTFromRequest(req);
                const image = await this.backendService.getImage(req.params.id);
                if (!image) {
                    this.logger.log(
                        `user ${jwt.userId} tried to get image ${req.params.id} which does not exist`
                    );
                    res.status(404).send("not found");
                    return;
                }
                const urls = await this.backendService.getImageDownloadUrls(
                    req.params.id
                );
                res.json(urls);
            })
        );

        this.app.get(
            "/api/images/:id/upload-urls",
            withMetrics("/api/images/:id/upload-urls", async (req, res) => {
                const jwt = this.authHelper.getJWTFromRequest(req);
                const image = await this.backendService.getImage(req.params.id);
                if (!image) {
                    this.logger.log(
                        `user ${jwt.userId} tried to get image ${req.params.id} which does not exist`
                    );
                    res.status(404).send("not found");
                    return;
                }
                if (jwt.serviceAccountConfig) {
                    if (jwt.serviceAccountConfig.workerId != image.worker_id) {
                        res.status(404).send("not found");
                        this.logger.log(
                            `Service account ${jwt.serviceAccountConfig.workerId} tried to get upload urls for image ${req.params.id} but not authorized`,
                            jwt
                        );
                        return;
                    }
                } else {
                    if (image.created_by !== jwt.userId) {
                        this.logger.log(
                            `user ${jwt.userId} tried to get image ${req.params.id} but not authorized`
                        );
                        res.status(404).send("not found");
                        return;
                    }
                }
                const urls = await this.backendService.getImageUploadUrls(
                    req.params.id
                );
                res.json(urls);
            })
        );

        this.app.post(
            "/api/batch-get-images",
            withMetrics("/api/batch-get-images", async (req, res) => {
                const jwt = this.authHelper.getJWTFromRequest(req);
                const images = await this.backendService.batchGetImages(
                    jwt.userId,
                    req.body.ids
                );
                res.json({
                    images,
                });
            })
        );

        this.app.put(
            "/api/images/:id.mp4",
            withMetrics("/api/images/:id.mp4", async (req, res) => {
                // get image first and check created_by
                let image = await this.backendService.getImage(req.params.id);
                if (!image) {
                    res.status(404).send("not found");
                    return;
                }
                const jwt = this.authHelper.getJWTFromRequest(req);
                // only service account can update video data
                if (!this.serviceAccountType(jwt)) {
                    this.logger.log(
                        `${jwt.userId} attempted to update video data but is not a service acct`
                    );
                    res.sendStatus(404);
                    return;
                }
                await this.backendService.updateVideoData(
                    req.params.id,
                    req.body
                );
                res.sendStatus(204);
            })
        );

        this.app.get(
            "/api/workers",
            withMetrics("/api/workers", async (req, res) => {
                const jwt = this.authHelper.getJWTFromRequest(req);
                if (jwt.serviceAccountConfig) {
                    res.status(403).send("Forbidden");
                    this.logger.log(
                        "Service account tried to get workers",
                        jwt
                    );
                    return;
                }
                // check admin
                if (!(await this.backendService.isUserAdmin(jwt.userId))) {
                    this.logger.log(
                        `${jwt.userId} attempted to get workers but is not an admin`
                    );
                    res.sendStatus(403);
                    return;
                }
                const workers = await this.backendService.listWorkers();
                res.json({
                    workers: workers,
                });
            })
        );

        this.app.post(
            "/api/workers",
            withMetrics("/api/workers", async (req, res) => {
                const jwt = this.authHelper.getJWTFromRequest(req);
                if (jwt.serviceAccountConfig) {
                    res.status(403).send("Forbidden");
                    this.logger.log(
                        "Service account tried to create worker",
                        jwt
                    );
                    return;
                }
                // check admin
                if (!(await this.backendService.isUserAdmin(jwt.userId))) {
                    this.logger.log(
                        `${jwt.userId} attempted to create a worker but is not an admin`
                    );
                    res.sendStatus(403);
                    return;
                }
                const input = req.body as UpsertWorkerInput;
                const worker = await this.backendService.createWorker(
                    input.display_name
                );
                res.json(worker);
            })
        );

        this.app.get(
            "/api/workers/:worker_id",
            withMetrics("/api/workers/:worker_id", async (req, res) => {
                const jwt = this.authHelper.getJWTFromRequest(req);
                if (jwt.serviceAccountConfig) {
                    res.status(403).send("Forbidden");
                    this.logger.log("Service account tried to get worker", jwt);
                    return;
                }
                // check admin
                if (!(await this.backendService.isUserAdmin(jwt.userId))) {
                    this.logger.log(
                        `${jwt.userId} attempted to get a worker but is not an admin`
                    );
                    res.sendStatus(403);
                    return;
                }
                const worker = await this.backendService.getWorker(
                    req.params.worker_id
                );
                if (worker) {
                    res.json(worker);
                } else {
                    res.sendStatus(404);
                }
            })
        );

        this.app.put(
            "/api/workers/:worker_id",
            withMetrics("/api/workers/:worker_id", async (req, res) => {
                const jwt = this.authHelper.getJWTFromRequest(req);
                if (jwt.serviceAccountConfig) {
                    res.status(403).send("Forbidden");
                    this.logger.log(
                        "Service account tried to update worker",
                        jwt
                    );
                    return;
                }
                // check admin
                if (!(await this.backendService.isUserAdmin(jwt.userId))) {
                    this.logger.log(
                        `${jwt.userId} attempted to update a worker but is not an admin`
                    );
                    res.sendStatus(403);
                    return;
                }
                const input = req.body as UpsertWorkerInput;
                const worker = await this.backendService.updateWorker(
                    req.params.worker_id,
                    input
                );
                if (worker) {
                    res.json(worker);
                } else {
                    res.sendStatus(404);
                }
            })
        );

        this.app.delete(
            "/api/workers/:worker_id",
            withMetrics("/api/workers/:worker_id", async (req, res) => {
                const jwt = this.authHelper.getJWTFromRequest(req);
                if (jwt.serviceAccountConfig) {
                    res.status(403).send("Forbidden");
                    this.logger.log(
                        "Service account tried to delete worker",
                        jwt
                    );
                    return;
                }
                // check admin
                if (!(await this.backendService.isUserAdmin(jwt.userId))) {
                    this.logger.log(
                        `${jwt.userId} attempted to delete a worker but is not an admin`
                    );
                    res.sendStatus(403);
                    return;
                }
                await this.backendService.deleteWorker(req.params.worker_id);
                res.sendStatus(204);
            })
        );

        // get worker config is allowed for all users
        this.app.get(
            "/api/workers/:worker_id/config",
            withMetrics("/api/workers/:worker_id/config", async (req, res) => {
                const workerConfig = await this.backendService.getWorkerConfig(
                    req.params.worker_id
                );
                if (workerConfig) {
                    res.json(workerConfig);
                } else {
                    res.sendStatus(404);
                }
            })
        );

        // upsert worker config is only allowed for admin users
        this.app.put(
            "/api/workers/:worker_id/config",
            withMetrics("/api/workers/:worker_id/config", async (req, res) => {
                const jwt = this.authHelper.getJWTFromRequest(req);
                if (jwt.serviceAccountConfig) {
                    res.status(403).send("Forbidden");
                    this.logger.log(
                        "Service account tried to update worker config",
                        jwt
                    );
                    return;
                }
                // check admin
                if (!(await this.backendService.isUserAdmin(jwt.userId))) {
                    this.logger.log(
                        `${jwt.userId} attempted to upsert a worker config but is not an admin`
                    );
                    res.sendStatus(403);
                    return;
                }
                const workerId = req.params.worker_id;
                const input = req.body as UpsertWorkerConfigInput;
                const workerConfig =
                    await this.backendService.upsertWorkerConfig(
                        workerId,
                        input
                    );
                res.json(workerConfig);
            })
        );

        this.app.post(
            "/api/workers/:worker_id/login-code",
            withMetrics(
                "/api/workers/:worker_id/login-code",
                async (req, res) => {
                    const jwt = this.authHelper.getJWTFromRequest(req);
                    if (jwt.serviceAccountConfig) {
                        res.status(403).send("Forbidden");
                        this.logger.log(
                            "Service account tried to create worker login code",
                            jwt
                        );
                        return;
                    }
                    // check admin
                    if (!(await this.backendService.isUserAdmin(jwt.userId))) {
                        this.logger.log(
                            `${jwt.userId} attempted to generate a worker login code but is not an admin`
                        );
                        res.sendStatus(403);
                        return;
                    }
                    const workerLoginCode =
                        await this.backendService.generateWorkerLoginCode(
                            req.params.worker_id
                        );
                    res.json(workerLoginCode);
                }
            )
        );

        //     /api/worker-ping:
        // post:
        //   description: Ping a worker
        //   operationId: pingWorker
        //   tags:
        //     - AIBrush
        //   responses:
        //     "201":
        //       description: Success

        // on ping, update the worker with an empty payload
        this.app.post(
            "/api/worker-ping",
            withMetrics("/api/worker-ping", async (req, res) => {
                console.log("******** worker ping **********");
                const jwt = this.authHelper.getJWTFromRequest(req);
                if (!jwt.serviceAccountConfig) {
                    res.status(403).send("Forbidden");
                    this.logger.log("Non-service account tried to ping", jwt);
                    return;
                }
                const worker = await this.backendService.updateWorker(
                    jwt.serviceAccountConfig.workerId,
                    {}
                );
                if (worker) {
                    res.sendStatus(201);
                } else {
                    res.sendStatus(404);
                }
            })
        );

        this.app.put(
            "/api/process-image",
            withMetrics("/api/process-image", async (req, res) => {
                const jwt = this.authHelper.getJWTFromRequest(req);

                // only service accounts can process images
                if (!this.serviceAccountType(jwt)) {
                    this.logger.log(
                        `${jwt.userId} attempted to process image but is not a service acct`
                    );
                    res.sendStatus(403);
                    return;
                }
                // TODO: this may or may not be used in the future...
                let user: string = undefined;
                if (jwt.serviceAccountConfig?.type == "private") {
                    user = jwt.userId;
                }
                const workerId = jwt.serviceAccountConfig.workerId;
                const image = await this.backendService.processImage(
                    user,
                    req.body,
                    workerId
                );
                if (jwt.serviceAccountConfig?.workerId) {
                    await this.backendService.updateWorker(
                        jwt.serviceAccountConfig.workerId,
                        {
                            status: image ? "active" : "idle",
                        }
                    );
                }
                res.json(image);
            })
        );

        this.app.post(
            "/api/auth/service-accounts",
            withMetrics("/api/auth/service-accounts", async (req, res) => {
                const jwt = this.authHelper.getJWTFromRequest(req);
                if (jwt.serviceAccountConfig) {
                    res.status(403).send("Forbidden");
                    this.logger.log(
                        "Service account tried to create service account",
                        jwt
                    );
                    return;
                }
                // service accounts can't create new service accounts
                if (this.serviceAccountType(jwt)) {
                    res.sendStatus(403);
                    return;
                }
                const serviceAccountConfig = req.body as ServiceAccountConfig;
                // only admins can create public service accounts
                if (!(await this.backendService.isUserAdmin(jwt.userId))) {
                    serviceAccountConfig.type = "private";
                }
                const result =
                    await this.backendService.createServiceAccountCreds(
                        jwt.userId,
                        serviceAccountConfig
                    );
                res.json(result);
            })
        );

        this.app.post(
            "/api/invite-codes",
            withMetrics("/api/invite-codes", async (req, res) => {
                const jwt = this.authHelper.getJWTFromRequest(req);
                if (jwt.serviceAccountConfig) {
                    res.status(403).send("Forbidden");
                    this.logger.log(
                        "Service account tried to create invite code",
                        jwt
                    );
                    return;
                }
                // service accounts can't create invite codes
                if (this.serviceAccountType(jwt)) {
                    res.sendStatus(403);
                    return;
                }
                if (!(await this.backendService.isUserAdmin(jwt.userId))) {
                    this.logger.log(
                        `user ${jwt.userId} tried to create invite code but is not an admin`
                    );
                    res.sendStatus(404);
                    return;
                }
                const inviteCode = await this.backendService.createInviteCode();
                res.status(201).json(inviteCode);
            })
        );

        this.app.get(
            "/api/boost",
            withMetrics("/api/boost", async (req, res) => {
                const jwt = this.authHelper.getJWTFromRequest(req);
                if (jwt.serviceAccountConfig) {
                    res.status(403).send("Forbidden");
                    this.logger.log("Service account tried to get boost", jwt);
                    return;
                }
                const boost = await this.backendService.getBoost(jwt.userId);
                res.json(boost);
            })
        );

        this.app.put(
            "/api/boost",
            withMetrics("/api/boost", async (req, res) => {
                const jwt = this.authHelper.getJWTFromRequest(req);
                if (jwt.serviceAccountConfig) {
                    res.status(403).send("Forbidden");
                    this.logger.log("Service account tried to update boost level", jwt);
                    return;
                }
                const level = req.body.level;
                if (!BOOST_LEVELS.find((l) => l.level == level)) {
                    res.status(400).send("Invalid level");
                    return;
                }
                try {
                    const boost = await this.backendService.updateBoost(
                        jwt.userId,
                        req.body.level,
                        req.body.is_active,
                    );
                    res.json({
                        level: boost.level,
                        balance: boost.balance,
                        is_active: boost.is_active,
                    })
                } catch (e) {
                    if (e instanceof UserError) {
                        res.json({
                            error: e.message,
                        })
                    } else {
                        throw e;
                    }
                }
            })
        );

        this.app.get(
            "/api/boost/:userId",
            withMetrics("/api/boost/:userId", async (req, res) => {
                // admin only
                const jwt = this.authHelper.getJWTFromRequest(req);
                if (jwt.serviceAccountConfig) {
                    res.status(403).send("Forbidden");
                    this.logger.log("Service account tried to get boost", jwt);
                    return;
                }
                if (!(await this.backendService.isUserAdmin(jwt.userId))) {
                    res.sendStatus(404);
                    return;
                }
                const boost = await this.backendService.getBoost(
                    req.params.userId
                );
                res.json(boost);
            })
        );

        // admin only
        this.app.post(
            "/api/boost/:userId/deposit",
            withMetrics("/api/boost/:userId/deposit", async (req, res) => {
                const jwt = this.authHelper.getJWTFromRequest(req);
                if (jwt.serviceAccountConfig) {
                    res.status(403).send("Forbidden");
                    this.logger.log(
                        "Service account tried to deposit to boost",
                        jwt
                    );
                    return;
                }
                if (!(await this.backendService.isUserAdmin(jwt.userId))) {
                    res.sendStatus(404);
                    return;
                }
                const depositRequest = req.body as DepositRequest;
                const boost = await this.backendService.depositBoost(
                    req.params.userId,
                    depositRequest.amount,
                    depositRequest.level
                );
                res.json(boost);
            })
        );

        this.app.get(
            "/api/boosts",
            withMetrics("/api/boosts", async (req, res) => {
                const jwt = this.authHelper.getJWTFromRequest(req);
                if (jwt.serviceAccountConfig) {
                    res.status(403).send("Forbidden");
                    this.logger.log("Service account tried to list boosts", jwt);
                    return;
                }
                if (!(await this.backendService.isUserAdmin(jwt.userId))) {
                    res.sendStatus(404);
                    return;
                }
                const boosts = await this.backendService.listActiveBoosts();
                res.json({
                    boosts,
                });
            })
        );

        this.app.get(
            "/api/is-admin",
            withMetrics("/api/is-admin", async (req, res) => {
                const jwt = this.authHelper.getJWTFromRequest(req);
                const isAdmin = await this.backendService.isUserAdmin(
                    jwt.userId
                );
                res.json({ is_admin: isAdmin });
            })
        );

        this.app.post(
            "/api/metrics",
            withMetrics("/api/metrics", async (req, res) => {
                const metrics = req.body as AddMetricsInput;
                await this.backendService.addMetrics(metrics);
                res.sendStatus(200);
            })
        );

        if (process.env.BUGSNAG_API_KEY) {
            this.app.use(middleware.errorHandler);
        }
    }

    start() {
        return new Promise<void>((resolve) => {
            this.server = this.app.listen(
                this.port as number,
                "0.0.0.0",
                () => {
                    resolve();
                }
            );

            this.server.on("upgrade", (request, socket, head) => {
                this.wsServer.handleUpgrade(request, socket, head, (socket) => {
                    this.wsServer.emit("connection", socket, request);
                });
            });

            this.terminator = createHttpTerminator({
                server: this.server,
                gracefulTerminationTimeout: 100,
            });

            if (this.config.disableCleanupJob) {
                return;
            }
            const cleanup = async () => {
                this.logger.log("cleanup process running");
                await this.backendService.cleanup();
                this.logger.log("cleanup complete");
            };
            sleep(Math.random() * 1000).then(() => {
                this.cleanupHandle = setInterval(() => {
                    cleanup();
                }, 1000 * 60);
                cleanup();
            });

            let lastIdle = 0;
            let lastTick = 0;
            this.metricsHandle = setInterval(async () => {
                try {
                    // calculate CPU percentage
                    const cpu = os.cpus();
                    let totalIdle = 0;
                    let totalTick = 0;
                    for (let i = 0; i < cpu.length; i++) {
                        const type = cpu[i].times;
                        totalIdle += type.idle;
                        totalTick +=
                            type.idle +
                            type.user +
                            type.nice +
                            type.irq +
                            type.sys;
                    }
                    const idle = totalIdle / cpu.length;
                    const tick = totalTick / cpu.length;
                    const diffIdle = idle - lastIdle;
                    const diffTick = tick - lastTick;
                    const cpuPercentage = 100 * (1 - diffIdle / diffTick);
                    lastIdle = idle;
                    lastTick = tick;

                    // calculate memory used percentage
                    const mem = os.totalmem() - os.freemem();
                    const memPercentage = (100 * mem) / os.totalmem();

                    // add metrics
                    this.metricsClient.addMetric(
                        "server.cpu",
                        cpuPercentage,
                        "gauge",
                        {
                            server: this.serverId,
                        }
                    );
                    this.metricsClient.addMetric(
                        "server.mem",
                        memPercentage,
                        "gauge",
                        {
                            server: this.serverId,
                        }
                    );
                } catch (err) {
                    Bugsnag.notify(err);
                }
            }, 10000);

            if (this.config.enableScalingService) {
                this.scalingService.start();
                this.scalingService.scale();
            }

            if (this.workDistributor) {
                this.workDistributor.start();
                this.workDistributor.distributeWork();
            }
        });
    }

    async stop() {
        await this.backendService.destroy();
        if (this.terminator) {
            await this.terminator.terminate();
        }
        if (this.cleanupHandle) {
            clearInterval(this.cleanupHandle);
            this.cleanupHandle = undefined;
        }
        if (this.config.enableScalingService) {
            this.scalingService.stop();
        }
        if (this.workDistributor) {
            this.workDistributor.stop();
        }
    }
}
