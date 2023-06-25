import { Item } from "./civit_loras";
import { KVStore } from "./kvstore";
import { recentLoras as recentList } from "./recentList";

export class RecentLoras {
    private kvstore: KVStore<Item>;

    constructor() {
        this.kvstore = new KVStore<Item>({
            dbName: "saved-loras",
            storeName: "loras",
        });
    }

    async listRecentLoras(): Promise<Item[]> {
        const recentLoraIDs = recentList.getItems();
        const result: Item[] = [];
        for (const loraID of recentLoraIDs) {
            const savedLora = await this.kvstore.getItem(loraID);
            if (savedLora) {
                result.push(savedLora);
            }
        }
        return result;
    }

    async getLora(loraID: string): Promise<Item | null> {
        return await this.kvstore.getItem(loraID);
    }

    async addLora(lora: Item): Promise<void> {
        const loraId = lora.name;
        await this.kvstore.setItem(loraId, lora);
        const removed = recentList.addItem(loraId);
        if (removed) {
            await this.kvstore.deleteItem(removed);
        }
    }
}

export const recentLoras = new RecentLoras();