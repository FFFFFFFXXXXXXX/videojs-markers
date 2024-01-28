/*
 * videojs-markers
 * @flow
 */

import videojs from 'video.js';
import Player from 'video.js/dist/types/player';
import VideoJsPlugin from 'video.js/dist/types/plugin'
import OrderedMap from './OrderedMap';
1
export type Marker = {
    time: number,
    duration: number,
    text?: string,
    class?: string,
    overlayText?: string,
};

type MarkerInternal = Marker & { readonly key: string };

export type Settings = {
    markerStyle: Partial<CSSStyleDeclaration>,
    markerTip: Partial<HTMLElement> & {
        display: boolean,
        text: (marker: Marker) => string,
        time: (marker: Marker) => number
    },
    onMarkerReached?: (marker: Marker) => void,
}

// default setting
const DEFAULT_SETTINGS: Settings = {
    markerStyle: {
        'width': '7px',
        'borderRadius': '30%',
        'backgroundColor': 'red',
    },
    markerTip: {
        display: true,
        text: (marker: Marker) => `Break: ${marker.text}`,
        time: (marker: Marker) => marker.time,
    }
};

/**
 * Returns the size of an element and its position
 * a default Object with 0 on each of its properties
 * is returned in case there's an error
 * @param  {Element} element  el to get the size and position
 * @return {DOMRect|Object}   size and position of an element
 */
function getElementBounding(element: Element) {
    try {
        return element.getBoundingClientRect();
    } catch (e) {
        return {
            top: 0,
            bottom: 0,
            left: 0,
            width: 0,
            height: 0,
            right: 0,
            x: 0,
            y: 0,
            toJSON: function () { return JSON.stringify(this) }
        };
    }
}

const NULL_INDEX = -1;

