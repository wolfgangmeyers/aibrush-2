import { useState, useEffect } from "react";

export class SimpleCache {
    private storage: Storage;

    constructor() {
        this.storage = window.localStorage;
    }

    setItem(key: string, value: any, ttl = 60 * 60) {
        const item: {
            value: any;
            expiry: number;
        } = {
            value,
            expiry: Date.now() + ttl * 1000,
        };
        this.storage.setItem(key, JSON.stringify(item));
    }

    getItem(key: string): any {
        try {
            const itemStr = this.storage.getItem(key);
            if (!itemStr) {
                return null;
            }
    
            const item: {
                value: any;
                expiry: number;
            } = JSON.parse(itemStr);
            if (Date.now() > item.expiry) {
                this.storage.removeItem(key);
                return null;
            }
            return item.value;
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    removeItem(key: string) {
        this.storage.removeItem(key);
    }

    clear() {
        this.storage.clear();
    }
}

const cache = new SimpleCache();

export function useCache<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const cachedValue = cache.getItem(key);
    return cachedValue !== null ? cachedValue : initialValue;
  });

  useEffect(() => {
    cache.setItem(key, value);
  }, [key, value]);

  return [value, setValue];
}
