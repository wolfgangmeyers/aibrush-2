// react bootstrap large modal with a canvas for image editing.
// Brush size, brush size preview, color selector, color picker
// Save and cancel buttons

import React, { FC, useState, useEffect } from 'react';
import { Modal } from "react-bootstrap";

interface ImageEditorProps {
    encodedImage: string | null;
    onSave: (image: string) => void;
    onCancel: () => void;
}

export const ImageEditor: FC<ImageEditorProps> = ({ encodedImage, onSave, onCancel }) => {
    const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
    const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);
    const [brushSize, setBrushSize] = useState(10);
    const [brushColor, setBrushColor] = useState('#000000');
    const [isDrawing, setIsDrawing] = useState(false);
    const [lastX, setLastX] = useState(0);
    const [lastY, setLastY] = useState(0);

    useEffect(() => {
        const c = document.getElementById('canvas') as HTMLCanvasElement;
        if (c) {
            setCanvas(c);
            setCtx(c.getContext('2d'));
        }
    }, [canvas]);

    useEffect(() => {
        if (ctx && canvas) {
            // if image is not null, draw it on the canvas
            if (encodedImage) {
                const img = new Image();
                img.src = encodedImage;
                img.onload = () => {
                    ctx.drawImage(img, 0, 0);
                }
            } else {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        }
    }, [ctx, canvas, encodedImage])

    const getMousePos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
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
        if (!canvas) {
            return;
        }
        setIsDrawing(true);
        const mousePos = getMousePos(e);
        setLastX(mousePos.x);
        setLastY(mousePos.y);
        // draw a single dot in case the user clicks without moving the mouse
        drawDot(mousePos.x, mousePos.y);
    };

    const drawDot = (x: number, y: number) => {
        if (!ctx) {
            return;
        }
        ctx.fillStyle = brushColor;
        ctx.beginPath();
        ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
    }

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !ctx || !canvas) {
            return;
        }

        e.preventDefault()
        // get x and y relative to the canvas
        const mousePos = getMousePos(e);
        const x = mousePos.x;
        const y = mousePos.y;

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
    };

    const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        setIsDrawing(false);
    };

    const handleBrushSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setBrushSize(parseFloat(e.target.value));
    };

    const handleBrushColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setBrushColor(e.target.value);
    };

    const handleSave = () => {
        if (canvas && ctx) {
            const data = canvas.toDataURL('image/png');
            onSave(data);
        }
    };

    const handleCancel = () => {
        onCancel();
    };

    return (
        <Modal show={true} onHide={handleCancel} size="lg">
            <Modal.Header closeButton>
                <Modal.Title>Image Editor</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <canvas
                    style={{ width: "100%" }}
                    id="canvas"
                    width="512"
                    height="512"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onTouchStart={handleMouseDown}
                    onTouchMove={handleMouseMove}
                    onTouchEnd={handleMouseUp}
                ></canvas>
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
                            <input type="color" className="form-control" id="brushColor" value={brushColor} onChange={handleBrushColorChange} />
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