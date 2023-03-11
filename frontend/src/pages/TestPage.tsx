import { useEffect, useState, FC } from "react";
import loadImage from "blueimp-load-image";
import { splitImage, mergeTiles, SplitResult } from "../lib/imageutil";

export const TestPage : FC = () => {

    const [originalImage, setOriginalImage] = useState<string | undefined>();
    const [upscaledImage, setUpscaledImage] = useState<string | undefined>();

    const imageDataToCanvas = (imageData: ImageData): HTMLCanvasElement => {
        const canvas = document.createElement("canvas");
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Could not get canvas context");
        }
        ctx.putImageData(imageData, 0, 0);
        return canvas;
    };

    const upscaleImageData = (imageData: ImageData): HTMLCanvasElement => {
        console.log("upscaling image data", imageData.width, imageData.height)
        const canvas = document.createElement("canvas");
        canvas.width = imageData.width * 2;
        canvas.height = imageData.height * 2;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Could not get canvas context");
        }
        const image = imageDataToCanvas(imageData);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas;
    };

    const onImageSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            loadImage(
                files[0],
                (img) => {
                    const c = img as HTMLCanvasElement;
                    const originalImage = c.toDataURL("image/png");
                    setOriginalImage(originalImage);

                    const ctx = c.getContext("2d");
                    if (ctx) {
                        const originalImageData = ctx.getImageData(0, 0, c.width, c.height);
                        const splitResult = splitImage(originalImageData);
                        if (!splitResult) {
                            setUpscaledImage(originalImage);
                            return;
                        }
                        console.log("splitResult", {
                            numTilesX: splitResult.numTilesX,
                            numTilesY: splitResult.numTilesY,
                            tileSize: splitResult.tileSize,
                        });
                        splitResult.tileSize *= 2;
                        splitResult.imageWidth *= 2;
                        splitResult.imageHeight *= 2;
                        for (let x = 0; x < splitResult.numTilesX; x++) {
                            for (let y = 0; y < splitResult.numTilesY; y++) {
                                const tile = splitResult.tiles[x][y];
                                const upscaledTile = upscaleImageData(tile);
                                splitResult.tiles[x][y] = upscaledTile.getContext("2d")!.getImageData(0, 0, upscaledTile.width, upscaledTile.height);
                            }
                        }
                        const upscaledImageData = mergeTiles(splitResult);
                        console.log("upscaled image data size", upscaledImageData.width, upscaledImageData.height)
                        const upscaledCanvas = imageDataToCanvas(upscaledImageData);
                        const upscaledImage = upscaledCanvas.toDataURL("image/png");
                        setUpscaledImage(upscaledImage);
                    }
                },
                { canvas: true }
            );
        }
    };

    return (
        <div>
            <input type="file" onChange={onImageSelected} />
            {originalImage && upscaledImage && <div>
                Original:<br/>
                <img src={originalImage} />
                <br/>
                Upscaled:<br/>
                <img src={upscaledImage} />
            </div>}
        </div>
    );
}