function registerVideoJsMarkersPlugin(this: Player, options: any) {
    // // copied from video.js/src/js/utils/merge-options.js since
    // // videojs 4 doens't support it by defualt.
    // if (!videojs.mergeOptions) {
    //     function isPlain(value: any) {
    //         return !!value && typeof value === 'object' &&
    //             toString.call(value) === '[object Object]' &&
    //             value.constructor === Object;
    //     }
    //     function mergeOptions(source1: Object, source2: Object) {
    //         const result = {};
    //         const sources = [source1, source2];
    //         sources.forEach(source => {
    //             if (!source) {
    //                 return;
    //             }
    //             Object.keys(source).forEach(key => {
    //                 const value = source[key];
    //                 if (!isPlain(value)) {
    //                     result[key] = value;
    //                     return;
    //                 }
    //                 if (!isPlain(result[key])) {
    //                     result[key] = {};
    //                 }
    //                 result[key] = mergeOptions(result[key], value);
    //             })
    //         });
    //         return result;
    //     }
    //     videojs.mergeOptions = mergeOptions;
    // }

    // if (!videojs.dom.createEl) {
    //     videojs.dom.createEl = function (tagName: string, props: Object, attrs?: Object): void {
    //         const el = videojs.Player.prototype.dom.createEl(tagName, props);
    //         if (!!attrs) {
    //             Object.keys(attrs).forEach(key => {
    //                 el.setAttribute(key, attrs[key]);
    //             });
    //         }
    //         return el;
    //     }
    // }


    /**
     * register the markers plugin (dependent on jquery)
     */
    const setting = videojs.obj.merge(DEFAULT_SETTINGS, options);
    const markersMap: { [key: string]: Marker } = {};
    const markersList: Array<Marker> = []; // list of markers sorted by time
    let currentMarkerIndex = NULL_INDEX;
    const player = this as Player & typeof DEFAULT_SETTINGS;
    let markerTip: HTMLElement | null = null;
    let breakOverlay: HTMLElement | null = null;
    let overlayIndex = NULL_INDEX;

    function sortMarkersAsc(): void {
        markersList.sort((a, b) => setting.markerTip.time(a) - setting.markerTip.time(b));
    }

    function addMarkers(newMarkers: Array<Marker>): void {
        newMarkers.forEach((marker: Marker) => {
            marker.key = generateUUID();

            player.el().querySelector('.vjs-progress-holder')?.appendChild(createMarkerDiv(marker));

            // store marker in an internal hash map
            markersMap[marker.key] = marker;
            markersList.push(marker);
        })

        sortMarkersList();
    }

    function getPosition(marker: Marker): number {
        return (setting.markerTip.time(marker) / player.duration()!) * 100;
    }

    function setMarkderDivStyle(marker: Marker, markerDiv: HTMLElement): void {
        markerDiv.className = `vjs-marker ${marker.class || ''}`;

        Object.keys(setting.markerStyle).forEach(key => {
            markerDiv.style.setProperty(key, setting.markerStyle[key]);
        });

        // hide out-of-bound markers
        const ratio = marker.time / player.duration()!;
        if (ratio < 0 || ratio > 1) {
            markerDiv.style.display = 'none';
        }

        // set position
        markerDiv.style.left = getPosition(marker) + '%';
        if (marker.duration) {
            markerDiv.style.width = (marker.duration / player.duration()!) * 100 + '%';
            markerDiv.style.marginLeft = '0px';
        } else {
            const markerDivBounding = getElementBounding(markerDiv);
            markerDiv.style.marginLeft = markerDivBounding.width / 2 + 'px';
        }
    }

    function createMarkerDiv(marker: Marker): Node {
        const markerDiv = videojs.dom.createEl('div', {}, {
            'data-marker-key': marker.key,
            'data-marker-time': setting.markerTip.time(marker)
        }) as HTMLElement;

        setMarkderDivStyle(marker, markerDiv);

        // bind click event to seek to marker time
        markerDiv.addEventListener('click', function (_e) {
            let preventDefault = false;
            if (typeof setting.onMarkerClick === 'function') {
                // if return false, prevent default behavior
                preventDefault = setting.onMarkerClick(marker) === false;
            }

            if (!preventDefault) {
                const key = this.getAttribute('data-marker-key')!;
                player.currentTime(setting.markerTip.time(markersMap[key]));
            }
        });

        if (setting.markerTip.display) {
            registerMarkerTipHandler(markerDiv);
        }

        return markerDiv;
    }

    function _updateMarkers(force: boolean): void {
        // update UI for markers whose time changed
        markersList.forEach((marker: Marker) => {
            const markerDiv = player.el().querySelector('.vjs-marker[data-marker-key='' + marker.key + '']')! as HTMLElement;
            const markerTime = setting.markerTip.time(marker);

            if (force || markerDiv.getAttribute('data-marker-time') !== markerTime) {
                setMarkderDivStyle(marker, markerDiv);
                markerDiv.setAttribute('data-marker-time', markerTime);
            }
        });
        sortMarkersList();
    }

    function removeMarkers(indexArray: Array<number>): void {
        // reset overlay
        if (breakOverlay) {
            overlayIndex = NULL_INDEX;
            breakOverlay.style.visibility = 'hidden';
        }
        currentMarkerIndex = NULL_INDEX;

        const deleteIndexList: Array<number> = [];
        indexArray.forEach((index: number) => {
            const marker = markersList[index];
            if (marker) {
                // delete from memory
                delete markersMap[marker.key];
                deleteIndexList.push(index);

                // delete from dom
                const el = player.el().querySelector('.vjs-marker[data-marker-key='' + marker.key + '']');
                el && el.parentNode?.removeChild(el);
            }
        });

        // clean up markers array
        deleteIndexList.reverse();
        deleteIndexList.forEach((deleteIndex: number) => {
            markersList.splice(deleteIndex, 1);
        });

        // sort again
        sortMarkersList();
    }

    // attach hover event handler
    function registerMarkerTipHandler(markerDiv: HTMLElement): void {
        markerDiv.addEventListener('mouseover', () => {
            const marker = markersMap[markerDiv.getAttribute('data-marker-key')!]!;
            if (!!markerTip) {
                if (setting.markerTip.html) {
                    markerTip.querySelector('.vjs-tip-inner')!.innerHTML = setting.markerTip.html(marker);
                } else {
                    markerTip.querySelector<HTMLElement>('.vjs-tip-inner')!.innerText = setting.markerTip.text(marker);
                }
                // margin-left needs to minus the padding length to align correctly with the marker
                markerTip.style.left = getPosition(marker) + '%';
                const markerTipBounding = getElementBounding(markerTip);
                const markerDivBounding = getElementBounding(markerDiv);
                markerTip.style.marginLeft = `${(markerDivBounding.width / 4) - (markerTipBounding.width / 2)} px`;
                markerTip.style.visibility = 'visible';
            }
        });

        markerDiv.addEventListener('mouseout', () => {
            if (!!markerTip) {
                markerTip.style.visibility = 'hidden';
            }
        });
    }

    function initializeMarkerTip(): void {
        markerTip = videojs.dom.createEl('div', {
            className: 'vjs-tip',
            innerHTML: '<div class='vjs- tip - arrow'></div><div class='vjs - tip - inner'></div>',
        }) as HTMLElement;
    player.el().querySelector('.vjs-progress-holder')?.appendChild(markerTip);
}

// show or hide break overlays
function updateBreakOverlay(): void {
    if (!setting.breakOverlay.display || currentMarkerIndex < 0) {
        return;
    }

    const currentTime = player.currentTime()!;
    const marker = markersList[currentMarkerIndex];
    const markerTime = setting.markerTip.time(marker);

    if (
        currentTime >= markerTime &&
        currentTime <= (markerTime + setting.breakOverlay.displayTime)
    ) {
        if (overlayIndex !== currentMarkerIndex) {
            overlayIndex = currentMarkerIndex;
            if (breakOverlay) {
                breakOverlay.querySelector('.vjs-break-overlay-text')!.innerHTML = setting.breakOverlay.text(marker);
            }
        }

        if (breakOverlay) {
            breakOverlay.style.visibility = 'visible';
        }
    } else {
        overlayIndex = NULL_INDEX;
        if (breakOverlay) {
            breakOverlay.style.visibility = 'hidden';
        }
    }
}

// problem when the next marker is within the overlay display time from the previous marker
function initializeOverlay(): void {
    breakOverlay = videojs.dom.createEl('div', {
        className: 'vjs-break-overlay',
        innerHTML: '<div class='vjs-break-overlay - text'></div>'
}) as HTMLElement;
Object.keys(setting.breakOverlay.style).forEach(key => {
    if (breakOverlay) {
        breakOverlay.style.setProperty(key, setting.breakOverlay.style[key]);
    }
});
player.el().appendChild(breakOverlay);
overlayIndex = NULL_INDEX;
    }

function onTimeUpdate(): void {
    onUpdateMarker();
    updateBreakOverlay();
    options.onTimeUpdateAfterMarkerUpdate && options.onTimeUpdateAfterMarkerUpdate();
}

function onUpdateMarker() {
    /*
      check marker reached in between markers
      the logic here is that it triggers a new marker reached event only if the player
      enters a new marker range (e.g. from marker 1 to marker 2). Thus, if player is on marker 1 and user clicked on marker 1 again, no new reached event is triggered)
    */
    if (!markersList.length) {
        return;
    }

    const getNextMarkerTime = (index: number): number => {
        if (index < markersList.length - 1) {
            return setting.markerTip.time(markersList[index + 1]);
        }
        // next marker time of last marker would be end of video time
        return player.duration()!;
    }
    const currentTime = player.currentTime()!;
    let newMarkerIndex = NULL_INDEX;

    if (currentMarkerIndex !== NULL_INDEX) {
        // check if staying at same marker
        const nextMarkerTime = getNextMarkerTime(currentMarkerIndex);
        if (
            currentTime >= setting.markerTip.time(markersList[currentMarkerIndex]) &&
            currentTime < nextMarkerTime
        ) {
            return;
        }

        // check for ending (at the end current time equals player duration)
        if (
            currentMarkerIndex === markersList.length - 1 &&
            currentTime === player.duration()
        ) {
            return;
        }
    }

    // check first marker, no marker is selected
    if (currentTime < setting.markerTip.time(markersList[0])) {
        newMarkerIndex = NULL_INDEX;
    } else {
        // look for new index
        for (const i = 0; i < markersList.length; i++) {
            const nextMarkerTime = getNextMarkerTime(i);
            if (
                currentTime >= setting.markerTip.time(markersList[i]) &&
                currentTime < nextMarkerTime
            ) {
                newMarkerIndex = i;
                break;
            }
        }
    }

    // set new marker index
    if (newMarkerIndex !== currentMarkerIndex) {
        // trigger event if index is not null
        if (newMarkerIndex !== NULL_INDEX && options.onMarkerReached) {
            options.onMarkerReached(markersList[newMarkerIndex], newMarkerIndex);
        }
        currentMarkerIndex = newMarkerIndex;
    }
}

// setup the whole thing
function initialize(): void {
    if (setting.markerTip.display) {
        initializeMarkerTip();
    }

    // remove existing markers if already initialized
    player.markers.length = 0;
    addMarkers(setting.markers);

    if (setting.breakOverlay.display) {
        initializeOverlay();
    }
    onTimeUpdate();
    player.on('timeupdate', onTimeUpdate);
}

// setup the plugin after we loaded video's meta data
player.one('loadedmetadata', function () {
    initialize();
});

    // exposed plugin API
    // player.markers = {
    //     getMarkers: function (): Array<Marker> {
    //         return markersList;
    //     },
    //     next: function (): void {
    //         // go to the next marker from current timestamp
    //         const currentTime = player.currentTime();
    //         for (const i = 0; i < markersList.length; i++) {
    //             const markerTime = setting.markerTip.time(markersList[i]);
    //             if (markerTime > currentTime) {
    //                 player.currentTime(markerTime);
    //                 break;
    //             }
    //         }
    //     },
    //     prev: function (): void {
    //         // go to previous marker
    //         const currentTime = player.currentTime();
    //         for (const i = markersList.length - 1; i >= 0; i--) {
    //             const markerTime = setting.markerTip.time(markersList[i]);
    //             // add a threshold
    //             if (markerTime + 0.5 < currentTime) {
    //                 player.currentTime(markerTime);
    //                 return;
    //             }
    //         }
    //     },
    //     add: function (newMarkers: Array<Marker>): void {
    //         // add new markers given an array of index
    //         addMarkers(newMarkers);
    //     },
    //     remove: function (indexArray: Array<number>): void {
    //         // remove markers given an array of index
    //         removeMarkers(indexArray);
    //     },
    //     removeAll: function (): void {
    //         const indexArray = [];
    //         for (const i = 0; i < markersList.length; i++) {
    //             indexArray.push(i);
    //         }
    //         removeMarkers(indexArray);
    //     },
    //     // force - force all markers to be updated, regardless of if they have changed or not.
    //     updateTime: function (force: boolean): void {
    //         // notify the plugin to update the UI for changes in marker times
    //         updateMarkers(force);
    //     },
    //     reset: function (newMarkers: Array<Marker>): void {
    //         // remove all the existing markers and add new ones
    //         player.markers.removeAll();
    //         addMarkers(newMarkers);
    //     },
    //     destroy: function (): void {
    //         // unregister the plugins and clean up even handlers
    //         player.markers.removeAll();
    //         breakOverlay && breakOverlay.remove();
    //         markerTip && markerTip.remove();
    //         player.off('timeupdate', updateBreakOverlay);
    //         delete player.markers;
    //     },
    // };
}

