import React, {FC, useEffect, useState} from "react";
import { Modal } from "react-bootstrap";
import { Image } from "../client/api";

interface Props {
    images: Image[];
    onDeleteImage: (image: Image) => void;
    onCancel: () => void;
    show: boolean;
}

export const PendingImages: FC<Props> = ({
    images,
    onDeleteImage,
    onCancel,
    show,
}) => {

    function imageIcon(image: Image) {
        if (image.status === "pending") {
            return <i className="fa fa-hourglass-half"></i>;
        } else if (image.status === "processing") {
            return <i className="fa fa-cog fa-spin"></i>;
        }
    }

    const truncate = (phrases: string) => {
        if (phrases.length > 35) {
            return phrases.substring(0, 35) + "...";
        }
        return phrases;
    }

    // refactor from table to div layout
    const pendingDiv = (
        <div>
            <div style={{marginBottom: "8px"}}>
                <div style={{display: "inline-block", width: "100px"}}>
                    Status
                </div>
                <div style={{display: "inline-block", width: "250px"}}>
                    Phrases
                </div>
                <div style={{display: "inline-block", width: "100px"}}>
                    Action
                </div>
            </div>
            {images.map((image) => (
                <div key={image.id} style={{marginBottom: "8px"}}>
                    <div style={{display: "inline-block", width: "100px"}}>
                        {imageIcon(image)}&nbsp;{image.status}
                    </div>
                    <div style={{display: "inline-block", width: "250px"}}>
                        {/* if more than 30 chars, truncate with ellipsis*/}
                        {truncate(image.phrases.join(", "))}
                    </div>
                    <div style={{display: "inline-block", width: "100px"}}>
                        <button
                            className="btn btn-danger btn-sm image-popup-delete-button"
                            onClick={() => onDeleteImage(image)}
                        >
                            <i className="fa fa-trash"></i>&nbsp;Delete
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <Modal show={show} onHide={onCancel}>
            <Modal.Header closeButton>
                <Modal.Title>Pending Images</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {pendingDiv}
            </Modal.Body>
            <Modal.Footer>
                <button className="btn btn-secondary" onClick={onCancel}>
                    Close
                </button>
            </Modal.Footer>
        </Modal>
    );
};