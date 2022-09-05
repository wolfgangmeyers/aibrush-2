import React, { FC, useEffect, useRef, useState } from "react";
import { Modal } from "react-bootstrap";
import { CreateImageInput, Image, ImageStatusEnum } from "../client/api";
import { ImagePrompt } from "./ImagePrompt";

interface ImagePopupProps {
    assetsUrl: string;
    image: Image;
    onClose: () => void;
    onDelete?: (image: Image) => void;
    onFork?: (image: Image) => void;
}

export const ImagePopup: FC<ImagePopupProps> = ({
    assetsUrl,
    image,
    onClose,
    onDelete,
    onFork,
}) => {
    const img = useRef<HTMLImageElement>(null);
    const src = `${assetsUrl}/${image.id}.image.jpg?updated_at=${image.updated_at}`;
    let score = image.score;
    if (
        image.negative_phrases.join("").trim() !== "" &&
        image.negative_score != 0
    ) {
        score -= image.negative_score;
    }

    const statusBadge = (status: string) => {
        const displayStatus = status.charAt(0).toUpperCase() + status.slice(1);
        let icon = "fa fa-question-circle";
        switch (status) {
            case ImageStatusEnum.Pending:
                icon = "fas fa-hourglass-half";
                break;
            case ImageStatusEnum.Processing:
                icon = "fas fa-cog fa-spin";
                break;
            case ImageStatusEnum.Completed:
                icon = "fas fa-check";
                break;
            case ImageStatusEnum.Error:
                icon = "fas fa-exclamation-circle";
                break;
        }
        return (
            <>
                <span style={{ fontSize: "24px" }}>
                    <i
                        className={`${icon} status-badge status-badge-${status}`}
                        style={{ fontSize: "10px", position: "relative", top: "-1px" }}
                    ></i>
                    &nbsp;{displayStatus}
                </span>
            </>
        );
    };

    useEffect(() => {
        if (!img.current) {
            return;
        }
        img.current.onerror = () => {
            if (!img.current) {
                return;
            }
            img.current.src = "/images/default.jpg";
        };
    }, [img]);

    let title = image.label;
    if (!title) {
        title = image.phrases[0];
    }

    // if open, show modal with image
    return (
        <Modal show={true} onHide={onClose} size="xl">
            <Modal.Header closeButton>
                <Modal.Title>{title}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <img
                    ref={img}
                    style={{
                        maxWidth: "100%",
                        maxHeight: "1024px",
                        display: "block",
                        marginLeft: "auto",
                        marginRight: "auto",
                    }}
                    id={`image-popup-${image.id}`}
                    src={src}
                    alt={image.label}
                />
                {/* List these fields: status, iterations, phrases */}
                <div className="row">
                    <div className="col-lg-12"></div>
                </div>
                {/* controls */}
                <div className="row">
                    <div className="col-lg-12">
                        <div
                            className="image-popup-controls"
                            style={{ marginTop: "40px" }}
                        >
                            {statusBadge(image.status)}
                            <div style={{ float: "right" }}>
                                {onFork &&
                                    (image.status === ImageStatusEnum.Saved ||
                                        image.status ===
                                            ImageStatusEnum.Completed) && (
                                        <button
                                            className="btn btn-secondary btn-sm image-popup-button"
                                            onClick={() => onFork(image)}
                                            style={{ marginRight: "5px" }}
                                        >
                                            <i className="fas fa-code-branch"></i>
                                            &nbsp;VARIATIONS
                                        </button>
                                    )}
                                {onDelete && (
                                    <button
                                        className="btn btn-danger btn-sm image-popup-delete-button"
                                        onClick={() =>
                                            onDelete && onDelete(image)
                                        }
                                        style={{ marginRight: "5px" }}
                                    >
                                        <i className="fas fa-trash-alt"></i>
                                        &nbsp;DELETE
                                    </button>
                                )}
                            </div>
                        </div>
                        <div
                            className="image-popup-controls"
                            style={{ marginTop: "28px", marginBottom: "85px" }}
                        >
                            <div>
                                Similarity to prompt: {(score * 200).toFixed(2)}%
                            </div>
                        </div>
                    </div>
                </div>
            </Modal.Body>
        </Modal>
    );
};
