import { Cursor, Rect } from "./models";

const maxSnapshots = 10;



export class Renderer {
    // private backgroundLayer: HTMLCanvasElement;
    private undoStack: ImageData[] = [];
    private redoStack: ImageData[] = [];
    private currentSnapshot: ImageData | undefined;

    private baseImageLayer: HTMLCanvasElement;
    private editLayer: HTMLCanvasElement;
    private overlayLayer: HTMLCanvasElement;

    private selectionOverlay: Rect | undefined;
    private selectionOverlayPreview: Rect | undefined;
    private hasSelection: boolean = false;
    private cursor: Cursor | undefined;

    private zoom: number;
    private offsetX: number;
    private offsetY: number;

    private snapshotListener: (() => void) | null = null;

    constructor(private readonly canvas: HTMLCanvasElement) {
        // invisible canvas elements
        // this.backgroundLayer = document.createElement('canvas');
        this.baseImageLayer = document.createElement("canvas");
        this.editLayer = document.createElement("canvas");
        this.overlayLayer = document.createElement("canvas");

        this.zoom = 1;
        this.offsetX = 0;
        this.offsetY = 0;
    }

    undo() {
        if (this.undoStack.length > 0 && this.currentSnapshot) {
            const imageData = this.undoStack.pop()!;
            this.redoStack.push(this.currentSnapshot);
            this.currentSnapshot = imageData;
            // set as base image
            const ctx = this.baseImageLayer.getContext("2d");
            if (ctx) {
                ctx.clearRect(
                    0,
                    0,
                    this.baseImageLayer.width,
                    this.baseImageLayer.height
                );
                ctx.putImageData(imageData, 0, 0);
                this.render();
            }
            this.notifySnapshotListener();
        }
    }

    redo() {
        if (this.redoStack.length > 0 && this.currentSnapshot) {
            this.undoStack.push(this.currentSnapshot);
            const imageData = this.redoStack.pop()!;
            this.currentSnapshot = imageData;

            // set as base image
            const ctx = this.baseImageLayer.getContext("2d");
            if (ctx) {
                ctx.putImageData(imageData, 0, 0);
                this.render();
            }
            this.notifySnapshotListener();
        }
    }

    canUndo(): boolean {
        return !this.hasSelection && this.undoStack.length > 0;
    }

    canRedo(): boolean {
        return !this.hasSelection && this.redoStack.length > 0;
    }

    onSnapshot(listener: () => void) {
        this.snapshotListener = listener;
    }

    snapshot() {
        const ctx = this.baseImageLayer.getContext("2d");
        if (ctx) {
            const snapshot = ctx.getImageData(
                0,
                0,
                this.baseImageLayer.width,
                this.baseImageLayer.height
            );
            if (this.currentSnapshot) {
                this.undoStack.push(this.currentSnapshot);
                this.currentSnapshot = snapshot;
                if (this.redoStack.length > 0) {
                    this.redoStack = [];
                }
                if (this.undoStack.length > maxSnapshots) {
                    this.undoStack.shift();
                }
            } else {
                this.currentSnapshot = snapshot;
            }

            this.notifySnapshotListener();
        }
    }

    private notifySnapshotListener() {
        if (this.snapshotListener) {
            this.snapshotListener();
        }
    }

    render() {
        const context = this.canvas.getContext("2d");
        if (context) {
            context.clearRect(0, 0, this.canvas.width, this.canvas.height);
            // apply zoom and offset
            context.setTransform(
                this.zoom,
                0,
                0,
                this.zoom,
                this.offsetX * this.zoom,
                this.offsetY * this.zoom
            );
            // context.drawImage(this.backgroundLayer, 0, 0);
            context.drawImage(this.baseImageLayer, 0, 0);
            context.drawImage(this.editLayer, 0, 0);
            context.drawImage(this.overlayLayer, 0, 0);
        }
    }

    getCanvas(): HTMLCanvasElement {
        return this.canvas;
    }