type Range = {
    from: number,
    to: number
}

export class MarkersPlugin extends VideoJsPlugin {

    public static readonly VERSION = '1.1.0';

    // each marker gets its own unique GUID
    private guid = 0;

    // plugin settings
    private readonly settings: Settings;
    private readonly markersMap: OrderedMap<string, MarkerInternal>;

    constructor(player: Player, options: Settings) {
        super(player);

        this.settings = videojs.obj.merge(DEFAULT_SETTINGS, options)
        this.markersMap = new OrderedMap<string, MarkerInternal>((v1, v2) => {
            return this.settings.markerTip.time(v1) - this.settings.markerTip.time(v2)
        });

        if (this.settings.onMarkerReached) {
            this.player.on('timeupdate', this.checkIfMarkerReached);
        }

        this.player.on('loadedmetadata', this.setup);
    }

    private setup() {
        // create hover text
        if (this.settings.markerTip.display) {
            const markerTip = videojs.dom.createEl('div', {
                className: 'vjs-tip',
                innerHTML: '<div class="vjs-tip-arrow"></div><div class="vjs-tip-inner"></div>',
            }) as HTMLElement;
            this.player.$('.vjs-progress-holder')?.appendChild(markerTip);
        }

        // create markers in timeline
        for (const marker of this.markersMap.values()) {
            const markerDiv = videojs.dom.createEl('div', {}, {
                'data-marker-key': marker.key,
                'data-marker-time': this.settings.markerTip.time(marker)
            }) as HTMLElement;

            setMarkderDivStyle(marker, markerDiv);

            // bind click event to seek to marker time
            markerDiv.addEventListener('click', function (_e) {
                let preventDefault = false;
                if (typeof this.settings.onMarkerClick === 'function') {
                    // if return false, prevent default behavior
                    preventDefault = setting.onMarkerClick(marker) === false;
                }

                if (!preventDefault) {
                    const key = this.getAttribute('data-marker-key')!;
                    player.currentTime(setting.markerTip.time(markersMap[key]));
                }
            });

            if (setting.markerTip.display) {
                registerMarkerTipHandler(markerDiv);
            }


            function setMarkderDivStyle(marker: Marker, markerDiv: HTMLElement): void {
                markerDiv.className = `vjs-marker ${marker.class || ''}`;

                Object.keys(setting.markerStyle).forEach(key => {
                    markerDiv.style.setProperty(key, setting.markerStyle[key]);
                });

                // hide out-of-bound markers
                const ratio = marker.time / player.duration()!;
                if (ratio < 0 || ratio > 1) {
                    markerDiv.style.display = 'none';
                }

                // set position
                markerDiv.style.left = this.settings.markerTip.time(marker) / this.player.duration()! * 100;
                markerDiv.style.left = getPosition(marker) + '%';
                if (marker.duration) {
                    markerDiv.style.width = (marker.duration / player.duration()!) * 100 + '%';
                    markerDiv.style.marginLeft = '0px';
                } else {
                    const markerDivBounding = getElementBounding(markerDiv);
                    markerDiv.style.marginLeft = markerDivBounding.width / 2 + 'px';
                }
            }

            function createMarkerDiv(marker: Marker): Node {
                const markerDiv = videojs.dom.createEl('div', {}, {
                    'data-marker-key': marker.key,
                    'data-marker-time': setting.markerTip.time(marker)
                }) as HTMLElement;

                setMarkderDivStyle(marker, markerDiv);

                // bind click event to seek to marker time
                markerDiv.addEventListener('click', function (_e) {
                    let preventDefault = false;
                    if (typeof setting.onMarkerClick === 'function') {
                        // if return false, prevent default behavior
                        preventDefault = setting.onMarkerClick(marker) === false;
                    }

                    if (!preventDefault) {
                        const key = this.getAttribute('data-marker-key')!;
                        player.currentTime(setting.markerTip.time(markersMap[key]));
                    }
                });

                if (setting.markerTip.display) {
                    registerMarkerTipHandler(markerDiv);
                }

                return markerDiv;
            }
        }
    }

