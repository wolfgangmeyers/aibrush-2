import CryptoJS from 'crypto-js';

export function encryptString(plainText: string, encryptionKey: string): string {
    const cipherText = CryptoJS.AES.encrypt(plainText, encryptionKey).toString();
    return cipherText;
}

export function decryptString(cipherText: string, encryptionKey: string): string {
    const bytes = CryptoJS.AES.decrypt(cipherText, encryptionKey);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    return originalText;
}
