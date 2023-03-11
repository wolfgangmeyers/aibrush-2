import React, { FC, useState, useEffect, useRef } from "react";
import { Prompt } from "react-router";
import { loadImageAsync } from "../../lib/loadImage";

import { sleep } from "../../lib/sleep";
import { defaultArgs } from "../../components/ImagePrompt";
import { Tool, BaseTool } from "./tool";
import { Renderer } from "./renderer";
import { Cursor, Rect } from "./models";
import {
    AIBrushApi,
    CreateImageInput,
    Image as APIImage,
    ImageList,
    ImageStatusEnum,
} from "../../client";
import { ZoomHelper } from "./zoomHelper";
import { getClosestAspectRatio } from "../../lib/aspecRatios";
import {
    ImageUtilWorker,
} from "../../lib/imageutil";
import { SelectionTool, Controls as SelectionControls } from "./selection-tool";
import { getUpscaleLevel } from "../../lib/upscale";
import { ApiSocket, NOTIFICATION_IMAGE_UPDATED } from "../../lib/apisocket";
import moment from "moment";

type EnhanceToolState = "select" | "default" | "busy" | "confirm" | "erase";

// eraser width modifier adds a solid core with a feather edge
// equal to the what is used on enhanced selections
const eraserWidthModifier = 1.3;

interface ImageWithData extends APIImage {
    data?: ImageData;
}

export class EnhanceTool extends BaseTool implements Tool {
    readonly selectionTool: SelectionTool;
    private prompt: string = "";
    private negativePrompt: string = "";
    private model: string = "Epic Diffusion";
    private count: number = 4;
    private variationStrength: number = 0.35;
    private _dirty = false;
    private worker: ImageUtilWorker;
    private idCounter = 0;

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
    private dirtyListener?: (dirty: boolean) => void;

    set dirty(dirty: boolean) {
        this._dirty = dirty;
        if (this.dirtyListener) {
            this.dirtyListener(dirty);
        }
    }

    get dirty() {
        return this._dirty;
    }

    onDirty(listener: (dirty: boolean) => void): void {
        this.dirtyListener = listener;
    }

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

    set state(state: EnhanceToolState) {
        if (state !== this._state) {
            if (this._state == "select") {
                this.selectionTool.destroy();
            }
            if (this._state === "erase") {
                this.renderer.setCursor(undefined);
            }
            this._state = state;
            this.stateHandler(state);
            if (state == "confirm") {
                this.selectionControlsListener(true);
            } else {
                this.selectionControlsListener(false);
                if (state == "select") {
                    this.selectionTool.updateArgs({
                        ...this.selectionTool.getArgs(),
                        outpaint: false,
                    });
                }
            }
        }
    }

    selectSupported(): boolean {
        return !(
            getUpscaleLevel(
                this.renderer.getWidth(),
                this.renderer.getHeight()
            ) === 0 && this.renderer.getWidth()
        );
    }

    constructor(renderer: Renderer) {
        super(renderer, "enhance");
        this.selectionTool = new SelectionTool(renderer);
        if (this.selectSupported()) {
            this.state = "select";
        } else {
            this.state = "default";
        }
        let selectionArgs = this.selectionTool.getArgs();
        if (!this.selectSupported()) {
            selectionArgs = {
                ...selectionArgs,
                selectionOverlay: {
                    x: 0,
                    y: 0,
                    width: this.renderer.getWidth(),
                    height: this.renderer.getHeight(),
                },
            };
        }
        this.selectionTool.updateArgs(selectionArgs);
        this.worker = new ImageUtilWorker();
    }

