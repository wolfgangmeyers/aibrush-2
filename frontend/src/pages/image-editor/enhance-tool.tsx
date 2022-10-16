import React, { FC, useState, useEffect, useRef } from "react";
import { loadImageAsync } from "../../lib/loadImage";

import { sleep } from "../../lib/sleep";
import { defaultArgs } from "../../components/ImagePrompt";
import { Tool, BaseTool } from "./tool";
import { Cursor, Rect, Renderer } from "./renderer";
import {
    AIBrushApi,
    CreateImageInput,
    Image as APIImage,
    ImageList,
    ImageStatusEnum,
} from "../../client";
import { ZoomHelper } from "./zoomHelper";
import { getClosestAspectRatio } from "../../lib/aspecRatios";

type EnhanceToolState = "default" | "busy" | "confirm" | "erase";

// eraser width modifier adds a solid core with a feather edge
// equal to the what is used on enhanced selections
const eraserWidthModifier = 1.3;

export class EnhanceTool extends BaseTool implements Tool {
    private renderer: Renderer;
    private zoomHelper: ZoomHelper;

    private prompt: string = "";
    private count: number = 4;
    private variationStrength: number = 0.35;

    private _state: EnhanceToolState = "default";
    private stateHandler: (state: EnhanceToolState) => void = () => {};
    private selectionControlsListener: (show: boolean) => void = () => {};

    private imageData: Array<ImageData> = [];
    private selectedImageDataIndex: number = -1;
    private selectedImageData: ImageData | null = null;
    private panning = false;
    private erasing = false;
    private progressListener?: (progress: number) => void;
    private errorListener?: (error: string | null) => void;

    onError(handler: (error: string | null) => void) {
        this.errorListener = handler;
    }

    private notifyError(error: string | null) {
        if (this.errorListener) {
            this.errorListener(error);
        }
    }

    get state(): EnhanceToolState {
        return this._state;
    }

    private set state(state: EnhanceToolState) {
        this._state = state;
        this.stateHandler(state);
        if (state == "confirm") {
            this.selectionControlsListener(true);
        } else {
            this.selectionControlsListener(false);
        }
    }

    constructor(renderer: Renderer) {
        super("enhance");
        this.renderer = renderer;
        this.zoomHelper = new ZoomHelper(renderer);
    }

    onMouseDown(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        let { x, y } = this.zoomHelper.translateMouseToCanvasCoordinates(
            event.nativeEvent.offsetX,
            event.nativeEvent.offsetY
        );
        if (event.button === 1) {
            this.panning = true;
            return;
        }
        if (this.state == "erase" && this.selectedImageData) {
            this.erasing = true;
            // clone selected ImageData
            this.selectedImageData = new ImageData(
                this.selectedImageData.data.slice(),
                this.selectedImageData.width,
                this.selectedImageData.height
            );

            this.erasePoint(x, y);
        }
    }

    // TODO: on erase cancel and on erase confirm
    // either restore the image data from the array
    // or overwrite the array with the new image data

    private erasePoint(x: number, y: number) {
        const selectionOverlay = this.renderer.getSelectionOverlay()!;
        const baseWidth = Math.min(
            selectionOverlay.width,
            selectionOverlay.height
        );
        const eraserRadius = Math.floor(baseWidth / 8 * eraserWidthModifier);

        const relX = x - selectionOverlay.x;
        const relY = y - selectionOverlay.y;
        const imageData = this.selectedImageData!;

        const startX = Math.max(0, relX - eraserRadius);
        const startY = Math.max(0, relY - eraserRadius);
        const endX = Math.min(imageData.width, relX + eraserRadius);
        const endY = Math.min(imageData.height, relY + eraserRadius);

        
        // relX=64.28541697636388, relY=64.24464312259761, startX=0.28541697636387653, startY=0.24464312259760845, endX=128.28541697636388, endY=128.2446431225976

        for (let i = startX; i < endX; i++) {
            for (let j = startY; j < endY; j++) {
                const index = (j * imageData.width + i) * 4;
                const distance = Math.sqrt(
                    Math.pow(i - relX, 2) + Math.pow(j - relY, 2)
                );
                if (distance < eraserRadius) {
                    // set alpha to a linear gradient from the center,
                    // 100% in the middle and 0% at the edge
                    const alphaPct = (distance / eraserRadius) * eraserWidthModifier - (eraserWidthModifier - 1);

                    const alpha = Math.min(Math.floor(
                        alphaPct * 255
                    ), imageData.data[index + 3]);
                    imageData.data[index + 3] = alpha;
                }
            }
        }
        this.renderer.setEditImage(imageData);
    }

