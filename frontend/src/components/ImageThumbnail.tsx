// Image Thumnail Component
import React, {FC, useState, useEffect} from "react";
import { Image } from "../client/api";
import { Config } from "../config";

interface ImageThumbnailProps {
    apiUrl: string;
    image: Image;
    onClick: (image: Image) => void;
    onDelete: (image: Image) => void;
}

// Image Thumbnail Component
// displays an image thumbnail with src based on image id
// and a delete button
// url pattern is /images/:id/thumbnail.jpg
// use bootstrap card component

export const ImageThumbnail: FC<ImageThumbnailProps> = ({apiUrl, image, onClick, onDelete}) => {

    const src = `${apiUrl}/images/${image.id}/thumbnail.jpg?updated_at=${image.updated_at}`;

    useEffect(() => {
        const img = document.getElementById(`image-${image.id}`) as HTMLImageElement;
        img.onerror = () => {
            img.src = "/images/default.jpg";
        }
    })

    return (
        <div className="card" style={{padding: "10px"}}>
            <img
                id={`image-${image.id}`}
                className="card-img-top"
                src={src}
                alt={image.label} onClick={() => onClick(image)}/>
            <div className="card-body">
                <h5 className="card-title">
                    {image.label}
                    {/* float-right delete button */}
                    <button className="btn btn-danger float-right" onClick={() => onDelete(image)}>
                        <i className="fas fa-trash-alt"></i>
                    </button>
                </h5>
                <p className="card-text">{image.status}</p>

            </div>
        </div>
    );
}