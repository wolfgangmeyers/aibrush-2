// react bootstrap large modal with a canvas for image editing.
// Brush size, brush size preview, color selector, color picker
// Save and cancel buttons

import React, { FC, useState, useEffect, useRef } from 'react';
import { Modal } from "react-bootstrap";

interface UncropperProps {
    encodedImage: string; // image is required in order to draw a mask
    onSave: (image: string, mask: string, width: number, height: number, offsetX: number, offsetY: number) => void;
    onCancel: () => void;
}

export const Uncropper: FC<UncropperProps> = ({ encodedImage, onSave, onCancel }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [imageCanvas, setImageCanvas] = useState<HTMLCanvasElement | null>(null);
    const [maskCanvas, setMaskCanvas] = useState<HTMLCanvasElement | null>(null);

    const [width, setWidth] = useState(256);
    const [height, setHeight] = useState(256);
    const [offsetX, setOffsetX] = useState(0);
    const [offsetY, setOffsetY] = useState(0);

    const createOffscreenCanvas = (width: number, height: number) => {
        const offscreenCanvas = document.createElement('canvas');
        // hide it
        offscreenCanvas.style.display = 'none';
        offscreenCanvas.width = width;
        offscreenCanvas.height = height;
        return offscreenCanvas;
    }

    const renderMask = (canvas: HTMLCanvasElement, image: HTMLImageElement, width: number, height: number, offsetX: number, offsetY: number) => {
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            // if (offsetX > 0) {
            //     ctx.fillStyle = '#000000';
            //     ctx.fillRect(0, 0, offsetX, height);
            // }
            // if (offsetX + image.width < width) {
            //     ctx.fillStyle = '#000000';
            //     ctx.fillRect(offsetX + image.width, 0, width - (offsetX + image.width), height);
            // }
            // if (offsetY > 0) {
            //     ctx.fillStyle = '#000000';
            //     ctx.fillRect(0, 0, width, offsetY);
            // }
            // if (offsetY + image.height < height) {
            //     ctx.fillStyle = '#000000';
            //     ctx.fillRect(0, offsetY + image.height, width, height - (offsetY + image.height));
            // }
        }
    }

    const renderImage = (canvas: HTMLCanvasElement, image: HTMLImageElement, width: number, height: number, offsetX: number, offsetY: number) => {
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(image, offsetX, offsetY);
        }
    }

    const onWidthChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newWidth = parseInt(e.target.value);
        setWidth(newWidth);
        if (canvasRef.current) {
            canvasRef.current.width = newWidth;
        }
        if (maskCanvas && imageCanvas) {
            maskCanvas.width = newWidth;
            imageCanvas.width = newWidth;
            render(maskCanvas, imageCanvas, newWidth, height, offsetX, offsetY);
        }
    }

    const onHeightChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newHeight = parseInt(e.target.value);
        setHeight(newHeight);
        if (canvasRef.current) {
            canvasRef.current.height = newHeight;
        }
        if (maskCanvas && imageCanvas) {
            maskCanvas.height = newHeight;
            imageCanvas.height = newHeight;
            render(maskCanvas, imageCanvas, width, newHeight, offsetX, offsetY);
        }
    }

    const onOffsetXChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newOffsetX = parseInt(e.target.value);
        setOffsetX(newOffsetX);
        if (maskCanvas && imageCanvas) {
            render(maskCanvas, imageCanvas, width, height, newOffsetX, offsetY);
        }
    }

    const onOffsetYChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newOffsetY = parseInt(e.target.value);
        setOffsetY(newOffsetY);
        if (maskCanvas && imageCanvas) {
            render(maskCanvas, imageCanvas, width, height, offsetX, newOffsetY);
        }
    }

    useEffect(() => {
        const img = new Image();
        img.src = encodedImage;
        img.onload = () => {
            setImage(img)
        }
    }, [encodedImage])

    useEffect(() => {
        if (canvasRef.current && image) {
            const maskCanvas = createOffscreenCanvas(image.width, image.height);
            setMaskCanvas(maskCanvas);
            const imageCanvas = createOffscreenCanvas(image.width, image.height);
            setImageCanvas(imageCanvas);
            
            render(maskCanvas, imageCanvas, width, height, offsetX, offsetY);
            setWidth(image.width);
            setHeight(image.height);
        }
    }, [canvasRef.current, image]);

    const render = (maskCanvas: HTMLCanvasElement, imageCanvas: HTMLCanvasElement, width: number, height: number, offsetX: number, offsetY: number) => {
        if (canvasRef.current && image && maskCanvas && imageCanvas) {
            renderMask(maskCanvas, image, width, height, offsetX, offsetY);
            renderImage(imageCanvas, image, width, height, offsetX, offsetY);
            const renderCtx = canvasRef.current.getContext('2d');
            if (renderCtx) {
                renderCtx.globalAlpha = 1;
                renderCtx.drawImage(imageCanvas, 0, 0);
                renderCtx.globalAlpha = 0.5;
                renderCtx.drawImage(maskCanvas, 0, 0);
                // draw the brush
                renderCtx.globalAlpha = 1;
            }
        }
    }


    const handleSave = () => {
        if (imageCanvas && maskCanvas) {
            const maskData = maskCanvas.toDataURL('image/jpg');
            const imageData = imageCanvas.toDataURL('image/jpg');
            onSave(imageData, maskData, width, height, offsetX, offsetY);
        }
    };

    const handleCancel = () => {
        onCancel();
    };

    return (
        <Modal show={true} onHide={handleCancel} size="lg">
            <Modal.Header closeButton>
                <Modal.Title>Uncrop Image</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <p>
                    <b>Note:</b> Uncropping may not work well with images larger than 256x256.
                </p>
                {image && <canvas
                    style={{ maxWidth: "100%", maxHeight: "1024px", display: "block", marginLeft: "auto", marginRight: "auto" }}
                    id="uncropperCanvas"
                    width={image.width}
                    height={image.height}
                    ref={canvasRef}
                ></canvas>}
                <div className="row">
                    <div className="col-md-6">
                        {/* width */}
                        <div className="form-group">
                            <label>Width</label>
                            <input type="number" className="form-control" value={width} onChange={onWidthChanged} min={128} max={1024} step={64} />
                        </div>
                        {/* height */}
                        <div className="form-group">
                            <label>Height</label>
                            <input type="number" className="form-control" value={height} onChange={onHeightChanged} min={128} max={1024} step={64} />
                        </div>
                        
                    </div>
                    <div className="col-md-6">
                        {/* offsetX */}
                        <div className="form-group">
                            <label>Offset X</label>
                            {/* number input */}
                            <input type="number"
                                step={64}
                                min={-1024}
                                max={1024}
                                className="form-control"
                                value={offsetX}
                                onChange={onOffsetXChanged}
                            />
                        </div>
                        {/* offsetY */}
                        <div className="form-group">
                            <label>Offset Y</label>
                            {/* number input */}
                            <input type="number"
                                step={64}
                                min={-1024}
                                max={1024}
                                className="form-control"
                                value={offsetY}
                                onChange={onOffsetYChanged}
                            />
                        </div>
                    </div>
                </div>
            </Modal.Body>
            <Modal.Footer>
                <button className="btn btn-primary" onClick={handleSave}>Save</button>
                <button className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
            </Modal.Footer>
        </Modal>
    );
}