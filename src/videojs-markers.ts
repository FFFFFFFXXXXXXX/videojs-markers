import './videojs-markers.css';

import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import type Plugin from 'video.js/dist/types/plugin';

import { MarkerMap } from "./MarkerMap";
import { PACKAGE_VERSION } from './version';

const BasePlugin = videojs.getPlugin('plugin') as typeof Plugin;

export interface MarkerOptions {
    time: number,
    duration?: number,
    text?: string,
    class?: string,
}
export interface Unique { readonly id: string }
export interface Marker extends MarkerOptions, Unique { }

export type Settings = {
    markerStyle: Partial<CSSStyleDeclaration>,
    markerTip: Partial<HTMLElement> & {
        display: boolean,
        innerHtml: (marker: MarkerOptions) => string
    },
    onMarkerReached?: (marker: MarkerOptions) => void,
}

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
export class MarkersPlugin extends BasePlugin {

    public static readonly VERSION = PACKAGE_VERSION;

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

    private readonly vjsTimeTooltip: HTMLDivElement | null;

    private remainingMarkers = new Array<Marker>();
    private visitedMarkers = new Array<Marker>();

    private id = 0;

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

        this.vjsTimeTooltip = player.$('.vjs-time-tooltip') as HTMLDivElement;

        if (this.settings.onMarkerReached) {
            this.player.on('timeupdate', this.checkIfMarkerReached);
        }

        // adjust position of markers if the duration of the current video changes
        this.player.on('durationchange', this.updateMarkers);

