export class ErrorFactory {
    private cursor = 0
    constructor(private pattern: Array<any>) {}

    error(): any {
        if (this.pattern.length == 0) {
            return null
        }
        const error = this.pattern[this.cursor]
        this.cursor = (this.cursor + 1) % this.pattern.length
        return error
    }
}
