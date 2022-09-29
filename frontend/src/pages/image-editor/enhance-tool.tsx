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
    ImageStatusEnum,
} from "../../client";
import { ZoomHelper } from "./zoomHelper";

type EnhanceToolState = "default" | "busy" | "confirm";

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
    private panning = false;

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
        if (event.button === 1) {
            this.panning = true;
        }
    }

    onMouseMove(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        if (this.panning) {
            this.zoomHelper.onPan(event);
        }
    }

    onMouseUp(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        this.panning = false;
    }

    onWheel(event: WheelEvent) {
        this.zoomHelper.onWheel(event);
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

    private featherEdges(selectionOverlay: Rect, imageWidth: number, imageHeight: number, imageData: ImageData) {
        const featherLeftEdge = selectionOverlay.x != 0;
        const featherRightEdge = selectionOverlay.x + selectionOverlay.width != imageWidth;
        const featherTopEdge = selectionOverlay.y != 0;
        const featherBottomEdge = selectionOverlay.y + selectionOverlay.height != imageHeight;

        const baseWidth = Math.min(selectionOverlay.width, selectionOverlay.height);
        const featherWidth = Math.floor(baseWidth / 8);

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
            for (let y = selectionOverlay.height - featherWidth; y < selectionOverlay.height; y++) {
                for (let x = 0; x < selectionOverlay.width; x++) {
                    const pixelIndex = (y * selectionOverlay.width + x) * 4;
                    const alpha = ((selectionOverlay.height - y) / featherWidth) * 255;
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
            for (let x = selectionOverlay.width - featherWidth; x < selectionOverlay.width; x++) {
                for (let y = 0; y < selectionOverlay.height; y++) {
                    const pixelIndex = (y * selectionOverlay.width + x) * 4;
                    const alpha = ((selectionOverlay.width - x) / featherWidth) * 255;
                    const existingAlpha = imageData.data[pixelIndex + 3];
                    imageData.data[pixelIndex + 3] = Math.min(alpha, existingAlpha);
                }
            }
        }
    }

    // TODO: refactor to use api.getImageData along with image editor :(
    // avoids "The canvas has been tainted by cross-origin data." error
    private loadImageData(api: AIBrushApi, imageId: string, baseImage: APIImage, selectionOverlay: Rect): Promise<ImageData> {
        return new Promise((resolve, reject) => {
            api.getImageData(imageId, {
                responseType: "arraybuffer"
            }).then((resp) => {
                const binaryImageData = Buffer.from(resp.data, "binary");
                const base64ImageData = binaryImageData.toString("base64");
                const src = `data:image/jpeg;base64,${base64ImageData}`;
                const imageElement = new Image();
                imageElement.src = src;
                imageElement.onload = () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = imageElement.width;
                    canvas.height = imageElement.height;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) {
                        reject(new Error("Failed to get canvas context"));
                        return;
                    }
                    ctx.drawImage(imageElement, 0, 0);
                    const imageData = ctx.getImageData(
                        0,
                        0,
                        imageElement.width,
                        imageElement.height
                    );
                    this.featherEdges(selectionOverlay, baseImage.width!, baseImage.height!, imageData);
                    
                    resolve(imageData);
                    // remove canvas
                    canvas.remove();
                };
            });
        });
    }

    cancel() {
        this.state = "default";
        this.imageData = [];
        this.renderer.setEditImage(null);
    }

    async submit(api: AIBrushApi, image: APIImage) {
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
        input.width = selectionOverlay!.width;
        input.height = selectionOverlay!.height;

        this.state = "busy";
        let resp = await api.createImage(input);
        let newImages = resp.data.images;
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
                const imageResp = await api.getImage(newImages![i].id);
                if (imageResp.data.status === ImageStatusEnum.Completed) {
                    newImages![i] = imageResp.data;
                    completeCount++;
                }
            }
            if (completeCount === newImages!.length) {
                completed = true;
            }
        }
        // sort images by score descending
        newImages!.sort((a, b) => {
            return b.score - a.score;
        });

        this.imageData = [];
        for (let i = 0; i < newImages!.length; i++) {
            this.imageData.push(
                await this.loadImageData(api, newImages[i].id, image, selectionOverlay!)
            );
        }
        // cleanup
        for (let i = 0; i < newImages!.length; i++) {
            await api.deleteImage(newImages![i].id);
        }
        this.renderer.setEditImage(this.imageData[0]);
        this.selectedImageDataIndex = 0;
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
            this.renderer.setEditImage(null);
        } else {
            this.renderer.setEditImage(this.imageData[this.selectedImageDataIndex]);
        }
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

    tool.onChangeState(setState);

    if (state == "busy") {
        return <div style={{marginTop: "16px"}}>
            <i className="fa fa-spinner fa-spin"></i>&nbsp;
            Enhancing...
        </div>;
    }
    if (state == "confirm") {
        return <div style={{marginTop: "16px"}}>
            <button
                className="btn btn-primary"
                onClick={() => {
                    tool.cancel();
                }}
            >
                Revert
            </button>
            <button
                className="btn btn-primary"
                onClick={() => tool.confirm()}
                style={{marginLeft: "8px"}}
            >
                Save
            </button>
        </div>;
    }
    return (
        <div style={{marginTop: "16px"}}>
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
                    }
                }
                />
                <small className="form-text text-muted">
                    Number of enhancement options
                </small>
            </div>
            <div className="form-group">
                <label htmlFor="variation-strength">Variation Strength: {Math.round(variationStrength * 100)}%</label>
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
                    }
                }
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
                        })
                        tool.submit(api, image);
                    }}
                >
                    Enhance
                </button>
            </div>
        </div>
    );
};
