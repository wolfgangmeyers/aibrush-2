import { Rect } from "../pages/image-editor/models";

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

function getAverageColor(imageData: ImageData) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let i = 0; i < imageData.data.length; i += 4) {
        if (imageData.data[i + 3] > 0) {
            red += imageData.data[i];
            green += imageData.data[i + 1];
            blue += imageData.data[i + 2];
            count++;
        }
    }
    return {
        red: red / count,
        green: green / count,
        blue: blue / count,
    };
}

export function fixRedShift(baseImageData: ImageData, imageData: ImageData) {
    // get the average red, green and blue values for the base image
    const baseAverageColor = getAverageColor(baseImageData);
    const averageColor = getAverageColor(imageData);

    // we need to multiply pixels in imageData by an amount so that the average equals the base average
    // do this for red, green and blue separately
    const redMultiplier = baseAverageColor.red / averageColor.red;
    const greenMultiplier = baseAverageColor.green / averageColor.green;
    const blueMultiplier = baseAverageColor.blue / averageColor.blue;

    for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] *= Math.floor(redMultiplier);
        imageData.data[i + 1] *= Math.floor(greenMultiplier);
        imageData.data[i + 2] *= Math.floor(blueMultiplier);
    }
}

export function createEncodedThumbnail(encodedImage: string): Promise<string> {
    return new Promise((resolve, reject) => {
        // use html5 canvas
        // crop to square aspect ratio on 128x128 canvas
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;

        const image = new Image();
        image.src = `data:image/png;base64,${encodedImage}`;
        image.onload = () => {
            const context = canvas.getContext("2d");
            if (!context) {
                throw new Error("Could not create canvas context");
            }
            const width = 128;
            const height = 128;
            canvas.width = width;
            canvas.height = height;
            
            const aspectRatio = image.width / image.height;
            const cropWidth = aspectRatio > 1 ? image.width : image.height * aspectRatio;
            const cropHeight = aspectRatio > 1 ? image.width / aspectRatio : image.height;
            const cropX = (image.width - cropWidth) / 2;
            const cropY = (image.height - cropHeight) / 2;
            context.drawImage(
                image,
                cropX,
                cropY,
                cropWidth,
                cropHeight,
                0,
                0,
                width,
                height
            );

            // save to png
            const imageUrl = canvas.toDataURL("image/png");
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
};