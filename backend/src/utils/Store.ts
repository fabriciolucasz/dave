export class Store<V> {
    protected readonly cache = new Map<string, V>();

    public set(key: string, value: V): void {
        this.cache.set(key, value);
    }

    public get(key: string): V | undefined {
        return this.cache.get(key);
    }

    public has(key: string): boolean {
        return this.cache.has(key);
    }

    public delete(key: string): boolean {
        return this.cache.delete(key);
    }

    public clear(): void {
        this.cache.clear();
    }

    public get size(): number {
        return this.cache.size;
    }
}
