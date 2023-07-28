import CryptoJS from "crypto-js";
import axios from "axios";
import { DropboxAuthOptions } from "dropbox";
import fetch from "isomorphic-fetch";

interface User {
    username: string;
    id: number;
}

export function generateEncryptionKey(
    secretKey: string,
    userId: string
): string {
    const salt = CryptoJS.enc.Utf8.parse(userId);
    const keySize = 256 / 32; // 256-bit key
    const iterations = 10000; // number of iterations
    const key: CryptoJS.lib.WordArray = CryptoJS.PBKDF2(secretKey, salt, {
        keySize,
        iterations,
    });
    return key.toString(CryptoJS.enc.Base64);
}
export async function getUser(apiKey: string): Promise<User> {
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
    return user;
}

export function encryptString(
    plainText: string,
    encryptionKey: string
): string {
    const cipherText = CryptoJS.AES.encrypt(
        plainText,
        encryptionKey
    ).toString();
    return cipherText;
}

export function decryptString(
    cipherText: string,
    encryptionKey: string
): string {
    const bytes = CryptoJS.AES.decrypt(cipherText, encryptionKey);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    return originalText;
}

export const config: DropboxAuthOptions = {
    fetch,
    clientId: process.env.DROPBOX_CLIENT_ID,
    clientSecret: process.env.DROPBOX_CLIENT_SECRET,
};