    private updateCursor(x: number, y: number) {
        if (this.state == "erase" && this.selectedImageData) {
            const selectionOverlay = this.renderer.getSelectionOverlay()!;
            const baseWidth = Math.min(
                selectionOverlay.width,
                selectionOverlay.height
            );
            const featherWidth = Math.floor(baseWidth / 8);
            this.renderer.setCursor({
                color: "white",
                radius: featherWidth * eraserWidthModifier,
                type: "circle",
                x,
                y,
            });
        } else {
            this.renderer.setCursor({
                color: "white",
                radius: 10,
                type: "crosshairs",
                x,
                y,
            });
        }
        
    }

    onMouseMove(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        let { x, y } = this.zoomHelper.translateMouseToCanvasCoordinates(
            event.nativeEvent.offsetX,
            event.nativeEvent.offsetY
        );
        if (this.panning) {
            this.zoomHelper.onPan(event);
        }
        
        this.updateCursor(x, y);
        if (this.erasing) {
            this.erasePoint(x, y);
        }
    }

    onMouseUp(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        this.panning = false;
        this.erasing = false;
        let { x, y } = this.zoomHelper.translateMouseToCanvasCoordinates(
            event.nativeEvent.offsetX,
            event.nativeEvent.offsetY
        );
    }

    onMouseLeave(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>): void {
        this.panning = false;
        this.erasing = false;
    }

    onWheel(event: WheelEvent) {
        this.zoomHelper.onWheel(event);
        let { x, y } = this.zoomHelper.translateMouseToCanvasCoordinates(
            event.offsetX,
            event.offsetY
        );
        this.updateCursor(x, y);
    }

    updateArgs(args: any) {
        this.prompt = args.prompt || "";
        this.count = args.count || 4;
        this.variationStrength = args.variationStrength || 0.75;
    }

    onChangeState(handler: (state: EnhanceToolState) => void) {
        this.stateHandler = handler;
    }

    onShowSelectionControls(listener: (show: boolean) => void): void {
        this.selectionControlsListener = listener;
    }

    onProgress(listener: (progress: number) => void): void {
        this.progressListener = listener;
    }

    private featherEdges(
        selectionOverlay: Rect,
        imageWidth: number,
        imageHeight: number,
        imageData: ImageData
    ) {
        const featherLeftEdge = selectionOverlay.x != 0;
        const featherRightEdge =
            selectionOverlay.x + selectionOverlay.width != imageWidth;
        const featherTopEdge = selectionOverlay.y != 0;
        const featherBottomEdge =
            selectionOverlay.y + selectionOverlay.height != imageHeight;

        const baseWidth = Math.min(
            selectionOverlay.width,
            selectionOverlay.height
        );
        const featherWidth = Math.floor(baseWidth / 8);

        if (featherTopEdge) {
            for (let y = 0; y < featherWidth; y++) {
                for (let x = 0; x < selectionOverlay.width; x++) {
                    const pixelIndex = (y * selectionOverlay.width + x) * 4;
                    const alpha = (y / featherWidth) * 255;
                    const existingAlpha = imageData.data[pixelIndex + 3];
                    imageData.data[pixelIndex + 3] = Math.min(
                        alpha,
                        existingAlpha
                    );
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
                    imageData.data[pixelIndex + 3] = Math.min(
                        alpha,
                        existingAlpha
                    );
                }
            }
        }
        if (featherLeftEdge) {
            for (let x = 0; x < featherWidth; x++) {
                for (let y = 0; y < selectionOverlay.height; y++) {
                    const pixelIndex = (y * selectionOverlay.width + x) * 4;
                    const alpha = (x / featherWidth) * 255;
                    const existingAlpha = imageData.data[pixelIndex + 3];
                    imageData.data[pixelIndex + 3] = Math.min(
                        alpha,
                        existingAlpha
                    );
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
                    imageData.data[pixelIndex + 3] = Math.min(
                        alpha,
                        existingAlpha
                    );
                }
            }
        }
    }

