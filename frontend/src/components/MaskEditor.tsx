// react bootstrap large modal with a canvas for image editing.
// Brush size, brush size preview, color selector, color picker
// Save and cancel buttons

import React, { FC, useState, useEffect, useRef } from 'react';
import { Modal } from "react-bootstrap";

interface MaskEditorProps {
    encodedImage: string; // image is required in order to draw a mask
    onSave: (image: string) => void;
    onCancel: () => void;
}

export const MaskEditor: FC<MaskEditorProps> = ({ encodedImage, onSave, onCancel }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [offscreenCanvas, setOffscreenCanvas] = useState<HTMLCanvasElement | null>(null);
    const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);
    const [brushSize, setBrushSize] = useState(10);
    const [brushColor, setBrushColor] = useState('#000000');
    const [isDrawing, setIsDrawing] = useState(false);
    const [lastX, setLastX] = useState(0);
    const [lastY, setLastY] = useState(0);

    useEffect(() => {
        const img = new Image();
        img.src = encodedImage;
        img.onload = () => {
            setImage(img)
        }
    }, [encodedImage])

    useEffect(() => {
        if (canvasRef.current && image) {
            const offscreenCanvas = document.createElement('canvas');
            // hide it
            offscreenCanvas.style.display = 'none';
            offscreenCanvas.width = image.width;
            offscreenCanvas.height = image.height;
            const ctx = offscreenCanvas.getContext('2d');
            if (ctx) {
                setOffscreenCanvas(offscreenCanvas);
                setCtx(ctx);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
                render(offscreenCanvas, image, lastX, lastY, brushColor, brushSize);
            }
            setCtx(ctx);
        }
    }, [canvasRef.current, image]);

    const render = (canvas: HTMLCanvasElement, image: HTMLImageElement | null, lastX: number, lastY: number, brushColor: string, brushSize: number) => {
        if (canvasRef.current && image && canvas) {
            const renderCtx = canvasRef.current.getContext('2d');
            if (renderCtx) {
                renderCtx.drawImage(image, 0, 0);
                renderCtx.globalAlpha = 0.5;
                renderCtx.drawImage(canvas, 0, 0);
                // draw the brush
                renderCtx.globalAlpha = 1;
                drawDot(renderCtx, lastX, lastY, brushColor, brushSize);
            }
        }
    }

    const getMousePos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) {
            throw Error("No canvas")
        }
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        if (e.nativeEvent instanceof MouseEvent) {
            const evt = e as React.MouseEvent<HTMLCanvasElement>;
            return {
                x: (evt.clientX - rect.left) * scaleX,
                y: (evt.clientY - rect.top) * scaleY
            }
        } else if (e.nativeEvent instanceof TouchEvent) {
            const evt = e as React.TouchEvent<HTMLCanvasElement>;
            return {
                x: (evt.touches[0].clientX - rect.left) * scaleX,
                y: (evt.touches[0].clientY - rect.top) * scaleY
            }
        }
        console.log(e)
        throw new Error("event is not MouseEvent or TouchEvent")
    }

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas || !offscreenCanvas) {
            return;
        }
        setIsDrawing(true);
        const mousePos = getMousePos(e);
        setLastX(mousePos.x);
        setLastY(mousePos.y);
        // draw a single dot in case the user clicks without moving the mouse
        drawDot(ctx, mousePos.x, mousePos.y, brushColor, brushSize);
        render(offscreenCanvas, image, mousePos.x, mousePos.y, brushColor, brushSize);
    };

    const drawDot = (ctx: CanvasRenderingContext2D | null, x: number, y: number, brushColor: string, brushSize: number) => {
        if (!ctx) {
            return;
        }
        ctx.fillStyle = brushColor;
        ctx.beginPath();
        ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
    }

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!ctx || !canvas || !offscreenCanvas) {
            return;
        }

        // get x and y relative to the canvas
        const mousePos = getMousePos(e);
        const x = mousePos.x;
        const y = mousePos.y;

        if (isDrawing) {
            e.preventDefault()
            e.stopPropagation()
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(x, y);
            ctx.strokeStyle = brushColor;
            ctx.lineWidth = brushSize;
            // line caps
            ctx.lineCap = 'round';
            ctx.stroke();

            setLastX(x);
            setLastY(y);
        }
        render(offscreenCanvas, image, x, y, brushColor, brushSize);
    };

    const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        setIsDrawing(false);
    };

    const handleBrushSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setBrushSize(parseFloat(e.target.value));
        if (offscreenCanvas) {
            render(offscreenCanvas, image, lastX, lastY, brushColor, brushSize);
        }
    };

    const handleBrushColorChange = (newColor: string) => {
        setBrushColor(newColor);
        if (offscreenCanvas) {
            render(offscreenCanvas, image, lastX, lastY, brushColor, brushSize);
        }
    };

    const handleSave = () => {
        if (offscreenCanvas) {
            const data = offscreenCanvas.toDataURL('image/jpg');
            onSave(data);
        }
    };

    const handleCancel = () => {
        onCancel();
    };

    return (
        <Modal show={true} onHide={handleCancel} size="lg">
            <Modal.Header closeButton>
                <Modal.Title>Mask Editor</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <p>
                    Areas in black will be repainted, areas in white will be preserved.
                </p>
                {image && <canvas
                    style={{ maxWidth: "100%", maxHeight: "1024px", display: "block", marginLeft: "auto", marginRight: "auto"  }}
                    id="maskEditorCanvas"
                    width={image.width}
                    height={image.height}
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onTouchStart={handleMouseDown}
                    onTouchMove={handleMouseMove}
                    onTouchEnd={handleMouseUp}
                ></canvas>}
                <div className="row">
                    <div className="col-md-6">
                        <div className="form-group">
                            <label htmlFor="brushSize">Brush Size</label>
                            <input type="range" className="form-control" id="brushSize" min="1" max="100" value={brushSize} onChange={handleBrushSizeChange} />
                        </div>

                    </div>
                    <div className="col-md-6">
                        <div className="form-group">
                            <label htmlFor="brushColor">Brush Color</label>
                            {/* Show two toggle buttons for white and black */}
                            <div className="btn-group" role="group" aria-label="Brush Color" style={{marginLeft: "20px"}}>
                                <button type="button" className="btn btn-secondary" style={{ backgroundColor: "white", padding: "30px" }} onClick={() => handleBrushColorChange("white")}></button>
                                <button type="button" className="btn btn-secondary" style={{ backgroundColor: "black", padding: "30px" }} onClick={() => handleBrushColorChange("black")}></button>
                            </div>
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