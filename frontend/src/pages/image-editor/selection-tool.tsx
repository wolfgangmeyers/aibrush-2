import React, { useState, useEffect } from "react";
import { Renderer } from "./renderer";
import { Cursor, Rect } from "./models";
import { Tool, BaseTool } from "./tool";
import { AspectRatioSelector } from "../../components/AspectRatioSelector";
import { getUpscaleLevel } from "../../lib/upscale";
import {
    DEFAULT_ASPECT_RATIO,
    aspectRatios,
    getClosestAspectRatio,
} from "../../lib/aspecRatios";
import { ZoomHelper } from "./zoomHelper";
import { runInThisContext } from "vm";

export class SelectionTool extends BaseTool implements Tool {
    private selectionOverlay: Rect | undefined;
    private selectionOverlayPreview: Rect | undefined;

    // private selectionWidth: number = 512;
    // private selectionHeight: number = 512;

    private panning = false;

    // TODO: size modifier to make the selection overlay smaller

    constructor(renderer: Renderer) {
        super(renderer, "select");
    }

    // TODO: smaller/larger, aspect ratios?
    updateArgs(args: any) {
        super.updateArgs(args);
        // this.selectionWidth = args.selectionWidth || 512;
        // this.selectionHeight = args.selectionHeight || 512;
        this.selectionOverlay = args.selectionOverlay || {
            x: 0,
            y: 0,
            width: 512,
            height: 512,
        };
        this.sync();
    }

    private sync(): void {
        this.renderer.setSelectionOverlay(this.selectionOverlay);
        this.renderer.setSelectionOverlayPreview(this.selectionOverlayPreview);
    }

    onMouseDown(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        if (event.type == "touch") {
            this.onMouseMove(event);
        } else if (event.button === 0) {
            this.selectionOverlay = this.selectionOverlayPreview;
            this.selectionOverlayPreview = undefined;
            this.sync();
            this.updateArgs({
                ...this.getArgs(),
                selectionOverlay: this.selectionOverlay,
            });
        } else if (event.button === 1) {
            this.panning = true;
        }
    }

    onMouseMove(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        const imageWidth = this.renderer.getWidth();
        const imageHeight = this.renderer.getHeight();
        if (this.panning) {
            this.zoomHelper.onPan(event);
        } else {
            let { x, y } = this.zoomHelper.translateMouseToCanvasCoordinates(
                event.nativeEvent.offsetX,
                event.nativeEvent.offsetY
            );

            // round to the nearest 16 pixels
            x = Math.round(x / 16) * 16;
            y = Math.round(y / 16) * 16;
            // offset by -256 to center the rect
            x -= 256;
            y -= 256;
            // clamp to the canvas
            x = Math.max(
                0,
                Math.min(x, imageWidth - this.selectionOverlay!.width)
            );
            y = Math.max(
                0,
                Math.min(y, imageHeight - this.selectionOverlay!.height)
            );
            x = Math.min(x, imageWidth - this.selectionOverlay!.width);
            y = Math.min(y, imageHeight - this.selectionOverlay!.height);

            this.selectionOverlayPreview = {
                x: x,
                y: y,
                width: this.selectionOverlay!.width,
                height: this.selectionOverlay!.height,
            };
            this.sync();
        }
    }

    onMouseUp(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        if (event.button === 0 && event.type == "touch") {
            this.selectionOverlay = this.selectionOverlayPreview;
            this.selectionOverlayPreview = undefined;
            this.sync();
            this.updateArgs({
                ...this.getArgs(),
                selectionOverlay: this.selectionOverlay,
            });
        }
        this.panning = false;
    }

    onMouseLeave(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        this.selectionOverlayPreview = undefined;
        this.panning = false;
        this.sync();
    }

    onWheel(event: WheelEvent) {
        this.zoomHelper.onWheel(event);
    }