    setBaseImage(image: HTMLImageElement) {
        const context = this.baseImageLayer.getContext("2d");
        if (context) {
            // set size of all layers
            // this.backgroundLayer.width = image.width;
            // this.backgroundLayer.height = image.height;
            this.baseImageLayer.width = image.width;
            this.baseImageLayer.height = image.height;
            this.editLayer.width = image.width;
            this.editLayer.height = image.height;
            this.overlayLayer.width = image.width;
            this.overlayLayer.height = image.height;
            // set canvas size
            this.canvas.width = image.width;
            this.canvas.height = image.height;
            context.drawImage(image, 0, 0);

            // set 512x512 selection overlay at the center of the image
            this.setSelectionOverlay({
                x: (image.width - 512) / 2,
                y: (image.height - 512) / 2,
                width: 512,
                height: 512,
            });

            this.render();
            this.snapshot();
        }
    }

    setEditImage(imageData: ImageData | null) {
        this.hasSelection = !!imageData;
        const context = this.editLayer.getContext("2d");
        if (context && this.selectionOverlay) {
            context.clearRect(
                0,
                0,
                this.editLayer.width,
                this.editLayer.height
            );
            if (imageData) {
                context.putImageData(
                    imageData,
                    this.selectionOverlay.x,
                    this.selectionOverlay.y
                );
            }
            // edit image makes the selection rect and preview disappear
            // so redraw the overlay
            this.hasSelection = !!imageData;
            this.drawOverlay();
        }
        this.notifySnapshotListener();
    }

    private drawOverlay() {
        const lineWidth = Math.max(
            this.canvas.width / 512,
            this.canvas.height / 512
        );
        const context = this.overlayLayer.getContext("2d");
        if (context) {
            context.clearRect(
                0,
                0,
                this.overlayLayer.width,
                this.overlayLayer.height
            );
            context.strokeStyle = "gray";
            context.lineWidth = lineWidth;
            context.strokeRect(
                0,
                0,
                this.overlayLayer.width,
                this.overlayLayer.height
            );

            if (!this.hasSelection && this.selectionOverlay) {
                context.strokeStyle = "white";
                context.lineWidth = lineWidth;
                context.strokeRect(
                    this.selectionOverlay.x,
                    this.selectionOverlay.y,
                    this.selectionOverlay.width,
                    this.selectionOverlay.height
                );
            }
            if (!this.hasSelection && this.selectionOverlayPreview) {
                context.strokeStyle = "cyan";
                context.lineWidth = lineWidth;
                context.strokeRect(
                    this.selectionOverlayPreview.x,
                    this.selectionOverlayPreview.y,
                    this.selectionOverlayPreview.width,
                    this.selectionOverlayPreview.height
                );
            }
            if (this.cursor) {
                if (this.cursor.type === "circle") {
                    context.lineWidth = lineWidth;
                    context.strokeStyle = this.cursor.color;
                    // context.globalAlpha = 0.5;
                    context.beginPath();
                    context.arc(
                        this.cursor.x,
                        this.cursor.y,
                        this.cursor.radius,
                        0,
                        2 * Math.PI
                    );
                    context.stroke();
                } else if (this.cursor.type === "circle-fill") {
                    context.fillStyle = this.cursor.color;
                    // context.lineWidth = lineWidth;
                    // context.globalAlpha = 0.5;
                    context.beginPath();
                    context.arc(
                        this.cursor.x,
                        this.cursor.y,
                        this.cursor.radius,
                        0,
                        2 * Math.PI
                    );
                    context.fill();
                } else if (this.cursor.type == "crosshairs") {
                    // draw crosshairs based on cursor radius
                    context.strokeStyle = this.cursor.color;
                    context.lineWidth = lineWidth;
                    context.beginPath();
                    context.moveTo(
                        this.cursor.x - this.cursor.radius,
                        this.cursor.y
                    );
                    context.lineTo(
                        this.cursor.x + this.cursor.radius,
                        this.cursor.y
                    );
                    context.moveTo(
                        this.cursor.x,
                        this.cursor.y - this.cursor.radius
                    );
                    context.lineTo(
                        this.cursor.x,
                        this.cursor.y + this.cursor.radius
                    );
                    context.stroke();
                } else if (this.cursor.type === "colorpicker") {
                    // TODO: add croshairs
                    context.lineWidth = this.cursor.radius * 0.75;
                    context.strokeStyle = this.cursor.color;
                    // context.globalAlpha = 0.5;
                    context.beginPath();
                    context.arc(
                        this.cursor.x,
                        this.cursor.y,
                        this.cursor.radius,
                        0,
                        2 * Math.PI
                    );
                    context.stroke();

                    // draw crosshairs (black)
                    context.lineWidth = lineWidth;
                    context.strokeStyle = "black";
                    context.beginPath();
                    context.moveTo(
                        this.cursor.x - this.cursor.radius,
                        this.cursor.y
                    );
                    context.lineTo(
                        this.cursor.x + this.cursor.radius,
                        this.cursor.y
                    );
                    context.moveTo(
                        this.cursor.x,
                        this.cursor.y - this.cursor.radius
                    );
                    context.lineTo(
                        this.cursor.x,
                        this.cursor.y + this.cursor.radius
                    );
                    context.stroke();
                }
            }

            this.render();
        }
    }

