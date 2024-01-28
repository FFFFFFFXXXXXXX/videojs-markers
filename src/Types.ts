export interface MarkerOptions {
    time: number,
    duration?: number,
    text?: string,
    class?: string,
};

export type Marker = MarkerOptions & { readonly id: string };

export type Settings = {
    markerStyle: Partial<CSSStyleDeclaration>,
    markerTip: Partial<HTMLElement> & {
        display: boolean,
        innerHtml: (marker: MarkerOptions) => string
    },
    onMarkerReached?: (marker: MarkerOptions) => void,
}

export type Range = {
    from: number,
    to: number
}