    destroy() {
        // this.renderer.setSelectionOverlay(undefined);
        this.renderer.setSelectionOverlayPreview(undefined);
        return true;
    }
}

interface ControlsProps {
    renderer: Renderer;
    tool: Tool;
}

export const Controls: React.FC<ControlsProps> = ({ renderer, tool }) => {
    const upscaleLevel = getUpscaleLevel(
        renderer.getWidth(),
        renderer.getHeight()
    );
    const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT_RATIO);
    const [size, setSize] = useState(1);

    useEffect(() => {
        const upscaleLevel = getUpscaleLevel(
            renderer.getWidth(),
            renderer.getHeight()
        );
        // lock aspect ratio to image
        if (upscaleLevel === 0) {
            const aspectRatio = getClosestAspectRatio(
                renderer.getWidth(),
                renderer.getHeight()
            );
            setAspectRatio(aspectRatio.id);
            tool.updateArgs({
                // selectionWidth: aspectRatio.width,
                // selectionHeight: aspectRatio.height,
                selectionOverlay: {
                    x: 0,
                    y: 0,
                    width: aspectRatio.width,
                    height: aspectRatio.height,
                },
            });
        } else {
            const args = tool.getArgs();
            if (args.selectionOverlay) {
                // restore args
                const aspectRatio = getClosestAspectRatio(
                    args.selectionOverlay.width,
                    args.selectionOverlay.height
                );
                setAspectRatio(aspectRatio.id);
                setSize(args.selectionOverlay.width / aspectRatio.width);
                tool.updateArgs(args);
            } else {
                // set default args
                args.selectionOverlay = {
                    x: 0,
                    y: 0,
                    width: aspectRatios[aspectRatio].width,
                    height: aspectRatios[aspectRatio].height,
                };
                tool.updateArgs(args);
            }
        }
    }, [tool]);

    function onChange(aspectRatioId: number, size: number) {
        const args = tool.getArgs();
        const aspectRatio = aspectRatios[aspectRatioId];
        if (args.selectionOverlay) {
            const xDiff = args.selectionOverlay.width - aspectRatio.width * size;
            const yDiff = args.selectionOverlay.height - aspectRatio.height * size;
            args.selectionOverlay.width = Math.round(aspectRatio.width * size);
            args.selectionOverlay.height = Math.round(aspectRatio.height * size);
            args.selectionOverlay.x += xDiff / 2;
            args.selectionOverlay.y += yDiff / 2;
            // clamp to canvas
            args.selectionOverlay.x = Math.round(Math.max(
                0,
                Math.min(
                    args.selectionOverlay.x,
                    renderer.getWidth() - args.selectionOverlay.width
                )
            ));
            args.selectionOverlay.y = Math.round(Math.max(
                0,
                Math.min(
                    args.selectionOverlay.y,
                    renderer.getHeight() - args.selectionOverlay.height
                )
            ));
        }
        tool.updateArgs({
            selectionOverlay: args.selectionOverlay,
        });
    }

    return (
        <>
            {upscaleLevel > 0 && (
                <AspectRatioSelector
                    aspectRatio={aspectRatio}
                    onChange={(aspectRatioId) => {
                        onChange(aspectRatioId, size);
                        setAspectRatio(aspectRatioId);
                    }}
                />
            )}
            <div className="form-group">
                <label htmlFor="size" style={{ width: "100%" }}>
                    Size
                    <small
                        className="form-text text-muted"
                        style={{ float: "right" }}
                    >
                        {Math.round(size * 100)}%
                    </small>
                </label>
                {/* range from 0.1 to 1 */}
                <input
                    type="range"
                    className="form-control-range"
                    id="size"
                    min="0.2"
                    max="1"
                    step="0.1"
                    value={size}
                    onChange={(event) => {
                        onChange(aspectRatio, parseFloat(event.target.value));
                        setSize(parseFloat(event.target.value));
                    }}
                />
            </div>
        </>
    );
};
