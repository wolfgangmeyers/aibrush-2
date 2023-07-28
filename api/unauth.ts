import { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
    request: VercelRequest,
    response: VercelResponse
) {
    response.setHeader(
        "Set-Cookie",
        `session=; Max-Age=31536000; HttpOnly; Path=/; SameSite=Strict`
    );
    return response.status(200).json({
        message: "Logged out",
    });
}