    setSelectionOverlay(selectionOverlay: Rect | undefined) {
        this.selectionOverlay = selectionOverlay;
        this.drawOverlay();
    }

    setSelectionOverlayPreview(selectionOverlayPreview: Rect | undefined) {
        this.selectionOverlayPreview = selectionOverlayPreview;
        this.drawOverlay();
    }

    setCursor(cursor: Cursor | undefined) {
        this.cursor = cursor;
        this.drawOverlay();
    }

    getSelectionOverlay(): Rect | undefined {
        return this.selectionOverlay;
    }

    getZoom(): number {
        return this.zoom;
    }

    getOffsetX(): number {
        return this.offsetX;
    }

    getOffsetY(): number {
        return this.offsetY;
    }

    updateZoomAndOffset(zoom: number, offsetX: number, offsetY: number) {
        this.zoom = zoom;
        this.offsetX = offsetX;
        this.offsetY = offsetY;
        this.render();
    }

    getWidth(): number {
        return this.canvas.width;
    }

    getHeight(): number {
        return this.canvas.height;
    }

    getEncodedImage(selection: Rect | null): string | undefined {
        const imageData = this.getImageData(selection);
        if (imageData) {
            // create a canvas and draw the image data on it
            const canvas = document.createElement("canvas");
            canvas.width = imageData.width;
            canvas.height = imageData.height;
            const context = canvas.getContext("2d");
            if (context) {
                context.putImageData(imageData, 0, 0);
                // return the data url of the canvas
                const result = canvas.toDataURL("image/jpeg");
                // cleanup the canvas
                canvas.remove();
                // extract base64 data from data url
                return result.split(",")[1];
            }
        }
    }

    getImageData(selection: Rect | null): ImageData | undefined {
        if (!selection) {
            selection = {
                x: 0,
                y: 0,
                width: this.canvas.width,
                height: this.canvas.height,
            };
        }
        // get image data of the selection
        let context = this.baseImageLayer.getContext("2d");
        if (context) {
            const imageData = context.getImageData(
                selection.x,
                selection.y,
                selection.width,
                selection.height
            );
            return imageData;
        }
    }

    commitSelection() {
        // draw the selection overlay on the base image layer
        const context = this.baseImageLayer.getContext("2d");
        if (context) {
            context.drawImage(this.editLayer, 0, 0);
            this.setEditImage(null);
            this.snapshot();
        }
    }

    drawPoint(x: number, y: number, brushSize: number, color: string): void {
        // draw on selection layer
        const context = this.editLayer.getContext("2d");
        if (context) {
            context.fillStyle = color;
            context.beginPath();
            context.arc(x, y, brushSize / 2, 0, 2 * Math.PI);
            context.fill();
        }
        this.render();
    }

    drawLine(
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        brushSize: number,
        color: string
    ): void {
        // draw on selection layer
        const context = this.editLayer.getContext("2d");
        if (context) {
            context.strokeStyle = color;
            context.lineWidth = brushSize;
            context.lineCap = "round";
            context.beginPath();
            context.moveTo(x1, y1);
            context.lineTo(x2, y2);
            context.stroke();
        }
        this.render();
    }

