import React, { FC, useState, useEffect } from "react";
import loadImage from "blueimp-load-image";
import saveAs from "file-saver";
import axios from "axios";
import * as uuid from "uuid";

import { sleep } from "../../lib/sleep";

import { Renderer } from "./renderer";
import { BaseTool, Tool } from "./tool";
import {
    ImageUtilWorker,
    imageDataToCanvas,
    fixImageSize,
    decodeImage,
} from "../../lib/imageutil";
import { ErrorNotification } from "../../components/Alerts";
import moment from "moment";
import { calculateImagesCost } from "../../lib/credits";
import { CostIndicator } from "../../components/CostIndicator";
import { LocalImage } from "../../lib/models";
import { HordeGenerator } from "../../lib/hordegenerator";

export const anonymousClient = axios.create();

interface Props {
    renderer: Renderer;
    tool: BaseTool;
    generator: HordeGenerator;
    image: LocalImage;
}

export const AugmentControls: FC<Props> = ({ renderer, tool, generator, image }) => {
    const [backupImage, setBackupImage] = useState<string | undefined>();
    const [activeAugmentation, setActiveAugmentation] = useState<
        "upscale" | "face_restore" | null
    >(null);
    const [imageWorker, setImageWorker] = useState<
        ImageUtilWorker | undefined
    >();
    const [error, setError] = useState<string | null>(null);
    const [lastError, setLastError] = useState<number>(0);

    useEffect(() => {
        const imageWorker = new ImageUtilWorker();
        setImageWorker(imageWorker);
        return () => {
            imageWorker.destroy();
        };
    }, []);

    const augmentImageData = async (
        imageData: ImageData,
        augmentation: "upscale" | "face_restore"
    ): Promise<ImageData> => {
        if (!imageWorker) {
            throw new Error("Image worker not initialized");
        }
        let c = imageDataToCanvas(imageData);
        let encodedImage = c.toDataURL("image/webp").split(",")[1];
        c.remove();

        // TODO: use progress indicator
        const start = moment().valueOf();
        let processingImage = await generator.augmentImage({
            augmentation: augmentation,
            image: {
                imageData: encodedImage,
            }
        });
        while (processingImage.status !== "completed") {
            await sleep(2000);
            processingImage = await generator.checkAugmentation(processingImage);
            if (processingImage.status === "error") {
                throw new Error("Augmentation failed");
            }
            if (moment().valueOf() - start > 60000) {
                await generator.client.deleteInterrogationRequest(processingImage.id);
                throw new Error("Augmentation timed out");
            }
        }
        encodedImage = processingImage.imageData!;
        const img = await decodeImage(encodedImage);
        c = document.createElement("canvas");
        const upscaleFactor = augmentation === "upscale" ? 2 : 1;
        c.width = imageData.width * upscaleFactor;
        c.height = imageData.height * upscaleFactor;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const newImageData = ctx.getImageData(0, 0, c.width, c.height);
        c.remove();
        return newImageData;
    };

    const onAugment = async (augmentation: "upscale" | "face_restore") => {
        setActiveAugmentation(augmentation);
        setError(null);
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

            const newImageData = await augmentImageData(
                imageData,
                augmentation
            );
            const newCanvas = imageDataToCanvas(newImageData);
            renderer.setBaseImage(newCanvas);
            newCanvas.remove();
        } catch (err: any) {
            setError(err.message || "Augmentation failed");
            setLastError(moment().valueOf());
        } finally {
            setActiveAugmentation(null);
        }
    };

    if (activeAugmentation) {
        return (
            <div className="form-group" style={{ marginTop: "16px" }}>
                <i className="fas fa-spinner fa-spin"></i>&nbsp;{" "}
                {activeAugmentation === "upscale"
                    ? "Upscaling..."
                    : "Restoring faces..."}
            </div>
        );
    }

    if (backupImage) {
        return (
            <div className="form-group" style={{ marginTop: "16px" }}>
                <ErrorNotification message={error} timestamp={lastError} />
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        setBackupImage(undefined);
                        const img = new Image();
                        // set src as data uri
                        const src = "data:image/webp;base64," + backupImage;
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

    const maxSize = 2048 * 2048;
    if (renderer.getWidth() * renderer.getHeight() > maxSize) {
        return (
            <div style={{ marginTop: "16px" }}>
                This image is too large to augment.
            </div>
        );
    }

    const cost = calculateImagesCost(1, image.params.width!, image.params.height!);

    // Show buttons for import and export and "save a copy"
    return (
        <>
            <ErrorNotification message={error} timestamp={lastError} />
            <div className="form-group" style={{ marginTop: "16px" }}>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        onAugment("upscale");
                    }}
                    style={{ marginLeft: "8px" }}
                >
                    {/* upscale icon */}
                    <i className="fas fa-arrows-alt"></i>&nbsp; Upscale Image 2x
                </button>
            </div>
            <div className="form-group" style={{ marginTop: "16px" }}>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        onAugment("face_restore");
                    }}
                    style={{ marginLeft: "8px" }}
                >
                    {/* face restore icon */}
                    <i className="fas fa-smile"></i>&nbsp; Restore Faces
                </button>
            </div>
            <div className="form-group" style={{ marginTop: "16px" }}>
                <CostIndicator imagesCost={cost} />
            </div>
        </>
    );
};
