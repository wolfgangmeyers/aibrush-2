import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Dropbox, DropboxAuth, DropboxAuthOptions } from "dropbox";
import { decryptString, encryptString, generateEncryptionKey } from "./_util";

export default async function handler(
    request: VercelRequest,
    response: VercelResponse
) {
    const secretKey = process.env.SECRET_KEY;
    if (!secretKey) {
        console.error("Missing SECRET_KEY env var");
        response.status(500).json({
            error: "Configuration Error",
        });
        return;
    }

    // get username, encrypted access token and encrypted refresh token from cookies
    let sessionData: any;
    try {
        sessionData = JSON.parse(request.cookies.session);
    } catch (e) {
        console.error("Invalid session cookie");
        response.status(401).json({
            error: "Unauthorized",
        });
        return;
    }
    const username = sessionData.username;
    const encryptedAccessToken = sessionData.accessToken;
    const encryptedRefreshToken = sessionData.refreshToken;

    const encryptionKey = generateEncryptionKey(secretKey, username);

    let accessToken = decryptString(encryptedAccessToken, encryptionKey);
    let refreshToken = decryptString(encryptedRefreshToken, encryptionKey);

    const auth = new DropboxAuth({
        fetch,
        clientId: process.env.DROPBOX_CLIENT_ID,
        clientSecret: process.env.DROPBOX_CLIENT_SECRET,
        accessToken,
        refreshToken,
    });
    await (auth as any).checkAndRefreshAccessToken([
        "files.metadata.read",
        "files.content.read",
        "files.content.write",
    ]);

    accessToken = auth.getAccessToken();
    refreshToken = auth.getRefreshToken();

    sessionData = {
        username: username,
        accessToken: encryptString(accessToken, encryptionKey),
        refreshToken: encryptString(refreshToken, encryptionKey),
    };
    // set http-only cookie with username, encrypted access token and encrypted refresh token
    response.setHeader(
        "Set-Cookie",
        `session=${JSON.stringify(
            sessionData
        )}; Max-Age=31536000; HttpOnly; Path=/; SameSite=Strict`
    );

    return response.status(200).json({
        accessToken: accessToken,
    });
}