        // update visited/remaining markers when the user clicks somewhere in the progress bar
        this.player.on('seeked', this.splitMarkersDebounced);
    }

    public getMarkers = (): ReadonlyArray<Marker> => {
        return this.markersMap.orderedValues();
    }

    /**
     * Go to the next marker from current timestamp.
     *
     * @returns true if successful and false if there is no next marker
     */
    public next = (): boolean => {
        const time = this.player.currentTime()!;

        let nextMarker = this.remainingMarkers.pop();
        while (nextMarker !== undefined && MarkersPlugin.timeEq(nextMarker.time, time)) {
            this.visitedMarkers.push(nextMarker);
            nextMarker = this.remainingMarkers.pop();
        }

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
    public prev = (): boolean => {
        const time = this.player.currentTime()!;

        let prevMarker = this.visitedMarkers.pop();
        while (prevMarker !== undefined && MarkersPlugin.timeEq(prevMarker.time, time)) {
            this.remainingMarkers.push(prevMarker);
            prevMarker = this.visitedMarkers.pop();
        }

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
     * @param markerOptions
     * @returns An array of all added Markers ordered by 'time'
     */
    public add = (markerOptions: ReadonlyArray<MarkerOptions>) => {
        for (const marker of markerOptions.map(m => ({ ...m, id: this.newId() } as Marker))) {
            this.markersMap.add(marker);
            this.updateMarker(marker);
        }

        this.splitMarkers();
    }

    /**
     * Remove all markers.
     */
    public remove = (markers: ReadonlyArray<Marker>) => {
        for (const marker of markers) {
            const markerDiv = this.player.$(`[data-marker-id='${marker.id}']`);
            if (markerDiv !== null) {
                const div = markerDiv as HTMLElement;
                div.onclick = null;
                div.onmouseover = null;
                div.onmouseout = null;
                div.remove();
            }

            this.markersMap.delete(marker.id);
        }

        this.splitMarkers();
    }

    /**
     * Remove all markers.
     */
    public removeAll = () => {
        this.player.$$('[data-marker-id]').forEach(node => {
            const markerDiv = node as HTMLElement;
            markerDiv.onclick = null;
            markerDiv.onmouseover = null;
            markerDiv.onmouseout = null;
            markerDiv.remove();
        });

        this.markersMap.clear();
        this.visitedMarkers.length = 0;
        this.remainingMarkers.length = 0;
    }

    /**
     * Reloads all markers.
     * Call this function if you modified a Marker after adding it and you want to display that change.
     */
    public updateMarkers = () => {
        // duration() only returns undefined if used as a setter
        const duration = this.player.duration()!;
        for (const marker of this.markersMap.values()) {
            this.updateMarker(marker, duration);
        }

        this.splitMarkers();
    }

    /**
     * Unregister the plugin.
     */
    public override dispose = () => {
        this.removeAll();

        if (this.settings.markerTip?.remove) {
            this.settings.markerTip.remove();
        }

        if (this.checkIfMarkerReached) {
            this.player.off('timeupdate', this.checkIfMarkerReached);
        }
        this.player.off('durationchange', this.updateMarkers);
        this.player.off('seeked', this.splitMarkersDebounced);

        super.dispose();
    }

    private splitMarkers = () => {
        const markers = this.markersMap.orderedValues();
        const nextBiggest = MarkersPlugin.binarySearchTime(markers, this.player.currentTime()!);
        this.remainingMarkers = markers.slice(nextBiggest).reverse();
        this.visitedMarkers = markers.slice(0, nextBiggest);
    }

    private splitMarkersDebounced = videojs.fn.debounce(this.splitMarkers, 250);

    private updateMarker = (marker: Marker, duration?: number) => {
        duration = duration ?? this.player.duration();

        // remove previous marker with the same id (if there is one)
        const prevMarkerDiv = this.player.$(`[data-marker-id='${marker.id}']`) as HTMLElement | null;
        if (prevMarkerDiv) {
            prevMarkerDiv.onclick = null;
            prevMarkerDiv.onmouseover = null;
            prevMarkerDiv.onmouseout = null;
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
            markerDiv.style[key] = this.settings.markerStyle[key]!;
        }

        // hide out-of-bounds markers
        const ratio = marker.time / duration!;
        markerDiv.style.display = (ratio < 0.0 || ratio > 1.0) ? 'none' : 'block';

        // set position
        markerDiv.style.left = (marker.time / duration!) * 100 + '%';
        if (marker.duration) {
            markerDiv.style.width = (marker.duration / duration!) * 100 + '%';
        }

        // handle onclick event (set time, trigger onMarkerReached()),
        // and hover effects
        markerDiv.onmousedown = this.markerClicked.bind(this);
        markerDiv.onmouseover = this.showMarkerTip.bind(this);
        markerDiv.onmouseout = this.hideMarkerTip.bind(this);

        this.player.$('.vjs-progress-holder')?.appendChild(markerDiv);
    }

    private markerClicked = (event: MouseEvent) => {
        event.stopPropagation();
        event.preventDefault();

        // this function only gets used as an eventListeners for HTMLElements with an 'data-marker-id' attribute
        const markerId = (event.target as HTMLElement).getAttribute('data-marker-id')!;
        const marker = this.markersMap.get(markerId)!;

        this.player.currentTime(marker.time);
        this.splitMarkers();

        if (this.settings.onMarkerReached) {
            this.settings.onMarkerReached(marker);
        }
    }

    private showMarkerTip = (event: MouseEvent) => {
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
        this.markerTip.style.marginLeft = ((markerDivBounding.width / 4) - (markerTipBounding.width / 2)) + 'px';
        this.markerTip.style.visibility = 'visible';

        this.vjsTimeTooltip?.style.setProperty('visibility', 'hidden');
    }

    private hideMarkerTip = (_event: MouseEvent) => {
        this.vjsTimeTooltip?.style.setProperty('visibility', 'visible');

        if (this.markerTip !== null) {
            this.markerTip.style.visibility = 'hidden';
        }
    }

    private checkIfMarkerReached = () => {
        const time = this.player.currentTime()!;

        let nextMarker = this.remainingMarkers.pop();
        while (nextMarker !== undefined) {
            if (nextMarker.time - time < 0) {
                this.visitedMarkers.push(nextMarker);
                this.settings.onMarkerReached!({ ...nextMarker });
            } else {
                this.remainingMarkers.push(nextMarker);
                return;
            }

            nextMarker = this.remainingMarkers.pop();
        }
    }

    /**
     * Returns a new unique id (for this plugin INSTANCE)
     */
    private newId = (): string => {
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
    private static binarySearchTime = (markers: ReadonlyArray<Marker>, time: number): number => {
        let start = 0;
        let end = markers.length;

        while (start !== end) {
            const middle = (start + end) >> 1;
            switch (this.timeCmp(time, markers[middle]!.time)) {
                case -1:
                    end = middle;
                    break;
                case 1:
                    start = middle + 1;
                    break;
                case 0:
                    return middle + 1;
            }
        }

        return end;
    }
    
    private static timeCmp(n1: number, n2: number): -1 | 0 | 1 {
        if (this.timeEq(n1, n2)) {
            return 0;
        } else {
            return n1 < n2 ? -1 : 1;
        }
    }

    private static timeEq(n1: number, n2: number): boolean {
        return Math.abs(n1 - n2) < 0.001
    }

}

videojs.registerPlugin('markers', MarkersPlugin);
