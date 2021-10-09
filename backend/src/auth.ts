
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
            } else {
                console.log(`Token verified: ${payload.exp} >= ${Math.floor(this.now() / 1000)}`);
            }
            return payload.userId;
        } catch (err) {
            return null;
        }
    }
}

export function authMiddleware(config: Config) {

    const helper = new AuthHelper(config.secret);

    return (req: Request, res: Response, next: NextFunction) => {
        const token = req.headers["authorization"];
        if (!token) {
            return res.status(401).send("Unauthorized");
        }
        const userId = helper.verifyToken(token, "access");
        if (!userId) {
            return res.status(401).send("Unauthorized");
        }
        req.params.userId = userId;
        next();
    }
}