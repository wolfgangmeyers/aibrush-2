import React, { FC, useState, useEffect, useRef } from "react";
import axios from "axios";
import { Prompt } from "react-router";

import { sleep } from "../../lib/sleep";
import { defaultArgs } from "../../components/ImagePrompt";
import { Tool, BaseTool } from "./tool";
import { Renderer } from "./renderer";
import { SelectionTool } from "./selection-tool";
import { Cursor, Rect } from "./models";
import { getClosestAspectRatio } from "../../lib/aspecRatios";
import {
    ImageUtilWorker,
    loadImageDataElement,
} from "../../lib/imageutil";
import moment from "moment";
import { ProgressBar } from "../../components/ProgressBar";
import { CostIndicator } from "../../components/CostIndicator";
import ModelSelector from "../../components/ModelSelector";
import { ResetToDefaultIcon } from "../../components/ResetToDefaultIcon";
import {
    LoraModal,
    SelectedLora,
    selectedLorasFromConfigs,
} from "../../components/LoraSelector";
import { LoraTriggers } from "../../components/LoraTriggers";
import { SelectedLoraTag } from "../../components/SelectedLora";
import {
    GenerateImageInput,
    GenerationJob,
    LocalImage,
    LoraConfig,
} from "../../lib/models";
import { HordeGenerator } from "../../lib/hordegenerator";
import { HordeClient } from "../../lib/hordeclient";

const anonymousClient = axios.create();

type InpaintToolState =
    | "select"
    | "erase"
    | "inpaint"
    | "uploading"
    | "processing"
    | "confirm"
    | undefined;

interface ImageWithData extends LocalImage {
    data?: ImageData;
}