    onMouseDown(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        if (this.state == "select") {
            this.selectionTool.onMouseDown(event);
            return;
        }
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
        const eraserRadius = Math.floor((baseWidth / 8) * eraserWidthModifier);

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
                    const alphaPct =
                        (distance / eraserRadius) * eraserWidthModifier -
                        (eraserWidthModifier - 1);

                    const alpha = Math.min(
                        Math.floor(alphaPct * 255),
                        imageData.data[index + 3]
                    );
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
        } else if (this.state == "confirm") {
            this.renderer.setCursor({
                color: "white",
                radius: 10,
                type: "crosshairs",
                x,
                y,
            });
        } else {
            this.renderer.setCursor(undefined);
        }
    }

    onMouseMove(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        if (this.state == "select") {
            this.selectionTool.onMouseMove(event);
            return;
        }
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
        if (this.state == "select") {
            this.selectionTool.onMouseUp(event);
        }
        this.panning = false;
        this.erasing = false;
    }

    onMouseLeave(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>): void {
        if (this.state == "select") {
            this.selectionTool.onMouseLeave(event);
        }
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
        args = {
            ...this.getArgs(),
            ...args,
        };
        this.prompt = args.prompt || "";
        this.negativePrompt = args.negativePrompt || "";
        this.model = args.model || "Epic Diffusion";
        this.count = args.count || 4;
        this.variationStrength = args.variationStrength || 0.75;
        console.log("updateArgs", args);
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

    private newId(): string {
        return `${this.idCounter++}`;
    }

    private loadImageData(
        api: AIBrushApi,
        imageId: string,
        baseImage: APIImage,
        baseImageData: ImageData,
        selectionOverlay: Rect
    ): Promise<ImageData> {
        return new Promise((resolve, reject) => {
            api.getImageData(imageId, {
                responseType: "arraybuffer",
            }).then((resp) => {
                const binaryImageData = Buffer.from(resp.data, "binary");
                const base64ImageData = binaryImageData.toString("base64");
                const src = `data:image/png;base64,${base64ImageData}`;
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
                    ctx.drawImage(
                        imageElement,
                        0,
                        0,
                        selectionOverlay.width,
                        selectionOverlay.height
                    );
                    const imageData = ctx.getImageData(
                        0,
                        0,
                        selectionOverlay.width,
                        selectionOverlay.height
                    );
                    const id = this.newId();
                    this.worker
                        .processRequest({
                            id,
                            alpha: false,
                            feather: true,
                            height: this.renderer.getHeight(),
                            width: this.renderer.getWidth(),
                            pixels: imageData.data,
                            selectionOverlay,
                        })
                        .then((resp) => {
                            const updatedImageData = new ImageData(
                                resp.pixels,
                                imageData.width,
                                imageData.height
                            );
                            resolve(updatedImageData);
                        });
                    // remove canvas
                    canvas.remove();
                };
            });
        });
    }

    cancel() {
        if (this.state == "erase") {
            this.state = "confirm";
            this.selectedImageData =
                this.imageData[this.selectedImageDataIndex];
            this.renderer.setEditImage(this.selectedImageData);
        } else {
            if (this.selectSupported()) {
                this.state = "select";
            } else {
                this.state = "default";
            }
            this.imageData = [];
            this.renderer.setEditImage(null);
            this.dirty = false;
        }
    }

    erase() {
        this.state = "erase";
    }

    async submit(api: AIBrushApi, apisocket: ApiSocket, image: APIImage) {
        this.dirty = true;
        this.notifyError(null);
        const selectionOverlay = this.renderer.getSelectionOverlay();
        const encodedImage = this.renderer.getEncodedImage(selectionOverlay!);
        if (!encodedImage) {
            console.error("No selection");
            return;
        }
        const baseImageData = this.renderer.getImageData(selectionOverlay!)!;
        const input: CreateImageInput = defaultArgs();
        input.label = "";
        input.encoded_image = encodedImage;
        input.parent = image.id;
        input.phrases = [this.prompt || image.phrases[0]];
        input.negative_phrases = [
            this.negativePrompt || image.negative_phrases[0],
        ];
        input.stable_diffusion_strength = this.variationStrength;
        input.count = this.count;
        // TODO: allow switching model
        input.model = this.model;
        input.nsfw = image.nsfw;

        const closestAspectRatio = getClosestAspectRatio(
            selectionOverlay!.width,
            selectionOverlay!.height
        );
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
        let newImages: Array<ImageWithData> | undefined = resp.images;
        if (!newImages || newImages.length === 0) {
            this.state = "default";
            throw new Error("No images returned");
        }
        let completed = false;

        let lastUpdate = moment();

        apisocket.onMessage(async (msg: string) => {
            const img = JSON.parse(msg) as any;
            if (
                img.type === NOTIFICATION_IMAGE_UPDATED &&
                img.status === ImageStatusEnum.Completed
            ) {
                lastUpdate = moment();
                for (let i = 0; i < newImages!.length; i++) {
                    if (newImages![i].id === img.id) {
                        const imageData = await this.loadImageData(
                            api,
                            newImages![i].id,
                            image,
                            baseImageData,
                            selectionOverlay!
                        );
                        newImages![i].data = imageData;
                        newImages![i].status = ImageStatusEnum.Completed;
                    }
                }
            } else if (img.status == ImageStatusEnum.Error) {
                for (let i = 0; i < newImages!.length; i++) {
                    if (newImages![i].id === img.id) {
                        newImages![i].status = ImageStatusEnum.Error;
                    }
                }
            }
        });
        try {
            let startTime = moment();
            let lastCheck = moment();

            while (!completed) {
                let completeCount = 0;
                await sleep(1000);
                // poll for completion
                for (let i = 0; i < newImages!.length; i++) {
                    if (
                        newImages![i].status === ImageStatusEnum.Completed ||
                        newImages![i].status === ImageStatusEnum.Error
                    ) {
                        completeCount++;
                        continue;
                    }
                }
                if (this.progressListener) {
                    this.progressListener(completeCount / newImages!.length);
                }
                if (completeCount === newImages!.length) {
                    completed = true;
                }

                // fallback if sockets don't catch one
                if (moment().diff(lastCheck, "seconds") > 10) {
                    // get list of ids that aren't completed and batch get them.
                    const pendingIds = newImages
                        .filter(
                            (img) =>
                                img.status === ImageStatusEnum.Pending ||
                                img.status === ImageStatusEnum.Processing
                        )
                        .map((img) => img.id);
                    console.log("Checking pending images", pendingIds);
                    const updatedImagesResult = await api.batchGetImages({
                        ids: pendingIds,
                    });
                    const updatedImages = updatedImagesResult.data.images;
                    const byId = updatedImages!.reduce((acc, img) => {
                        acc[img.id] = img;
                        return acc;
                    }, {} as Record<string, APIImage>);
                    for (let i = 0; i < newImages!.length; i++) {
                        if (
                            newImages![i].status === ImageStatusEnum.Pending ||
                            newImages![i].status === ImageStatusEnum.Processing
                        ) {
                            const updated = byId[newImages![i].id];
                            if (updated) {
                                newImages![i].status = updated.status;
                                if (
                                    updated.status === ImageStatusEnum.Completed
                                ) {
                                    lastUpdate = moment();
                                    const imageData = await this.loadImageData(
                                        api,
                                        newImages![i].id,
                                        image,
                                        baseImageData,
                                        selectionOverlay!
                                    );
                                    newImages![i].data = imageData;
                                }
                            }
                        }
                    }
                    lastCheck = moment();
                }
                // timeout of 2 minutes
                if (
                    (lastUpdate.isAfter(startTime) &&
                        moment().diff(lastUpdate, "seconds") > 30) ||
                    moment().diff(startTime, "minutes") > 2
                ) {
                    completed = true;
                }
            }
        } finally {
            apisocket.onMessage(undefined);
        }

        // sort images by score descending
        newImages!.sort((a, b) => {
            return b.score - a.score;
        });
        newImages = newImages!.filter((img) => {
            return img.status === ImageStatusEnum.Completed;
        });

        this.imageData = [];
        for (let i = 0; i < newImages!.length; i++) {
            if (newImages![i].data) {
                this.imageData.push(newImages![i].data as ImageData);
            }
        }
        if (this.imageData.length === 0) {
            this.state = "default";
            this.notifyError("No images returned");
            return;
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

    onSaveImage(listener: (encodedImage: string, args?: any) => void): void {
        this.saveListener = listener;
    }

    confirm() {
        this.renderer.commitSelection();
        if (this.selectSupported()) {
            this.state = "select";
        } else {
            this.state = "default";
        }
        this.imageData = [];
        const encodedImage = this.renderer.getEncodedImage(null);
        if (encodedImage && this.saveListener) {
            this.saveListener(encodedImage, {
                phrases: [this.prompt],
                negative_phrases: [this.negativePrompt],
                model: this.model,
            });
        }
        this.dirty = false;
    }

    destroy(): boolean {
        this.renderer.setCursor(undefined);
        this.worker.destroy();
        return true;
    }
}

interface ControlsProps {
    api: AIBrushApi;
    apisocket: ApiSocket;
    image: APIImage;
    renderer: Renderer;
    tool: EnhanceTool;
}

export const EnhanceControls: FC<ControlsProps> = ({
    api,
    apisocket,
    image,
    renderer,
    tool,
}) => {
    const [count, setCount] = useState(4);
    const [dirty, setDirty] = useState(false);
    const [variationStrength, setVariationStrength] = useState(0.35);
    const [prompt, setPrompt] = useState(image.phrases[0]);
    const [negativePrompt, setNegativePrompt] = useState(
        image.negative_phrases[0]
    );
    console.log("negativePrompt", negativePrompt);
    const [model, setModel] = useState(
        (image.model == "swinir" || image.model == "stable_diffusion") ? "Epic Diffusion" : image.model
    );
    const [state, setState] = useState<EnhanceToolState>(tool.state);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    tool.onChangeState(setState);
    tool.onProgress(setProgress);
    tool.onError(setError);
    tool.onDirty(setDirty);

    if (state == "busy") {
        return (
            <div style={{ marginTop: "16px" }}>
                <i className="fa fa-spinner fa-spin"></i>&nbsp; Enhancing...
                <br />
                {/* bootstrap progress bar */}
                <div
                    className="progress"
                    style={{ height: "20px", marginTop: "16px" }}
                >
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

    return (
        <div
            style={{
                marginTop: "16px",
                marginBottom: "8px",
                marginLeft: "16px",
            }}
        >
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
            {state === "select" && (
                <>
                    <p>
                        {/* info icon */}
                        <i className="fa fa-info-circle"></i>&nbsp; Move the
                        selection rectangle to the area that you want to enhance
                    </p>
                    <SelectionControls
                        renderer={renderer}
                        tool={tool.selectionTool}
                        lockAspectRatio={true}
                    />
                </>
            )}
            {state === "default" && (
                <>
                    <p>
                        {/* info icon */}
                        <i className="fa fa-info-circle"></i>&nbsp; Confirm the
                        parameters below and continue
                    </p>
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
                    {/* negative prompt */}
                    <div className="form-group">
                        <label htmlFor="negative-prompt">Negative Prompt</label>
                        <input
                            type="text"
                            className="form-control"
                            id="negative-prompt"
                            value={negativePrompt}
                            onChange={(e) => {
                                setNegativePrompt(e.target.value);
                            }}
                        />
                        <small className="form-text text-muted">
                            Customize the negative text prompt here
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
                            Variation Strength:{" "}
                            {Math.round(variationStrength * 100)}%
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
                                setVariationStrength(
                                    parseFloat(e.target.value)
                                );
                            }}
                        />
                        <small className="form-text text-muted">
                            How much variation to use
                        </small>
                    </div>
                    <div className="form-group">
                        <label htmlFor="model">Model</label>
                        <select
                            className="form-control"
                            id="model"
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                        >
                            <option value="Epic Diffusion">
                                Epic Diffusion
                            </option>
                            <option value="Anything v3">
                                Anything v3
                            </option>
                            <option value="Hentai Diffusion">
                                Hentai Diffusion
                            </option>
                            <option value="URPM">URPM</option>
                            <option value="Deliberate">Deliberate</option>
                            <option value="GTA5 Artwork Diffusion">
                                GTA5 Artwork Diffusion
                            </option>
                        </select>
                        <small className="form-text text-muted">
                            Select the model to use
                        </small>
                    </div>
                </>
            )}
            {state === "erase" && (
                <p>
                    {/* info icon */}
                    <i className="fa fa-info-circle"></i>&nbsp; Erase any
                    undesired sections before saving
                </p>
            )}

            <div className="form-group">
                {state === "select" && (
                    <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                            tool.state = "default";
                        }}
                        style={{ marginRight: "8px" }}
                    >
                        {/* magic icon */}
                        <i className="fa fa-magic"></i>&nbsp; Continue
                    </button>
                )}
                {((state === "default" && tool.selectSupported()) ||
                    state === "confirm" ||
                    state === "erase") && (
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                            tool.cancel();
                        }}
                        style={{ marginRight: "8px" }}
                    >
                        {/* cancel icon */}
                        <i className="fa fa-times"></i>&nbsp; Revert
                    </button>
                )}
                {(state === "confirm" || state === "erase") && (
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={() => tool.confirm()}
                        style={{ marginRight: "8px" }}
                    >
                        <i className="fa fa-save"></i>&nbsp; Save
                    </button>
                )}
                {state === "confirm" && (
                    <>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={() => tool.erase()}
                            style={{ marginRight: "8px" }}
                        >
                            <i className="fa fa-eraser"></i>&nbsp; Erase
                        </button>
                    </>
                )}
                {state === "default" && (
                    <button
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                            tool.updateArgs({
                                count,
                                variationStrength,
                                prompt,
                                negativePrompt,
                                model,
                            });
                            tool.submit(api, apisocket, image);
                        }}
                        style={{ marginRight: "8px" }}
                    >
                        <i className="fa fa-magic"></i>&nbsp; Enhance
                    </button>
                )}
            </div>
            <Prompt
                when={dirty}
                message="Are you sure you want to leave? Your changes will be lost."
            />
        </div>
    );
};
