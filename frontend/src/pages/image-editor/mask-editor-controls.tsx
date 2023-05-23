import { FC, useEffect, useState } from "react";
import { PaletteButton } from "./PaletteButton";
import { PencilTool } from "./pencil-tool";
import { Renderer } from "./renderer";

interface MaskEditorProps {
    // renderer: Renderer;
    tool: PencilTool;
    onConfirm: () => void;
    onRevert: () => void;
}

const colors = ["#FFFFFF", "#000000"];

export const MaskEditor: FC<MaskEditorProps> = ({
    // renderer,
    tool,
    onConfirm,
    onRevert,
}) => {
    const [brushSize, setBrushSize] = useState(10);
    const [brushColor, setBrushColor] = useState(colors[0]);

    useEffect(() => {
        tool.updateArgs({
            brushSize,
            brushColor,
        });
    }, [brushSize, brushColor]);

    return (
        <div style={{ marginTop: "16px" }}>
            <div className="form-group">
                <label style={{ width: "100%" }}>
                    Brush size
                    <small
                        className="form-text text-muted"
                        style={{ float: "right" }}
                    >
                        {brushSize}px
                    </small>
                </label>
                <input
                    type="range"
                    className="form-control-range"
                    min="1"
                    max="100"
                    value={brushSize}
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                />
            </div>
            <div
                style={{
                    display: "flex",
                    flexDirection: "row",
                    flexWrap: "wrap",
                }}
            >
                {colors.map((color, i) => (
                    <PaletteButton
                        key={i}
                        selectedColor={brushColor}
                        color={color}
                        onClick={(color) => setBrushColor(color)}
                    />
                ))}
            </div>
            <div className="form-group" style={{ marginTop: "16px" }}>
                <i className="fa fa-info-circle"></i>&nbsp;Masking: areas that
                are painted white will be changed, areas that are painted black
                will be left unchanged.
            </div>
            <div className="form-group" style={{ marginTop: "16px" }}>
                <button
                    className="btn btn-secondary"
                    onClick={() => tool.renderer.invertMask()}
                >
                    Invert
                </button>
                <button
                    className="btn btn-secondary"
                    onClick={onRevert}
                    style={{ marginLeft: "8px" }}
                >
                    Cancel
                </button>
                <button
                    className="btn btn-primary"
                    onClick={onConfirm}
                    style={{ marginLeft: "8px" }}
                >
                    Save
                </button>
            </div>
        </div>
    );
};