export class InpaintTool extends BaseTool implements Tool {
    private selectionTool: SelectionTool;
    private prompt: string = "";
    private negativePrompt: string = "";
    private count: number = 4;
    private brushSize: number = 10;
    private loras: LoraConfig[] = [];
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
        this.brushSize = args.brushSize || 10;
        this.loras = args.loras || [];

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
        image: LocalImage,
        alphaMask: ImageData,
        selectionOverlay: Rect
    ): Promise<ImageData> {
        const imageElement = await loadImageDataElement(image);
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
            alphaMode: "alpha",
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

    async submit(generator: HordeGenerator, image: LocalImage, model: string) {
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

        const encodedImage = this.renderer.getEncodedImage(
            selectionOverlay,
            "webp"
        );

        const input: GenerateImageInput = defaultArgs();
        // input.encoded_image = encodedImage;
        // input.encoded_mask = encodedMask;
        input.encoded_image = encodedImage;
        input.encoded_mask = encodedMask;
        input.parent = image.id;
        input.params.prompt = this.prompt || image.params.prompt;
        input.params.negative_prompt =
            this.negativePrompt || image.params.negative_prompt;
        input.params.denoising_strength = 1;
        input.count = this.count;
        input.model = model;

        const closestAspectRatio = getClosestAspectRatio(
            selectionOverlay!.width,
            selectionOverlay!.height
        );
        input.params.width = closestAspectRatio.width;
        input.params.height = closestAspectRatio.height;
        input.params.loras = this.loras;

        let job: GenerationJob | undefined;

        try {
            job = await generator.generateImages(input, (progress) => {
                this.updateProgress(progress.loaded / progress.total);
            });
        } catch (err: any) {
            console.error("Error creating images", err);
            const errMessage =
                err.response?.data?.message ||
                err.message ||
                "Failed to create image";
            this.notifyError(errMessage);
            this.state = "select";
            return;
        }
        this.state = "processing";
        this.updateProgress(0);
        let newImages: Array<ImageWithData> = [];

        let completed = false;
        let startTime = moment();
        while (!completed) {
            await sleep(2000);
            // poll for completion
            try {
                job = await generator.checkGenerationJob(job);
                this.updateProgress(job.progress);
                if (job.status === "completed") {
                    completed = true;
                    newImages = job.images!.filter(
                        (img) => img.status === "completed"
                    );
                    await Promise.all(
                        newImages.map(async (img) => {
                            const imageData = await this.loadImageData(
                                img,
                                maskData!,
                                selectionOverlay!
                            );
                            img.data = imageData;
                        })
                    );
                }
            } catch (err: any) {
                console.error("Error checking job", err);
                const errMessage =
                    err.response?.data?.message ||
                    err.message ||
                    "Failed to check job";
                this.notifyError(errMessage);
            }
            

            if (moment().diff(startTime, "minutes") > 2) {
                completed = true;
                await generator.client.deleteImageRequest(job.id);
            }
        }

        newImages!.sort((a, b) => {
            return a.created_at - b.created_at;
        });
        newImages = newImages!.filter((img) => {
            return img.status === "completed";
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
        const encodedImage = this.renderer.getEncodedImage(null, "png");
        if (encodedImage && this.saveListener) {
            this.saveListener(encodedImage, "png");
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
    generator: HordeGenerator;
    hordeClient: HordeClient;
    image: LocalImage;
    renderer: Renderer;
    tool: InpaintTool;
}

export const InpaintControls: FC<ControlsProps> = ({
    // TODO: alternative source of horde model reference
    generator,
    hordeClient,
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
    const [model, setModel] = useState("Deliberate Inpainting");
    const [selectingModel, setSelectingModel] = useState(false);

    const [selectingLora, setSelectingLora] = useState<boolean>(false);
    const [selectedLoras, setSelectedLoras] = useState<SelectedLora[]>([]);

    useEffect(() => {
        tool.updateArgs({
            brushSize,
        });
    }, [brushSize]);

    useEffect(() => {
        if (image.params.loras && image.params.loras.length > 0) {
            selectedLorasFromConfigs(image.params.loras).then((selected) => {
                setSelectedLoras(selected);
            });
        } else {
            setSelectedLoras([]);
        }
    }, [image]);

    tool.onChangeState(setState);
    tool.onProgress(setProgress);
    tool.onError(setError);
    tool.onDirty(setDirty);

    const onAddLora = (lora: SelectedLora) => {
        setSelectedLoras([...selectedLoras, lora]);
        setSelectingLora(false);
    };

    const onRemoveLora = (lora: SelectedLora) => {
        const updated = selectedLoras.filter(
            (selectedLora) => selectedLora.config.name !== lora.config.name
        );
        setSelectedLoras(updated);
    };

    const onAddTrigger = (trigger: string) => {
        const parts = [prompt];
        if (prompt.length > 0 && !prompt.endsWith(",")) {
            parts.push(", ");
        }
        parts.push(trigger);
        setPrompt(parts.join(""));
    };

    const onSelectModel = (model: string) => {
        setModel(model);
        setSelectingModel(false);
    };

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
                        <label htmlFor="prompt">
                            Prompt&nbsp;
                            <ResetToDefaultIcon
                                onClick={() =>
                                    setPrompt(image.params.prompt || "")
                                }
                            />
                        </label>
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
                    {selectedLoras.length > 0 && (
                        <LoraTriggers
                            prompt={prompt}
                            selectedLoras={selectedLoras}
                            onAddTrigger={onAddTrigger}
                        />
                    )}
                    {/* negative prompt */}
                    <div className="form-group">
                        <label htmlFor="negativeprompt">
                            Negative prompt&nbsp;
                            <ResetToDefaultIcon
                                onClick={() =>
                                    setNegativePrompt(
                                        image.params.negative_prompt || ""
                                    )
                                }
                            />
                        </label>
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
                            Select the inpaint model
                        </small>
                    </div>
                    <div className="form-group">
                        {/* loras */}
                        <label htmlFor="loras">Loras</label>
                        <div>
                            {selectedLoras.map((lora) => (
                                <SelectedLoraTag
                                    key={lora.lora.name}
                                    lora={lora}
                                    onRemove={(lora) => onRemoveLora(lora)}
                                />
                            ))}
                            {/* add lora button */}
                            {selectedLoras.length < 5 && (
                                <button
                                    type="button"
                                    className="btn btn-secondary light-button"
                                    style={{ marginLeft: "8px" }}
                                    onClick={() => setSelectingLora(true)}
                                >
                                    <i className="fas fa-plus"></i>&nbsp;Add
                                    Lora
                                </button>
                            )}
                        </div>
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
                            tool.submit(generator, image, model);
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
            {selectingModel && (
                <ModelSelector
                    onCancel={() => setSelectingModel(false)}
                    onSelectModel={onSelectModel}
                    initialSelectedModel={model}
                    inpainting={true}
                    hordeClient={hordeClient}
                    openaiEnabled={false}
                />
            )}
            {selectingLora && (
                <LoraModal
                    onCancel={() => setSelectingLora(false)}
                    onConfirm={(lora) => onAddLora(lora)}
                />
            )}
        </div>
    );
};
