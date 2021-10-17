// Image Thumnail Component
import React, { FC, useState, useEffect } from "react";
import { Image, ImageStatusEnum } from "../client/api";
import { imageStatusToIconClass } from "../lib/iconhelper";
import { Config } from "../config";

interface ImageThumbnailProps {
    apiUrl: string;
    image: Image;
    onClick: (image: Image) => void;
    onDelete?: (image: Image) => void;
    onSave?: (image: Image) => void;
    onFork?: (image: Image) => void;
}

export const ImageThumbnail: FC<ImageThumbnailProps> = ({ apiUrl, image, onClick, onDelete, onSave, onFork }) => {

    const src = `${apiUrl}/images/${image.id}/thumbnail.jpg?updated_at=${image.updated_at}`;

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
                </div>

                <hr />
                {onSave && image.status == "completed" && <button className="btn btn-primary btn-sm" onClick={() => onSave(image)} style={{marginRight: "5px"}}>
                    {/* save icon */}
                    <i className="fas fa-save"></i>
                </button>}
                {onDelete && <button className="btn btn-danger btn-sm" onClick={() => onDelete && onDelete(image)} style={{marginRight: "5px"}}>
                    <i className="fas fa-trash-alt"></i>
                </button>}
                {onFork && image.status == "saved" && <button className="btn btn-secondary btn-sm" onClick={() => onFork && onFork(image)} style={{marginRight: "5px"}}>
                    <i className="fas fa-code-branch"></i>
                </button>}
            </div>
        </div>
    );
}