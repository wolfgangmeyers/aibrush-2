
import { KVStore } from "./kvstore";
import { ImageClient } from "./savedimages";
import { Image } from "./models";

export class ImagesCache {

    private kvstore: KVStore<Image>;

    constructor() {
        this.kvstore = new KVStore<Image>({
            dbName: "saved-images",
            storeName: "images",
        });
    }

    async listImages(imageClient: ImageClient, cursor: string | undefined, search: string, limit: number): Promise<Image[] | undefined> {
        const resp = await imageClient.listImages({
            cursor,
            limit,
            filter: search,
        });

        const result: Image[] = [];
        const batchGetIds: string[] = [];
        for (const image of resp.images) {
            const savedImage = await this.kvstore.getItem(image.id);
            if (savedImage && savedImage.updated_at === image.updated_at) {
                result.push(savedImage);
            } else {
                await this.kvstore.setItem(image.id, image);
            }
        }
        return result;
    }
}