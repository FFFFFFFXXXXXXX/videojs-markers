export default class OrderedMap<K, V> extends Map<K, V> {

    private readonly comparator;

    public constructor(comparator: (v1: V, v2: V) => number) {
        super();
        this.comparator = comparator;
    }

    public orderedValues(): Array<V> {
        return Array.from(this.values()).sort(this.comparator)
    }

}
