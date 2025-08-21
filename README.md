# Video.js Markers

A plugin that displays customizable markers in the progress bars of the of a [Video.js](https://github.com/videojs/video.js/) player.

## Features
* Display markers on progress bar, with hover-over tooltips
* Flexible styling
* Support dynamically adding and removing markers

## Quick Start
Add the 'videojs.markers.js' plugin and stylesheet after including videojs script

    <link href="{VIDEOJS CSS}" rel="stylesheet">
    <link href="videojs-markers.css" rel="stylesheet">
    <script src="{VIDEOJS JS}"></script>
    <script src='../src/videojs-markers.js'></script>

### Customize marker style:
The style of the markers could be modified by passing an optional setting "markerStyle" with your preference of css styles.

```js
const player = videojs('markers_test');

player.markers({
    markerStyle: {
       'width':'8px',
       'background-color': 'red'
    }
});
```

## Development

```
git clone https://github.com/spchuang/videojs-markers
cd videojs-markers
npm install
npm run build
```

## History
- 1.2.1
  - bugfixes
- 1.1.0
  - Rewrite as advanced videojs plugin
  - Add typescript types / typechecking
- 1.0.2
   - Fixing issue #109
- 1.0.1
   - fix /dist missing issue (issue 81)
- 1.0.0
   - add force flag in updateTime
   - small bug fixes including UI bug (https://github.com/spchuang/videojs-markers/pull/79)
- 0.9.0
   - remove jquery dependency
- 0.7.0
   - support videojs 5
- 0.6.0
   - add index parameter to `onMarkerReached`
   - fix bugs where video crashes when played the second time
   - break overlay uses `html` instead of `test`
   - added babel && flow
- 0.5.0
   - add 'onMarkerClick' callback handler. When this returns false, the default behavior of seeking to the marker time will be prevented.
   - add new 'getMarkers' API
   - remove constraints of using 'time' as the marker time attribute. Instead, a new markertip.time() function is added to resolve the time dynamically. This mean the time attribute can be represented in different attributes. This also made marker times modifiable (see new demo file). Note that the UI position of the marker will only be updated after you call marker.players.updateTime().
- 0.4
   - change display_time to displayTime
   - markers now takes an array of object containing time, text, overlay text
   - add markerReached callback
   - markerTip and overlay text is now a clalback function for higher flexibility
   - Add many markers APIs for adding and removing markers dynamically.
- 0.1
   - initial release


## License
This project is licensed under MIT.
