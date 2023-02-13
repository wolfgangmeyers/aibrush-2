import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { Config } from "./config";
import Bugsnag from "@bugsnag/js";
import { Logger } from "./logs";
import moment from "moment";

export function hash(username: string): string {
    if (username.indexOf("@") == -1) {
        return username;
    }
    return crypto.createHash("sha256").update(username).digest("base64")
}

export interface Authentication {
    accessToken: string;
    refreshToken: string;
}

export interface AuthHelperConfig {
    secret: string;
    userAccessTokenExpirationSeconds: number;
    serviceAccountAccessTokenExpirationSeconds: number;
    serviceAccounts: string[];
}

export interface ServiceAccountConfig {
    // @deprecated
    type: "public" | "private";
    workerId?: string;
}

export interface AuthJWTPayload {
    userId: string;
    type: "refresh" | "access";
    exp: number;
    serviceAccountConfig?: ServiceAccountConfig;
    imageId?: string;
}

export class AuthHelper {
    constructor(private config: AuthHelperConfig, private now = Date.now, private logger: Logger) {

    }

    // create access token with 1 hour expiration
    // and refresh token with 30 days expiration
    public createTokens(userId: string, serviceAccountConfig?: ServiceAccountConfig): Authentication {
        let accessTokenExpirationSeconds = this.config.userAccessTokenExpirationSeconds;
        if (serviceAccountConfig) {
            accessTokenExpirationSeconds = this.config.serviceAccountAccessTokenExpirationSeconds;
        }
        const accessToken = this.createToken(userId, "access", accessTokenExpirationSeconds, serviceAccountConfig);
        const refreshToken = this.createToken(userId, "refresh", 2592000);
        return {
            accessToken,
            refreshToken
        };
    }

    // create token with expiration
    public createToken(userId: string, type: "access" | "refresh", expiration: number, serviceAccountConfig?: ServiceAccountConfig, imageId?: string): string {
        if (userId.indexOf("@") > -1) {
            userId = hash(userId);
        }
        let payload: AuthJWTPayload = {
            userId,
            type,
            exp: Math.floor(this.now() / 1000) + expiration
        };
        if (imageId) {
            payload.imageId = imageId;
        }
        if (serviceAccountConfig) {
            payload.serviceAccountConfig = serviceAccountConfig;
        }
        return jwt.sign(payload, this.config.secret);
    }

    // verify token
    public verifyToken(token: string, type: "refresh" | "access"): AuthJWTPayload {
        try {
            const payload: AuthJWTPayload = jwt.verify(token, this.config.secret) as any;
            if (payload.type !== type) {
                // log the mismatch
                this.logger.log(`Token type mismatch: ${payload.type} !== ${type}`);
                return null;
            }
            if (payload.exp < Math.floor(this.now() / 1000)) {
                // log the expired token
                this.logger.log(`Token expired: ${payload.exp} < ${Math.floor(this.now() / 1000)}`);
                return null;
            }
            return payload;
        } catch (err) {
            if (err.name === "TokenExpiredError") {
                return null;
            }
            Bugsnag.notify(err, evt => {
                evt.context = "verifyToken";
            })
            return null;
        }
    }

    public getJWTFromRequest(req: Request): AuthJWTPayload {
        const authzHeader = req.headers["authorization"];
        if (!authzHeader) {
            this.logger.log("no authz header")
            return null;
        }
        // parse JWT from header
        const token = authzHeader.split(" ")[1];
        return this.verifyToken(token, "access")
    }
}

export function authMiddleware(config: Config, logger: Logger) {

    const helper = new AuthHelper(config, () => moment().valueOf(), logger);

    return (req: Request, res: Response, next: NextFunction) => {
        const jwt = helper.getJWTFromRequest(req);

        if (!jwt) {
            logger.log("could not verify token")
            return res.status(401).send("Unauthorized");
        }
        next();
    }
}