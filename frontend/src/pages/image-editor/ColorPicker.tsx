import React, { FC, useState, useEffect } from "react";
import { ChromePicker } from "react-color";

import "./ColorPicker.css"

interface Props {
    color: string;
    onColorSelected: (color: string) => void;
}

export const ColorPicker: FC<Props> = ({ color, onColorSelected }) => {
    const [displayColorPicker, setDisplayColorPicker] = useState(false);
    const [tmpColor, setTmpColor] = useState(color);

    const handleClick = () => {
        setDisplayColorPicker(!displayColorPicker);
        if (displayColorPicker) {
            onColorSelected(tmpColor);
        }
    };

    const handleClose = () => {
        setDisplayColorPicker(false);
        if (displayColorPicker) {
            onColorSelected(tmpColor);
        }
    };

    const popover: React.CSSProperties = {
        position: "absolute",
        zIndex: 2,
    };
    const cover: React.CSSProperties = {
        position: "fixed",
        top: "0px",
        right: "0px",
        bottom: "0px",
        left: "0px",
    };

    return (
        <>
            <button className="color-picker" onClick={handleClick}>
                <i className="fas fa-plus" />
            </button>
            {displayColorPicker ? (
                <div style={popover}>
                    <div style={cover} onClick={handleClose} />
                    <ChromePicker
                        color={tmpColor}
                        onChange={(color) => setTmpColor(color.hex)}
                        onChangeComplete={(color) => setTmpColor(color.hex)}
                    />
                </div>
            ) : null}
        </>
    );
};
