import moment from "moment"

export interface Clock {
    now(): moment.Moment
}

export class RealClock implements Clock {
    now(): moment.Moment {
        return moment()
    }
}

export class FakeClock implements Clock {
    _now: moment.Moment

    constructor(now: moment.Moment) {
        this._now = now
    }

    setNow(now: moment.Moment) {
        this._now = now
    }

    now(): moment.Moment {
        return this._now.clone()
    }
}
