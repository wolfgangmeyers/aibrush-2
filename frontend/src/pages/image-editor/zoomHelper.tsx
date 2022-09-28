import { Renderer } from "./renderer";

export class ZoomHelper {

    constructor(private renderer: Renderer) {}

    onWheel(event: WheelEvent) {
        const originalZoom = this.renderer.getZoom();
        let zoom = this.renderer.getZoom();
        let offsetX = this.renderer.getOffsetX();
        let offsetY = this.renderer.getOffsetY();

        let canvasPoint = this.translateMouseToCanvasCoordinates(
            event.offsetX,
            event.offsetY
        );
        // console.log("x: " + x + ", y: " + y);
        
        if (event.deltaY < 0) {
            zoom += 0.1 * zoom;
        } else {
            zoom -= 0.1 * zoom;
        }
        zoom = Math.max(0.1, Math.min(zoom, 8.0));

        let xDiff = canvasPoint.x - -offsetX;
        let yDiff = canvasPoint.y - -offsetY;

        // offsetX = canvasPoint.x - xDiff * (zoom / originalZoom);
        // offsetY = canvasPoint.y - yDiff * (zoom / originalZoom);
        offsetX -= xDiff * (zoom / originalZoom) - xDiff;
        offsetY -= yDiff * (zoom / originalZoom) - yDiff;

        this.renderer.updateZoomAndOffset(zoom, offsetX, offsetY);
    }

    onPan(event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
        let movementX = event.movementX;
        let movementY = event.movementY;
        // translate offset to canvas coordinates
        let rect = (
            event.target as HTMLCanvasElement
        ).getBoundingClientRect();
        movementX = (movementX / rect.width) * this.renderer.getWidth();
        movementY = (movementY / rect.height) * this.renderer.getHeight();

        let zoom = this.renderer.getZoom();
        let offsetX = this.renderer.getOffsetX();
        let offsetY = this.renderer.getOffsetY();

        offsetX += movementX / zoom;
        offsetY += movementY / zoom;

        this.renderer.updateZoomAndOffset(zoom, offsetX, offsetY);
    }

    translateMouseToCanvasCoordinates(mouseX: number, mouseY: number, zoom?: number, offsetX?: number, offsetY?: number) {
        let x = mouseX;
        let y = mouseY;
        // adjust for zoom
        zoom = zoom || this.renderer.getZoom();
        offsetX = offsetX || this.renderer.getOffsetX();
        offsetY = offsetY || this.renderer.getOffsetY();
        x = x / zoom;
        y = y / zoom;

        // translate offset to canvas coordinates
        let rect = this.renderer.getCanvas().getBoundingClientRect();

        x = (x / rect.width) * this.renderer.getWidth();
        y = (y / rect.height) * this.renderer.getHeight();

        x = x - offsetX;
        y = y - offsetY;

        return { x: x, y: y };
    }

    translateCanvasToMouseCoordinates(x: number, y: number, zoom?: number, offsetX?: number, offsetY?: number) {
        zoom = zoom || this.renderer.getZoom();
        offsetX = offsetX || this.renderer.getOffsetX();
        offsetY = offsetY || this.renderer.getOffsetY();
        x = x + offsetX;
        y = y + offsetY;
        x = x * zoom;
        y = y * zoom;

        // translate offset to canvas coordinates
        let rect = this.renderer.getCanvas().getBoundingClientRect();
        x = (x / this.renderer.getWidth()) * rect.width;
        y = (y / this.renderer.getHeight()) * rect.height;

        return { x: x, y: y };
    }
}