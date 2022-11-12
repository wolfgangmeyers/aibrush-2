
export interface ScalingEngine {
    get maxAllocationPercentage(): number;
    capacity(): Promise<number>;
    scale(activeOrders: number): Promise<number>;
}

export class FakeScalingEngine implements ScalingEngine {

    _scale: number = -1;
    returnScale: number = -1;

    constructor(
        private _maxAllocationPercentage: number,
        private _capacity: number,
    ) {
    }

    get maxAllocationPercentage(): number {
        return this._maxAllocationPercentage;
    }

    async capacity(): Promise<number> {
        return this._capacity;
    }

    async scale(activeOrders: number): Promise<number> {
        this._scale = activeOrders;
        if (this.returnScale) {
            return this.returnScale;
        }
        return activeOrders;
    }
}
