
export interface ScalingEngine {
    capacity(): Promise<number>;
    scale(activeOrders: number): Promise<number>;
    cleanup(): Promise<void>;
}

export class FakeScalingEngine implements ScalingEngine {

    _scale: number = -1;
    returnScale: number = -1;

    constructor(
        private _capacity: number,
    ) {
    }

    async capacity(): Promise<number> {
        return this._capacity;
    }

    async scale(activeOrders: number): Promise<number> {
        this._scale = activeOrders;
        if (this.returnScale > -1) {
            return this.returnScale;
        }
        return activeOrders;
    }

    async cleanup(): Promise<void> {
        return;
    }
}
