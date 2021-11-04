import React, { FC, useEffect } from "react";
import { Modal } from "react-bootstrap";
import { Image } from "../client/api";

interface ImagePopupProps {
    apiUrl: string;
    image: Image;
    onClose: () => void;
    onDelete?: (image: Image) => void;
    onFork?: (image: Image) => void;
    onDesign?: (image: Image) => void;
}

export const ImagePopup: FC<ImagePopupProps> = ({ apiUrl, image, onClose, onDelete, onDesign, onFork }) => {

    const src = `${apiUrl}/images/${image.id}/image.jpg?updated_at=${image.updated_at}`;

    useEffect(() => {
        const img = document.getElementById(`image-popup-${image.id}`) as HTMLImageElement;
        img.onerror = () => {
            img.src = "/images/default.jpg"
        }
    })

    // if open, show modal with image
    return (
        <Modal show={true} onHide={onClose} size="lg">
            <Modal.Header closeButton>
                <Modal.Title>{image.label}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <img style={{ width: "100%" }} id={`image-popup-${image.id}`} src={src} alt={image.label} />
                {/* List these fields: status, iterations, phrases */}
                <div className="row">
                    <div className="col-lg-12">
                        <p>Status: {image.status}</p>
                        <p>Iterations: {image.iterations}</p>
                        <p>Phrases: {image.phrases.join(", ")}</p>
                        {/* enable_video */}
                        <p>Enable Video: {image.enable_video ? "Yes" : "No"}</p>
                    </div>
                </div>
                {/* controls */}
                <div className="row">
                    <div className="col-lg-12">
                        {onDelete && <button className="btn btn-danger btn-sm" onClick={() => onDelete && onDelete(image)} style={{ marginRight: "5px" }}>
                            <i className="fas fa-trash-alt"></i>
                        </button>}
                        {onFork && image.status === "saved" && <button className="btn btn-secondary btn-sm" onClick={() => onFork && onFork(image)} style={{ marginRight: "5px" }}>
                            <i className="fas fa-code-branch"></i>
                        </button>}
                        {/*  interactive designer */}
                        {onDesign && <button className="btn btn-secondary btn-sm" onClick={() => onDesign && onDesign(image)} style={{ marginRight: "5px" }}>
                            <i className="fas fa-pencil-alt"></i>
                        </button>}
                        {(image.status === "completed" || image.status === "saved") && image.enable_video && <button className="btn btn-secondary btn-sm" onClick={() => window.open(`${apiUrl}/images/${image.id}/video.mp4`)} style={{ marginRight: "5px", marginTop: "5px" }}>
                            <i className="fas fa-video"></i>
                        </button>}
                    </div>
                </div>
            </Modal.Body>
        </Modal>
    );

}