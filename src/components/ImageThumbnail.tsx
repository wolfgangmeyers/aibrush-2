import React, { FC, useEffect, useState } from "react";
import moment from "moment";
import { LocalImage } from "../lib/models";

interface Props {
    image: LocalImage;
    censorNSFW: boolean;
    bulkDelete?: boolean;
    onClick?: (image: LocalImage) => void;
}

export const ImageThumbnail: FC<Props> = ({ image, censorNSFW, bulkDelete, onClick }) => {
    const src = `https://aibrush2-filestore.s3.amazonaws.com/${image.id}.thumbnail.png?updated_at=${image.updated_at}`;

    let label = image.label || "";
    if (image.label === "") {
        label = image.params.prompt || "";
    }
    if (label.indexOf(",") !== -1) {
        label = label.substring(0, label.indexOf(","));
    }
    
    let className = "image-thumbnail";
    if (bulkDelete) {
        className += " bulk-delete";
    }

    let backgroundImage = `url(${src}), url(/images/default.png)`;
    if (image.imageData) {
        backgroundImage = `url(${image.imageData}), url(/images/default.png)`;
    }

    return (
        <div
            className={className}
            style={{
                backgroundImage,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
                filter: (image.nsfw && censorNSFW) ? "blur(8px)" : undefined,
            }}
            onClick={() => onClick && onClick(image)}
        >
            {!bulkDelete && <div className="image-thumbnail-label">
                {label}
            </div>}

            {bulkDelete && <div className="image-thumbnail-label">
                <input type="checkbox" style={{
                    width: "20px",
                    height: "20px",
                    marginLeft: "16px",
                    marginTop: "16px",
                }} checked readOnly />
            </div>}

            {image.status === "pending" && <div className="image-thumbnail-pending">
                <i style={{marginTop: "20px"}} className="fa fa-hourglass-half"></i>
            </div>}
            {
                image.status === "processing" && <div className="image-thumbnail-pending">
                    <i style={{marginTop: "20px"}} className="fa fa-cog fa-spin"></i>
                </div>
            }
        </div>
    );
};
