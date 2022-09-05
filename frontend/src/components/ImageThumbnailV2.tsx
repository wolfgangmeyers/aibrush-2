import React, { FC, useEffect, useState } from "react";
import moment from "moment";
import { Image, ImageStatusEnum } from "../client/api";

interface Props {
    assetsUrl: string;
    image: Image;
    onClick?: (image: Image) => void;
}

export const ImageThumbnail: FC<Props> = ({ assetsUrl, image, onClick }) => {
    const src = `${assetsUrl}/${image.id}.thumbnail.jpg?updated_at=${image.updated_at}`;
    const [retry, setRetry] = useState("");
    const [hover, setHover] = useState(false);

    // on mouse in/out, set hover state
    const onMouseEnter = () => setHover(true);
    const onMouseLeave = () => setHover(false);

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
    

    return (
        <div
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            style={{
                backgroundImage: `url(${src}${retry}), url(/images/default.jpg)`,
                backgroundSize: "contain",
                width: "128px",
                height: "128px",
                margin: "8px",
                float: "left",
                cursor: "pointer",
            }}
            onClick={() => onClick && onClick(image)}
        >
            {hover && <div style={{
                background: "rgba(255, 255, 255, 0.5)",
                color: "black",
                width: "100%",
                height: "100%",
                lineHeight: "1"
            }}>
                {label}
            </div>}
            {!hover && image.status === ImageStatusEnum.Pending && <div style={{
                background: "rgba(255, 255, 255, 0.3)",
                color: "#555",
                width: "100%",
                height: "100%",
                fontSize: "80px"
            }}>
                {/* pending / wait symbol */}
                <i style={{marginTop: "20px"}} className="fa fa-hourglass-half"></i>
            </div>}
            {
                !hover && image.status === ImageStatusEnum.Processing && <div style={{
                    background: "rgba(255, 255, 255, 0.3)",
                    color: "#555",
                    width: "100%",
                    height: "100%",
                    fontSize: "80px"
                }}>
                    <i style={{marginTop: "20px"}} className="fa fa-cog fa-spin"></i>
                </div>
            }
        </div>
    );
};
