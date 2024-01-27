"use strict";
/*
 * videojs-markers
 * @flow
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarkersPlugin = void 0;
const video_js_1 = __importDefault(require("video.js"));
const plugin_1 = __importDefault(require("video.js/dist/types/plugin"));
// default setting
const defaultSetting = {
    markerStyle: {
        'width': '7px',
        'borderRadius': '30%',
        'backgroundColor': 'red',
    },
    markerTip: {
        display: true,
        text: (marker) => `Break: ${marker.text}`,
        time: (marker) => marker.time,
    },
    breakOverlay: {
        display: false,
        displayTime: 3,
        text: (marker) => `Break overlay: ${marker.overlayText}`,
        style: {
            'width': '100%',
            'height': '20%',
            'background-color': 'rgba(0,0,0,0.7)',
            'color': 'white',
            'font-size': '17px',
        },
    },
    onMarkerClick: (_marker) => { },
    onMarkerReached: (_marker, _index) => { },
    markers: new Array()
};
// create a non-colliding random number
function generateUUID() {
    let d = new Date().getTime();
    let uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        let r = (d + Math.random() * 16) % 16 | 0;
        d = Math.floor(d / 16);
        return (c == 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    return uuid;
}
;
/**
 * Returns the size of an element and its position
 * a default Object with 0 on each of its properties
 * its return in case there's an error
 * @param  {Element} element  el to get the size and position
 * @return {DOMRect|Object}   size and position of an element
 */
