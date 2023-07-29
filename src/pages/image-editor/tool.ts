import React from "react";
import { Renderer } from "./renderer";
import { ZoomHelper } from "./zoomHelper";

export interface Tool {
    name: string;
    getArgs(): any;
    updateArgs(args: any): void;
    onMouseDown(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>): void;
    onMouseMove(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>): void;
    onMouseUp(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>): void;
    onMouseLeave(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>): void;

    onTouchStart(event: React.TouchEvent<HTMLCanvasElement>): void;
    onTouchMove(event: React.TouchEvent<HTMLCanvasElement>): void;
    onTouchEnd(event: React.TouchEvent<HTMLCanvasElement>): void;

    onKeyDown(event: KeyboardEvent): void;
    onKeyUp(event: KeyboardEvent): void;
    onWheel(event: WheelEvent): void;
    destroy(): boolean;
    onShowSelectionControls(listener: (show: boolean) => void): void;
    select(direction: "left" | "right"): void;
    onSaveImage(listener: (encodedImage: string) => void): void;
}

export class BaseTool implements Tool {
    saveListener?: (encodedImage: string, format: "png" | "webp") => void = () => {};

    private touchHandle: number | undefined;

    readonly zoomHelper: ZoomHelper;

    private _pinchZooming = false;
    private _panning = false;

    constructor(readonly renderer: Renderer, readonly name: string) {
        this.zoomHelper = new ZoomHelper(renderer);
    }

    getArgs(): any {
        return JSON.parse(
            localStorage.getItem(`tool_args_${this.name}`) || "{}"
        );
    }
    updateArgs(args: any) {
        localStorage.setItem(`tool_args_${this.name}`, JSON.stringify(args));
    }
    onMouseDown(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        if (event.button === 1) {
            this._panning = true;
        }
    }
    onMouseMove(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        if (this._panning) {
            this.zoomHelper.onPan(event);
        }
        let { x, y } = this.zoomHelper.translateMouseToCanvasCoordinates(
            event.nativeEvent.offsetX,
            event.nativeEvent.offsetY
        );
        this._updateCursor(x, y);
    }

    private _updateCursor(x: number, y: number) {
        this.renderer.setCursor({
            color: "white",
            radius: 10,
            type: "crosshairs",
            x,
            y,
        });
    }

    onMouseUp(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        if (this._panning) {
            this._panning = false;
        }
    }
    onMouseLeave(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {}

    onTouchStart(event: React.TouchEvent<HTMLCanvasElement>) {
        if (this.touchHandle) {
            window.clearTimeout(this.touchHandle);
        }
        const touches: React.Touch[] = [];
        // make a deep copy so that the values live past the delay
        for (let i = 0; i < event.touches.length; i++) {
            const touch = event.touches[i];
            touches.push({
                identifier: touch.identifier,
                clientX: touch.clientX,
                clientY: touch.clientY,
                pageX: touch.pageX,
                pageY: touch.pageY,
                screenX: touch.screenX,
                screenY: touch.screenY,
                target: null,
            } as any);
        }
        event = {
            touches,
        } as any;
        this.touchHandle = window.setTimeout(() => {
            this.touchHandle = undefined;
            if (event.touches.length === 2) {
                this._pinchZooming = true;
                this.zoomHelper.onTouchStart(event);
            } else {
                const rect = this.renderer.getCanvas().getBoundingClientRect();
                const touch = event.touches[0];
                if (touch) {
                    this.onMouseDown({
                        type: "touch",
                        button: 0,
                        nativeEvent: {
                            offsetX: touch.clientX - rect.left,
                            offsetY: touch.clientY - rect.top,
                        },
                    } as any);
                }
            }
        }, 200);
    }
    onTouchMove(event: React.TouchEvent<HTMLCanvasElement>) {
        if (event.touches.length === 2) {
            this.zoomHelper.onTouchMove(event);
        } else {
            const rect = this.renderer.getCanvas().getBoundingClientRect();
            const touch = event.touches[0];
            if (touch) {
                this.onMouseMove({
                    type: "touch",
                    button: 0,
                    nativeEvent: {
                        offsetX: touch.clientX - rect.left,
                        offsetY: touch.clientY - rect.top,
                    },
                } as any);
            }
        }
    }
    onTouchEnd(event: React.TouchEvent<HTMLCanvasElement>) {
        if (this._pinchZooming) {
            this._pinchZooming = false;
            this.zoomHelper.onTouchEnd(event);
        } else {
            this.onMouseUp({
                button: 0,
                type: "touch",
            } as any);
        }
    }

    onKeyDown(event: KeyboardEvent) {}
    onKeyUp(event: KeyboardEvent) {}
    onWheel(event: WheelEvent) {
        this.zoomHelper.onWheel(event);
    }
    destroy(): boolean {
        return true;
    }
    onShowSelectionControls(listener: (show: boolean) => void) {}
    select(direction: "left" | "right") {}
    onSaveImage(listener: (encodedImage: string) => void) {
        this.saveListener = listener;
    }
}
