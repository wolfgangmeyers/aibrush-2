import axios from "axios";
import { Buffer } from "buffer";
import { Rect } from "../pages/image-editor/models";
import { LocalImage } from "./models";
import saveAs from "file-saver";

const anonymousClient = axios.create();

export interface SplitResult {
    numTilesX: number;
    numTilesY: number;
    tileSize: number;
    imageWidth: number;
    imageHeight: number;
    tiles: ImageData[][]; // [x][y]
}

export function convertImageFormat(
    encodedImage: string,
    srcFormat: string,
    destFormat: string
): Promise<string> {
    const isDataUrl = encodedImage.startsWith("data:image");
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement("canvas");
            try {
                canvas.width = image.width;
                canvas.height = image.height;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    throw new Error("Could not get canvas context");
                }
                ctx.drawImage(image, 0, 0);
                const dataUrl = canvas.toDataURL(`image/${destFormat}`);
                if (isDataUrl) {
                    resolve(dataUrl);
                } else {
                    resolve(dataUrl.split(",")[1]);
                }
            } finally {
                canvas.remove();
            }
        };
        if (isDataUrl) {
            image.src = encodedImage;
        } else {
            image.src = `data:image/${srcFormat};base64,${encodedImage}`;
        }
    });
}

export async function downloadImage(
    baseName: string,
    dataUrl: string,
    format: string
) {
    const srcFormat = getImageFormat(dataUrl);
    if (srcFormat != format) {
        dataUrl = await convertImageFormat(dataUrl, srcFormat, format);
    }
    const encodedImage = dataUrl.split(",")[1];
    // base64 decode
    const byteString = atob(encodedImage);
    // save as file
    const buffer = new ArrayBuffer(byteString.length);
    const intArray = new Uint8Array(buffer);
    for (let i = 0; i < byteString.length; i++) {
        intArray[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([intArray], { type: `image/${format}` });
    saveAs(blob, `${baseName}.${format}`);
}

export function loadImageDataElement(
    image: LocalImage
): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const src = image.imageData!;
        const imageElement = new Image();
        imageElement.src = src;
        imageElement.onload = () => {
            resolve(imageElement);
        };
    });
}

// split image for individual upscales
export function splitImage(initImage: ImageData) {
    // Check if the image area is larger than 512x512
    if (initImage.width * initImage.height > 512 * 512) {
        // use a temporary canvas to split the image
        const canvas = document.createElement("canvas");
        try {
            canvas.width = initImage.width;
            canvas.height = initImage.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                throw new Error("Could not get canvas context");
            }
            ctx.putImageData(initImage, 0, 0);
            const tile_size = Math.min(initImage.width, initImage.height, 512);
            // split the image into 512x512 tiles
            // they need to overlap by at least 32 pixels
            // so that the edges can be merged

            // calculate the number of tiles in each dimension
            const num_tiles_x = Math.ceil(initImage.width / (tile_size - 32));
            const num_tiles_y = Math.ceil(initImage.height / (tile_size - 32));

            const tiles: ImageData[][] = [];
            for (let x = 0; x < num_tiles_x; x++) {
                tiles.push([]);
                for (let y = 0; y < num_tiles_y; y++) {
                    // calculate the bounding box of the tile
                    const x0 = x * (tile_size - 32);
                    const y0 = y * (tile_size - 32);
                    const x1 = Math.min(x0 + tile_size, initImage.width);
                    const y1 = Math.min(y0 + tile_size, initImage.height);
                    // crop the tile
                    const tile = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
                    tiles[x].push(tile);
                }
            }
            return {
                numTilesX: num_tiles_x,
                numTilesY: num_tiles_y,
                tileSize: tile_size,
                imageWidth: initImage.width,
                imageHeight: initImage.height,
                tiles,
            };
        } finally {
            canvas.remove();
        }
    } else {
        return null;
    }
}

// merge the tiles back into a single image
// tiles should be 2x original size
export function mergeTiles(splitResult: SplitResult): ImageData {
    // create a new image
    const canvas = document.createElement("canvas");
    try {
        canvas.width = splitResult.imageWidth;
        canvas.height = splitResult.imageHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Could not get canvas context");
        }
        for (let x = 0; x < splitResult.numTilesX; x++) {
            for (let y = 0; y < splitResult.numTilesY; y++) {
                // load the tile
                const tile = splitResult.tiles[x][y];
                const tileCanvas = imageDataToCanvas(tile);

                // paste the tile into the new image
                ctx.drawImage(
                    tileCanvas,
                    x * (splitResult.tileSize - 64),
                    y * (splitResult.tileSize - 64)
                );
            }
        }
        return ctx.getImageData(
            0,
            0,
            splitResult.imageWidth,
            splitResult.imageHeight
        );
    } finally {
        canvas.remove();
    }
}

export function imageDataToCanvas(imageData: ImageData): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Could not get canvas context");
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

// extract resizing logic from above function into a reusable resizeImage function
export function resizeImage(
    image: HTMLCanvasElement,
    width: number,
    height: number
): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    try {
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Could not get canvas context");
        }
        ctx.drawImage(image, 0, 0, width, height);
        return canvas;
    } finally {
        image.remove();
    }
}

