export interface DBConfig {
    dbName: string;
    storeName: string;
};

export class KVStore<T> {
    private dbConfig: DBConfig;
    private db: IDBDatabase | null = null;

    constructor(dbConfig: DBConfig) {
        this.dbConfig = dbConfig;
    }

    private async createDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbConfig.dbName);

            request.onupgradeneeded = () => {
                const db = request.result;
                db.createObjectStore(this.dbConfig.storeName);
            };

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    private async getDB(): Promise<IDBDatabase> {
        if (!this.db) {
            this.db = await this.createDB();
        }
        return this.db;
    }


    async getItem(key: string): Promise<T | null> {
        const db = await this.getDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.dbConfig.storeName);
            const store = transaction.objectStore(this.dbConfig.storeName);
            const request = store.get(key);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                resolve(null);
            };
        });
    }

    async setItem(key: string, value: T): Promise<void> {
        const db = await this.getDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(
                this.dbConfig.storeName,
                "readwrite"
            );
            const store = transaction.objectStore(this.dbConfig.storeName);
            const request = store.put(value, key);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                resolve();
            };
        });
    }

    async deleteItem(key: string): Promise<void> {
        const db = await this.getDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(
                this.dbConfig.storeName,
                "readwrite"
            );
            const store = transaction.objectStore(this.dbConfig.storeName);
            const request = store.delete(key);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                resolve();
            };
        });
    }

    async getAllItems(): Promise<T[]> {
        const db = await this.getDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.dbConfig.storeName);
            const store = transaction.objectStore(this.dbConfig.storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                resolve([]);
            };
        });
    }
}
