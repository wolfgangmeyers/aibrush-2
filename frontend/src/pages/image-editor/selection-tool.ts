import { Cursor, Rect, Renderer } from "./renderer";
import { Tool } from "./tool";

export class SelectionTool implements Tool {
    private renderer: Renderer;
    private selectionOverlay: Rect | undefined;
    private selectionOverlayPreview: Rect | undefined;

    private selectionWidth: number = 512;
    private selectionHeight: number = 512;
    
    private panning = false;

    // getter for name
    get name(): string {
        return "select";
    }

    constructor(renderer: Renderer) {
        this.renderer = renderer;
    }

    // TODO: smaller/larger, aspect ratios?
    configure(args: any) {
        this.selectionWidth = args.selectionWidth || 512;
        this.selectionHeight = args.selectionHeight || 512;
        this.selectionOverlay = {
            x: 0,
            y: 0,
            width: this.selectionWidth,
            height: this.selectionHeight,
        }
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

            let movementX = event.movementX;
            let movementY = event.movementY;
            // translate offset to canvas coordinates
            let rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
            movementX = (movementX / rect.width) * imageWidth;
            movementY = (movementY / rect.height) * imageHeight;

            let zoom = this.renderer.getZoom();
            let offsetX = this.renderer.getOffsetX();
            let offsetY = this.renderer.getOffsetY();

            offsetX += movementX / zoom;
            offsetY += movementY / zoom;

            this.renderer.updateZoomAndOffset(zoom, offsetX, offsetY);
        } else {
            let x = event.nativeEvent.offsetX;
            let y = event.nativeEvent.offsetY;

            // adjust for zoom
            let zoom = this.renderer.getZoom();
            let offsetX = this.renderer.getOffsetX();
            let offsetY = this.renderer.getOffsetY();
            // x = x - offsetX;
            // y = y - offsetY;
            x = x / zoom;
            y = y / zoom;

            // translate offset to canvas coordinates
            let rect = event.currentTarget.getBoundingClientRect();
            
            x = (x / rect.width) * imageWidth;
            y = (y / rect.height) * imageHeight;

            x = x - offsetX
            y = y - offsetY;

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
            }
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

    onKeyDown(event: KeyboardEvent) {
        // TODO
    }

    onKeyUp(event: KeyboardEvent) {
        // TODO
    }

    onWheel(event: WheelEvent) {
        const originalZoom = this.renderer.getZoom();
        let zoom = this.renderer.getZoom();
        let offsetX = this.renderer.getOffsetX();
        let offsetY = this.renderer.getOffsetY();

        let x = event.offsetX;
        let y = event.offsetY;
        // translate offset to canvas coordinates
        let rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
        x = (x / rect.width) * this.renderer.getWidth();
        y = (y / rect.width) * this.renderer.getHeight();

        if (event.deltaY < 0) {
            zoom += 0.1;
        }
        else {
            zoom -= 0.1;
        }
        zoom = Math.max(0.1, Math.min(zoom, 2.0));

        this.renderer.updateZoomAndOffset(zoom, offsetX, offsetY);
    }

    destroy() {
        // this.renderer.setSelectionOverlay(undefined);
        this.renderer.setSelectionOverlayPreview(undefined);
    }
}