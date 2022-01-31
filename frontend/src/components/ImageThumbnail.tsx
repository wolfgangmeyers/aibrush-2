// Image Thumnail Component
import React, { FC, useEffect } from "react";
import { Image, ImageStatusEnum } from "../client/api";
import { imageStatusToIconClass } from "../lib/iconhelper";

interface ImageThumbnailProps {
    apiUrl: string;
    assetsUrl: string;
    image: Image;
    onClick: (image: Image) => void;
    onDelete?: (image: Image) => void;
    onFork?: (image: Image) => void;
    onDesign?: (image: Image) => void;
}

export const ImageThumbnail: FC<ImageThumbnailProps> = ({ assetsUrl, apiUrl, image, onClick, onDelete, onFork, onDesign }) => {

    const src = `${assetsUrl}/${image.id}.thumbnail.jpg?updated_at=${image.updated_at}`;

    useEffect(() => {
        const img = document.getElementById(`image-${image.id}`) as HTMLImageElement;
        img.onerror = () => {
            img.src = "/images/default.jpg";
        }
    })

    return (
        <div className="card" style={{ padding: "10px", width: "200px", margin: "10px" }}>
            <img
                style={{ cursor: "pointer" }}
                id={`image-${image.id}`}
                className="card-img-top"
                src={src}
                alt={image.label} onClick={() => onClick(image)} />
            <div className="card-body">
                <div>
                    <h5 className="card-title">
                        {image.label}
                    </h5>
                    <p className="card-text">
                        {/* icon for image status */}
                        <i className={imageStatusToIconClass(image.status as ImageStatusEnum)}></i>&nbsp;
                        {image.status}
                    </p>
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
                {/*  interactive designer */}
                {onDesign && <button className="btn btn-secondary btn-sm" onClick={() => onDesign && onDesign(image)} style={{marginRight: "5px"}}>
                    <i className="fas fa-pencil-alt"></i>
                </button>}
                {(image.status === "completed" || image.status === "saved") && image.enable_video && <button className="btn btn-secondary btn-sm" onClick={() => window.open(`${apiUrl}/images/${image.id}.mp4`)} style={{marginRight: "5px", marginTop: "5px"}}>
                    <i className="fas fa-video"></i>
                </button>}
            </div>
        </div>
    );
}