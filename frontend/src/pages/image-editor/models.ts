export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Cursor {
    x: number;
    y: number;
    radius: number;
    color: string;
    type: "circle" | "circle-fill" | "colorpicker" | "crosshairs";
}