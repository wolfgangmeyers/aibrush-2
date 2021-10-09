import { AuthHelper } from "./auth";


describe("AuthHelper", () => {
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
