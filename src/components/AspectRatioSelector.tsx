import React, { FC, useEffect, useRef, useState } from "react";

import { aspectRatios, DEFAULT_ASPECT_RATIO, getClosestAspectRatio } from "../lib/aspecRatios";

interface Props {
    aspectRatio: number;
    onChange: (aspectRatio: number) => void;
    disabled?: boolean;
}

export const AspectRatioSelector: FC<Props> = ({ aspectRatio, onChange, disabled }) => {
    const aspectRatioDetails = aspectRatios[aspectRatio];
    return (
        <div className="form-group">
            <div
                style={{
                    minHeight: "140px",
                    display: "flex",
                    alignItems: "center",
                }}
            >
                {/* aspect ratio slider, goes from 0 -> aspectRatios.length - 1 */}
                <div
                    style={{
                        width: aspectRatioDetails.width / 8,
                        height: aspectRatioDetails.height / 8,
                        // dotted line options: dotted, dashed, solid, double, groove, ridge, inset, outset, none, hidden
                        border: "1px dashed white",
                        margin: "auto",
                    }}
                ></div>
            </div>
            <label style={{width: "100%"}}>
                Aspect Ratio
                <small className="form-text text-muted" style={{float: "right"}}>
                    {aspectRatioDetails.displayName}
                </small>
            </label>
            <input
                type="range"
                disabled={disabled}
                className="form-control-range"
                min={0}
                max={aspectRatios.length - 1}
                value={aspectRatio}
                onChange={(e) => {
                    onChange(parseInt(e.target.value));
                }}
            />
        </div>
    );
};
