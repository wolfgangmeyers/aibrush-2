import React, {FC, useEffect} from "react";
import { Modal } from "react-bootstrap";
import { Image } from "../client/api";

interface ImagePopupProps {
    apiUrl: string;
    image: Image;
    onClose: () => void;
    isOpen: boolean;
}

export const ImagePopup: FC<ImagePopupProps> = ({apiUrl, image, onClose, isOpen}) => {

    const src = `${apiUrl}/images/${image.id}/image.jpg?updated_at=${image.updated_at}`;

    useEffect(() => {
        const img = document.getElementById(`image-${image.id}`) as HTMLImageElement;
        img.onerror = () => {
            img.src = "/images/default.jpg"
        }
    })

    // if open, show modal with image
    return (
        <Modal show={isOpen} onHide={onClose}>
            <Modal.Header closeButton>
                <Modal.Title>{image.label}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <img id={`image-${image.id}`} src={src} alt={image.label} />
            </Modal.Body>
        </Modal>
    );

}