export default class OrderedMap<K, V> extends Map<K, V> {

    private readonly comparator;
    private orderedValuesCached: ReadonlyArray<V> | null = null;

    public constructor(comparator: (v1: V, v2: V) => number) {
        super();
        this.comparator = comparator;
    }

    public orderedValues(): ReadonlyArray<V> {
        if (this.orderedValuesCached !== null) {
            return this.orderedValuesCached;
        } else {
            return Array.from(this.values()).sort(this.comparator);
        }
    }

    public override clear() {
        this.orderedValuesCached = null;
        super.clear();
    }

    public override delete(key: K): boolean {
        this.orderedValuesCached = null;
        return super.delete(key);
    }

    public override set(key: K, value: V): this {
        this.orderedValuesCached = null;
        return super.set(key, value);
    }

}
