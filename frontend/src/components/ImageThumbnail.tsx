// Image Thumnail Component
import React, { FC, useEffect } from "react";
import { Image, ImageStatusEnum } from "../client/api";
import { imageStatusToIconClass } from "../lib/iconhelper";

interface ImageThumbnailProps {
    apiUrl: string;
    assetsUrl: string;
    image: Image;
    onClick?: (image: Image) => void;
    onDelete?: (image: Image) => void;
    onFork?: (image: Image) => void;
    onSvg?: (image: Image) => void;
    onWorkflow?: (image: Image) => void;
}

export const ImageThumbnail: FC<ImageThumbnailProps> = ({ assetsUrl, apiUrl, image, onClick, onDelete, onFork, onSvg, onWorkflow }) => {

    const src = `${assetsUrl}/${image.id}.thumbnail.jpg?updated_at=${image.updated_at}`;
    let fontSize = "1.5em";
    // shrink the font size depending on the length of image.label
    if (image.label.length > 20) {
        fontSize = "1em";
    } else if (image.label.length > 15) {
        fontSize = "1.2em";
    } else if (image.label.length > 10) {
        fontSize = "1.4em";
    }

    useEffect(() => {
        const img = document.getElementById(`image-${image.id}`) as HTMLImageElement;
        img.onerror = () => {
            img.src = "/images/default.jpg";
        }
        // this seems wasteful, but it helps deal with S3 eventual consistency
        const t = setTimeout(() => {
            img.src = `${src}&retry`
        }, 3000);
        return () => clearTimeout(t);
    })

    return (
        <div className="card" style={{ padding: "10px", width: "200px", margin: "10px" }}>
            <img
                style={{ cursor: "pointer" }}
                id={`image-${image.id}`}
                className="card-img-top"
                src={src}
                alt={image.label} onClick={() => onClick && onClick(image)} />
            <div className="card-body">
                <div>
                    {/* label */}
                    <h5 className="card-title" style={{fontSize: fontSize}}>
                        {image.label}
                    </h5>

                    <p className="card-text">
                        {/* icon for image status */}
                        <i className={imageStatusToIconClass(image.status as ImageStatusEnum)}></i>&nbsp;
                        {image.status}
                    </p>
                    {/* if the image score > 0, display it */}
                    {image.score > 0 && <p className="card-text">Score: {image.score.toFixed(5)}</p>}
                    {/* if status is "processing" then show bootstrap progress bar for image.current_iterations / image.iterations */}
                    {image.status === "processing" && <div className="progress">
                        <div className="progress-bar" role="progressbar" style={{ width: `${(image.current_iterations * 1.0) / image.iterations * 100}%` }}>
                        </div>
                    </div>}
                </div>

                <hr />
                {onDelete && <button className="btn btn-danger btn-sm" onClick={() => onDelete && onDelete(image)} style={{marginRight: "5px"}}>
                    <i className="fas fa-trash-alt"></i>
                </button>}
                {onFork && (image.status === "completed" || image.status === "saved") && <button className="btn btn-secondary btn-sm" onClick={() => onFork && onFork(image)} style={{marginRight: "5px"}}>
                    <i className="fas fa-code-branch"></i>
                </button>}
                {(image.status === "completed" || image.status === "saved") && image.enable_video && <button className="btn btn-secondary btn-sm" onClick={() => window.open(`${apiUrl}/api/images/${image.id}.mp4`)} style={{marginRight: "5px", marginTop: "5px"}}>
                    <i className="fas fa-video"></i>
                </button>}
                {onSvg && (image.status === "completed" || image.status === "saved") && <button className="btn btn-secondary btn-sm" onClick={() => onSvg && onSvg(image)} style={{marginRight: "5px", marginTop: "5px"}}>
                    <i className="fas fa-file-code"></i>
                </button>}
                {onWorkflow && (image.status === "completed" || image.status === "saved") && <button className="btn btn-secondary btn-sm" onClick={() => onWorkflow && onWorkflow(image)} style={{marginRight: "5px", marginTop: "5px"}}>
                    <i className="fas fa-cogs"></i>
                </button>}
            </div>
        </div>
    );
}