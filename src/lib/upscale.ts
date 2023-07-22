import { aspectRatios } from "./aspecRatios";

export function getUpscaleLevel(width: number, height: number): number {
    for (let i = 0; i < aspectRatios.length; i++) {
        const aspectRatio = aspectRatios[i];
        if (width * height <= aspectRatio.width * aspectRatio.height) {
            return 0;
        }
        // if (width === aspectRatio.width && height === aspectRatio.height) {
        //     return upscaleLevel;
        // }
    }
    width /= 2;
    height /= 2;
    for (let i = 0; i < aspectRatios.length; i++) {
        const aspectRatio = aspectRatios[i];
        if (width * height <= aspectRatio.width * aspectRatio.height) {
            return 1;
        }
        // if (width === aspectRatio.width && height === aspectRatio.height) {
        //     return upscaleLevel;
        // }
    }
    return 2;
}
