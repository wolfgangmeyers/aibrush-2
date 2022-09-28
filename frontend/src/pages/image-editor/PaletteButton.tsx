import React, { FC, useState, useEffect } from "react";

interface Props {
    selectedColor: string;
    color: string;
    onClick: (color: string) => void;
}

export const PaletteButton: FC<Props> = ({ selectedColor, color, onClick }) => {
    let className = "palette-button";
    if (selectedColor === color) {
        className += " selected";
    } else if (color == "#000000") {
        className += " black";
    }
    return (
        <div
            className={className}
            style={{ backgroundColor: color }}
            onClick={() => onClick(color)}
        ></div>
    );
};