    private loadImageData(
        api: AIBrushApi,
        imageId: string,
        baseImage: APIImage,
        selectionOverlay: Rect
    ): Promise<ImageData> {
        return new Promise((resolve, reject) => {
            api.getImageData(imageId, {
                responseType: "arraybuffer",
            }).then((resp) => {
                const binaryImageData = Buffer.from(resp.data, "binary");
                const base64ImageData = binaryImageData.toString("base64");
                const src = `data:image/jpeg;base64,${base64ImageData}`;
                const imageElement = new Image();
                imageElement.src = src;
                imageElement.onload = () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = selectionOverlay.width;
                    canvas.height = selectionOverlay.height;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) {
                        reject(new Error("Failed to get canvas context"));
                        return;
                    }
                    ctx.drawImage(imageElement, 0, 0, selectionOverlay.width, selectionOverlay.height);
                    const imageData = ctx.getImageData(
                        0,
                        0,
                        selectionOverlay.width,
                        selectionOverlay.height
                    );
                    this.featherEdges(
                        selectionOverlay,
                        baseImage.width!,
                        baseImage.height!,
                        imageData
                    );

                    resolve(imageData);
                    // remove canvas
                    canvas.remove();
                };
            });
        });
    }

    cancel() {
        if (this.state == "erase") {
            this.state = "confirm";
            this.selectedImageData = this.imageData[this.selectedImageDataIndex];
            this.renderer.setEditImage(this.selectedImageData);
        } else {
            this.state = "default";
            this.imageData = [];
            this.renderer.setEditImage(null);
        }
    }

    erase() {
        this.state = "erase";
    }

    async submit(api: AIBrushApi, image: APIImage) {
        this.notifyError(null);
        const selectionOverlay = this.renderer.getSelectionOverlay();
        const encodedImage = this.renderer.getEncodedImage(selectionOverlay!);
        if (!encodedImage) {
            console.error("No selection");
            return;
        }
        const input: CreateImageInput = defaultArgs();
        input.label = "";
        input.encoded_image = encodedImage;
        input.parent = image.id;
        input.phrases = [this.prompt || image.phrases[0]];
        input.negative_phrases = image.negative_phrases;
        input.stable_diffusion_strength = this.variationStrength;
        input.count = this.count;

        const closestAspectRatio = getClosestAspectRatio(selectionOverlay!.width, selectionOverlay!.height);
        input.width = closestAspectRatio.width;
        input.height = closestAspectRatio.height;
        input.temporary = true;

        this.state = "busy";
        let resp: ImageList | null = null;
        try {
            resp = (await api.createImage(input)).data;
        } catch (err) {
            console.error("Error creating images", err);
            this.notifyError("Failed to create image");
            this.state = "default";
            return;
        }
        let newImages = resp.images;
        if (!newImages || newImages.length === 0) {
            this.state = "default";
            throw new Error("No images returned");
        }
        let completed = false;

        while (!completed) {
            let completeCount = 0;
            await sleep(1000);
            // poll for completion
            for (let i = 0; i < newImages!.length; i++) {
                if (newImages![i].status === ImageStatusEnum.Completed) {
                    completeCount++;
                    continue;
                }
                try {
                    const imageResp = await api.getImage(newImages![i].id);
                    if (imageResp.data.status === ImageStatusEnum.Completed) {
                        newImages![i] = imageResp.data;
                        completeCount++;
                    }
                } catch (err) {
                    // gracefully leave out the result...
                    console.error(err);
                    completeCount++;
                }
            }
            if (completeCount === newImages!.length) {
                completed = true;
            }
            if (this.progressListener) {
                this.progressListener(completeCount / newImages!.length);
            }
        }
        // sort images by score descending
        newImages!.sort((a, b) => {
            return b.score - a.score;
        });

        this.imageData = [];
        for (let i = 0; i < newImages!.length; i++) {
            this.imageData.push(
                await this.loadImageData(
                    api,
                    newImages[i].id,
                    image,
                    selectionOverlay!
                )
            );
        }
        this.renderer.setEditImage(this.imageData[0]);
        this.selectedImageDataIndex = 0;
        this.selectedImageData = this.imageData[0];
        this.state = "confirm";
    }

    select(direction: "left" | "right") {
        if (direction == "left") {
            this.selectedImageDataIndex--;
            if (this.selectedImageDataIndex < -1) {
                this.selectedImageDataIndex = this.imageData.length - 1;
            }
        }
        if (direction == "right") {
            this.selectedImageDataIndex++;
            if (this.selectedImageDataIndex >= this.imageData.length) {
                this.selectedImageDataIndex = -1;
            }
        }
        if (this.selectedImageDataIndex === -1) {
            this.selectedImageData = null;
        } else {
            this.selectedImageData =
                this.imageData[this.selectedImageDataIndex];
        }
        this.renderer.setEditImage(this.selectedImageData);
    }

    onSaveImage(listener: (encodedImage: string) => void): void {
        this.saveListener = listener;
    }

    confirm() {
        this.renderer.commitSelection();
        this.state = "default";
        this.imageData = [];
        const encodedImage = this.renderer.getEncodedImage(null);
        if (encodedImage && this.saveListener) {
            this.saveListener(encodedImage);
        }
    }

    destroy(): boolean {
        this.renderer.setCursor(undefined);
        return true;
    }
}