// re-implement fixImageSize using resizeImage
export function fixImageSize(image: HTMLCanvasElement): HTMLCanvasElement {
    // if the width and the height are divisible by 64, return the image data
    // otherwise, resize up to the next multiple of 64
    const width = Math.ceil(image.width / 64) * 64;
    const height = Math.ceil(image.height / 64) * 64;
    if (width == image.width && height == image.height) {
        return image;
    }
    return resizeImage(image, width, height);
}

export function featherEdges(
    selectionOverlay: Rect,
    imageWidth: number,
    imageHeight: number,
    imageData: ImageData,
    featherWidth?: number
) {
    const featherLeftEdge = selectionOverlay.x != 0;
    const featherRightEdge =
        selectionOverlay.x + selectionOverlay.width != imageWidth;
    const featherTopEdge = selectionOverlay.y != 0;
    const featherBottomEdge =
        selectionOverlay.y + selectionOverlay.height != imageHeight;

    const baseWidth = Math.min(selectionOverlay.width, selectionOverlay.height);
    if (!featherWidth) {
        featherWidth = Math.floor(baseWidth / 8);
    }

    if (featherTopEdge) {
        for (let y = 0; y < featherWidth; y++) {
            for (let x = 0; x < selectionOverlay.width; x++) {
                const pixelIndex = (y * selectionOverlay.width + x) * 4;
                const alpha = (y / featherWidth) * 255;
                const existingAlpha = imageData.data[pixelIndex + 3];
                imageData.data[pixelIndex + 3] = Math.min(alpha, existingAlpha);
            }
        }
    }
    if (featherBottomEdge) {
        for (
            let y = selectionOverlay.height - featherWidth;
            y < selectionOverlay.height;
            y++
        ) {
            for (let x = 0; x < selectionOverlay.width; x++) {
                const pixelIndex = (y * selectionOverlay.width + x) * 4;
                const alpha =
                    ((selectionOverlay.height - y) / featherWidth) * 255;
                const existingAlpha = imageData.data[pixelIndex + 3];
                imageData.data[pixelIndex + 3] = Math.min(alpha, existingAlpha);
            }
        }
    }
    if (featherLeftEdge) {
        for (let x = 0; x < featherWidth; x++) {
            for (let y = 0; y < selectionOverlay.height; y++) {
                const pixelIndex = (y * selectionOverlay.width + x) * 4;
                const alpha = (x / featherWidth) * 255;
                const existingAlpha = imageData.data[pixelIndex + 3];
                imageData.data[pixelIndex + 3] = Math.min(alpha, existingAlpha);
            }
        }
    }
    if (featherRightEdge) {
        for (
            let x = selectionOverlay.width - featherWidth;
            x < selectionOverlay.width;
            x++
        ) {
            for (let y = 0; y < selectionOverlay.height; y++) {
                const pixelIndex = (y * selectionOverlay.width + x) * 4;
                const alpha =
                    ((selectionOverlay.width - x) / featherWidth) * 255;
                const existingAlpha = imageData.data[pixelIndex + 3];
                imageData.data[pixelIndex + 3] = Math.min(alpha, existingAlpha);
            }
        }
    }
}

export function applyAlphaMask(imageData: ImageData, alphaMask: ImageData) {
    if (
        imageData.width != alphaMask.width ||
        imageData.height != alphaMask.height
    ) {
        throw new Error("imageData and alphaMask are not the same size");
    }
    const spread = 10;
    for (let x = 0; x < imageData.width; x++) {
        for (let y = 0; y < imageData.height; y++) {
            // r, g, b, a
            // if transparency within 10 pixels, set alpha to 1, otherwise to zero.
            // binary alpha inversion with spread
            let alpha = false;
            for (
                let x2 = Math.max(0, x - spread);
                x2 < Math.min(imageData.width, x + spread);
                x2++
            ) {
                for (
                    let y2 = Math.max(0, y - spread);
                    y2 < Math.min(imageData.height, y + spread);
                    y2++
                ) {
                    const alphaValue =
                        alphaMask.data[y2 * alphaMask.width * 4 + x2 * 4 + 3];
                    if (alphaValue < 255) {
                        alpha = true;
                    }
                }
            }
            const alphaIndex = y * imageData.width * 4 + x * 4 + 3;
            if (alpha) {
                imageData.data[alphaIndex] = 255;
            } else {
                imageData.data[alphaIndex] = 0;
            }
        }
    }
}

export function createBlankImage(
    color: string,
    width: number,
    height: number
): string {
    const canvas = document.createElement("canvas");
    try {
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d")!;
        context.fillStyle = color;
        context.fillRect(0, 0, width, height);
        return canvas.toDataURL().split(",")[1];
    } finally {
        canvas.remove();
    }
}

export interface ImageWorkerRequest {
    id: string;
    feather: boolean;
    upscale?: boolean;
    alphaMode: "none" | "mask" | "alpha";
    pixels: Uint8ClampedArray;
    alphaPixels?: Uint8ClampedArray;
    width: number;
    height: number;
    featherWidth?: number;
    selectionOverlay: Rect;
}

