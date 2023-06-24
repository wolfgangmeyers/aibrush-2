import React, { FC, useState, useEffect, useRef } from "react";
import axios from "axios";
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
    StatusEnum,
} from "../../client";
import { ZoomHelper } from "./zoomHelper";
import { getClosestAspectRatio } from "../../lib/aspecRatios";
import { convertPNGToJPG, ImageUtilWorker, ImageWorkerRequest, loadImageDataElement } from "../../lib/imageutil";
import { SelectionTool, Controls as SelectionControls } from "./selection-tool";
import { getUpscaleLevel } from "../../lib/upscale";
import { ApiSocket, NOTIFICATION_IMAGE_UPDATED } from "../../lib/apisocket";
import moment from "moment";
import { ProgressBar } from "../../components/ProgressBar";
import { calculateImagesCost } from "../../lib/credits";
import { CostIndicator } from "../../components/CostIndicator";
import ModelSelector from "../../components/ModelSelector";
import { PencilTool } from "./pencil-tool";
import { MaskEditor } from "./mask-editor-controls";
import { ResetToDefaultIcon } from "../../components/ResetToDefaultIcon";

const anonymousClient = axios.create();

type EnhanceToolState =
    | "select"
    | "default"
    | "uploading"
    | "processing"
    | "confirm"
    | "erase"
    | "mask";

// eraser width modifier adds a solid core with a feather edge
// equal to the what is used on enhanced selections
const eraserWidthModifier = 1.3;

interface ImageWithData extends APIImage {
    data?: ImageData;
}