interface ControlsProps {
    api: AIBrushApi;
    image: APIImage;
    renderer: Renderer;
    tool: EnhanceTool;
}

export const EnhanceControls: FC<ControlsProps> = ({
    api,
    image,
    renderer,
    tool,
}) => {
    const [count, setCount] = useState(4);
    const [variationStrength, setVariationStrength] = useState(0.35);
    const [prompt, setPrompt] = useState(image.phrases[0]);
    const [state, setState] = useState<EnhanceToolState>(tool.state);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    tool.onChangeState(setState);
    tool.onProgress(setProgress);
    tool.onError(setError);

    if (state == "busy") {
        return (
            <div style={{ marginTop: "16px" }}>
                <i className="fa fa-spinner fa-spin"></i>&nbsp; Enhancing...<br/>
                {/* bootstrap progress bar */}
                <div className="progress" style={{ height: "20px", marginTop: "16px" }}>
                    <div
                        className="progress-bar"
                        role="progressbar"
                        style={{ width: `${progress * 100}%` }}
                        aria-valuenow={progress * 100}
                        aria-valuemin={0}
                        aria-valuemax={100}
                    >
                        {Math.round(progress * 100)}%
                    </div>
                </div>
            </div>
        );
    }
    if (state == "confirm" || state == "erase") {
        return (
            <div style={{ marginTop: "16px" }}>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        tool.cancel();
                    }}
                >
                    {/* cancel icon */}
                    <i className="fa fa-times"></i>&nbsp;
                    Revert
                </button>
                <button
                    className="btn btn-primary"
                    onClick={() => tool.confirm()}
                    style={{ marginLeft: "8px" }}
                >
                    {/* save icon */}
                    <i className="fa fa-save"></i>&nbsp;
                    Save
                </button>
                {/* erase button */}
                {state == "confirm" && <button
                    className="btn btn-primary"
                    onClick={() => tool.erase()}
                    style={{ marginLeft: "8px" }}
                >
                    <i className="fa fa-eraser"></i>&nbsp;
                    Erase
                </button>}
            </div>
        );
    }
    return (
        <div style={{ marginTop: "16px" }}>
            {error && (
                <div className="alert alert-danger" role="alert">
                    {/* dismiss button */}
                    <button
                        type="button"
                        className="close"
                        data-dismiss="alert"
                        aria-label="Close"
                        onClick={() => setError(null)}
                    >
                        <span aria-hidden="true">&times;</span>
                    </button>
                    {error}
                </div>
            )}
            {/* prompt */}
            <div className="form-group">
                <label htmlFor="prompt">Prompt</label>
                <input
                    type="text"
                    className="form-control"
                    id="prompt"
                    value={prompt}
                    onChange={(e) => {
                        setPrompt(e.target.value);
                    }}
                />
                <small className="form-text text-muted">
                    Customize the text prompt here
                </small>
            </div>
            <div className="form-group">
                <label htmlFor="count">Count: {count}</label>
                <input
                    type="range"
                    className="form-control-range"
                    id="count"
                    min="1"
                    max="10"
                    step="1"
                    value={count}
                    onChange={(e) => {
                        setCount(parseInt(e.target.value));
                    }}
                />
                <small className="form-text text-muted">
                    Number of enhancement options
                </small>
            </div>
            <div className="form-group">
                <label htmlFor="variation-strength">
                    Variation Strength: {Math.round(variationStrength * 100)}%
                </label>
                <input
                    type="range"
                    className="form-control-range"
                    id="variation-strength"
                    min="0"
                    max="1"
                    step="0.05"
                    value={variationStrength}
                    onChange={(e) => {
                        setVariationStrength(parseFloat(e.target.value));
                    }}
                />
                <small className="form-text text-muted">
                    How much variation to use
                </small>
            </div>
            <div className="form-group">
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        tool.updateArgs({
                            count,
                            variationStrength,
                            prompt,
                        });
                        tool.submit(api, image);
                    }}
                >
                    Enhance
                </button>
            </div>
        </div>
    );
};
