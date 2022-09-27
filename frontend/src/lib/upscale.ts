import { aspectRatios } from "./aspecRatios";

export function getUpscaleLevel(width: number, height: number): number {
    let upscaleLevel = 0;
    for (let i = 0; i < aspectRatios.length; i++) {
        const aspectRatio = aspectRatios[i];
        if (width === aspectRatio.width && height === aspectRatio.height) {
            return upscaleLevel;
        }
    }
    width /= 2;
    height /= 2;
    upscaleLevel++;
    for (let i = 0; i < aspectRatios.length; i++) {
        const aspectRatio = aspectRatios[i];
        if (width === aspectRatio.width && height === aspectRatio.height) {
            return upscaleLevel;
        }
    }
    width /= 2;
    height /= 2;
    upscaleLevel++;
    for (let i = 0; i < aspectRatios.length; i++) {
        const aspectRatio = aspectRatios[i];
        if (width === aspectRatio.width && height === aspectRatio.height) {
            return upscaleLevel;
        }
    }
    return -1;
}
