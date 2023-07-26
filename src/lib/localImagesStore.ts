import moment from "moment";

import { LocalImage } from "./models";
import { convertImageFormat, createEncodedThumbnail, getImageFormat } from "./imageutil";

/**
 * This class uses indexedDB to store images locally.
 */
export class LocalImagesStore {
    private db: IDBDatabase | null = null;

    constructor(private dbName="aibrush") {
    }

    init(): Promise<void> {
        console.log("Initializing local images store")
        return new Promise((resolve, reject) => {
            console.log("Opening indexeddb")
            const request = indexedDB.open(this.dbName, 4);
            request.onupgradeneeded = (evt) => {
                console.log("Upgrading local images store")
                const db = request.result;
                // create object store if it doesn't exist
                // const imagesStore = db.createObjectStore("images", { keyPath: "id" });
                let imagesStore: IDBObjectStore;
                if (!db.objectStoreNames.contains("images")) {
                    imagesStore = db.createObjectStore("images", {
                        keyPath: "id",
                    });
                } else {
                    imagesStore = request.transaction?.objectStore(
                        "images"
                    ) as IDBObjectStore;
                }
                imagesStore.createIndex("updated_at", "updated_at", {
                    unique: false,
                });
                imagesStore.createIndex("deleted_at", "deleted_at", {
                    unique: false,
                });
                console.log("Local images store updated");
            };
            request.onsuccess = (_) => {
                this.db = request.result;
                console.log("Local images store initialized");
                resolve();
            };
            request.onerror = (evt) => {
                console.error("error opening indexeddb", evt);
                reject(evt);
            };
            request.onblocked = (evt) => {
                console.error("indexeddb blocked", evt);
                reject(evt);
            };
        });
    }

    // migrate old images to new format
    private hydrateImage(image: LocalImage): LocalImage {
        if (!image) {
            return image;
        }
        if (!image.params) {
            const legacyImage = image as any;
            image.params = {
                prompt: legacyImage.phrases.join(", "),
                negative_prompt: legacyImage.negative_phrases.join(", "),
                width: legacyImage.width,
                height: legacyImage.height,
                denoising_strength: legacyImage.stable_diffusion_strength,
                steps: legacyImage.iterations,
            }
        }
        if (!image.format) {
            if (image.imageData) {
                image.format = image.imageData.startsWith("data:image/webp") ? "webp" : "png";
            } else {
                image.format = "png";
            }
        }
        return image;
    }

    async getImage(id: string): Promise<LocalImage | null> {
        if (!this.db) {
            throw new Error("not initialized");
        }
        const transaction = this.db.transaction(["images"]);
        const store = transaction.objectStore("images");
        const request = store.get(id);
        return new Promise((resolve, reject) => {
            request.onsuccess = (evt) => {
                resolve(this.hydrateImage(request.result));
            };
            request.onerror = (evt) => {
                console.error("error getting image", evt);
                reject(evt);
            };
        });
    }

    async saveImage(image: LocalImage): Promise<void> {
        if (!this.db) {
            throw new Error("not initialized");
        }
        // make sure to save as webp
        if (image.imageData && getImageFormat(image.imageData) !== "webp") {
            image.imageData = await convertImageFormat(image.imageData, getImageFormat(image.imageData), "webp");
        }
        // create thumbnail if needed
        if (image.imageData && !image.thumbnailData) {
            image.thumbnailData = await createEncodedThumbnail(image.imageData);
        }
        await this.cleanupDeletedImages();
        const transaction = this.db.transaction(["images"], "readwrite");
        const store = transaction.objectStore("images");
        const request = store.put({
            ...image,
            updated_at: moment().valueOf(),
        });
        return new Promise((resolve, reject) => {
            request.onsuccess = (evt) => {
                resolve();
            };
            request.onerror = (evt) => {
                console.error("error saving image", evt);
                reject(evt);
            };
        });
    }

    async hardDeleteImage(id: string): Promise<void> {
        if (!this.db) {
            throw new Error("not initialized");
        }
        const transaction = this.db.transaction(["images"], "readwrite");
        const store = transaction.objectStore("images");
        const request = store.delete(id);
        return new Promise((resolve, reject) => {
            request.onsuccess = (evt) => {
                console.log(`image ${id} permanently deleted`);
                resolve();
            };
            request.onerror = (evt) => {
                console.error("error deleting image", evt);
                reject(evt);
            };
        });
    }

