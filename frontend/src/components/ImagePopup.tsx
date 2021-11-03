import React, {FC, useEffect} from "react";
import { Modal } from "react-bootstrap";
import { Image } from "../client/api";

interface ImagePopupProps {
    apiUrl: string;
    image: Image;
    onClose: () => void;
}

export const ImagePopup: FC<ImagePopupProps> = ({apiUrl, image, onClose}) => {

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
                <img style={{width: "100%"}} id={`image-popup-${image.id}`} src={src} alt={image.label} />
                {/* List these fields: status, iterations, phrases */}
                <div>
                    <p>Status: {image.status}</p>
                    <p>Iterations: {image.iterations}</p>
                    <p>Current iterations: {image.current_iterations}</p>
                    <p>Score: {image.score}</p>
                    <p>Phrases: {image.phrases.join(", ")}</p>
                    {/* enable_video */}
                    <p>Enable Video: {image.enable_video ? "Yes" : "No"}</p>
                </div>
            </Modal.Body>
        </Modal>
    );

}