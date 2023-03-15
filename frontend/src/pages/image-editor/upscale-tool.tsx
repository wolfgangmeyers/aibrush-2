import React, { FC, useState, useEffect } from "react";
import loadImage from "blueimp-load-image";
import saveAs from "file-saver";
import axios from "axios";
import * as uuid from "uuid";

import { sleep } from "../../lib/sleep";

import {
    AIBrushApi,
    CreateImageInput,
    Image as APIImage,
    ImageStatusEnum,
} from "../../client";
import { Renderer } from "./renderer";
import { BaseTool, Tool } from "./tool";
import {
    splitImage,
    mergeTiles,
    ImageUtilWorker,
    imageDataToCanvas,
    fixImageSize,
    decodeImage,
    binaryImageToDataBase64,
    SplitResult,
} from "../../lib/imageutil";
import { defaultArgs } from "../../components/ImagePrompt";

export const anonymousClient = axios.create();
delete anonymousClient.defaults.headers.common["Authorization"];

interface Props {
    renderer: Renderer;
    tool: BaseTool;
    api: AIBrushApi;
    image: APIImage;
}

export const UpscaleControls: FC<Props> = ({ renderer, tool, api, image }) => {
    const [backupImage, setBackupImage] = useState<string | undefined>();
    const [upscaling, setUpscaling] = useState<boolean>(false);
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

    const upscaleImageData = async (
        imageData: ImageData
    ): Promise<ImageData> => {
        if (!imageWorker) {
            throw new Error("Image worker not initialized");
        }
        let c = imageDataToCanvas(imageData);
        let encodedImage = c.toDataURL("image/png").split(",")[1];
        c.remove();
        const input: CreateImageInput = defaultArgs();
        input.label = "";
        input.encoded_image = encodedImage;
        input.phrases = image.phrases;
        input.negative_phrases = image.negative_phrases;
        input.stable_diffusion_strength = 0.05;
        input.count = 1;
        input.model = "stable_diffusion";
        input.nsfw = true;
        input.temporary = true;
        input.width = imageData.width;
        input.height = imageData.height;
        input.upscale = true;

        const createResp = await api.createImage(input);
        let processingImage = createResp.data.images![0];
        while (processingImage.status !== ImageStatusEnum.Completed) {
            await sleep(2000);
            const checkResp = await api.getImage(processingImage.id);
            processingImage = checkResp.data;
            if (processingImage.status === ImageStatusEnum.Error) {
                throw new Error("Upscaling failed");
            }
        }
        const downloadUrls = await api.getImageDownloadUrls(processingImage.id);

        // download image data, convert to canvas and resize to 2x original,
        // convert back to image data and return.
        const imageDataResp = await anonymousClient.get(
            downloadUrls.data.image_url!,
            {
                responseType: "arraybuffer",
            }
        );
        encodedImage = binaryImageToDataBase64(imageDataResp.data);
        const img = await decodeImage(encodedImage);
        c = document.createElement("canvas");
        c.width = imageData.width * 2;
        c.height = imageData.height * 2;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const newImageData = ctx.getImageData(0, 0, c.width, c.height);
        c.remove();
        return newImageData;
    };

    const upscaleTile = async (
        splitResult: SplitResult,
        x: number,
        y: number
    ) => {
        if (!imageWorker) {
            throw new Error("Image worker not initialized");
        }
        const tile = splitResult.tiles[x][y];
        const newTile = await upscaleImageData(tile);
        const id = uuid.v4();
        const feathered = await imageWorker.processRequest({
            id,
            alpha: false,
            feather: true,
            width: splitResult.imageWidth * 2,
            height: splitResult.imageHeight * 2,
            pixels: newTile.data,
            selectionOverlay: {
                x: x * (splitResult.tileSize * 2 - 64),
                y: y * (splitResult.tileSize * 2 - 64),
                width: newTile.width,
                height: newTile.height,
            },
            upscale: true,
            featherWidth: 64,
        })
        splitResult.tiles[x][y] = new ImageData(feathered.pixels, newTile.width, newTile.height);
    };

    const onUpscale = async () => {
        setUpscaling(true);
        try {
            const backupImage = renderer.getEncodedImage(null);
            setBackupImage(backupImage);
            let imageData = renderer.getImageData(null);
            if (!imageData) {
                return;
            }
            // ensure width and height are multiples of 64
            if ((imageData.width % 64) + (imageData.height % 64) !== 0) {
                const c = fixImageSize(imageDataToCanvas(imageData));
                imageData = c
                    .getContext("2d")!
                    .getImageData(0, 0, c.width, c.height);
            }
            const splitResult = splitImage(imageData);
            if (splitResult) {
                const promises: Array<Promise<void>> = [];
                for (let x = 0; x < splitResult.tiles[0].length; x++) {
                    for (let y = 0; y < splitResult.tiles.length; y++) {
                        promises.push(upscaleTile(splitResult, x, y));
                    }
                }
                await Promise.all(promises);
                splitResult.tileSize *= 2;
                splitResult.imageWidth *= 2;
                splitResult.imageHeight *= 2;
                const newImageData = mergeTiles(splitResult);
                const newCanvas = imageDataToCanvas(newImageData);
                renderer.setBaseImage(newCanvas);
                newCanvas.remove();
            } else {
                const newImageData = await upscaleImageData(imageData);
                const newCanvas = imageDataToCanvas(newImageData);
                renderer.setBaseImage(newCanvas);
                newCanvas.remove();
            }
        } finally {
            setUpscaling(false);
        }
    };

    if (upscaling) {
        return (
            <div className="form-group" style={{ marginTop: "16px" }}>
                <i className="fas fa-spinner fa-spin"></i>&nbsp; Upscaling...
            </div>
        );
    }

    if (backupImage) {
        return (
            <div className="form-group" style={{ marginTop: "16px" }}>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        setBackupImage(undefined);
                        const img = new Image();
                        // set src as data uri
                        const src = "data:image/png;base64," + backupImage;
                        img.src = src;
                        img.onload = () => {
                            renderer.setBaseImage(img);
                        };
                    }}
                >
                    {/* cancel icon */}
                    <i className="fas fa-times"></i>&nbsp; Revert
                </button>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        setBackupImage(undefined);
                        if (tool.saveListener) {
                            const encodedImage = renderer.getEncodedImage(null);
                            if (encodedImage) {
                                tool.saveListener(encodedImage);
                            }
                        }
                    }}
                    style={{ marginLeft: "8px" }}
                >
                    {/* save icon */}
                    <i className="fas fa-save"></i>&nbsp; Save
                </button>
            </div>
        );
    }

    // Show buttons for import and export and "save a copy"
    return (
        <>
            <div className="form-group" style={{ marginTop: "16px" }}>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        onUpscale();
                    }}
                    style={{ marginLeft: "8px" }}
                >
                    {/* upscale icon */}
                    <i className="fas fa-search-plus"></i>&nbsp; Upscale Image
                    2x
                </button>
            </div>
        </>
    );
};