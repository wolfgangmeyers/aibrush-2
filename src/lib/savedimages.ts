import axios from "axios";
import { Image } from "./models";

export function getManifestId(): string | undefined {
    let manifestId: string | undefined =
        localStorage.getItem("manifest_id") || undefined;
    if (manifestId) {
        return manifestId;
    }
    const urlParams = new URLSearchParams(window.location.search);
    manifestId = urlParams.get("manifest_id") || undefined;
    if (manifestId) {
        localStorage.setItem("manifest_id", manifestId);
    }
    return manifestId;
}

export function deleteManifestId(): void {
    localStorage.removeItem("manifest_id");
}

export interface ImageList {
    images: Image[];
    nextCursor?: string;
}

export class ImageClient {
    baseUrl: string;
    manifestId: string | undefined;
    manifest: { imageIds: string[] } | null = null;

    constructor(baseUrl: string, manifestId: string | undefined) {
        this.baseUrl = baseUrl;
        this.manifestId = manifestId;
    }

    async init(): Promise<void> {
        if (!this.manifest && this.manifestId) {
            try {
                const response = await axios.get(
                    `${this.baseUrl}/${this.manifestId}.json`
                );
                this.manifest = response.data as { imageIds: string[] };
            } catch (e: any) {
                console.error(e);
            }
        }
    }

    async listImages(query: {
        cursor?: string;
        limit?: number;
        filter?: string;
    }): Promise<ImageList> {
        if (!this.manifest) {
            return {
                images: [],
            };
        }

        const { cursor = "", limit = 10, filter = "" } = query;
        const imageIds = this.manifest.imageIds;
        let startIndex = cursor ? imageIds.indexOf(cursor) + 1 : 0;

        if (startIndex === -1 || startIndex > imageIds.length) {
            throw new Error("Invalid cursor");
        }

        let images: Image[] = [];
        let nextCursor: string | undefined = undefined;

        while (images.length < limit && startIndex < imageIds.length) {
            let endIndex = startIndex + (limit - images.length);
            let selectedImageIds = imageIds.slice(startIndex, endIndex);

            // Load the images from S3
            let fetchedImages = await Promise.all(
                selectedImageIds.map((id) => this.loadImage(id))
            );

            // Filter images
            let filteredImages = fetchedImages.filter((image) =>
                (image.params.prompt || "")
                    .toLowerCase()
                    .includes(filter.toLowerCase())
            );

            images = [...images, ...filteredImages];
            startIndex = endIndex;
            nextCursor = imageIds[endIndex];
        }

        return {
            images,
            nextCursor,
        };
    }

    async loadImage(imageId: string): Promise<Image> {
        const response = await axios.get(`${this.baseUrl}/${imageId}.json`);
        return response.data;
    }
}
