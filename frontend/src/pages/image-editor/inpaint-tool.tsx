import React, { FC, useState, useEffect, useRef } from "react";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import ToggleButton from "react-bootstrap/ToggleButton";
import { loadImageAsync } from "../../lib/loadImage";

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
    ImageStatusEnum,
} from "../../client";
import { ZoomHelper } from "./zoomHelper";
import { getClosestAspectRatio } from "../../lib/aspecRatios";
import { getUpscaleLevel } from "../../lib/upscale";
import { featherEdges } from "../../lib/imageutil";

type InpaintToolState =
    | "select"
    | "erase"
    | "inpaint"
    | "busy"
    | "confirm"
    | undefined;

interface ImageWithData extends APIImage {
    data?: ImageData;
}

export class InpaintTool extends BaseTool implements Tool {
    private selectionTool: SelectionTool;
    private prompt: string = "";
    private count: number = 4;
    private variationStrength: number = 0.35;
    private brushSize: number = 10;
    private _dirty = false;

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

    // TODO: support outpainting (remove this function)
    selectSupported(): boolean {
        return !(
            this.renderer.getWidth() == this.renderer.getHeight() &&
            getUpscaleLevel(
                this.renderer.getWidth(),
                this.renderer.getHeight()
            ) === 0
        );
    }

    constructor(renderer: Renderer) {
        super(renderer, "inpaint");
        this.selectionTool = new SelectionTool(renderer);
        if (this.selectSupported()) {
            this.state = "select";
            this.selectionTool.updateArgs({
                outpaint: this.getArgs().outpaint,
            })
        } else {
            this.state = "erase";
        }
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
        }
        super.updateArgs(args);
        this.prompt = args.prompt || "";
        this.count = args.count || 4;
        this.variationStrength = args.variationStrength || 0.75;
        this.brushSize = args.brushSize || 10;

        this.updateCursor(
            this.renderer.getWidth() / 2,
            this.renderer.getHeight() / 2
        );
        this.selectionTool.updateArgs({
            outpaint: args.outpaint,
        })
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

                    featherEdges(
                        selectionOverlay,
                        baseImage.width!,
                        baseImage.height!,
                        imageData,
                        10
                    );

                    resolve(imageData);
                    // remove canvas
                    canvas.remove();
                };
            });
        });
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

    async submit(api: AIBrushApi, image: APIImage) {
        this.notifyError(null);
        let selectionOverlay = this.renderer.getSelectionOverlay();
        if (!selectionOverlay) {
            console.error("No selection");
            return;
        }

        console.log(`args: ${JSON.stringify(this.getArgs())}`);
        if (this.getArgs().outpaint) {
            console.log("Checking for overlay out of bounds")
            // check if selection overlay is out of renderer bounds (width, height)
            if (selectionOverlay.x < 0 || selectionOverlay.y < 0 || selectionOverlay.x + selectionOverlay.width > this.renderer.getWidth() || selectionOverlay.y + selectionOverlay.height > this.renderer.getHeight()) {
                console.log("Expanding to overlay!")
                this.renderer.expandToOverlay();
                selectionOverlay = this.renderer.getSelectionOverlay()!;
            }
        }

        // get the erased area, then undo the erase to get the original image
        const encodedMask = this.renderer.getEncodedMask(selectionOverlay);
        // hack to restore the image
        this.renderer.snapshot();
        this.renderer.undo();
        this.renderer.clearRedoStack();

        const encodedImage = this.renderer.getEncodedImage(selectionOverlay);

        const input: CreateImageInput = defaultArgs();
        input.label = "";
        input.encoded_image = encodedImage;
        input.encoded_mask = encodedMask;
        input.parent = image.id;
        input.phrases = [this.prompt || image.phrases[0]];
        input.negative_phrases = image.negative_phrases;
        input.stable_diffusion_strength = this.variationStrength;
        input.count = this.count;
        input.model = "stable_diffusion_inpainting";

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
            this.state = "select";
            return;
        }
        let newImages: Array<ImageWithData> | undefined = resp.images;
        if (!newImages || newImages.length === 0) {
            this.state = "select";
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
                        const imageData = await this.loadImageData(
                            api,
                            newImages![i].id,
                            image,
                            selectionOverlay!
                        );
                        newImages![i].data = imageData;
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

    onSaveImage(listener: (encodedImage: string) => void): void {
        this.saveListener = listener;
    }

    confirm() {
        this.renderer.commitSelection();
        if (this.selectSupported()) {
            this.state = "select";
        } else {
            this.state = "erase";
        }

        this.imageData = [];
        const encodedImage = this.renderer.getEncodedImage(null);
        if (encodedImage && this.saveListener) {
            this.saveListener(encodedImage);
        }
    }

    destroy(): boolean {
        this.renderer.setCursor(undefined);
        this.renderer.setEditImage(null);
        return true;
    }
}

interface ControlsProps {
    api: AIBrushApi;
    image: APIImage;
    renderer: Renderer;
    tool: InpaintTool;
}

export const InpaintControls: FC<ControlsProps> = ({
    api,
    image,
    renderer,
    tool,
}) => {
    const [count, setCount] = useState(4);
    const [prompt, setPrompt] = useState(image.phrases[0]);
    const [state, setState] = useState<InpaintToolState>(tool.state);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [brushSize, setBrushSize] = useState(10);
    const [dirty, setDirty] = useState(false);
    const [outpaint, setoutpaint] = useState<boolean | undefined>(
        tool.getArgs().outpaint
    );

    useEffect(() => {
        tool.updateArgs({
            brushSize,
        });
    }, [brushSize]);

    tool.onChangeState(setState);
    tool.onProgress(setProgress);
    tool.onError(setError);
    tool.onDirty(setDirty);

    if (state == "busy") {
        return (
            <div style={{ marginTop: "16px" }}>
                <i className="fa fa-spinner fa-spin"></i>&nbsp; Inpainting...
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
                        selection rectangle to the area that you want to inpaint
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
                            });
                            tool.submit(api, image);
                        }}
                    >
                        {/* paint icon */}
                        <i className="fa fa-paint-brush"></i>&nbsp; Inpaint
                    </button>
                )}
            </div>
        </div>
    );
};
