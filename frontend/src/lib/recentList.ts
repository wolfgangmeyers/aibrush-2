export class RecentList {
    private key: string;
    private listSize: number;

    constructor(key: string, listSize: number) {
        this.key = key;
        this.listSize = listSize;
    }

    private getRecentItems(): string[] {
        const modelsJson = localStorage.getItem(this.key);
        return modelsJson ? JSON.parse(modelsJson) : [];
    }

    private saveRecentItems(models: string[]): void {
        localStorage.setItem(this.key, JSON.stringify(models));
    }

    addItem(model: string): (string | undefined) {
        const recentModels = this.getRecentItems();
        const modelIndex = recentModels.indexOf(model);

        if (modelIndex !== -1) {
            recentModels.splice(modelIndex, 1);
        }

        recentModels.unshift(model);

        let removed: string | undefined;
        if (recentModels.length > this.listSize) {
            removed = recentModels.pop();
        }

        this.saveRecentItems(recentModels);
        return removed;
    }

    getItems(): string[] {
        return this.getRecentItems();
    }
}

export const recentModels = new RecentList("recent-models", 20);
export const recentNegativePrompts = new RecentList("recent-negative-prompts", 20);
export const recentPrompts = new RecentList("recent-positive-prompts", 20);
export const recentLoras = new RecentList("recent-loras", 20);