export class EnhanceTool extends BaseTool implements Tool {
    readonly selectionTool: SelectionTool;
    readonly pencilTool: PencilTool;

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
    private maskHandler: (isMasked: boolean) => void = () => {};

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
            this.renderer.setCursor(undefined);
            if (this._state == "select") {
                this.selectionTool.destroy();
            }
            // if (this._state === "mask") {
            //     this.renderer.setCursor(undefined);
            // }
            // if (this._state === "erase") {
            //     this.renderer.setCursor(undefined);
            // }
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
        this.pencilTool = new PencilTool(
            renderer,
            "mask",
            "#FFFFFF",
            "mask-editor"
        );
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
        this.pencilTool.updateArgs({
            ...this.pencilTool.getArgs(),
            brushColor: "#FFFFFF",
        });
        // unset the cursor from the pencil tool (hack)
        this.renderer.setCursor(undefined);
        this.worker = new ImageUtilWorker();
    }

    onMouseDown(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        if (this.state == "select") {
            this.selectionTool.onMouseDown(event);
            return;
        }
        if (this.state == "mask") {
            this.pencilTool.onMouseDown(event);
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
        if (this.state == "select") {
            this.selectionTool.onMouseMove(event);
            return;
        }
        if (this.state == "mask") {
            this.pencilTool.onMouseMove(event);
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
        if (this.state == "mask") {
            this.pencilTool.onMouseUp(event);
        }
        this.panning = false;
        this.erasing = false;
    }

    onMouseLeave(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>): void {
        if (this.state == "select") {
            this.selectionTool.onMouseLeave(event);
        }
        if (this.state == "mask") {
            this.pencilTool.onMouseLeave(event);
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

    onChangeMask(handler: (isMasked: boolean) => void) {
        this.maskHandler = handler;
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

    private async loadImageData(
        api: AIBrushApi,
        imageId: string,
        maskData: ImageData | undefined,
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
        const req: ImageWorkerRequest = {
            id,
            alphaMode: "none",
            feather: true,
            height: this.renderer.getHeight(),
            width: this.renderer.getWidth(),
            pixels: imageData.data,
            selectionOverlay,
        }
        if (maskData) {
            req.alphaMode = "mask";
            req.alphaPixels = maskData.data;
        }
        const resp = await this.worker.processRequest(req);
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

    mask() {
        if (this.renderer.isMasked()) {
            this.renderer.deleteMask();
        }
        this.renderer.createMask();
        this.state = "mask";
        this.maskHandler(true);
    }

    deleteMask() {
        this.renderer.deleteMask();
        if (this.state == "mask") {
            this.state = "default";
        }
        this.maskHandler(false);
    }

    private updateProgress(progress: number) {
        if (this.progressListener) {
            this.progressListener(progress);
        }
    }

    async submit(api: AIBrushApi, apisocket: ApiSocket, image: APIImage) {
        this.dirty = true;
        this.notifyError(null);
        const selectionOverlay = this.renderer.getSelectionOverlay();
        let encodedImage = this.renderer.getEncodedImage(selectionOverlay!);
        if (!encodedImage) {
            console.error("No selection");
            return;
        }
        encodedImage = await convertPNGToJPG(encodedImage);
        let encodedMask: string | undefined;
        let maskData: ImageData | undefined;
        if (this.renderer.isMasked()) {
            encodedMask = this.renderer.getEncodedMask(selectionOverlay!, "mask");
            maskData = this.renderer.getImageData(selectionOverlay!, "mask");
        }

        const input: CreateImageInput = defaultArgs();

        const tmpInitImage = await api.createTemporaryImage("jpg");
        // convert base64 to binary
        const binaryImageData = Buffer.from(encodedImage, "base64");
        this.state = "uploading";
        this.updateProgress(0);
        await anonymousClient.put(
            tmpInitImage.data.upload_url,
            binaryImageData,
            {
                headers: {
                    "Content-Type": "image/jpeg",
                },
                onUploadProgress: (progressEvent: any) => {
                    let percentCompleted =
                        progressEvent.loaded / progressEvent.total;
                    if (encodedMask) {
                        percentCompleted /= 2;
                    }
                    this.updateProgress(percentCompleted);
                },
            }
        );
        input.tmp_jpg_id = tmpInitImage.data.id;

        if (encodedMask) {
            const tmpMaskImage = await api.createTemporaryImage("png");
            const binaryMaskData = Buffer.from(encodedMask, "base64");
            await anonymousClient.put(tmpMaskImage.data.upload_url, binaryMaskData, {
                headers: {
                    "Content-Type": "image/png",
                },
                onUploadProgress: (progressEvent: any) => {
                    let percentCompleted = 0.5 + progressEvent.loaded / progressEvent.total / 2;
                    this.updateProgress(percentCompleted);
                },
            });
            input.tmp_mask_id = tmpMaskImage.data.id;
        }

        input.label = "";
        input.parent = image.id;
        input.params.prompt = this.prompt || image.params.prompt;
        input.params.negative_prompt =
            this.negativePrompt || image.params.negative_prompt;
        input.params.denoising_strength = this.variationStrength;
        input.count = this.count;
        input.model = this.model;
        input.nsfw = image.nsfw;

        input.params.width = selectionOverlay!.width;
        input.params.height = selectionOverlay!.height;
        // round width and height up to the nearest multiple of 64
        input.params.width = Math.ceil(input.params.width / 64) * 64;
        input.params.height = Math.ceil(input.params.height / 64) * 64;
        input.temporary = true;

        let resp: ImageList | null = null;

        try {
            resp = (await api.createImage(input)).data;
        } catch (err) {
            console.error("Error creating images", err);
            this.notifyError("Failed to create image");
            this.state = "default";
            return;
        }
        this.state = "processing";
        let newImages: Array<ImageWithData> | undefined = resp.images;
        if (!newImages || newImages.length === 0) {
            this.state = "default";
            throw new Error("No images returned");
        }
        let completed = false;

        let lastUpdate = moment();

        const onMessage = async (msg: string) => {
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
                            maskData,
                            selectionOverlay!
                        );
                        newImages![i].data = imageData;
                        newImages![i].status = StatusEnum.Completed;
                    }
                }
            } else if (img.status == StatusEnum.Error) {
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
                await sleep(1000);
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
                                        maskData,
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
            this.state = "default";
            this.notifyError("No images returned");
            return;
        }
        this.renderer.setEditImage(this.imageData[0]);
        this.selectedImageDataIndex = 0;
        this.selectedImageData = this.imageData[0];
        this.state = "confirm";
        this.deleteMask();
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
        if (this.renderer.isMasked()) {
            this.renderer.deleteMask();
        }
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
    const [prompt, setPrompt] = useState(image.params.prompt || "");
    const [negativePrompt, setNegativePrompt] = useState(
        image.params.negative_prompt || ""
    );
    const [model, setModel] = useState(
        image.model == "swinir" || image.model == "stable_diffusion"
            ? "Epic Diffusion"
            : image.model
    );
    const [selectingModel, setSelectingModel] = useState<boolean>(false);
    const [state, setState] = useState<EnhanceToolState>(tool.state);
    const [isMasked, setIsMasked] = useState<boolean>(tool.renderer.isMasked());
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    tool.onChangeState(setState);
    tool.onChangeMask(setIsMasked);
    tool.onProgress(setProgress);
    tool.onError(setError);
    tool.onDirty(setDirty);

    const selectionOverlay: Rect =
        tool.selectionTool.getArgs().selectionOverlay;
    let cost = count;
    if (selectionOverlay) {
        cost = calculateImagesCost(
            count,
            selectionOverlay.width,
            selectionOverlay.height
        );
    }

    if (state == "processing" || state == "uploading") {
        return (
            <div style={{ marginTop: "16px" }}>
                <i className="fa fa-spinner fa-spin"></i>&nbsp;{" "}
                {state === "processing" ? "Enhancing..." : "Uploading..."}
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
                        <label htmlFor="prompt">
                            Prompt&nbsp;
                            <ResetToDefaultIcon onClick={() => setPrompt(image.params.prompt || "")} />
                        </label>
                        {/* refresh icon */}
                        
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
                        <label htmlFor="negative-prompt">
                            Negative Prompt&nbsp;
                            <ResetToDefaultIcon onClick={() => setNegativePrompt(image.params.negative_prompt || "")} />
                        </label>
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
                        {/* <select
                            className="form-control"
                            id="model"
                            value={model}
                            onChange={(e) => setModel(e.target.value)}
                        >
                            {supportedModels.map((model) => (
                                <option value={model} key={`model-${model}`}>
                                    {model}
                                </option>
                            ))}
                        </select> */}
                        <div>
                            <button
                                type="button"
                                className="btn btn-secondary light-button"
                                onClick={() => setSelectingModel(true)}
                            >
                                {model}&nbsp;
                                <i className="fas fa-caret-down"></i>
                            </button>
                        </div>
                        <small className="form-text text-muted">
                            Select the model to use
                        </small>
                    </div>
                    <div className="form-group">
                        <CostIndicator imagesCost={cost} />
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
            {state === "mask" && (
                <MaskEditor
                    onConfirm={() => (tool.state = "default")}
                    onRevert={() => {
                        tool.deleteMask();
                    }}
                    tool={tool.pencilTool}
                />
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
                    <>
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
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={() => tool.mask()}
                            style={{ marginRight: "8px" }}
                        >
                            <i className="fa fa-cut"></i>&nbsp; Mask
                        </button>
                        {isMasked && (
                            <button
                                className="btn btn-danger btn-sm"
                                onClick={() => tool.deleteMask()}
                                style={{ marginRight: "8px" }}
                            >
                                <i className="fa fa-cut"></i>&nbsp; Unmask
                            </button>
                        )}
                    </>
                )}
            </div>
            <Prompt
                when={dirty}
                message="Are you sure you want to leave? Your changes will be lost."
            />
            {selectingModel && (
                <ModelSelector
                    api={api}
                    onCancel={() => setSelectingModel(false)}
                    onSelectModel={(model) => {
                        setModel(model);
                        setSelectingModel(false);
                    }}
                    initialSelectedModel={model}
                    inpainting={false}
                />
            )}
        </div>
    );
};
