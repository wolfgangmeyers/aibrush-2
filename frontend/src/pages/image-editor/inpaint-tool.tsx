import React, { FC, useState, useEffect, useRef } from "react";
import axios from "axios";
import { Prompt } from "react-router";

import { sleep } from "../../lib/sleep";
import { defaultArgs } from "../../components/ImagePrompt";
import { Tool, BaseTool } from "./tool";
import { Renderer } from "./renderer";
import { SelectionTool } from "./selection-tool";
import { Cursor, Rect } from "./models";
import {
    AIBrushApi,
    CreateImageInput,
    Image as APIImage,
    ImageList,
    StatusEnum,
} from "../../client";
import { ZoomHelper } from "./zoomHelper";
import { getClosestAspectRatio } from "../../lib/aspecRatios";
import { getUpscaleLevel } from "../../lib/upscale";
import {
    applyAlphaMask,
    featherEdges,
    ImageUtilWorker,
    loadImageDataElement,
} from "../../lib/imageutil";
import { ApiSocket, NOTIFICATION_IMAGE_UPDATED } from "../../lib/apisocket";
import moment from "moment";
import { ProgressBar } from "../../components/ProgressBar";
import { calculateImagesCost } from "../../lib/credits";
import { CostIndicator } from "../../components/CostIndicator";

const anonymousClient = axios.create();

type InpaintToolState =
    | "select"
    | "erase"
    | "inpaint"
    | "uploading"
    | "processing"
    | "confirm"
    | undefined;

interface ImageWithData extends APIImage {
    data?: ImageData;
}

export class InpaintTool extends BaseTool implements Tool {
    private selectionTool: SelectionTool;
    private prompt: string = "";
    private negativePrompt: string = "";
    private count: number = 4;
    private variationStrength: number = 0.35;
    private brushSize: number = 10;
    private _dirty = false;
    private worker: ImageUtilWorker;
    private idCounter = 0;

    private _state: InpaintToolState;
    private stateHandler: (state: InpaintToolState) => void = () => {};
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

    private newId(): string {
        return `${this.idCounter++}`;
    }

    onError(handler: (error: string | null) => void) {
        this.errorListener = handler;
    }

    private notifyError(error: string | null) {
        if (this.errorListener) {
            this.errorListener(error);
        }
    }

    get state(): InpaintToolState {
        return this._state;
    }

