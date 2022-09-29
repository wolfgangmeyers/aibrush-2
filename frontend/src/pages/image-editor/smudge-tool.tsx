import React, { FC, useState, useEffect } from "react";
import { Renderer } from "./renderer";
import { BaseTool, Tool } from "./tool";
import { ZoomHelper } from "./zoomHelper";

export class SmudgeTool extends BaseTool implements Tool {
    private renderer: Renderer;
    private zoomHelper: ZoomHelper;

    private brushSize = 10;

    private lastX = 0;
    private lastY = 0;
    private panning = false;
    private smudging = false;
    private _dirty = false;

    set dirty(dirty: boolean) {
        this._dirty = dirty;
        if (this.dirtyListener) {
            this.dirtyListener(dirty);
        }
    }

    get dirty() {
        return this._dirty;
    }

    private saveListener: (encodedImage: string) => void = () => {};
    private dirtyListener?: (dirty: boolean) => void;

    constructor(renderer: Renderer) {
        super("smudge");
        this.renderer = renderer;
        this.zoomHelper = new ZoomHelper(renderer);
        this.renderer.copyEditImageFromBaseImage();
    }

    private sync() {
        this.renderer.setCursor({
            type: "circle",
            color: "white",
            radius: this.brushSize / 2,
            x: this.lastX,
            y: this.lastY,
        });
    }

    updateArgs(args: any) {
        super.updateArgs(args);
        this.brushSize = args.brushSize || 10;
        this.sync();
    }

    onMouseMove(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>): void {
        let { x, y } = this.zoomHelper.translateMouseToCanvasCoordinates(
            event.nativeEvent.offsetX,
            event.nativeEvent.offsetY
        );

        if (this.panning) {
            this.zoomHelper.onPan(event);
        } else if (this.smudging) {
            this.renderer.smudgeLine(
                this.lastX,
                this.lastY,
                x,
                y,
                this.brushSize,
                0.2
            );
            this.dirty = true;
        }

        this.lastX = x;
        this.lastY = y;
        this.sync();
    }

    onWheel(event: WheelEvent) {
        this.zoomHelper.onWheel(event);
        this.sync();
    }

    onMouseDown(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        if (event.button === 0) {
            this.smudging = true;
        } else if (event.button === 1) {
            this.panning = true;
        }
        this.sync();
    }

    onMouseUp(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        if (event.button === 0) {
            this.smudging = false;
        } else if (event.button === 1) {
            this.panning = false;
        }
    }

    onSaveImage(listener: (encodedImage: string) => void): void {
        this.saveListener = listener;
    }

    onDirty(listener: (dirty: boolean) => void): void {
        this.dirtyListener = listener;
    }

    cancel() {
        // kind of a hack, clears the selection layer
        this.renderer.copyEditImageFromBaseImage();
        this.dirty = false;
    }

    confirm() {
        this.renderer.commitSelection();
        const encodedImage = this.renderer.getEncodedImage(null);
        if (encodedImage && this.saveListener) {
            this.saveListener(encodedImage);
        }
        this.dirty = false;
    }

    destroy(): boolean {
        if (
            !this.dirty ||
            window.confirm("Are you sure you want to discard your changes?")
        ) {
            this.renderer.setCursor(undefined);
            this.renderer.setEditImage(null);
            return true;
        }
        return false;
    }
}

interface Props {
    renderer: Renderer;
    tool: SmudgeTool;
}

export const SmudgeControls: FC<Props> = ({ renderer, tool }) => {
    const [brushSize, setBrushSize] = useState(10);
    const [dirty, setDirty] = useState(false);

    tool.onDirty(setDirty);

    useEffect(() => {
        tool.updateArgs({
            brushSize,
        });
    }, [brushSize]);

    return (
        <div style={{ marginTop: "16px" }}>
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
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                />
            </div>
            {dirty && (
                <div className="form-group" style={{ marginTop: "16px" }}>
                    <button
                        className="btn btn-secondary"
                        onClick={() => tool.cancel()}
                    >
                        Revert
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={() => tool.confirm()}
                        style={{ marginLeft: "8px" }}
                    >
                        Save
                    </button>
                </div>
            )}
        </div>
    );
};
