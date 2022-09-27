import loadImage, { LoadImageOptions } from "blueimp-load-image";

export function loadImageAsync(
    file: string | File | Blob,
    options: LoadImageOptions,
): Promise<Event | HTMLImageElement | HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
        loadImage(file, (img: Event | HTMLImageElement | HTMLCanvasElement) => {
            resolve(img);
        }, options);
    });
}
