import videojs from 'video.js';
import type Player from 'videojs/player';
import type Plugin from 'videojs/plugin';

import MarkerMap from "./MarkerMap";

export interface MarkerOptions {
    time: number,
    duration?: number,
    text?: string,
    class?: string,
}
export interface Id { readonly id: string}
export interface Marker extends MarkerOptions, Id {}

export type Settings = {
    markerStyle: Partial<CSSStyleDeclaration>,
    markerTip: Partial<HTMLElement> & {
        display: boolean,
        innerHtml: (marker: MarkerOptions) => string
    },
    onMarkerReached?: (marker: MarkerOptions) => void,
}

const BasePlugin = videojs.getPlugin('plugin') as typeof Plugin;

/**
 * To use the plugin you have to register it with videojs:
 *
 * ```ts
 * videojs.registerPlugin('markers', MarkersPlugin)
 * ```
 *
 * The name ('markers' in the example) you give the plugin shouldn't matter
 * unless there is already another plugin with the same name
 */
class MarkersPlugin extends BasePlugin {

    public static readonly VERSION = '1.1.0';

    private static readonly DEFAULT_SETTINGS: Settings = {
        markerStyle: {
            'width': '0.5rem',
            'borderRadius': '30%',
            'backgroundColor': 'red',
        },
        markerTip: {
            display: true,
            innerHtml: (marker: MarkerOptions) => `Break: ${marker.text}`,
        }
    };

    private readonly settings: Settings;
    private readonly markersMap: MarkerMap;
    private readonly markerTip: HTMLElement | null;

    private remainingMarkers = new Array<Marker>();
    private visitedMarkers = new Array<Marker>();

    private id = 0;

    private readonly debouncedFindRemainingMarkers: Function;

    constructor(player: Player, options: Settings) {
        super(player);

        this.settings = videojs.obj.merge(MarkersPlugin.DEFAULT_SETTINGS, options)
        this.markersMap = new MarkerMap();

        // create hover-textbox
        if (this.settings.markerTip.display) {
            this.markerTip = videojs.dom.createEl('div', {
                className: 'vjs-tip',
                innerHTML: '<div class="vjs-tip-arrow"></div><div class="vjs-tip-inner"></div>',
            }) as HTMLElement;
            this.player.$('.vjs-progress-holder')?.appendChild(this.markerTip);
        } else {
            this.markerTip = null;
        }

        if (this.settings.onMarkerReached) {
            this.player.on('timeupdate', this.checkIfMarkerReached.bind(this));
        }

        // adjust position of markers if the duration of the current video changes
        this.player.on('durationchange', this.updateMarkers.bind(this));

        // update visited/remaining markers when the user clicks somewhere in the progress bar
        this.debouncedFindRemainingMarkers = videojs.fn.debounce(this.findRemainingMarkers.bind(this), 500);
        this.player.on('seeked', this.debouncedFindRemainingMarkers.bind(this));
    }

    public getMarkers(): ReadonlyArray<Marker> {
        return this.markersMap.orderedValues();
    }

    /**
     * Go to the next marker from current timestamp.
     *
     * @returns true if successful and false if there is no next marker
     */
    public next(): boolean {
        const nextMarker = this.remainingMarkers.pop();
        if (nextMarker !== undefined) {
            this.player.currentTime(nextMarker.time);
            this.visitedMarkers.push(nextMarker);
            return true;
        } else {
            return false;
        }
    }

    /**
     * Go to previous marker from current timestamp.
     *
     * @returns true if successful and false if there is no previous marker
     */
    public prev(): boolean {
        const prevMarker = this.visitedMarkers.pop();
        if (prevMarker !== undefined) {
            this.player.currentTime(prevMarker.time);
            this.remainingMarkers.push(prevMarker);
            return true;
        } else {
            return false;
        }
    }

    /**
     * Create markers for all the given MarkerOptions and show them in the video progress bar.
     *
     * @param markers
     */
    public addAll(markers: Array<MarkerOptions>) {
        const progressHolder = this.player.$('.vjs-progress-holder');
        if (!progressHolder) {
            console.error('no progress-holder found')
            return;
        }

        for (const marker of markers.map(m => ({ ...m, id: this.newId() } as Marker))) {
            this.markersMap.add(marker);
            this.updateMarker(marker);
        }

        this.findRemainingMarkers();
    }

    /**
     * Unregister the plugin and clean up.
     */
    public override dispose(): void {
        this.markersMap.clear();
        if (this.settings.markerTip?.remove) {
            this.settings.markerTip.remove();
        }
        this.visitedMarkers.length = 0;
        this.remainingMarkers.length = 0;

        this.player.off('timeupdate', this.checkIfMarkerReached);
        this.player.off('durationchange', this.updateMarkers);
        this.player.off('seeked', this.debouncedFindRemainingMarkers);

        this.player.$$('[data-markers-id]').forEach(node =>  {
            const markerDiv = node as HTMLElement;
            markerDiv.removeEventListener('click', this.markerClicked);
            markerDiv.removeEventListener('mouseover', this.showMarkerTip);
            markerDiv.removeEventListener('mouseout', this.hideMarkerTip);
            markerDiv.remove();
        });

        super.dispose();
    }

    private findRemainingMarkers() {
        const markers = this.markersMap.orderedValues();
        const nextBiggest = MarkersPlugin.binarySearch(markers, this.player.currentTime()!);
        this.remainingMarkers = markers.slice(nextBiggest).reverse();
        this.visitedMarkers = markers.slice(0, nextBiggest);
    }

