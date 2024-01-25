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
        'border-radius': '30%',
        'background-color': 'red',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlkZW9qcy5tYXJrZXJzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3ZpZGVvanMubWFya2Vycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztHQUdHOzs7Ozs7QUFFSCx3REFBK0I7QUFFL0Isd0VBQXNEO0FBWXRELGtCQUFrQjtBQUNsQixNQUFNLGNBQWMsR0FBRztJQUNuQixXQUFXLEVBQUU7UUFDVCxPQUFPLEVBQUUsS0FBSztRQUNkLGVBQWUsRUFBRSxLQUFLO1FBQ3RCLGtCQUFrQixFQUFFLEtBQUs7S0FDNUI7SUFDRCxTQUFTLEVBQUU7UUFDUCxPQUFPLEVBQUUsSUFBSTtRQUNiLElBQUksRUFBRSxDQUFDLE1BQWMsRUFBRSxFQUFFLENBQUMsVUFBVSxNQUFNLENBQUMsSUFBSSxFQUFFO1FBQ2pELElBQUksRUFBRSxDQUFDLE1BQWMsRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUk7S0FDeEM7SUFDRCxZQUFZLEVBQUU7UUFDVixPQUFPLEVBQUUsS0FBSztRQUNkLFdBQVcsRUFBRSxDQUFDO1FBQ2QsSUFBSSxFQUFFLENBQUMsTUFBYyxFQUFFLEVBQUUsQ0FBQyxrQkFBa0IsTUFBTSxDQUFDLFdBQVcsRUFBRTtRQUNoRSxLQUFLLEVBQUU7WUFDSCxPQUFPLEVBQUUsTUFBTTtZQUNmLFFBQVEsRUFBRSxLQUFLO1lBQ2Ysa0JBQWtCLEVBQUUsaUJBQWlCO1lBQ3JDLE9BQU8sRUFBRSxPQUFPO1lBQ2hCLFdBQVcsRUFBRSxNQUFNO1NBQ3RCO0tBQ0o7SUFDRCxhQUFhLEVBQUUsQ0FBQyxPQUFlLEVBQVEsRUFBRSxHQUFHLENBQUM7SUFDN0MsZUFBZSxFQUFFLENBQUMsT0FBZSxFQUFFLE1BQWMsRUFBUSxFQUFFLEdBQUcsQ0FBQztJQUMvRCxPQUFPLEVBQUUsSUFBSSxLQUFLLEVBQVU7Q0FDL0IsQ0FBQztBQUVGLHVDQUF1QztBQUN2QyxTQUFTLFlBQVk7SUFDakIsSUFBSSxDQUFDLEdBQUcsSUFBSSxJQUFJ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