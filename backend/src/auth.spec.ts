import { AuthHelper, AuthHelperConfig } from "./auth";
import { Config } from "./config";
import { ConsoleLogger } from "./logs";


describe("AuthHelper", () => {

    // most of this isn't needed...
    const config: AuthHelperConfig = {
        secret: "test",
        userAccessTokenExpirationSeconds: 3600,
        serviceAccountAccessTokenExpirationSeconds: 3600,
        serviceAccounts: ["service-account@test.test"]
    }

    it("should create access and refresh tokens", () => {
        const authHelper = new AuthHelper(config, () => Date.now(), new ConsoleLogger());
        const tokens = authHelper.createTokens("userId");
        expect(tokens.accessToken).toBeDefined();
        expect(tokens.refreshToken).toBeDefined();
    })

    it("should verify an access token", () => {
        const authHelper = new AuthHelper(config, () => Date.now(), new ConsoleLogger());
        const tokens = authHelper.createTokens("userId");
        const jwt = authHelper.verifyToken(tokens.accessToken, "access");
        expect(jwt.userId).toBe("userId");
    })

    it("should verify a refresh token", () => {
        const authHelper = new AuthHelper(config, () => Date.now(), new ConsoleLogger());
        const tokens = authHelper.createTokens("userId");
        const jwt = authHelper.verifyToken(tokens.refreshToken, "refresh");
        expect(jwt.userId).toBe("userId");
    })

    it("should fail to verify an access token with the wrong type", () => {
        const authHelper = new AuthHelper(config, () => Date.now(), new ConsoleLogger());
        const tokens = authHelper.createTokens("userId");
        const userId = authHelper.verifyToken(tokens.accessToken, "refresh");
        expect(userId).toBeNull();
    })

    it("should fail to verify a refresh token with the wrong type", () => {
        const authHelper = new AuthHelper(config, () => Date.now(), new ConsoleLogger());
        const tokens = authHelper.createTokens("userId");
        const userId = authHelper.verifyToken(tokens.refreshToken, "access");
        expect(userId).toBeNull();
    })

    it("should fail to verify an expired access token", () => {
        const authHelper = new AuthHelper(config, () => Date.now() - 3600000, new ConsoleLogger());
        const tokens = authHelper.createTokens("userId");
        const userId = authHelper.verifyToken(tokens.accessToken, "access");
        expect(userId).toBeNull();
    })

    it("should fail to verify an expired refresh token", () => {
        const authHelper = new AuthHelper(config, () => Date.now() - 2592000000, new ConsoleLogger());
        const tokens = authHelper.createTokens("userId");
        const userId = authHelper.verifyToken(tokens.refreshToken, "refresh");
        expect(userId).toBeNull();
    })
})
