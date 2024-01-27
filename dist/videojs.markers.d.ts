import Player from 'video.js/dist/types/player';
import VideoJsPlugin from 'video.js/dist/types/plugin';
export type Marker = {
    time: number;
    duration: number;
    text?: string;
    class?: string;
    overlayText?: string;
    key: string;
};
export type CSSProperties = {
    [key: string]: string;
};
export type Settings = {
    markerStyle: CSSProperties;
    markerTip: {
        display: boolean;
        text: (m: Marker) => string;
        time: (m: Marker) => number;
    };
    breakOverlay: {
        display: boolean;
        displayTime: number;
        text: (m: Marker) => string;
        style: CSSProperties;
    };
    onMarkerClick: (m: Marker) => void;
    onMarkerReached: (m: Marker, i: number) => void;
    markers: Array<Marker>;
};
export declare class MarkersPlugin extends VideoJsPlugin {
    static VERSION: string;
    constructor(player: Player, options: any);
}
