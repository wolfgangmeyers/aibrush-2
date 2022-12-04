import React, { FC, useEffect, useState } from "react";
import moment from "moment";
import { Image, ImageStatusEnum } from "../client/api";

interface Props {
    pendingCount: number;
    processingCount: number;
    onClick?: () => void;
}

export const PendingImagesThumbnail: FC<Props> = ({
    pendingCount,
    processingCount,
    onClick,
}) => {
    const [hover, setHover] = useState(false);

    // on mouse in/out, set hover state
    const onMouseEnter = () => setHover(true);
    const onMouseLeave = () => setHover(false);
    let icon = (
        <i style={{ marginTop: "20px" }} className="fa fa-hourglass-half"></i>
    );

    if (processingCount > 0) {
        icon = (
            <i style={{ marginTop: "20px" }} className="fa fa-cog fa-spin"></i>
        );
    }

    return (
        <div
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            style={{
                backgroundImage: `url(/images/default.png)`,
                backgroundSize: "contain",
                width: "128px",
                height: "128px",
                margin: "8px",
                float: "left",
                cursor: "pointer",
            }}
            onClick={onClick}
        >
            {hover && (
                <div
                    style={{
                        background: "rgba(255, 255, 255, 0.5)",
                        color: "black",
                        width: "100%",
                        height: "100%",
                        lineHeight: "1",
                        fontSize: "20px",
                    }}
                >
                    <br/>
                    {pendingCount > 0 && (
                        <div style={{ marginBottom: "24px" }}>
                            {pendingCount} pending
                        </div>
                    )}
                    {processingCount > 0 && (
                        <div>{processingCount} processing</div>
                    )}
                </div>
            )}
            {!hover && (
                <div
                    style={{
                        background: "rgba(255, 255, 255, 0.3)",
                        color: "#555",
                        width: "100%",
                        height: "100%",
                        fontSize: "80px",
                    }}
                >
                    {icon}
                </div>
            )}
        </div>
    );
};