    async deleteImage(id: string): Promise<void> {
        if (!this.db) {
            throw new Error("not initialized");
        }
        // fetch the image first. If it has a deletedAt timestamp already, or if it's not
        // in "completed" state, hard delete it. Otherwise, set the deletedAt timestamp.
        const image = await this.getImage(id);
        if (!image) {
            console.error("image not found", id);
            return;
        }
        if (image.deleted_at || image.status !== "completed") {
            return this.hardDeleteImage(id);
        }
        const transaction = this.db.transaction(["images"], "readwrite");
        const store = transaction.objectStore("images");
        const request = store.put({
            ...image,
            deleted_at: moment().valueOf(),
        });
        return new Promise((resolve, reject) => {
            request.onsuccess = (evt) => {
                resolve();
            };
            request.onerror = (evt) => {
                console.error("error deleting image", evt);
                reject(evt);
            };
        });
    }

    async listImages(
        updated_at: number,
        direction: IDBCursorDirection,
        count: number,
        search: string
    ): Promise<LocalImage[]> {
        // use updated_at index
        if (!this.db) {
            throw new Error("not initialized");
        }
        const transaction = this.db.transaction(["images"]);
        const store = transaction.objectStore("images");
        const index = store.index("updated_at");
        const range =
            direction == "next"
                ? IDBKeyRange.lowerBound(updated_at)
                : IDBKeyRange.upperBound(updated_at);
        const request = index.openCursor(range, direction);
        return new Promise((resolve, reject) => {
            const images: LocalImage[] = [];
            request.onsuccess = (evt) => {
                const cursor = request.result;
                if (cursor) {
                    const image: LocalImage = this.hydrateImage(cursor.value);
                    const prompt = (image.params.prompt || "").toLowerCase();
                    if (
                        !image.deleted_at &&
                        (!search || prompt.includes(search.toLowerCase()))
                    ) {
                        if (image.thumbnailData) {
                            delete image.imageData;
                        }
                        images.push(image);
                    }
                    if (images.length < count) {
                        cursor.continue();
                    } else {
                        resolve(images);
                    }
                } else {
                    resolve(images);
                }
            };
            request.onerror = (evt) => {
                console.error("error listing images", evt);
                reject(evt);
            };
        });
    }

    async clearImages(): Promise<void> {
        // clear from both indexes
        if (!this.db) {
            throw new Error("not initialized");
        }
        const transaction = this.db.transaction(["images"], "readwrite");
        const imagesStore = transaction.objectStore("images");
        const imagesRequest = imagesStore.clear();
        return new Promise((resolve, reject) => {
            imagesRequest.onsuccess = (evt) => {
                resolve();
            };
            imagesRequest.onerror = (evt) => {
                console.error("error clearing images", evt);
                reject(evt);
            };
        });
    }

    async getDeletedImages(olderThan?: number): Promise<LocalImage[]> {
        if (!this.db) {
            throw new Error("not initialized");
        }
        // refactor to use deleted_at index
        const transaction = this.db.transaction(["images"]);
        const store = transaction.objectStore("images");
        const index = store.index("deleted_at");
        // const request = index.openCursor();
        // get cursor for all deleted_at values
        const request = index.openCursor(
            olderThan
                ? IDBKeyRange.upperBound(olderThan)
                : IDBKeyRange.lowerBound(1),
            olderThan ? "prev" : "next"
        );
        return new Promise((resolve, reject) => {
            const images: LocalImage[] = [];
            request.onsuccess = (evt) => {
                const cursor = request.result;
                if (cursor) {
                    const image: LocalImage = cursor.value;
                    if (images.length < 50 && image.deleted_at) {
                        images.push(cursor.value);
                    }
                    cursor.continue();
                } else {
                    resolve(images);
                }
            };
            request.onerror = (evt) => {
                console.error("error listing images", evt);
                reject(evt);
            };
        });
    }

    async clearDeletedImages(): Promise<void> {
        if (!this.db) {
            throw new Error("not initialized");
        }
        let deletedImages = await this.getDeletedImages();
        while (deletedImages.length > 0) {
            // hard delete all deleted images
            const promises = deletedImages.map((image) => {
                return this.hardDeleteImage(image.id);
            });
            await Promise.all(promises);
            deletedImages = await this.getDeletedImages();
        }
    }

    async cleanupDeletedImages(): Promise<void> {
        // delete images that are more than 1 day old
        let deletedImages = await this.getDeletedImages(
            moment().subtract(1, "hours").valueOf()
        );
        while (deletedImages.length > 0) {
            // hard delete all deleted images
            const promises = deletedImages.map((image) => {
                return this.hardDeleteImage(image.id);
            });
            await Promise.all(promises);
            deletedImages = await this.getDeletedImages(
                moment().subtract(1, "hours").valueOf()
            );
        }
    }
}