    private updateMarker(marker: Marker, duration?: number) {
        duration = duration ?? this.player.duration();

        // remove previous marker with the same id (if there is one)
        const prevMarkerDiv = this.player.$(`[data-markers-id='${marker.id}']`) as HTMLElement | null;
        if (prevMarkerDiv) {
            prevMarkerDiv.removeEventListener('click', this.markerClicked);
            prevMarkerDiv.removeEventListener('mouseover', this.showMarkerTip);
            prevMarkerDiv.removeEventListener('mouseout', this.hideMarkerTip);
            prevMarkerDiv.remove();
        }

        // create marker
        const markerDiv = videojs.dom.createEl('div', {}, {
            'class': `vjs-marker ${marker.class ?? ''}`,
            'data-marker-id': marker.id,
            'data-marker-time': marker.time
        }) as HTMLElement;

        //apply style
        for (const key in this.settings.markerStyle) {
            markerDiv.style.setProperty(key, this.settings.markerStyle[key]!);
        }

        // hide out-of-bounds markers
        const ratio = marker.time / duration!;
        if (ratio < 0.0 || ratio > 1.0) {
            markerDiv.style.display = 'none';
        }

        // set position
        markerDiv.style.left = (marker.time / duration!) * 100 + '%';
        if (marker.duration) {
            markerDiv.style.width = (marker.duration / duration!) * 100 + '%';
        }

        // handle onclick event (set time, trigger onMarkerReached()),
        // and hover effects
        markerDiv.addEventListener('click', this.markerClicked);
        markerDiv.addEventListener('mouseover', this.showMarkerTip);
        markerDiv.addEventListener('mouseout', this.hideMarkerTip);

        this.player.$('.vjs-progress-holder')?.appendChild(markerDiv);
    }

    private updateMarkers() {
        // duration() only returns undefined if used as a setter
        const duration = this.player.duration()!;
        for (const marker of this.markersMap.values()) {
            this.updateMarker(marker, duration);
        }
    }

    private markerClicked(event: MouseEvent) {
        // this function only gets used as an eventListeners for HTMLElements with an 'data-marker-id' attribute
        const markerId = (event.target as HTMLElement).getAttribute('data-marker-id')!;
        const marker = this.markersMap.get(markerId)!;

        this.player.currentTime(marker.time);

        if (this.settings.onMarkerReached) {
            this.settings.onMarkerReached(marker);
        }
    }

    private showMarkerTip(event: MouseEvent) {
        if (this.markerTip === null) return;

        // this function only gets used as an eventListeners for HTMLElements with an 'data-marker-id' attribute
        const markerDiv = (event.target as HTMLElement);
        const marker = this.markersMap.get(markerDiv.getAttribute('data-marker-id')!)!;

        // '.vjs-tip-inner' always exists if 'this.markerTip' exists
        this.markerTip.querySelector<HTMLElement>('.vjs-tip-inner')!.innerHTML = this.settings.markerTip.innerHtml(marker);

        // margin-left needs to minus the padding length to align correctly with the marker
        this.markerTip.style.left = (marker.time / this.player.duration()!) * 100 + '%';
        const markerTipBounding = videojs.dom.getBoundingClientRect(this.markerTip);
        const markerDivBounding = videojs.dom.getBoundingClientRect(markerDiv);
        this.markerTip.style.marginLeft = `${(markerDivBounding.width / 4) - (markerTipBounding.width / 2)} px`;
        this.markerTip.style.visibility = 'visible';
    }

    private hideMarkerTip(_event: MouseEvent) {
        if (this.markerTip !== null) {
            this.markerTip.style.visibility = 'hidden';
        }
    }

    private checkIfMarkerReached() {
        if (this.markersMap.size === 0) return;

        const peekNextMarker = this.remainingMarkers[this.remainingMarkers.length - 1];
        if (peekNextMarker !== undefined && (peekNextMarker.time - this.player.currentTime()!) < 0.0) {
            this.visitedMarkers.push(this.remainingMarkers.pop()!);
            this.settings.onMarkerReached!(peekNextMarker);
        }
    }

    /**
     * Returns a new unique id (for this plugin INSTANCE)
     */
    private newId(): string {
        return (this.id++).toString();
    }

    /**
     * Finds the range of the found marker in the list. E.g. if the found element has index 3 returns the 'to' value of the Slice { from: 3, to: 4 }.
     * If there is no marker with the same exact time returns the 'to' value of the Slice where 'from' and 'to' both are set to the
     * index of the next biggest element (or after the end of the array).
     * If there are multiple markers in the array that all have the same time that we are looking for, returns one of them at random.
     *
     * @param markers
     * @param time
     */
    private static binarySearch(markers: ReadonlyArray<Marker>, time: number): number {
        type Slice = {
            from: number,
            to: number
        }

        const slice: Slice = { from: 0, to: markers.length };
        while (slice.from !== slice.to) {
            const middle = (slice.from + slice.to) >> 1;
            if (time > markers[middle]!.time) {
                slice.from = middle + 1;
            } else if (time < markers[middle]!.time) {
                slice.to = middle;
            } else {
                return middle + 1;
            }
        }
        return slice.to;
    }

}

videojs.registerPlugin('markers', MarkersPlugin);
