export class Cooldown {
    private readonly map = new Map<string, number>();

    constructor(private readonly duration: number) {}

    public check(key: string): boolean {
        const now = Date.now();
        const expiration = this.map.get(key);

        if (expiration && now < expiration) {
            return false;
        }

        this.map.set(key, now + this.duration);
        return true;
    }

    public getRemaining(key: string): number {
        const now = Date.now();
        const expiration = this.map.get(key);

        if (!expiration || now >= expiration) {
            return 0;
        }

        return expiration - now;
    }

    public delete(key: string): void {
        this.map.delete(key);
    }

    public clear(): void {
        this.map.clear();
    }
}
