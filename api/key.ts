import type { VercelRequest, VercelResponse } from "@vercel/node";
import axios from "axios";
import CryptoJS from "crypto-js";

interface User {
    username: string;
    id: number;
}

function generateEncryptionKey(secretKey: string, userId: string): string {
    const cipherText = CryptoJS.AES.encrypt(userId, secretKey).toString();
    return cipherText;
}

const getEncryptionKey = async (secretKey: string, apiKey: string): Promise<string> => {
    const response = await axios.get(
        "https://stablehorde.net/api/v2/find_user",
        {
            headers: {
                accept: "application/json",
                "Client-Agent": "unknown:0:unknown",
                apikey: apiKey,
            },
        }
    );

    const user: User = response.data;
    const encryptionKey = generateEncryptionKey(secretKey, user.id.toString());
    return encryptionKey;
};

export default async function handler(
    request: VercelRequest,
    response: VercelResponse
) {
    const secretKey = process.env.SECRET_KEY;
    if (!secretKey) {
        response.status(500).json({
            error: "Missing SECRET_KEY env var",
        });
        return;
    }
    const encryptionKey = getEncryptionKey(secretKey, request.query.apikey as string);
    response.status(200).json({
        encryptionKey,
    });
}