    public getMarkers(): ReadonlyArray<Marker> {
        return this.markersMap.orderedValues();
    }

    // go to the next marker from current timestamp
    public next(): void {
        const markers = this.markersMap.orderedValues();
        const { to } = MarkersPlugin.binarySearch(markers, this.player.currentTime()!);
        const nextMarker = markers[to];

        if (nextMarker !== undefined) this.player.currentTime(nextMarker.time);
    }

    // go to previous marker from current timestamp
    public prev(): void {
        const markers = this.markersMap.orderedValues();
        const { to } = MarkersPlugin.binarySearch(markers, this.player.currentTime()!);
        const prevMarker = markers[to - 1];

        if (prevMarker !== undefined) this.player.currentTime(prevMarker.time);
    }

    public add(marker: Marker) {
        const progressHolder = this.player.$('.vjs-progress-holder');
        if (!progressHolder) {
            console.error('no progress-holder found')
            return;
        }

        progressHolder.appendChild<HTMLElement>(this.createMarkerDiv(marker));

        let markerInt: MarkerInternal = { ...marker, key: this.newGUID() };
        this.markersMap.set(markerInt.key, markerInt);
    }

    public addAll(markers: Array<Marker>) {
        const progressHolder = this.player.$('.vjs-progress-holder');
        if (!progressHolder) {
            console.error('no progress-holder found')
            return;
        }

        for (const marker of markers.map(m => ({ ...m, key: this.newGUID() } as MarkerInternal))) {
            progressHolder.appendChild<HTMLElement>(this.createMarkerDiv(marker));
            this.markersMap.set(marker.key, marker);
        }
    }

