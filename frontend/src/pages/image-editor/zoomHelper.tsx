import { Renderer } from "./renderer";

export class ZoomHelper {

    private startTouches: React.TouchList | null;
    private startZoom = 1;
    private startOffsetX = 0;
    private startOffsetY = 0;

    constructor(private renderer: Renderer) {
        this.startTouches = null;
    }

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
        movementX = (movementX / rect.width) * this.renderer.getCanvas().width;
        movementY = (movementY / rect.height) * this.renderer.getCanvas().height;

        let zoom = this.renderer.getZoom();
        let offsetX = this.renderer.getOffsetX();
        let offsetY = this.renderer.getOffsetY();

        offsetX += movementX / zoom;
        offsetY += movementY / zoom;

        this.renderer.updateZoomAndOffset(zoom, offsetX, offsetY);
    }

    onTouchStart(event: React.TouchEvent<HTMLCanvasElement>) {
        if (event.touches.length === 2) {
            this.startTouches = event.touches;
            this.startZoom = this.renderer.getZoom();
            this.startOffsetX = this.renderer.getOffsetX();
            this.startOffsetY = this.renderer.getOffsetY();
        }
    }

    onTouchMove(event: React.TouchEvent<HTMLCanvasElement>) {
        if (this.startTouches) {
            const canvasRect = this.renderer.getCanvas().getBoundingClientRect();
            const startTouch1 = this.startTouches[0];
            const startTouch2 = this.startTouches[1];
            const touch1 = event.touches[0];
            const touch2 = event.touches[1];

            const startDistance = Math.sqrt(
                Math.pow(startTouch1.clientX - startTouch2.clientX, 2) +
                Math.pow(startTouch1.clientY - startTouch2.clientY, 2)
            );
            const distance = Math.sqrt(
                Math.pow(touch1.clientX - touch2.clientX, 2) +
                Math.pow(touch1.clientY - touch2.clientY, 2)
            );
            const zoom = this.startZoom * (distance / startDistance);

            const startCenterX = (startTouch1.clientX + startTouch2.clientX) / 2;
            const startCenterY = (startTouch1.clientY + startTouch2.clientY) / 2;
            const centerX = (touch1.clientX + touch2.clientX) / 2;
            const centerY = (touch1.clientY + touch2.clientY) / 2;

            const startCanvasPoint = this.translateMouseToCanvasCoordinates(
                startCenterX - canvasRect.left,
                startCenterY - canvasRect.top
            );
            const canvasPoint = this.translateMouseToCanvasCoordinates(
                centerX - canvasRect.left,
                centerY - canvasRect.top
            );

            let offsetX = this.startOffsetX;
            let offsetY = this.startOffsetY;

            let xDiff = canvasPoint.x - startCanvasPoint.x;
            let yDiff = canvasPoint.y - startCanvasPoint.y;

            let xDiff2 = canvasPoint.x - -this.renderer.getOffsetX();
            let yDiff2 = canvasPoint.y - -this.renderer.getOffsetY();

            offsetX -= xDiff2 * (zoom / this.startZoom) - xDiff2 - (xDiff * (distance / startDistance));
            offsetY -= yDiff2 * (zoom / this.startZoom) - yDiff2 - (yDiff * (distance / startDistance));

            this.renderer.updateZoomAndOffset(zoom, offsetX, offsetY);
        }
    }

    onTouchEnd(event: React.TouchEvent<HTMLCanvasElement>) {
        this.startTouches = null;
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

        // x = (x / rect.width) * this.renderer.getWidth();
        // y = (y / rect.height) * this.renderer.getHeight();

        x = (x / rect.width) * this.renderer.getCanvas().width;
        y = (y / rect.height) * this.renderer.getCanvas().height;

        x = Math.round(x - offsetX);
        y = Math.round(y - offsetY);

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
        x = Math.round((x / this.renderer.getWidth()) * rect.width);
        y = Math.round((y / this.renderer.getHeight()) * rect.height);

        return { x: x, y: y };
    }
}