function getElementBounding(element) {
    try {
        return element.getBoundingClientRect();
    }
    catch (e) {
        return {
            top: 0,
            bottom: 0,
            left: 0,
            width: 0,
            height: 0,
            right: 0,
            x: 0,
            y: 0,
            toJSON: function () { return JSON.stringify(this); }
        };
    }
}
const NULL_INDEX = -1;
function registerVideoJsMarkersPlugin(options) {
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
    let setting = video_js_1.default.mergeOptions(defaultSetting, options);
    let markersMap = {};
    let markersList = []; // list of markers sorted by time
    let currentMarkerIndex = NULL_INDEX;
    let player = this;
    let markerTip = null;
    let breakOverlay = null;
    let overlayIndex = NULL_INDEX;
    function sortMarkersList() {
        // sort the list by time in asc order
        markersList.sort((a, b) => {
            return setting.markerTip.time(a) - setting.markerTip.time(b);
        });
    }
    function addMarkers(newMarkers) {
        newMarkers.forEach((marker) => {
            var _a;
            marker.key = generateUUID();
            (_a = player.el().querySelector('.vjs-progress-holder')) === null || _a === void 0 ? void 0 : _a.appendChild(createMarkerDiv(marker));
            // store marker in an internal hash map
            markersMap[marker.key] = marker;
            markersList.push(marker);
        });
        sortMarkersList();
    }
    function getPosition(marker) {
        return (setting.markerTip.time(marker) / player.duration()) * 100;
    }
    function setMarkderDivStyle(marker, markerDiv) {
        markerDiv.className = `vjs-marker ${marker.class || ""}`;
        Object.keys(setting.markerStyle).forEach(key => {
            markerDiv.style.setProperty(key, setting.markerStyle[key]);
        });
        // hide out-of-bound markers
        const ratio = marker.time / player.duration();
        if (ratio < 0 || ratio > 1) {
            markerDiv.style.display = 'none';
        }
        // set position
        markerDiv.style.left = getPosition(marker) + '%';
        if (marker.duration) {
            markerDiv.style.width = (marker.duration / player.duration()) * 100 + '%';
            markerDiv.style.marginLeft = '0px';
        }
        else {
            const markerDivBounding = getElementBounding(markerDiv);
            markerDiv.style.marginLeft = markerDivBounding.width / 2 + 'px';
        }
    }
    function createMarkerDiv(marker) {
        let markerDiv = video_js_1.default.dom.createEl('div', {}, {
            'data-marker-key': marker.key,
            'data-marker-time': setting.markerTip.time(marker)
        });
        setMarkderDivStyle(marker, markerDiv);
        // bind click event to seek to marker time
        markerDiv.addEventListener('click', function (_e) {
            let preventDefault = false;
            if (typeof setting.onMarkerClick === "function") {
                // if return false, prevent default behavior
                preventDefault = setting.onMarkerClick(marker) === false;
            }
            if (!preventDefault) {
                let key = this.getAttribute('data-marker-key');
                player.currentTime(setting.markerTip.time(markersMap[key]));
            }
        });
        if (setting.markerTip.display) {
            registerMarkerTipHandler(markerDiv);
        }
        return markerDiv;
    }
    function _updateMarkers(force) {
        // update UI for markers whose time changed
        markersList.forEach((marker) => {
            let markerDiv = player.el().querySelector(".vjs-marker[data-marker-key='" + marker.key + "']");
            let markerTime = setting.markerTip.time(marker);
            if (force || markerDiv.getAttribute('data-marker-time') !== markerTime) {
                setMarkderDivStyle(marker, markerDiv);
                markerDiv.setAttribute('data-marker-time', markerTime);
            }
        });
        sortMarkersList();
    }
    function removeMarkers(indexArray) {
        // reset overlay
        if (breakOverlay) {
            overlayIndex = NULL_INDEX;
            breakOverlay.style.visibility = "hidden";
        }
        currentMarkerIndex = NULL_INDEX;
        let deleteIndexList = [];
        indexArray.forEach((index) => {
            var _a;
            let marker = markersList[index];
            if (marker) {
                // delete from memory
                delete markersMap[marker.key];
                deleteIndexList.push(index);
                // delete from dom
                let el = player.el().querySelector(".vjs-marker[data-marker-key='" + marker.key + "']");
                el && ((_a = el.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(el));
            }
        });
        // clean up markers array
        deleteIndexList.reverse();
        deleteIndexList.forEach((deleteIndex) => {
            markersList.splice(deleteIndex, 1);
        });
        // sort again
        sortMarkersList();
    }
    // attach hover event handler
    function registerMarkerTipHandler(markerDiv) {
        markerDiv.addEventListener('mouseover', () => {
            let marker = markersMap[markerDiv.getAttribute('data-marker-key')];
            if (!!markerTip) {
                if (setting.markerTip.html) {
                    markerTip.querySelector('.vjs-tip-inner').innerHTML = setting.markerTip.html(marker);
                }
                else {
                    markerTip.querySelector('.vjs-tip-inner').innerText = setting.markerTip.text(marker);
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
    function initializeMarkerTip() {
        var _a;
        markerTip = video_js_1.default.dom.createEl('div', {
            className: 'vjs-tip',
            innerHTML: "<div class='vjs-tip-arrow'></div><div class='vjs-tip-inner'></div>",
        });
        (_a = player.el().querySelector('.vjs-progress-holder')) === null || _a === void 0 ? void 0 : _a.appendChild(markerTip);
    }
    // show or hide break overlays
    function updateBreakOverlay() {
        if (!setting.breakOverlay.display || currentMarkerIndex < 0) {
            return;
        }
        let currentTime = player.currentTime();
        let marker = markersList[currentMarkerIndex];
        let markerTime = setting.markerTip.time(marker);
        if (currentTime >= markerTime &&
            currentTime <= (markerTime + setting.breakOverlay.displayTime)) {
            if (overlayIndex !== currentMarkerIndex) {
                overlayIndex = currentMarkerIndex;
                if (breakOverlay) {
                    breakOverlay.querySelector('.vjs-break-overlay-text').innerHTML = setting.breakOverlay.text(marker);
                }
            }
            if (breakOverlay) {
                breakOverlay.style.visibility = "visible";
            }
        }
        else {
            overlayIndex = NULL_INDEX;
            if (breakOverlay) {
                breakOverlay.style.visibility = "hidden";
            }
        }
    }
    // problem when the next marker is within the overlay display time from the previous marker
    function initializeOverlay() {
        breakOverlay = video_js_1.default.dom.createEl('div', {
            className: 'vjs-break-overlay',
            innerHTML: "<div class='vjs-break-overlay-text'></div>"
        });
        Object.keys(setting.breakOverlay.style).forEach(key => {
            if (breakOverlay) {
                breakOverlay.style.setProperty(key, setting.breakOverlay.style[key]);
            }
        });
        player.el().appendChild(breakOverlay);
        overlayIndex = NULL_INDEX;
    }
    function onTimeUpdate() {
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
        let getNextMarkerTime = (index) => {
            if (index < markersList.length - 1) {
                return setting.markerTip.time(markersList[index + 1]);
            }
            // next marker time of last marker would be end of video time
            return player.duration();
        };
        let currentTime = player.currentTime();
        let newMarkerIndex = NULL_INDEX;
        if (currentMarkerIndex !== NULL_INDEX) {
            // check if staying at same marker
            let nextMarkerTime = getNextMarkerTime(currentMarkerIndex);
            if (currentTime >= setting.markerTip.time(markersList[currentMarkerIndex]) &&
                currentTime < nextMarkerTime) {
                return;
            }
            // check for ending (at the end current time equals player duration)
            if (currentMarkerIndex === markersList.length - 1 &&
                currentTime === player.duration()) {
                return;
            }
        }
        // check first marker, no marker is selected
        if (currentTime < setting.markerTip.time(markersList[0])) {
            newMarkerIndex = NULL_INDEX;
        }
        else {
            // look for new index
            for (let i = 0; i < markersList.length; i++) {
                let nextMarkerTime = getNextMarkerTime(i);
                if (currentTime >= setting.markerTip.time(markersList[i]) &&
                    currentTime < nextMarkerTime) {
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
    function initialize() {
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
class MarkersPlugin extends plugin_1.default {
    constructor(player, options) {
        super(player);
        if (options.customClass) {
            player.addClass(options.customClass);
        }
        player.on('playing', function () {
            video_js_1.default.log('playback began!');
        });
    }
}
exports.MarkersPlugin = MarkersPlugin;
MarkersPlugin.VERSION = '1.1.0';
video_js_1.default.registerPlugin('markers', MarkersPlugin);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlkZW9qcy5tYXJrZXJzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3ZpZGVvanMubWFya2Vycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztHQUdHOzs7Ozs7QUFFSCx3REFBK0I7QUFFL0Isd0VBQXNEO0FBa0N0RCxrQkFBa0I7QUFDbEIsTUFBTSxjQUFjLEdBQWE7SUFDN0IsV0FBVyxFQUFFO1FBQ1QsT0FBTyxFQUFFLEtBQUs7UUFDZCxjQUFjLEVBQUUsS0FBSztRQUNyQixpQkFBaUIsRUFBRSxLQUFLO0tBQzNCO0lBQ0QsU0FBUyxFQUFFO1FBQ1AsT0FBTyxFQUFFLElBQUk7UUFDYixJQUFJLEVBQUUsQ0FBQyxNQUFjLEVBQUUsRUFBRSxDQUFDLFVBQVUsTUFBTSxDQUFDLElBQUksRUFBRTtRQUNqRCxJQUFJLEVBQUUsQ0FBQyxNQUFjLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJO0tBQ3hDO0lBQ0QsWUFBWSxFQUFFO1FBQ1YsT0FBTyxFQUFFLEtBQUs7UUFDZCxXQUFXLEVBQUUsQ0FBQztRQUNkLElBQUksRUFBRSxDQUFDLE1BQWMsRUFBRSxFQUFFLENBQUMsa0JBQWtCLE1BQU0sQ0FBQyxXQUFXLEVBQUU7UUFDaEUsS0FBSyxFQUFFO1lBQ0gsT0FBTyxFQUFFLE1BQU07WUFDZixRQUFRLEVBQUUsS0FBSztZQUNmLGtCQUFrQixFQUFFLGlCQUFpQjtZQUNyQyxPQUFPLEVBQUUsT0FBTztZQUNoQixXQUFXLEVBQUUsTUFBTTtTQUN0QjtLQUNKO0lBQ0QsYUFBYSxFQUFFLENBQUMsT0FBZSxFQUFRLEVBQUUsR0FBRyxDQUFDO0lBQzdDLGVBQWUsRUFBRSxDQUFDLE9BQWUsRUFBRSxNQUFjLEVBQVEsRUFBRSxHQUFHLENBQUM7SUFDL0QsT0FBTyxFQUFFLElBQUksS0FBSyxFQUFVO0NBQy9CLENBQUM7QUFFRix1Q0FBdUM7QUFDdkMsU0FBUyxZQUFZO0lBQ2pCLElBQUksQ0FBQyxHQUFHLElBQUksSUFB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