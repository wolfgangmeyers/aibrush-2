import React, { FC, useState, useEffect } from "react";
import { Renderer } from "./renderer";
import { BaseTool, Tool } from "./tool";
import { ZoomHelper } from "./zoomHelper";

export class SmudgeTool extends BaseTool implements Tool {
    private brushSize = 10;
    private brushOpacity = 0.2;

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

    private dirtyListener?: (dirty: boolean) => void;

    constructor(renderer: Renderer) {
        super(renderer, "smudge");
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
        this.brushOpacity = args.brushOpacity || 0.2;
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
                this.brushOpacity
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
            if (!this.dirty) {
                this.renderer.copyEditImageFromBaseImage();
            }
            this.dirty = true;
            let { x, y } = this.zoomHelper.translateMouseToCanvasCoordinates(
                event.nativeEvent.offsetX,
                event.nativeEvent.offsetY
            );
            this.lastX = x;
            this.lastY = y;
            this.sync();
        } else if (event.button === 1) {
            this.panning = true;
        }
        this.sync();
    }

    onMouseUp(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        this.smudging = false;
        this.panning = false;
        this.sync();
    }

    onSaveImage(listener: (encodedImage: string) => void): void {
        this.saveListener = listener;
    }

    onDirty(listener: (dirty: boolean) => void): void {
        this.dirtyListener = listener;
    }

    cancel() {
        // kind of a hack, clears the selection layer
        this.renderer.setEditImage(null);
        this.dirty = false;
    }

    confirm() {
        this.renderer.commitSelection();
        const encodedImage = this.renderer.getEncodedImage(null, "png");
        if (encodedImage && this.saveListener) {
            this.saveListener(encodedImage, "png");
        }
        this.dirty = false;
    }

    destroy(): boolean {
        if (this.dirty) {
            this.renderer.commitSelection();
        }
        return true;
    }
}

interface Props {
    renderer: Renderer;
    tool: SmudgeTool;
}

export const SmudgeControls: FC<Props> = ({ renderer, tool }) => {
    const [brushSize, setBrushSize] = useState(10);
    const [brushOpacity, setBrushOpacity] = useState(0.2);
    const [dirty, setDirty] = useState(false);

    tool.onDirty(setDirty);

    useEffect(() => {
        tool.updateArgs({
            brushSize,
            brushOpacity,
        });
    }, [brushSize, brushOpacity]);

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
            <div className="form-group">
                <label style={{ width: "100%" }}>
                    Brush opacity
                    <small
                        className="form-text text-muted"
                        style={{ float: "right" }}
                    >
                        {Math.round(brushOpacity * 100)}%
                    </small>
                </label>
                <input
                    type="range"
                    className="form-control-range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={brushOpacity}
                    onChange={(e) =>
                        setBrushOpacity(parseFloat(e.target.value))
                    }
                />
            </div>
            <div
                className="form-group"
                style={{
                    marginTop: "16px",
                    visibility: dirty ? "visible" : "hidden",
                }}
            >
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
        </div>
    );
};