    smudgeLine(
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        brushSize: number,
        brushOpacity: number
    ): void {
        const unitVector = {
            x: x2 - x1,
            y: y2 - y1,
        };
        const length = Math.sqrt(
            unitVector.x * unitVector.x + unitVector.y * unitVector.y
        );
        unitVector.x /= length;
        unitVector.y /= length;

        // for each point on the line, get image data (brushSize x brushSize) from edit layer
        // average pixel values that are within the brush circle.
        // update the image data with the averaged pixel values in the
        // brush circle, then put the image data back on the edit layer
        // at the point on the line

        const context = this.editLayer.getContext("2d");
        if (context) {
            for (let i = 0; i < length; i++) {
                const x = x1 + i * unitVector.x;
                const y = y1 + i * unitVector.y;

                const imageData = context.getImageData(
                    x - brushSize / 2,
                    y - brushSize / 2,
                    brushSize,
                    brushSize
                );

                let totalRed = 0;
                let totalGreen = 0;
                let totalBlue = 0;
                let count = 0.0;

                // average pixel values
                for (let y = 0; y < imageData.height; y++) {
                    for (let x = 0; x < imageData.width; x++) {
                        const index = (y * imageData.width + x) * 4;
                        const distance = Math.sqrt(
                            (x - brushSize / 2) * (x - brushSize / 2) +
                                (y - brushSize / 2) * (y - brushSize / 2)
                        );
                        if (distance <= brushSize / 2) {
                            // get the pixel value from the image data
                            const r = imageData.data[index];
                            const g = imageData.data[index + 1];
                            const b = imageData.data[index + 2];

                            totalRed += r;
                            totalGreen += g;
                            totalBlue += b;
                            count++;
                        }
                    }
                }

                // update the image data with the averaged pixel values
                // these need to be weighted by the brush opacity
                const averageRed = totalRed / count;
                const averageGreen = totalGreen / count;
                const averageBlue = totalBlue / count;
                for (let y = 0; y < imageData.height; y++) {
                    for (let x = 0; x < imageData.width; x++) {
                        const index = (y * imageData.width + x) * 4;
                        const distance = Math.sqrt(
                            (x - brushSize / 2) * (x - brushSize / 2) +
                                (y - brushSize / 2) * (y - brushSize / 2)
                        );
                        if (distance <= brushSize / 2) {
                            imageData.data[index] =
                                averageRed * brushOpacity +
                                imageData.data[index] * (1 - brushOpacity);
                            imageData.data[index + 1] =
                                averageGreen * brushOpacity +
                                imageData.data[index + 1] * (1 - brushOpacity);
                            imageData.data[index + 2] =
                                averageBlue * brushOpacity +
                                imageData.data[index + 2] * (1 - brushOpacity);
                        }
                    }
                }

                // put the image data back on the edit layer
                context.putImageData(
                    imageData,
                    x - brushSize / 2,
                    y - brushSize / 2
                );
            }
        }
        this.render();
    }

    getPixel(x: number, y: number): string {
        const context = this.baseImageLayer.getContext("2d");
        // get pixel as hex string
        if (context) {
            const pixel = context.getImageData(x, y, 1, 1).data;
            return (
                "#" +
                ("000000" + rgbToHex(pixel[0], pixel[1], pixel[2])).slice(-6)
            );
        }
        return "#000000";
    }

    copyEditImageFromBaseImage(): void {
        // copy the base image to the edit layer
        const context = this.editLayer.getContext("2d");
        if (context) {
            context.drawImage(this.baseImageLayer, 0, 0);
        }
        this.render();
        this.hasSelection = true;
        this.notifySnapshotListener();
    }
}

function rgbToHex(r: number, g: number, b: number) {
    if (r > 255 || g > 255 || b > 255) throw "Invalid color component";
    return ((r << 16) | (g << 8) | b).toString(16);
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
    return new Renderer(canvas);
}
