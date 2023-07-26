import { useEffect, useState, FC } from "react";
import loadImage from "blueimp-load-image";
import {
    splitImage,
    mergeTiles,
    SplitResult,
    ImageUtilWorker,
} from "../lib/imageutil";
import * as uuid from "uuid";

export const TestPage: FC = () => {
    const [originalImage, setOriginalImage] = useState<string | undefined>();
    const [upscaledImage, setUpscaledImage] = useState<string | undefined>();
    const [imageWorker, setImageWorker] = useState<
        ImageUtilWorker | undefined
    >();

    useEffect(() => {
        const imageWorker = new ImageUtilWorker();
        setImageWorker(imageWorker);
        return () => {
            imageWorker.destroy();
        };
    }, []);

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
        console.log("upscaling image data", imageData.width, imageData.height);
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

    const onImageSelected = async (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        if (!imageWorker) {
            throw new Error("Image worker not initialized");
        }
        const files = event.target.files;
        if (files && files.length > 0) {
            loadImage(
                files[0],
                async (img) => {
                    const c = img as HTMLCanvasElement;
                    const originalImage = c.toDataURL("image/webp");
                    setOriginalImage(originalImage);

                    const ctx = c.getContext("2d");
                    if (ctx) {
                        const originalImageData = ctx.getImageData(
                            0,
                            0,
                            c.width,
                            c.height
                        );
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
                                const upscaledImageData = upscaledTile
                                .getContext("2d")!
                                .getImageData(
                                    0,
                                    0,
                                    upscaledTile.width,
                                    upscaledTile.height
                                );
                                const id = uuid.v4();
                                const feathered =
                                    await imageWorker.processRequest({
                                        id,
                                        alphaMode: "none",
                                        feather: true,
                                        width: splitResult.imageWidth,
                                        height: splitResult.imageHeight,
                                        pixels: upscaledImageData.data,
                                        selectionOverlay: {
                                            x:
                                                x *
                                                (splitResult.tileSize - 64),
                                            y:
                                                y *
                                                (splitResult.tileSize - 64),
                                            width: upscaledTile.width,
                                            height: upscaledTile.height,
                                        },
                                        upscale: true,
                                        featherWidth: 64,
                                    });

                                splitResult.tiles[x][y] = new ImageData(feathered.pixels, upscaledTile.width, upscaledTile.height)
                            }
                        }
                        const upscaledImageData = mergeTiles(splitResult);
                        console.log(
                            "upscaled image data size",
                            upscaledImageData.width,
                            upscaledImageData.height
                        );
                        const upscaledCanvas =
                            imageDataToCanvas(upscaledImageData);
                        const upscaledImage =
                            upscaledCanvas.toDataURL("image/webp");
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
            {originalImage && upscaledImage && (
                <div>
                    Original:
                    <br />
                    <img src={originalImage} />
                    <br />
                    Upscaled:
                    <br />
                    <img src={upscaledImage} />
                </div>
            )}
        </div>
    );
};
