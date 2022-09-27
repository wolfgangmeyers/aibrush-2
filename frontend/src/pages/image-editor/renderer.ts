
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface Cursor {
    x: number;
    y: number;
    radius: number;
}

class renderer {

    // private backgroundLayer: HTMLCanvasElement;
    private baseImageLayer: HTMLCanvasElement;
    private selectionLayer: HTMLCanvasElement;
    private overlayLayer: HTMLCanvasElement;

    private selectionOverlay: Rect | undefined;
    private selectionOverlayPreview: Rect | undefined;
    private hasSelection: boolean = false;
    private cursor: Cursor | undefined;

    private zoom: number;
    private offsetX: number;
    private offsetY: number;

    constructor(private readonly canvas: HTMLCanvasElement) {
        // invisible canvas elements
        // this.backgroundLayer = document.createElement('canvas');
        this.baseImageLayer = document.createElement('canvas');
        this.selectionLayer = document.createElement('canvas');
        this.overlayLayer = document.createElement('canvas');

        this.zoom = 1;
        this.offsetX = 0;
        this.offsetY = 0;
    }
    
    render() {
        const context = this.canvas.getContext('2d');
        if (context) {
            context.clearRect(0, 0, this.canvas.width, this.canvas.height);
            // apply zoom and offset
            context.setTransform(this.zoom, 0, 0, this.zoom, this.offsetX * this.zoom, this.offsetY * this.zoom);
            // context.drawImage(this.backgroundLayer, 0, 0);
            context.drawImage(this.baseImageLayer, 0, 0);
            context.drawImage(this.selectionLayer, 0, 0);
            if (!this.hasSelection) {
                context.drawImage(this.overlayLayer, 0, 0);
            }
        }
    }

    setBaseImage(image: HTMLImageElement) {
        const context = this.baseImageLayer.getContext('2d');
        if (context) {
            // set size of all layers
            // this.backgroundLayer.width = image.width;
            // this.backgroundLayer.height = image.height;
            this.baseImageLayer.width = image.width;
            this.baseImageLayer.height = image.height;
            this.selectionLayer.width = image.width;
            this.selectionLayer.height = image.height;
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
        }
    }

    setSelection(imageData: ImageData | null) {
        this.hasSelection = !!imageData;
        const context = this.selectionLayer.getContext('2d');
        if (context && this.selectionOverlay) {
            context.clearRect(0, 0, this.selectionLayer.width, this.selectionLayer.height);
            if (imageData) {
                context.putImageData(imageData, this.selectionOverlay.x, this.selectionOverlay.y);
            }
            this.render();
        }
    }

    private drawOverlay() {
        const context = this.overlayLayer.getContext('2d');
        if (context) {
            context.clearRect(0, 0, this.overlayLayer.width, this.overlayLayer.height);
            // draw a 1px gray line around the layer
            context.strokeStyle = 'gray';
            context.lineWidth = 1;
            context.strokeRect(0, 0, this.overlayLayer.width, this.overlayLayer.height);
            
            if (this.selectionOverlay) {
                context.strokeStyle = 'white';
                context.lineWidth = 2;
                context.strokeRect(
                    this.selectionOverlay.x,
                    this.selectionOverlay.y,
                    this.selectionOverlay.width,
                    this.selectionOverlay.height,
                );
            }
            if (this.selectionOverlayPreview) {
                context.strokeStyle = 'cyan';
                context.lineWidth = 2;
                context.strokeRect(
                    this.selectionOverlayPreview.x,
                    this.selectionOverlayPreview.y,
                    this.selectionOverlayPreview.width,
                    this.selectionOverlayPreview.height,
                );
            }
            if (this.cursor) {
                context.strokeStyle = 'white';
                context.lineWidth = 1;
                context.beginPath();
                context.arc(this.cursor.x, this.cursor.y, this.cursor.radius, 0, 2 * Math.PI);
                context.stroke();
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
        if (!selection) {
            selection = {
                x: 0,
                y: 0,
                width: this.canvas.width,
                height: this.canvas.height,
            }
        }
        // get image data of the selection
        let context = this.baseImageLayer.getContext('2d');
        if (context) {
            const imageData = context.getImageData(
                selection.x,
                selection.y,
                selection.width,
                selection.height,
            );
            // create a canvas and draw the image data on it
            const canvas = document.createElement('canvas');
            canvas.width = imageData.width;
            canvas.height = imageData.height;
            context = canvas.getContext('2d');
            if (context) {
                context.putImageData(imageData, 0, 0);
                // return the data url of the canvas
                const result = canvas.toDataURL("image/jpeg");
                // cleanup the canvas
                canvas.remove();
                // extract base64 data from data url
                return result.split(',')[1];
            }
        }
    }

    commitSelection() {
        // draw the selection overlay on the base image layer
        if (this.selectionOverlay) {
            const context = this.baseImageLayer.getContext('2d');
            if (context) {
                context.drawImage(this.selectionLayer, 0, 0);
                this.setSelection(null);
            }
        }
    }
}

export interface Renderer {
    render(): void;
    setBaseImage(image: HTMLImageElement): void;
    setSelection(imageData: ImageData | null): void;
    setSelectionOverlay(selectionOverlay: Rect | undefined): void;
    setSelectionOverlayPreview(selectionOverlayPreview: Rect | undefined): void;
    setCursor(cursor: Cursor | undefined): void;
    getSelectionOverlay(): Rect | undefined;
    getZoom(): number;
    getOffsetX(): number;
    getOffsetY(): number;
    updateZoomAndOffset(zoom: number, offsetX: number, offsetY: number): void;
    getWidth(): number;
    getHeight(): number;
    getEncodedImage(selection: Rect | null): string | undefined;
    commitSelection(): void;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
    return new renderer(canvas);
}