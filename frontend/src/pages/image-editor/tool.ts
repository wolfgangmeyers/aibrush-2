import React from "react";

export interface Tool {
    name: string;
    initialize(args: any): void;
    onMouseDown(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>): void;
    onMouseMove(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>): void;
    onMouseUp(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>): void;
    onMouseLeave(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>): void;
    onKeyDown(event: KeyboardEvent): void;
    onKeyUp(event: KeyboardEvent): void;
    onWheel(event: WheelEvent): void;
    destroy(): void;
}
