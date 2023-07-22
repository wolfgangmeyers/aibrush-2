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
        this.migrateToIDs();
    }

    async migrateToIDs(): Promise<void> {
        console.log("migrateToIDs");
        const recentLoras = recentList.getItems();
        let migrateRequired = false;
        for (let id of recentLoras) {
            console.log("id", id);
            // is id formatted as an integer?
            if (!id.match(/^\d+$/)) {
                migrateRequired = true;
                break;
            }
        }
        if (migrateRequired) {
            console.log("one-time migration of recent loras to int keys");
            recentList.clear();
            recentLoras.reverse();
            for (const name of recentLoras) {
                const lora = await this.kvstore.getItem(name);
                if (lora) {
                    recentList.addItem(lora.id.toString());
                    await this.kvstore.deleteItem(name);
                    await this.kvstore.setItem(lora.id.toString(), lora);
                }
            }
        }
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
        console.log("getLora", loraID);
        return await this.kvstore.getItem(loraID);
    }

    async addLora(lora: Item): Promise<void> {
        const loraId = lora.id.toString();
        await this.kvstore.setItem(loraId, lora);
        const removed = recentList.addItem(loraId);
        if (removed) {
            await this.kvstore.deleteItem(removed);
        }
    }
}

export const recentLoras = new RecentLoras();