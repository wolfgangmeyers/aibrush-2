import React, { FC, useEffect, useState } from "react";
import moment from "moment";
import { Image, ImageStatusEnum } from "../client/api";

interface Props {
    assetsUrl: string;
    image: Image;
    censorNSFW: boolean;
    bulkDelete?: boolean;
    onClick?: (image: Image) => void;
}

export const ImageThumbnail: FC<Props> = ({ assetsUrl, image, censorNSFW, bulkDelete, onClick }) => {
    const src = `${assetsUrl}/${image.id}.thumbnail.png?updated_at=${image.updated_at}`;
    const [retry, setRetry] = useState("");

    useEffect(() => {
        // This is to help deal with eventual consistency from S3.
        // if image.updated_at (unix timestamp in milliseconds) is less than a minute ago, try to reload the image
        if (moment().diff(moment(image.updated_at), "minutes") < 1) {
            setRetry("");
            const t = setTimeout(() => {
                setRetry("&retry")
            }, 3000);
            return () => clearTimeout(t);
        }
    }, [image.id, image.updated_at])

    let label = image.label;
    if (image.label === "") {
        label = image.phrases[0];
    }
    
    let className = "image-thumbnail";
    if (bulkDelete) {
        className += " bulk-delete";
    }

    return (
        <div
            className={className}
            style={{
                backgroundImage: `url(${src}${retry}), url(/images/default.png)`,
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

            {image.status === ImageStatusEnum.Pending && <div className="image-thumbnail-pending">
                <i style={{marginTop: "20px"}} className="fa fa-hourglass-half"></i>
            </div>}
            {
                image.status === ImageStatusEnum.Processing && <div className="image-thumbnail-pending">
                    <i style={{marginTop: "20px"}} className="fa fa-cog fa-spin"></i>
                </div>
            }
        </div>
    );
};
