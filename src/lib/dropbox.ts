import { Dropbox, DropboxAuth } from 'dropbox';
import CryptoJS from 'crypto-js';
import { Buffer } from "buffer";

const CLIENT_ID = "hcm3qw3zetwsrzg";

function fixCode(code: string): string {
    return code.replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '')
}

class DropboxHelper {
    private dropbox?: Dropbox;
    private dropboxAuth: DropboxAuth;

    constructor() {
        // get hostname from window
        this.dropboxAuth = new DropboxAuth({ clientId: CLIENT_ID });
    }

    async init() {
        const accessToken = localStorage.getItem('dropbox.access_token');
        if (accessToken) {
            this.dropbox = new Dropbox({
                clientId: CLIENT_ID,
                accessToken,
            });
        }
        try {
            await this.dropbox?.filesListFolder({ path: '' });
        } catch (e) {
            console.error("DropboxHelper init error", e);
            this.dropbox = undefined;
            localStorage.removeItem('dropbox.access_token');
        }
    }

    private redirectUri(): string {
        const protocol = window.location.protocol;
        const host = window.location.host;
        return `${protocol}//${host}/dropbox`;
    }

    // TODO: store access token and expiration (expires built in?) to local storage
    isAuthorized(): boolean {
        return !!this.dropbox;
    }

    async initiateAuth() {
        const authUrl = await this.dropboxAuth.getAuthenticationUrl(this.redirectUri(), undefined, 'code', 'online', ['files.metadata.read', 'files.content.read', 'files.content.write'], undefined, true);
        localStorage.setItem("codeVerifier", this.dropboxAuth.getCodeVerifier());
        window.location.href = authUrl.toString();
    }

    async handleRedirect() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        if (code) {
            const codeVerifier = localStorage.getItem('codeVerifier');
            if (!codeVerifier) {
                throw new Error('Code verifier not found');
            }
            console.log("codeVerifier", codeVerifier);
            this.dropboxAuth.setCodeVerifier(codeVerifier);
            const token = await this.dropboxAuth.getAccessTokenFromCode(this.redirectUri(), code);
            this.dropbox = new Dropbox({
                clientId: CLIENT_ID,
                accessToken: (token.result as any).access_token,
            });

            localStorage.removeItem('codeVerifier');  // clear code verifier after usage
            return this.dropbox;
        }
    }
}

export default DropboxHelper;