    set state(state: InpaintToolState) {
        if (state != this._state) {
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
                    const imageWidth = this.renderer.getWidth();
                    const imageHeight = this.renderer.getHeight();
                    const selectionWidth = Math.min(
                        imageWidth,
                        imageHeight,
                        512
                    );
                    this.selectionTool.updateArgs({
                        selectionOverlay: {
                            x: 0,
                            y: 0,
                            width: selectionWidth,
                            height: selectionWidth,
                        },
                    });
                }
            }
        }
    }

    selectSupported(): boolean {
        // return !(
        //     this.renderer.getWidth() == this.renderer.getHeight() &&
        //     getUpscaleLevel(
        //         this.renderer.getWidth(),
        //         this.renderer.getHeight()
        //     ) === 0
        // );
        return true;
    }

    constructor(renderer: Renderer) {
        super(renderer, "inpaint");
        this.selectionTool = new SelectionTool(renderer);
        if (this.selectSupported()) {
            this.state = "select";
            this.selectionTool.updateArgs({
                outpaint: this.getArgs().outpaint,
            });
        } else {
            this.state = "erase";
        }
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
        if (this.state == "erase") {
            this.erasing = true;
            this.erasePoint(x, y);
        }
    }

    private erasePoint(x: number, y: number) {
        if (!this.dirty) {
            this.dirty = true;
        }
        this.renderer.erasePoint(x, y, this.brushSize);
        this.renderer.render();
    }

    private updateCursor(x: number, y: number) {
        if (this.state == "erase") {
            this.renderer.setCursor({
                color: "white",
                radius: this.brushSize / 2,
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
        this.updateCursor(x, y);
        if (this.state == "select") {
            this.selectionTool.onMouseMove(event);
            return;
        }

        if (this.panning) {
            this.zoomHelper.onPan(event);
        }

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
        super.updateArgs(args);
        this.prompt = args.prompt || "";
        this.negativePrompt = args.negativePrompt || "";
        this.count = args.count || 4;
        this.variationStrength = args.variationStrength || 0.75;
        this.brushSize = args.brushSize || 10;

        this.updateCursor(
            this.renderer.getWidth() / 2,
            this.renderer.getHeight() / 2
        );
        this.selectionTool.updateArgs({
            outpaint: args.outpaint,
        });
    }

    onChangeState(handler: (state: InpaintToolState) => void) {
        this.stateHandler = handler;
    }

    onShowSelectionControls(listener: (show: boolean) => void): void {
        this.selectionControlsListener = listener;
    }

    onProgress(listener: (progress: number) => void): void {
        this.progressListener = listener;
    }

    private async loadImageData(
        api: AIBrushApi,
        imageId: string,
        alphaMask: ImageData,
        selectionOverlay: Rect
    ): Promise<ImageData> {
        const imageElement = await loadImageDataElement(api, imageId);
        const canvas = document.createElement("canvas");
        canvas.width = selectionOverlay.width;
        canvas.height = selectionOverlay.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Failed to get canvas context");
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
        const resp = await this.worker.processRequest({
            id,
            alpha: true,
            alphaPixels: alphaMask.data,
            feather: true,
            height: this.renderer.getHeight(),
            width: this.renderer.getWidth(),
            pixels: imageData.data,
            selectionOverlay,
            featherWidth: 10,
        });
        const updatedImageData = new ImageData(
            resp.pixels,
            imageData.width,
            imageData.height
        );
        // remove canvas
        canvas.remove();
        return updatedImageData;
    }

    cancel() {
        if (this.selectSupported()) {
            this.state = "select";
        } else {
            this.state = "erase";
        }
        this.renderer.snapshot();
        this.renderer.undo();
        this.renderer.clearRedoStack();
        this.imageData = [];
        this.renderer.setEditImage(null);
        this.dirty = false;
    }

    private updateProgress(progress: number) {
        if (this.progressListener) {
            this.progressListener(progress);
        }
    }

    async submit(
        api: AIBrushApi,
        apisocket: ApiSocket,
        image: APIImage,
        model: string
    ) {
        this.notifyError(null);
        let selectionOverlay = this.renderer.getSelectionOverlay();
        if (!selectionOverlay) {
            console.error("No selection");
            return;
        }

        if (this.getArgs().outpaint) {
            // check if selection overlay is out of renderer bounds (width, height)
            if (
                selectionOverlay.x < 0 ||
                selectionOverlay.y < 0 ||
                selectionOverlay.x + selectionOverlay.width >
                    this.renderer.getWidth() ||
                selectionOverlay.y + selectionOverlay.height >
                    this.renderer.getHeight()
            ) {
                this.renderer.expandToOverlay();
                selectionOverlay = this.renderer.getSelectionOverlay()!;
            }
        }

        this.state = "uploading";
        this.updateProgress(0);

        // get the erased area, then undo the erase to get the original image
        const encodedMask = this.renderer.getEncodedMask(selectionOverlay);
        const maskData = this.renderer.getImageData(selectionOverlay);
        // hack to restore the image
        this.renderer.snapshot();
        this.renderer.undo();
        this.renderer.clearRedoStack();

        const encodedImage = this.renderer.getEncodedImage(selectionOverlay);

        // upload temporary images in parallel
        const tmpImagePromises = [
            api.createTemporaryImage(),
            api.createTemporaryImage(),
        ];
        const tmpImages = await Promise.all(tmpImagePromises);
        const binaryImages = [
            Buffer.from(encodedImage!, "base64"),
            Buffer.from(encodedMask!, "base64"),
        ];
        const progress = [0, 0];
        const uploadPromises: Array<Promise<any>> = [];
        for (let i = 0; i < tmpImages.length; i++) {
            const tmpImage = tmpImages[i].data;
            const binaryImage = binaryImages[i];
            uploadPromises.push(
                anonymousClient.put(tmpImage.upload_url, binaryImage, {
                    headers: {
                        "Content-Type": "image/png",
                    },
                    onUploadProgress: (e) => {
                        progress[i] = e.loaded / e.total;
                        this.updateProgress((progress[0] + progress[1]) / 2);
                    },
                })
            );
        }
        await Promise.all(uploadPromises);

        const input: CreateImageInput = defaultArgs();
        input.label = "";
        // input.encoded_image = encodedImage;
        // input.encoded_mask = encodedMask;
        input.tmp_image_id = tmpImages[0].data.id;
        input.tmp_mask_id = tmpImages[1].data.id;
        input.parent = image.id;
        input.params.prompt = this.prompt || image.params.prompt;
        input.params.negative_prompt =
            this.negativePrompt || image.params.negative_prompt;
        input.params.denoising_strength = this.variationStrength;
        input.count = this.count;
        input.model = model;

        const closestAspectRatio = getClosestAspectRatio(
            selectionOverlay!.width,
            selectionOverlay!.height
        );
        input.params.width = closestAspectRatio.width;
        input.params.height = closestAspectRatio.height;
        input.temporary = true;

        let resp: ImageList | null = null;

        try {
            resp = (await api.createImage(input)).data;
        } catch (err) {
            console.error("Error creating images", err);
            this.notifyError("Failed to create image");
            this.state = "select";
            return;
        }
        this.state = "processing";
        this.updateProgress(0);
        let newImages: Array<ImageWithData> | undefined = resp.images;
        if (!newImages || newImages.length === 0) {
            this.state = "select";
            throw new Error("No images returned");
        }
        let completed = false;
        let lastUpdate = moment();

        const onMessage = async (msg: string) => {
            console.log("inpaint onMessage", msg);
            const img = JSON.parse(msg) as any;
            if (
                img.type === NOTIFICATION_IMAGE_UPDATED &&
                img.status === StatusEnum.Completed
            ) {
                lastUpdate = moment();
                for (let i = 0; i < newImages!.length; i++) {
                    if (newImages![i].id === img.id) {
                        const imageData = await this.loadImageData(
                            api,
                            newImages![i].id,
                            maskData!,
                            selectionOverlay!
                        );
                        newImages![i].data = imageData;
                        newImages![i].status = StatusEnum.Completed;
                    }
                }
            } else if (img.status === StatusEnum.Error) {
                for (let i = 0; i < newImages!.length; i++) {
                    if (newImages![i].id === img.id) {
                        newImages![i].status = StatusEnum.Error;
                    }
                }
            }
        };
        apisocket.addMessageListener(onMessage);
        try {
            let startTime = moment();
            let lastCheck = moment();
            while (!completed) {
                let completeCount = 0;
                await sleep(100);
                // poll for completion
                for (let i = 0; i < newImages!.length; i++) {
                    if (
                        newImages![i].status === StatusEnum.Completed ||
                        newImages![i].status === StatusEnum.Error
                    ) {
                        completeCount++;
                        continue;
                    }
                }
                this.updateProgress(completeCount / newImages!.length);
                if (completeCount === newImages!.length) {
                    completed = true;
                    continue;
                }

                // fallback if sockets don't catch one
                if (moment().diff(lastCheck, "seconds") > 10) {
                    // get list of ids that aren't completed and batch get them.
                    const pendingIds = newImages
                        .filter(
                            (img) =>
                                img.status === StatusEnum.Pending ||
                                img.status === StatusEnum.Processing
                        )
                        .map((img) => img.id);
                    console.log("Checking pending images", pendingIds);
                    const updatedImagesResult = await api.batchGetImages(
                        undefined,
                        {
                            ids: pendingIds,
                        }
                    );
                    const updatedImages = updatedImagesResult.data.images;
                    const byId = updatedImages!.reduce((acc, img) => {
                        acc[img.id] = img;
                        return acc;
                    }, {} as Record<string, APIImage>);
                    for (let i = 0; i < newImages!.length; i++) {
                        if (
                            newImages![i].status === StatusEnum.Pending ||
                            newImages![i].status === StatusEnum.Processing
                        ) {
                            const updated = byId[newImages![i].id];
                            if (updated) {
                                newImages![i].status = updated.status;
                                if (updated.status === StatusEnum.Completed) {
                                    lastUpdate = moment();
                                    const imageData = await this.loadImageData(
                                        api,
                                        newImages![i].id,
                                        maskData!,
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
            apisocket.removeMessageListener(onMessage);
        }

        // sort images by score descending
        newImages!.sort((a, b) => {
            return b.score - a.score;
        });
        newImages = newImages!.filter((img) => {
            return img.status === StatusEnum.Completed;
        });

        this.imageData = [];
        for (let i = 0; i < newImages!.length; i++) {
            if (newImages![i].data) {
                this.imageData.push(newImages![i].data as ImageData);
            }
        }
        if (this.imageData.length === 0) {
            this.state = "select";
            this.notifyError("No images returned");
            return;
        }
        this.renderer.setEditImage(this.imageData[0]);
        this.selectedImageDataIndex = 0;
        this.selectedImageData = this.imageData[0];
        this.state = "confirm";
    }

    onDirty(listener: (dirty: boolean) => void): void {
        this.dirtyListener = listener;
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

        this.imageData = [];
        const encodedImage = this.renderer.getEncodedImage(null);
        if (encodedImage && this.saveListener) {
            this.saveListener(encodedImage, {
                phrases: [this.prompt],
                negative_phrases: [this.negativePrompt],
                selection_overlay: this.renderer.getSelectionOverlay(),
            });
        }
        this.dirty = false;
        if (this.selectSupported()) {
            this.state = "select";
        } else {
            this.state = "erase";
        }
    }

    destroy(): boolean {
        if (this.dirty) {
            if (!window.confirm("Discard changes?")) {
                return false;
            }
        }
        this.renderer.setCursor(undefined);
        this.renderer.setEditImage(null);
        this.worker.destroy();
        return true;
    }
}

interface ControlsProps {
    api: AIBrushApi;
    apisocket: ApiSocket;
    image: APIImage;
    renderer: Renderer;
    tool: InpaintTool;
}

export const InpaintControls: FC<ControlsProps> = ({
    api,
    apisocket,
    image,
    renderer,
    tool,
}) => {
    const [count, setCount] = useState(4);
    const [prompt, setPrompt] = useState(image.params.prompt || "");
    const [negativePrompt, setNegativePrompt] = useState(
        image.params.negative_prompt || ""
    );
    const [state, setState] = useState<InpaintToolState>(tool.state);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [brushSize, setBrushSize] = useState(10);
    const [dirty, setDirty] = useState(false);
    const [outpaint, setoutpaint] = useState<boolean | undefined>(
        tool.getArgs().outpaint
    );
    const [model, setModel] = useState("stable_diffusion_inpainting");

    useEffect(() => {
        tool.updateArgs({
            brushSize,
        });
    }, [brushSize]);

    tool.onChangeState(setState);
    tool.onProgress(setProgress);
    tool.onError(setError);
    tool.onDirty(setDirty);

    if (state === "uploading" || state === "processing") {
        return (
            <div style={{ marginTop: "16px" }}>
                <i className="fa fa-spinner fa-spin"></i>&nbsp;{" "}
                {state === "uploading" ? "Uploading..." : "Inpainting..."}
                <br />
                <ProgressBar progress={progress} />
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
                        selection rectangle to the area that you want to
                        inpaint. For outpainting, try zooming out.
                    </p>
                    <div className="form-group">
                        {/* allow outpaint checkbox */}
                        <div className="form-check">
                            <input
                                className="form-check-input"
                                type="checkbox"
                                id="allowoutpaint"
                                checked={!!outpaint}
                                onChange={(e) => {
                                    setoutpaint(e.target.checked);
                                    tool.updateArgs({
                                        outpaint: e.target.checked,
                                    });
                                }}
                            />
                            <label
                                className="form-check-label"
                                htmlFor="allowoutpaint"
                            >
                                Allow outpainting
                            </label>
                        </div>
                    </div>
                </>
            )}

            {state === "erase" && (
                <>
                    <p>
                        {/* info icon */}
                        <i className="fa fa-info-circle"></i>&nbsp; Erase the
                        area that you want to inpaint.
                    </p>
                    <div className="form-group">
                        <label style={{ width: "100%" }}>
                            Brush size
                            <small
                                className="form-text text-muted"
                                style={{ float: "right" }}
                            >
                                {brushSize}px
                            </small>
                        </label>
                        <input
                            type="range"
                            className="form-control-range"
                            min="1"
                            max="100"
                            value={brushSize}
                            onChange={(e) =>
                                setBrushSize(parseInt(e.target.value))
                            }
                        />
                    </div>
                </>
            )}

            {state === "inpaint" && (
                <>
                    <p>
                        {/* info icon */}
                        <i className="fa fa-info-circle"></i>&nbsp; Confirm the
                        parameters below and continue
                    </p>
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
                        <label htmlFor="negativeprompt">Negative prompt</label>
                        <input
                            type="text"
                            className="form-control"
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
                            Number of inpaint options
                        </small>
                    </div>
                    {/* select model dropdown */}
                    {/* options: stable_diffusion_inpainting, "Epic Diffusion", "Deliberate" */}
                    <div className="form-group">
                        <label htmlFor="model">Model</label>
                        <select
                            className="form-control"
                            id="model"
                            value={model}
                            onChange={(e) => {
                                setModel(e.target.value);
                            }}
                        >
                            <option value="stable_diffusion_inpainting">
                                Stable Diffusion
                            </option>

                            <option value="stable_diffusion_2_inpainting">
                                Stable Diffusion 2
                            </option>
                            <option value="dreamlike_diffusion_inpainting">
                                Dreamlike Diffusion
                            </option>
                            <option value="anything_v4_inpainting">
                                Anything v4
                            </option>
                        </select>
                        <small className="form-text text-muted">
                            Select the inpaint model
                        </small>
                    </div>
                    <div className="form-group">
                        <CostIndicator imagesCost={count} />
                    </div>
                </>
            )}

            {state === "confirm" && (
                <>
                    <p>
                        Use the <i className="fa fa-arrow-left"></i> and{" "}
                        <i className="fa fa-arrow-right"></i> buttons to
                        navigate between the inpaint options
                    </p>
                </>
            )}

            <div className="form-group">
                {(dirty ||
                    state === "confirm" ||
                    (state == "erase" && tool.selectSupported()) ||
                    state == "inpaint") && (
                    <button
                        style={{ marginRight: "8px" }}
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                            tool.cancel();
                        }}
                    >
                        {/* cancel icon */}
                        <i className="fa fa-times"></i>&nbsp; Revert
                    </button>
                )}

                {state === "confirm" && (
                    <>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={() => tool.confirm()}
                            style={{ marginRight: "8px" }}
                        >
                            {/* save icon */}
                            <i className="fa fa-save"></i>&nbsp; Save
                        </button>
                    </>
                )}
                {state == "select" && (
                    <button
                        style={{ marginRight: "8px" }}
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => (tool.state = "erase")}
                    >
                        <i className="fa fa-eraser"></i>&nbsp; Continue
                    </button>
                )}
                {state == "erase" && (
                    <button
                        style={{ marginRight: "8px" }}
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => (tool.state = "inpaint")}
                    >
                        <i className="fa fa-paint-brush"></i>&nbsp; Continue
                    </button>
                )}
                {state === "inpaint" && (
                    <button
                        style={{ marginRight: "8px" }}
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                            tool.updateArgs({
                                count,
                                prompt,
                                negativePrompt,
                            });
                            tool.submit(api, apisocket, image, model);
                        }}
                    >
                        {/* paint icon */}
                        <i className="fa fa-paint-brush"></i>&nbsp; Inpaint
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
