import { AuthHelper } from "./auth";

/*

export interface Authentication {
    accessToken: string;
    refreshToken: string;
}

export class AuthHelper {
    constructor(private secret: string) {

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
            exp: Math.floor(Date.now() / 1000) + expiration
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
            return payload.userId;
        } catch (err) {
            return null;
        }
    }
}
 */

describe.only("AuthHelper", () => {
    it("should create access and refresh tokens", () => {
        const authHelper = new AuthHelper("secret");
        const tokens = authHelper.createTokens("userId");
        expect(tokens.accessToken).toBeDefined();
        expect(tokens.refreshToken).toBeDefined();
    })

    it("should verify an access token", () => {
        const authHelper = new AuthHelper("secret");
        const tokens = authHelper.createTokens("userId");
        const userId = authHelper.verifyToken(tokens.accessToken, "access");
        expect(userId).toBe("userId");
    })

    it("should verify a refresh token", () => {
        const authHelper = new AuthHelper("secret");
        const tokens = authHelper.createTokens("userId");
        const userId = authHelper.verifyToken(tokens.refreshToken, "refresh");
        expect(userId).toBe("userId");
    })

    it("should fail to verify an access token with the wrong type", () => {
        const authHelper = new AuthHelper("secret");
        const tokens = authHelper.createTokens("userId");
        const userId = authHelper.verifyToken(tokens.accessToken, "refresh");
        expect(userId).toBeNull();
    })

    it("should fail to verify a refresh token with the wrong type", () => {
        const authHelper = new AuthHelper("secret");
        const tokens = authHelper.createTokens("userId");
        const userId = authHelper.verifyToken(tokens.refreshToken, "access");
        expect(userId).toBeNull();
    })

    it("should fail to verify an expired access token", () => {
        const authHelper = new AuthHelper("secret", () => Date.now() - 3600000);
        const tokens = authHelper.createTokens("userId");
        const userId = authHelper.verifyToken(tokens.accessToken, "access");
        expect(userId).toBeNull();
    })

    it("should fail to verify an expired refresh token", () => {
        const authHelper = new AuthHelper("secret", () => Date.now() - 2592000000);
        const tokens = authHelper.createTokens("userId");
        const userId = authHelper.verifyToken(tokens.refreshToken, "refresh");
        expect(userId).toBeNull();
    })
})