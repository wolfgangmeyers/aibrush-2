import { Dropbox, DropboxAuth, DropboxResponse } from "dropbox";
import { Buffer } from "buffer";
import { LocalImage } from "./models";
import axios from "axios";

const CLIENT_ID = "hcm3qw3zetwsrzg";

class DropboxHelper {
    private dropbox?: Dropbox;
    private dropboxAuth: DropboxAuth;
    private refreshHandle?: number;

    constructor(private apiKey: string) {
        this.dropboxAuth = new DropboxAuth({ clientId: CLIENT_ID });
    }

    async init() {
        try {
            const resp = await axios.post("/api/refresh");
            const accessToken = (resp.data as any).accessToken;
            if (accessToken) {
                this.dropbox = new Dropbox({
                    clientId: CLIENT_ID,
                    accessToken,
                });
                await this.dropbox?.filesListFolder({ path: "" });

                // refresh access token every 10 minutes
                this.refreshHandle = window.setInterval(async () => {
                    const resp = await axios.get("/api/refresh");
                    const accessToken = (resp.data as any).accessToken;
                    if (accessToken) {
                        this.dropbox = new Dropbox({
                            clientId: CLIENT_ID,
                            accessToken,
                        });
                    }
                }, 10 * 60 * 1000);
            }
        } catch (e) {
            console.error("DropboxHelper init error", e);
            this.dropbox = undefined;
        }
    }

    destroy() {
        if (this.refreshHandle) {
            window.clearInterval(this.refreshHandle);
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
        const authUrl = await this.dropboxAuth.getAuthenticationUrl(
            this.redirectUri(),
            undefined,
            "code",
            "offline",
            [
                "files.metadata.read",
                "files.content.read",
                "files.content.write",
            ],
            undefined,
            false
        );
        window.location.href = authUrl.toString();
    }

    async handleRedirect() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get("code");
        if (code) {
            const resp = await axios.post("/api/auth?code=" + code + "&apikey=" + this.apiKey);
            const accessToken = (resp.data as any).accessToken;
            this.dropbox = new Dropbox({
                clientId: CLIENT_ID,
                accessToken,
            });
        }
    }

    async disconnect() {
        await axios.post("/api/unauth");
        this.dropbox = undefined;
        localStorage.removeItem("dropbox.access_token");
    }

    async listRemoteImages(): Promise<string[]> {
        if (!this.dropbox) {
            throw new Error("Not authorized");
        }
        // remote image data files will be in the form of <image id>.json
        // list json files and parse the image id from the filename
        // and return those
        let resp = await this.dropbox.filesListFolder({
            path: "",
        });
        let remoteImages: string[] = resp.result.entries
            .filter((e) => e.name.endsWith(".json"))
            .map((e) => e.name.replace(".json", ""));
        while (resp.result.has_more) {
            resp = await this.dropbox.filesListFolderContinue({
                cursor: resp.result.cursor,
            });
            remoteImages = remoteImages.concat(
                resp.result.entries
                    .filter((e) => e.name.endsWith(".json"))
                    .map((e) => e.name.replace(".json", ""))
            );
        }
        return remoteImages;
    }

    async uploadImage(image: LocalImage) {
        if (!this.dropbox) {
            throw new Error("Not authorized");
        }
        const imageDataUrl = image.imageData!;
        const imageData = imageDataUrl.split(",")[1];
        const imageBuffer = Buffer.from(imageData, "base64");
        const imageId = image.id;
        // const imageFileName = `${imageId}.${image.format || "webp"}`;
        const imageFileName = `${imageId}_${image.format || "webp"}`;
        const imageMetaFileName = `${imageId}.json`;

        await this.dropbox.filesUpload({
            path: `/${imageFileName}`,
            contents: imageBuffer,
            mode: { ".tag": "overwrite" },
        });
        await this.dropbox.filesUpload({
            path: `/${imageMetaFileName}`,
            contents: JSON.stringify({
                ...image,
                imageData: undefined,
                thumbnailData: undefined,
            }),
            mode: { ".tag": "overwrite" },
        });
    }

    // temporarily work around a strange dropbox issue
    async imageNameHack(image: LocalImage): Promise<void> {
        if (!this.dropbox) {
            throw new Error("Not authorized");
        }
        const oldImagePath = `${image.id}.${image.format || "webp"}`;
        const newImagePath = `${image.id}_${image.format || "webp"}`;

        // if the old path exists, rename it to the new path
        try {
            // does it exist?
            await this.dropbox.filesGetMetadata({
                path: `/${oldImagePath}`,
            });
            await this.dropbox.filesMoveV2({
                from_path: `/${oldImagePath}`,
                to_path: `/${newImagePath}`,
            });
        } catch (e) {
            // if the old path doesn't exist, do nothing
        }
    }

    async downloadImage(imageId: string): Promise<LocalImage> {
        if (!this.dropbox) {
            throw new Error("Not authorized");
        }
        const imageMetaFileName = `${imageId}.json`;
        const jsonResult = (await this.dropbox.filesDownload({
            path: `/${imageMetaFileName}`,
        })).result;
        const jsonBlob = (jsonResult as any).fileBlob;
        const jsonBuffer = await new Response(jsonBlob).arrayBuffer();
        const image = JSON.parse(
            Buffer.from(jsonBuffer).toString()
        ) as LocalImage;

        // work around strange dropbox issue
        // const imageFileName = `${imageId}.${image.format || "webp"}}`;
        await this.imageNameHack(image);
        const imageFileName = `${imageId}_${image.format || "webp"}`;
        const imageResult = (await this.dropbox.filesDownload({
            path: `/${imageFileName}`,
        })).result;
        // fileBlob field is not in the typescript definition for some reason
        const imageBlob = (imageResult as any).fileBlob;
        const imageBuffer = await new Response(imageBlob).arrayBuffer();
        const imageDataUrl = `data:image/${image.format || "webp"};base64,${Buffer.from(
            imageBuffer
        ).toString("base64")}`;

        image.imageData = imageDataUrl;
        return image;
    }

    async deleteImage(image: LocalImage) {
        if (!this.dropbox) {
            throw new Error("Not authorized");
        }
        // const imageFileName = `${image.id}.${image.format || "webp"}`;
        await this.imageNameHack(image);
        const imageFileName = `${image.id}_${image.format || "webp"}`;
        const imageMetaFileName = `${image.id}.json`;

        await this.dropbox.filesDeleteV2({
            path: `/${imageFileName}`,
        });
        await this.dropbox.filesDeleteV2({
            path: `/${imageMetaFileName}`,
        });
    }
}

export default DropboxHelper;