    // unregister the plugin and clean up
    public destroy(): void {
        this.markersMap.clear();
        this.settings.markerTip?.remove && this.settings.markerTip.remove();
        this.player.off('timeupdate', this.checkIfMarkerReached);
        this.player.off('loadedmetadata', this.setup);
        this.dispose();
    }

    private checkIfMarkerReached() {
        if (this.markersMap.size === 0) return;

        const currentTime = this.player.currentTime() ?? 0;
        const markers = this.markersMap.orderedValues();

        const { to } = MarkersPlugin.binarySearch(markers, currentTime);
        const nextMarker = markers[to]!;

        if (nextMarker !== null && (nextMarker.time - currentTime) < 0.5) {
            this.settings.onMarkerReached!(nextMarker);
        }
    }

    private newGUID(): string {
        return (this.guid++).toString();
    }

    // Returns the range of the found marker in the list. E.g. for i = 3 returns the Range { from: 3, to: 4 }
    // If there is no marker with the same exact time returns a Range where 'from' and 'to' both are set to the
    // index of the next biggest element (or after the end of the array).
    // If there are multiple markers in the array that all have the same time that we are looking for, returns one of them at random.
    private static binarySearch(markers: ReadonlyArray<MarkerInternal>, time: number): Range {
        const slice: Range = { from: 0, to: markers.length };
        while (slice.from !== slice.to) {
            const middle = (slice.from + slice.to) >> 1;
            if (time > markers[middle]!.time) {
                slice.from = middle + 1;
            } else if (time < markers[middle]!.time) {
                slice.to = middle;
            } else {
                return { from: middle, to: middle + 1 };
            }
        }

        return slice;
    }

}

// do this to use the plugin
// videojs.registerPlugin('markers', MarkersPlugin);
