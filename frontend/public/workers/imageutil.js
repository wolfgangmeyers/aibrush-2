// import { Rect } from "../pages/image-editor/models";

function featherEdges(
    selectionOverlay,
    imageWidth,
    imageHeight,
    imageData,
    featherWidth,
    upscale,
) {
    console.log("featherEdges", selectionOverlay, imageWidth, imageHeight);
    const featherLeftEdge = selectionOverlay.x != 0;
    const featherRightEdge =
        !upscale && selectionOverlay.x + selectionOverlay.width != imageWidth;
    const featherTopEdge = selectionOverlay.y != 0;
    const featherBottomEdge =
        !upscale && selectionOverlay.y + selectionOverlay.height != imageHeight;

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

// backup

// function applyAlphaMask(imageData, alphaMask, alphaMode) {
//     console.log("applyAlphaMask", imageData, alphaMask);
//     if (
//         imageData.width != alphaMask.width ||
//         imageData.height != alphaMask.height
//     ) {
//         throw new Error("imageData and alphaMask are not the same size");
//     }
//     const alphaOffset = alphaMode === "alpha" ? 3 : 0;
//     const spread = 10;
//     for (let x = 0; x < imageData.width; x++) {
//         for (let y = 0; y < imageData.height; y++) {
//             // r, g, b, a
//             // if transparency within 10 pixels, set alpha to 1, otherwise to zero.
//             // binary alpha inversion with spread
//             let alpha = false;
//             for (
//                 let x2 = Math.max(0, x - spread);
//                 x2 < Math.min(imageData.width, x + spread);
//                 x2++
//             ) {
//                 for (
//                     let y2 = Math.max(0, y - spread);
//                     y2 < Math.min(imageData.height, y + spread);
//                     y2++
//                 ) {
//                     const alphaValue =
//                         alphaMask.data[y2 * alphaMask.width * 4 + x2 * 4 + alphaOffset];
//                     if (alphaValue < 255) {
//                         alpha = true;
//                     }
//                 }
//             }
//             const alphaIndex = y * imageData.width * 4 + x * 4 + 3;
//             // invert alpha calculation for mask mode
//             if (alphaMode === "mask") {
//                 alpha = !alpha;
//             }
//             if (alpha) {
//                 imageData.data[alphaIndex] = 255;
//             } else {
//                 imageData.data[alphaIndex] = 0;
//             }
//         }
//     }
// }

function applyAlphaMask(imageData, alphaMask, alphaMode) {
    console.log("applyAlphaMask", imageData, alphaMask);
    if (
        imageData.width != alphaMask.width ||
        imageData.height != alphaMask.height
    ) {
        throw new Error("imageData and alphaMask are not the same size");
    }
    const alphaOffset = alphaMode === "alpha" ? 3 : 0;
    const spread = 10;
    for (let x = 0; x < imageData.width; x++) {
        for (let y = 0; y < imageData.height; y++) {
            // r, g, b, a
            // if transparency within 10 pixels, set alpha to 1, otherwise to zero.
            // binary alpha inversion with spread
            let alphaValue = 0;
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
                    let maskValue =
                        alphaMask.data[y2 * alphaMask.width * 4 + x2 * 4 + alphaOffset];
                    if (alphaMode === "mask") {
                        maskValue = 255 - maskValue;
                    }
                    if (maskValue < 255) {
                        const distance = Math.min(
                            Math.abs(x - x2),
                            Math.abs(y - y2)
                        )
                        alphaValue = Math.max(alphaValue, Math.ceil(((spread - distance) / spread) * 255));
                    }
                }
            }
            const alphaIndex = y * imageData.width * 4 + x * 4 + 3;
            // invert alpha calculation for mask mode
            // if (alphaMode === "mask") {
            //     alphaValue = 255 - alphaValue;
            // }
            // if (alpha) {
            //     imageData.data[alphaIndex] = alphaValue;
            // } else {
            //     imageData.data[alphaIndex] = 0;
            // }
            imageData.data[alphaIndex] = alphaValue;
        }
    }
}

self.addEventListener('message', (evt) => {
    const { id, feather, alphaMode, pixels, alphaPixels, width, height, featherWidth, selectionOverlay, upscale } = evt.data;
    const imageData = new ImageData(pixels, selectionOverlay.width, selectionOverlay.height);
    if (feather) {
        featherEdges(selectionOverlay, width, height, imageData, featherWidth, upscale);
    }
    if (alphaMode !== "none") {
        const alphaMask = new ImageData(
            new Uint8ClampedArray(alphaPixels),
            selectionOverlay.width,
            selectionOverlay.height,
        );
        applyAlphaMask(imageData, alphaMask, alphaMode);
    }
    self.postMessage({
        id,
        pixels: imageData.data
    }, [imageData.data.buffer]);
});

function createEncodedThumbnail(encodedImage) {
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

function encodedImageToBlob(encodedImage) {
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
function uploadBlob(signedUrl, blob) {
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