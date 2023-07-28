import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Dropbox, DropboxAuth, DropboxAuthOptions } from "dropbox";
import axios from "axios";
import { encryptString, generateEncryptionKey, getUser, config } from "./_util";



export default async function handler(
    request: VercelRequest,
    response: VercelResponse
) {
    try {
        const redirectUri = process.env.DROPBOX_REDIRECT_URI;
        if (!redirectUri) {
            console.error("Missing DROPBOX_REDIRECT_URI env var");
            response.status(500).json({
                error: "Configuration Error",
            });
            return;
        }
        const secretKey = process.env.SECRET_KEY;
        if (!secretKey) {
            response.status(500).json({
                error: "Configuration Error",
            });
            return;
        }
    
        const user = await getUser(request.query.apikey as string);
    
        const code = request.query.code as string;
        const auth = new DropboxAuth(config);
    
        const resp = await auth.getAccessTokenFromCode(redirectUri, code);
    
        const accessToken = (resp.result as any).access_token;
        const refreshToken = (resp.result as any).refresh_token;
        const encryptionKey = generateEncryptionKey(secretKey, user.username);
    
        const sessionData = {
            username: user.username,
            accessToken: encryptString(accessToken, encryptionKey),
            refreshToken: encryptString(refreshToken, encryptionKey),
        }
        // set http-only cookie with username, encrypted access token and encrypted refresh token
        response.setHeader(
            "Set-Cookie",
            `session=${JSON.stringify(sessionData)}; Max-Age=31536000; HttpOnly; Path=/; SameSite=Strict`
        );
    
        return response.status(200).json({
            accessToken,
        });
    } catch (e: any) {
        console.error(JSON.stringify(e.response.data, null, 2));
        response.status(500).json({
            error: "Internal Server Error",
        });
    }
}
