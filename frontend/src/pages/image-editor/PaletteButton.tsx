import React, { FC, useState, useEffect } from "react";
import { ChromePicker } from "react-color";

interface Props {
    selectedColor: string;
    color: string;
    onClick: (color: string) => void;
    onColorSelected?: (color: string) => void;
}

export const PaletteButton: FC<Props> = ({
    selectedColor,
    color,
    onClick,
    onColorSelected,
}) => {
    const [displayColorPicker, setDisplayColorPicker] = useState(false);
    const [tmpColor, setTmpColor] = useState(color);

    useEffect(() => {
        setTmpColor(color);
    }, [color]);

    const popover: React.CSSProperties = {
        position: "absolute",
        zIndex: 2,
    };

    let className = "palette-button";
    if (selectedColor === color) {
        className += " selected";
    } else if (color == "#000000") {
        className += " black";
    }
    return (
        <>
            <div
                className={className}
                style={{ backgroundColor: color }}
                onClick={() => onClick(color)}
                onDoubleClick={() => setDisplayColorPicker(!displayColorPicker)}
            ></div>
            {onColorSelected && displayColorPicker ? (
                <div style={popover}>
                    {/* <div style={cover} onClick={handleClose} /> */}
                    <ChromePicker
                        color={tmpColor}
                        onChange={(color) => setTmpColor(color.hex)}
                        onChangeComplete={(color) => setTmpColor(color.hex)}
                    />
                    <button
                        className="btn btn-primary"
                        style={{ marginRight: "8px", marginLeft: "16px" }}
                        onClick={() => {
                            onColorSelected(tmpColor);
                            setDisplayColorPicker(false);
                        }}
                    >
                        <i className="fas fa-check" />
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={() => setDisplayColorPicker(false)}
                    >
                        <i className="fas fa-times" />
                    </button>
                </div>
            ) : null}
        </>
    );
};
