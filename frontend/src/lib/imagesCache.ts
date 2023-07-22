
import { AIBrushApi, Image } from "../client";
import { KVStore } from "./kvstore";

export class ImagesCache {

    private kvstore: KVStore<Image>;

    constructor() {
        this.kvstore = new KVStore<Image>({
            dbName: "saved-images",
            storeName: "images",
        });
    }

    async listImages(api: AIBrushApi, cursor: number, search: string, limit: number, order: "asc" | "desc"): Promise<Image[] | undefined> {
        const resp = await api.listImages(cursor, search, limit, order, "id,updated_at,deleted_at");
        if (!resp.data.images) {
            return undefined;
        }

        const result: Image[] = [];
        const batchGetIds: string[] = [];
        for (const image of resp.data.images) {
            if (image.deleted_at) {
                await this.kvstore.deleteItem(image.id);
            } else {
                const savedImage = await this.kvstore.getItem(image.id);
                if (savedImage && savedImage.updated_at === image.updated_at) {
                    result.push(savedImage);
                } else {
                    batchGetIds.push(image.id);
                }
            }
        }
        if (batchGetIds.length > 0) {
            const batchResult = await api.batchGetImages(undefined, {
                ids: batchGetIds,
            });
            if (batchResult.data.images) {
                for (const image of batchResult.data.images) {
                    await this.kvstore.setItem(image.id, image);
                    result.push(image);
                }
            }
        }
        return result;
    }
}