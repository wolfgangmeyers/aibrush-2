import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Dropbox, DropboxAuth, DropboxAuthOptions } from "dropbox";
import axios from "axios";
import { decryptString, encryptString, generateEncryptionKey } from "./_util";

const redirectUri = process.env.DROPBOX_REDIRECT_URI;

// export default async function handler(
//     request: VercelRequest,
//     response: VercelResponse
// ) {
//     console.log("auth.handler")
//     try {
//         const redirectUri = process.env.DROPBOX_REDIRECT_URI;
//         if (!redirectUri) {
//             console.error("Missing DROPBOX_REDIRECT_URI env var");
//             response.status(500).json({
//                 error: "Configuration Error",
//             });
//             return;
//         }
//         const secretKey = process.env.SECRET_KEY;
//         if (!secretKey) {
//             response.status(500).json({
//                 error: "Configuration Error",
//             });
//             return;
//         }
    
//         const user = await getUser(request.query.apikey as string);
    
//         const code = request.query.code as string;
//         const auth = new DropboxAuth(config);
    
//         const resp = await auth.getAccessTokenFromCode(redirectUri, code);
//         console.log("getAccessTokenFromCode resp", JSON.stringify(resp, null, 2));
    
//         const accessToken = (resp.result as any).access_token;
//         const refreshToken = (resp.result as any).refresh_token;
//         const encryptionKey = generateEncryptionKey(secretKey, user.username);
    
//         const sessionData = {
//             username: user.username,
//             accessToken: encryptString(accessToken, encryptionKey),
//             refreshToken: encryptString(refreshToken, encryptionKey),
//         }
//         // set http-only cookie with username, encrypted access token and encrypted refresh token
//         response.setHeader(
//             "Set-Cookie",
//             `session=${JSON.stringify(sessionData)}; Max-Age=31536000; HttpOnly; Path=/; SameSite=Strict`
//         );
    
//         response.status(200).json({
//             accessToken,
//         });
//     } catch (e: any) {
//         console.error(JSON.stringify(e.response.data, null, 2));
//         response.status(500).json({
//             error: "Internal Server Error",
//         });
//     }
//     console.log("auth.handler done")
// }

export default async function handler(
    request: VercelRequest,
    response: VercelResponse
) {
    const secretKey = process.env.SECRET_KEY;
    if (!secretKey) {
        console.error("Missing SECRET_KEY env var")
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
    }
    // set http-only cookie with username, encrypted access token and encrypted refresh token
    response.setHeader(
        "Set-Cookie",
        `session=${JSON.stringify(sessionData)}; Max-Age=31536000; HttpOnly; Path=/; SameSite=Strict`
    );

    return response.status(200).json({
        accessToken: accessToken,
    });
}
