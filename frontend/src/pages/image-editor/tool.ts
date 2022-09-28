import React from "react";

export interface Tool {
    name: string;
    getArgs(): any;
    updateArgs(args: any): void;
    onMouseDown(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>): void;
    onMouseMove(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>): void;
    onMouseUp(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>): void;
    onMouseLeave(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>): void;
    onKeyDown(event: KeyboardEvent): void;
    onKeyUp(event: KeyboardEvent): void;
    onWheel(event: WheelEvent): void;
    destroy(): boolean;
    onShowSelectionControls(listener: (show: boolean) => void): void;
    select(direction: "left" | "right"): void;
    onSaveImage(listener: (encodedImage: string) => void): void;
}

export class BaseTool implements Tool {
    constructor(readonly name: string) {}

    getArgs(): any {
        return JSON.parse(
            localStorage.getItem(`tool_args_${this.name}`) || "{}"
        );
    }
    updateArgs(args: any) {
        localStorage.setItem(`tool_args_${this.name}`, JSON.stringify(args));
    }
    onMouseDown(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {}
    onMouseMove(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {}
    onMouseUp(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {}
    onMouseLeave(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {}
    onKeyDown(event: KeyboardEvent) {}
    onKeyUp(event: KeyboardEvent) {}
    onWheel(event: WheelEvent) {}
    destroy(): boolean {
        return true;
    }
    onShowSelectionControls(listener: (show: boolean) => void) {}
    select(direction: "left" | "right") {}
    onSaveImage(listener: (encodedImage: string) => void) {}
}
