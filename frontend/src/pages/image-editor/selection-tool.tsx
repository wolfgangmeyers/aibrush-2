import React, { useState, useEffect } from "react";
import { Cursor, Rect, Renderer } from "./renderer";
import { Tool, BaseTool } from "./tool";
import { AspectRatioSelector } from "../../components/AspectRatioSelector";
import { getUpscaleLevel } from "../../lib/upscale";
import {
    DEFAULT_ASPECT_RATIO,
    aspectRatios,
    getClosestAspectRatio,
} from "../../lib/aspecRatios";
import { ZoomHelper } from "./zoomHelper";

export class SelectionTool extends BaseTool implements Tool {
    private renderer: Renderer;
    private zoomHelper: ZoomHelper;
    private selectionOverlay: Rect | undefined;
    private selectionOverlayPreview: Rect | undefined;

    private selectionWidth: number = 512;
    private selectionHeight: number = 512;

    private panning = false;

    constructor(renderer: Renderer) {
        super("select");
        this.renderer = renderer;
        this.zoomHelper = new ZoomHelper(renderer);
    }

    // TODO: smaller/larger, aspect ratios?
    updateArgs(args: any) {
        super.updateArgs(args);
        this.selectionWidth = args.selectionWidth || 512;
        this.selectionHeight = args.selectionHeight || 512;
        this.selectionOverlay = {
            x: 0,
            y: 0,
            width: this.selectionWidth,
            height: this.selectionHeight,
        };
        this.sync();
    }

    private sync(): void {
        this.renderer.setSelectionOverlay(this.selectionOverlay);
        this.renderer.setSelectionOverlayPreview(this.selectionOverlayPreview);
    }

    onMouseDown(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        if (this.selectionOverlayPreview && event.button === 0) {
            this.selectionOverlay = this.selectionOverlayPreview;
            this.selectionOverlayPreview = undefined;
            this.sync();
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
            let {x, y} = this.zoomHelper.translateMouseToCanvasCoordinates(
                event.nativeEvent.offsetX,
                event.nativeEvent.offsetY,
            )

            // round to the nearest 64 pixels
            x = Math.round(x / 64) * 64;
            y = Math.round(y / 64) * 64;
            // offset by -256 to center the rect
            x -= 256;
            y -= 256;
            // clamp to the canvas
            x = Math.max(0, Math.min(x, imageWidth - this.selectionWidth));
            y = Math.max(0, Math.min(y, imageHeight - this.selectionHeight));
            x = Math.min(x, imageWidth - this.selectionWidth);
            y = Math.min(y, imageHeight - this.selectionHeight);

            this.selectionOverlayPreview = {
                x: x,
                y: y,
                width: this.selectionWidth,
                height: this.selectionHeight,
            };
            this.sync();
        }
    }

    onMouseUp(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        this.panning = false;
    }

    onMouseLeave(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        this.selectionOverlayPreview = undefined;
        this.panning = false;
        this.sync();
    }

    // onKeyDown(event: KeyboardEvent) {
    //     // TODO
    // }

    // onKeyUp(event: KeyboardEvent) {
    //     // TODO
    // }

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
                selectionWidth: aspectRatio.width,
                selectionHeight: aspectRatio.height,
            });
        } else {
            const args = tool.getArgs();
            if (args.selectionWidth && args.selectionHeight) {
                // restore args
                const aspectRatio = getClosestAspectRatio(
                    args.selectionWidth,
                    args.selectionHeight
                );
                setAspectRatio(aspectRatio.id);
                tool.updateArgs(args)
            } else {
                // set default args
                args.selectionWidth = aspectRatios[aspectRatio].width;
                args.selectionHeight = aspectRatios[aspectRatio].height;
                tool.updateArgs(args);
            }
        }
    }, [tool]);
    return (
        <>
            {upscaleLevel > 0 && (
                <AspectRatioSelector
                    aspectRatio={aspectRatio}
                    onChange={(aspectRatioId) => {
                        const aspectRatio = aspectRatios[aspectRatioId];
                        tool.updateArgs({
                            selectionWidth: aspectRatio.width,
                            selectionHeight: aspectRatio.height,
                        });
                        setAspectRatio(aspectRatioId);
                    }}
                />
            )}
        </>
    );
};
