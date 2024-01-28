import {Marker} from './Plugin';

export default class MarkerMap extends Map<Marker["id"], Marker> {

    private orderedValuesCached: ReadonlyArray<Marker> | null = null;

    public orderedValues(): ReadonlyArray<Marker> {
        if (this.orderedValuesCached !== null) {
            return this.orderedValuesCached;
        } else {
            return Array.from(this.values()).sort(MarkerMap.compareMarkers);
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

    private static compareMarkers(m1: Marker, m2: Marker) {
        return m1.time - m2.time;
    }

}
