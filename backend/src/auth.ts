
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Config } from "./config";

export interface Authentication {
    accessToken: string;
    refreshToken: string;
}

export class AuthHelper {
    constructor(private secret: string, private now = Date.now) {

    }

    // create access token with 1 hour expiration
    // and refresh token with 30 days expiration
    public createTokens(userId: string): Authentication {
        const accessToken = this.createToken(userId, "access", 3600);
        const refreshToken = this.createToken(userId, "refresh", 2592000);
        return {
            accessToken,
            refreshToken
        };
    }

    // create token with expiration
    private createToken(userId: string, type: "access" | "refresh", expiration: number): string {
        const payload = {
            userId,
            type,
            exp: Math.floor(this.now() / 1000) + expiration
        };
        return jwt.sign(payload, this.secret);
    }

    // verify token
    public verifyToken(token: string, type: string): string {
        try {
            const payload = jwt.verify(token, this.secret) as any;
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
            return payload.userId;
        } catch (err) {
            if (err.name === "TokenExpiredError") {
                return null;
            }
            console.error("Error verifying token", err)
            return null;
        }
    }

    public getUserFromRequest(req: Request): string {
        const authzHeader = req.headers["authorization"];
        if (!authzHeader) {
            console.log("no authz header")
            return null;
        }
        // parse JWT from header
        const token = authzHeader.split(" ")[1];
        return this.verifyToken(token, "access");
    }
}

export function authMiddleware(config: Config) {

    const helper = new AuthHelper(config.secret);

    return (req: Request, res: Response, next: NextFunction) => {

        const userId = helper.getUserFromRequest(req)

        if (!userId) {
            console.log("could not verify token")
            return res.status(401).send("Unauthorized");
        }
        next();
    }
}