/*
 * videojs-markers
 * @flow
 */

import videojs from 'video.js';
import Player from 'video.js/dist/types/player';
import VideoJsPlugin from 'video.js/dist/types/plugin'

type Marker = {
    time: number,
    duration: number,
    text?: string,
    class?: string,
    overlayText?: string,
    // private property
    key: string,
};

// default setting
const defaultSetting = {
    markerStyle: {
        'width': '7px',
        'border-radius': '30%',
        'background-color': 'red',
    },
    markerTip: {
        display: true,
        text: (marker: Marker) => `Break: ${marker.text}`,
        time: (marker: Marker) => marker.time,
    },
    breakOverlay: {
        display: false,
        displayTime: 3,
        text: (marker: Marker) => `Break overlay: ${marker.overlayText}`,
        style: {
            'width': '100%',
            'height': '20%',
            'background-color': 'rgba(0,0,0,0.7)',
            'color': 'white',
            'font-size': '17px',
        },
    },
    onMarkerClick: (_marker: Marker): void => { },
    onMarkerReached: (_marker: Marker, _index: number): void => { },
    markers: new Array<Marker>()
};

// create a non-colliding random number
function generateUUID(): string {
    let d = new Date().getTime();
    let uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        let r = (d + Math.random() * 16) % 16 | 0;
        d = Math.floor(d / 16);
        return (c == 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    return uuid;
};

/**
 * Returns the size of an element and its position
 * a default Object with 0 on each of its properties
 * its return in case there's an error
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
    //                 let value = source[key];
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
    let setting = videojs.mergeOptions(defaultSetting, options);
    let markersMap: { [key: string]: Marker } = {};
    let markersList: Array<Marker> = []; // list of markers sorted by time
    let currentMarkerIndex = NULL_INDEX;
    let player = this as Player & typeof defaultSetting;
    let markerTip: HTMLElement | null = null;
    let breakOverlay: HTMLElement | null = null;
    let overlayIndex = NULL_INDEX;

    function sortMarkersList(): void {
        // sort the list by time in asc order
        markersList.sort((a, b) => {
            return setting.markerTip.time(a) - setting.markerTip.time(b);
        });
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
        markerDiv.className = `vjs-marker ${marker.class || ""}`;

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
        let markerDiv = videojs.dom.createEl('div', {}, {
            'data-marker-key': marker.key,
            'data-marker-time': setting.markerTip.time(marker)
        }) as HTMLElement;

        setMarkderDivStyle(marker, markerDiv);

        // bind click event to seek to marker time
        markerDiv.addEventListener('click', function (_e) {
            let preventDefault = false;
            if (typeof setting.onMarkerClick === "function") {
                // if return false, prevent default behavior
                preventDefault = setting.onMarkerClick(marker) === false;
            }

            if (!preventDefault) {
                let key = this.getAttribute('data-marker-key')!;
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
            let markerDiv = player.el().querySelector(".vjs-marker[data-marker-key='" + marker.key + "']")! as HTMLElement;
            let markerTime = setting.markerTip.time(marker);

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
            breakOverlay.style.visibility = "hidden";
        }
        currentMarkerIndex = NULL_INDEX;

        let deleteIndexList: Array<number> = [];
        indexArray.forEach((index: number) => {
            let marker = markersList[index];
            if (marker) {
                // delete from memory
                delete markersMap[marker.key];
                deleteIndexList.push(index);

                // delete from dom
                let el = player.el().querySelector(".vjs-marker[data-marker-key='" + marker.key + "']");
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
            let marker = markersMap[markerDiv.getAttribute('data-marker-key')!]!;
            if (!!markerTip) {
                if (setting.markerTip.html) {
                    markerTip.querySelector('.vjs-tip-inner')!.innerHTML = setting.markerTip.html(marker);
                } else {
                    markerTip.querySelector<HTMLElement>('.vjs-tip-inner')!.innerText = setting.markerTip.text(marker);
                }
                // margin-left needs to minus the padding length to align correctly with the marker
                markerTip.style.left = getPosition(marker) + '%';
                let markerTipBounding = getElementBounding(markerTip);
                let markerDivBounding = getElementBounding(markerDiv);
                markerTip.style.marginLeft = `${(markerDivBounding.width / 4) - (markerTipBounding.width / 2)} px`;
                markerTip.style.visibility = 'visible';
            }
        });

        markerDiv.addEventListener('mouseout', () => {
            if (!!markerTip) {
                markerTip.style.visibility = "hidden";
            }
        });
    }

    function initializeMarkerTip(): void {
        markerTip = videojs.dom.createEl('div', {
            className: 'vjs-tip',
            innerHTML: "<div class='vjs-tip-arrow'></div><div class='vjs-tip-inner'></div>",
        }) as HTMLElement;
        player.el().querySelector('.vjs-progress-holder')?.appendChild(markerTip);
    }

    // show or hide break overlays
    function updateBreakOverlay(): void {
        if (!setting.breakOverlay.display || currentMarkerIndex < 0) {
            return;
        }

        let currentTime = player.currentTime()!;
        let marker = markersList[currentMarkerIndex];
        let markerTime = setting.markerTip.time(marker);

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
                breakOverlay.style.visibility = "visible";
            }
        } else {
            overlayIndex = NULL_INDEX;
            if (breakOverlay) {
                breakOverlay.style.visibility = "hidden";
            }
        }
    }

    // problem when the next marker is within the overlay display time from the previous marker
    function initializeOverlay(): void {
        breakOverlay = videojs.dom.createEl('div', {
            className: 'vjs-break-overlay',
            innerHTML: "<div class='vjs-break-overlay-text'></div>"
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

        let getNextMarkerTime = (index: number): number => {
            if (index < markersList.length - 1) {
                return setting.markerTip.time(markersList[index + 1]);
            }
            // next marker time of last marker would be end of video time
            return player.duration()!;
        }
        let currentTime = player.currentTime()!;
        let newMarkerIndex = NULL_INDEX;

        if (currentMarkerIndex !== NULL_INDEX) {
            // check if staying at same marker
            let nextMarkerTime = getNextMarkerTime(currentMarkerIndex);
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
            for (let i = 0; i < markersList.length; i++) {
                let nextMarkerTime = getNextMarkerTime(i);
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
        player.on("timeupdate", onTimeUpdate);
    }

    // setup the plugin after we loaded video's meta data
    player.one("loadedmetadata", function () {
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
    //         for (let i = 0; i < markersList.length; i++) {
    //             let markerTime = setting.markerTip.time(markersList[i]);
    //             if (markerTime > currentTime) {
    //                 player.currentTime(markerTime);
    //                 break;
    //             }
    //         }
    //     },
    //     prev: function (): void {
    //         // go to previous marker
    //         const currentTime = player.currentTime();
    //         for (let i = markersList.length - 1; i >= 0; i--) {
    //             let markerTime = setting.markerTip.time(markersList[i]);
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
    //         let indexArray = [];
    //         for (let i = 0; i < markersList.length; i++) {
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
    //         player.off("timeupdate", updateBreakOverlay);
    //         delete player.markers;
    //     },
    // };
}

export class MarkersPlugin extends VideoJsPlugin {
    public static VERSION = '1.1.0';

    constructor(player: Player, options: any) {
        super(player);

        if (options.customClass) {
            player.addClass(options.customClass);
        }

        player.on('playing', function () {
            videojs.log('playback began!');
        });
    }
}

videojs.registerPlugin('markers', MarkersPlugin);