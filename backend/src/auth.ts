
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Config } from "./config";

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
    type: "public" | "private";
}

export interface AuthJWTPayload {
    userId: string;
    type: "refresh" | "access";
    exp: number;
    serviceAccountConfig?: ServiceAccountConfig;
}

export class AuthHelper {
    constructor(private config: AuthHelperConfig, private now = Date.now) {

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
    private createToken(userId: string, type: "access" | "refresh", expiration: number, serviceAccountConfig?: ServiceAccountConfig): string {
        let payload: AuthJWTPayload = {
            userId,
            type,
            exp: Math.floor(this.now() / 1000) + expiration
        };
        if (serviceAccountConfig) {
            payload = {
                ...payload,
                serviceAccountConfig
            };
        }
        return jwt.sign(payload, this.config.secret);
    }

    // verify token
    public verifyToken(token: string, type: "refresh" | "access"): AuthJWTPayload {
        try {
            const payload: AuthJWTPayload = jwt.verify(token, this.config.secret) as any;
            if (payload.type !== type) {
                // log the mismatch
                console.log(`Token type mismatch: ${payload.type} !== ${type}`);
                return null;
            }
            if (payload.exp < Math.floor(this.now() / 1000)) {
                // log the expired token
                console.log(`Token expired: ${payload.exp} < ${Math.floor(this.now() / 1000)}`);
                return null;
            }
            return payload;
        } catch (err) {
            if (err.name === "TokenExpiredError") {
                return null;
            }
            console.error("Error verifying token", err)
            return null;
        }
    }

    public getJWTFromRequest(req: Request): AuthJWTPayload {
        const authzHeader = req.headers["authorization"];
        if (!authzHeader) {
            console.log("no authz header")
            return null;
        }
        // parse JWT from header
        const token = authzHeader.split(" ")[1];
        return this.verifyToken(token, "access")
    }
}

export function authMiddleware(config: Config) {

    const helper = new AuthHelper(config);

    return (req: Request, res: Response, next: NextFunction) => {

        const jwt = helper.getJWTFromRequest(req);

        if (!jwt) {
            console.log("could not verify token")
            return res.status(401).send("Unauthorized");
        }
        next();
    }
}