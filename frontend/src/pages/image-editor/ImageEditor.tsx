// react bootstrap page with a canvas for image editing.
// Brush size and color selector
// Save and cancel buttons

import React, { FC, useState, useEffect } from 'react';

interface ImageEditorProps {
    // image: string;
    onSave: (image: string) => void;
    onCancel: () => void;
}

export const ImageEditor : FC<ImageEditorProps> = ({ onSave, onCancel }) => {
    const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
    const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);
    const [brushSize, setBrushSize] = useState(10);
    const [brushColor, setBrushColor] = useState('#000000');
    const [isDrawing, setIsDrawing] = useState(false);
    const [isPickingColor , setIsPickingColor] = useState(false);
    const [lastX, setLastX] = useState(0);
    const [lastY, setLastY] = useState(0);

    useEffect(() => {
        const c = document.getElementById('canvas') as HTMLCanvasElement;
        if (c) {
            setCanvas(c);
            setCtx(c.getContext('2d'));
        }
    }, [canvas]);

    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canvas) {
            return;
        }
        setIsDrawing(true);
        setLastX(e.clientX - canvas.offsetLeft);
        setLastY(e.clientY - canvas.offsetTop);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !ctx || !canvas) {
            return;
        }


        // get x and y relative to the canvas
        const x = e.clientX - canvas.offsetLeft;
        const y = e.clientY - canvas.offsetTop;

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

    const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
        setIsDrawing(false);
        if (!canvas || !ctx) {
            return;
        }
        if (isPickingColor) {
            const x = e.clientX - canvas.offsetLeft;
            const y = e.clientY - canvas.offsetTop;
            const pixel = ctx.getImageData(x, y, 1, 1).data;
            // hex encode color with zero padding
            const hex = `#${pixel[0].toString(16).padStart(2, '0')}${pixel[1].toString(16).padStart(2, '0')}${pixel[2].toString(16).padStart(2, '0')}`;
            setBrushColor(hex);
            setIsPickingColor(false);
        }
    };

    const handleBrushSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setBrushSize(parseInt(e.target.value));
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
        <div className="image-editor">
            <div className="image-editor__canvas-container">
                <canvas
                    id="canvas"
                    className="image-editor__canvas"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    style={{ border: '1px solid white', cursor: isPickingColor ? 'crosshair' : 'default' }}
                    width={512}
                    height={512}
                />
            </div>
            <div className="image-editor__controls" style={{height: "50px"}}>
                <div className="image-editor__controls-row">
                    <label htmlFor="brush-size">Brush size:</label>
                    <input
                        id="brush-size"
                        type="range"
                        min="1"
                        max="50"
                        value={brushSize}
                        onChange={handleBrushSizeChange}
                    />
                    {/* show preview of brush */}
                    <div className="image-editor__brush-preview" style={{ borderRadius: `${brushSize}px`, width: brushSize, height: brushSize, backgroundColor: brushColor, display: "inline-block" }} />
                </div>
                <div className="image-editor__controls-row">
                    <label htmlFor="brush-color">Brush color:</label>
                    <input
                        id="brush-color"
                        type="color"
                        value={brushColor}
                        onChange={handleBrushColorChange}
                    />
                </div>
                {/* Pick color from page (dropper icon) */}
                <div className="image-editor__controls-row">
                    <button
                        className="image-editor__controls-button"
                        onClick={() => setIsPickingColor(true)}
                    >
                        <i className="fas fa-eye-dropper" />
                    </button>
                </div>
                <div className="image-editor__controls-row">
                    <button onClick={handleSave}>Save</button>
                    <button onClick={handleCancel}>Cancel</button>
                </div>
            </div>
        </div>
    );
}