export interface ImageWorkerResponse {
    id: string;
    pixels: Uint8ClampedArray;
}

export class ImageUtilWorker {
    private workers: Array<Worker> = [];
    private callbacks: { [key: string]: (event: MessageEvent) => void } = {};
    private cursor = 0;

    constructor(numWorkers = 3) {
        for (let i = 0; i < numWorkers; i++) {
            this.workers[i] = new Worker(`/workers/imageutil.js`);
            this.workers[i].addEventListener(
                "message",
                this.onMessage.bind(this)
            );
        }
    }

    onMessage(event: MessageEvent) {
        const resp = event.data as ImageWorkerResponse;
        this.callbacks[resp.id](event);
        delete this.callbacks[resp.id];
    }

    async processRequest(
        request: ImageWorkerRequest
    ): Promise<ImageWorkerResponse> {
        return new Promise((resolve, reject) => {
            this.callbacks[request.id] = (event) => {
                resolve(event.data);
            };
            this.workers[this.cursor].postMessage({
                ...request,
            });
            this.cursor = (this.cursor + 1) % this.workers.length;
        });
    }

    destroy() {
        for (let key in this.workers) {
            this.workers[key].terminate();
        }
    }
}

export function getImageFormat(imageUrl: string): string {
    return imageUrl.split(";")[0].split("/")[1];
}

export function createEncodedThumbnail(encodedImage: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement("canvas");
        const thumbSize = 128;
        let thumbWidth = thumbSize;
        let thumbHeight = thumbSize;

        const image = new Image();
        let dataUrl = false;
        if (encodedImage.startsWith("data:image")) {
            dataUrl = true;
            image.src = encodedImage;
        } else {
            image.src = `data:image/webp;base64,${encodedImage}`;
        }

        image.onload = () => {
            const context = canvas.getContext("2d");
            if (!context) {
                reject(new Error("Could not create canvas context"));
                return;
            }

            let aspectRatio = image.width / image.height;
            if (aspectRatio > 1) {
                thumbHeight = thumbSize / aspectRatio;
            } else {
                thumbWidth = thumbSize * aspectRatio;
            }

            canvas.width = thumbWidth;
            canvas.height = thumbHeight;

            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = "high";

            context.drawImage(
                image, // Source image
                0, // Source x
                0, // Source y
                image.width, // Source width
                image.height, // Source height
                0, // Destination x
                0, // Destination y
                thumbWidth, // Destination width
                thumbHeight // Destination height
            );

            const imageUrl = canvas.toDataURL("image/webp");
            if (dataUrl) {
                resolve(imageUrl);
            } else {
                const base64 = imageUrl.split(",")[1];
                resolve(base64);
            }
        };

        image.onerror = (error) => {
            reject(error);
        };
    });
}


export function decodeImage(encodedImage: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        if (!encodedImage.startsWith("data:image")) {
            encodedImage = `data:image/png;base64,${encodedImage}`;
        }
        image.src = encodedImage;
        image.onload = () => {
            resolve(image);
        };
    });
}

export function binaryImageToDataBase64(binaryImage: any): string {
    const buf = Buffer.from(binaryImage, "binary");
    return buf.toString("base64");
}

export function resizeEncodedImage(
    encodedImage: string,
    width: number,
    height: number,
    format: "png" | "jpeg" | "webp"
): Promise<string> {
    return new Promise((resolve, reject) => {
        // use html5 canvas
        // crop to square aspect ratio on 128x128 canvas
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const image = new Image();
        image.src = `data:image/${format};base64,${encodedImage}`;
        image.onload = () => {
            const context = canvas.getContext("2d");
            if (!context) {
                throw new Error("Could not create canvas context");
            }
            canvas.width = width;
            canvas.height = height;

            context.drawImage(
                image,
                0,
                0,
                image.width,
                image.height,
                0,
                0,
                width,
                height
            );

            // save to png
            const imageUrl = canvas.toDataURL("image/${format}");
            const base64 = imageUrl.split(",")[1];
            resolve(base64);
        };
    });
}

export function encodedImageToBlob(encodedImage: string): Blob {
    const binaryString = atob(encodedImage);
    const arr = [];
    for (let i = 0; i < binaryString.length; i++) {
        arr.push(binaryString.charCodeAt(i));
    }
    return new Blob([new Uint8Array(arr)], {
        type: "image/png",
    });
}

// This function is made to work with S3 presigned urls.
// Solution found at https://stackoverflow.com/questions/22531114/how-to-upload-to-aws-s3-directly-from-browser-using-a-pre-signed-url-instead-of
export function uploadBlob(signedUrl: string, blob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
        var xhr = new XMLHttpRequest();
        xhr.open("PUT", signedUrl, true);
        xhr.setRequestHeader("Content-Type", "image/png");
        xhr.onload = () => {
            if (xhr.status < 400) {
                // success!
                resolve();
            }
        };
        xhr.onerror = (err) => {
            // error...
            reject(err);
        };
        xhr.send(blob); // `file` is a File object here
    });
}
