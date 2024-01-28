import { Marker } from './Types';

export default class MarkerMap extends Map<Marker["id"], Marker> {

    private readonly comparator;
    private orderedValuesCached: ReadonlyArray<Marker> | null = null;

    public constructor(comparator: (m1: Marker, m2: Marker) => number) {
        super();
        this.comparator = comparator;
    }

    public orderedValues(): ReadonlyArray<Marker> {
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

    public override delete(key: Marker["id"]): boolean {
        this.orderedValuesCached = null;
        return super.delete(key);
    }

    public override set(key: Marker["id"], value: Marker): this {
        this.orderedValuesCached = null;
        return super.set(key, value);
    }

    public add(value: Marker): this {
        this.orderedValuesCached = null;
        return super.set(value.id, value);
    }

}
