import React, { FC, useEffect, useRef, useState } from "react";
import { Modal } from "react-bootstrap";
import { CreateImageInput, Image, ImageStatusEnum } from "../client/api";
import { getUpscaleLevel } from "../lib/upscale";

interface ImagePopupProps {
    assetsUrl: string;
    image: Image;
    onClose: () => void;
    onDelete?: (image: Image) => void;
    onFork?: (image: Image) => void;
    onEdit?: (image: Image) => void;
    onUpscale?: (image: Image) => void;
    onNSFW?: (image: Image, nsfw: boolean) => void;
}

export const ImagePopup: FC<ImagePopupProps> = ({
    assetsUrl,
    image,
    onClose,
    onDelete,
    onFork,
    onEdit,
    onUpscale,
    onNSFW,
}) => {
    const img = useRef<HTMLImageElement>(null);
    const src = `${assetsUrl}/${image.id}.image.png?updated_at=${image.updated_at}`;
    let score = image.score;
    if (
        image.negative_phrases.join("").trim() !== "" &&
        image.negative_score != 0
    ) {
        score -= image.negative_score;
    }
    const [showNSFW, setShowNSFW] = useState(false);

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
                        style={{
                            fontSize: "10px",
                            position: "relative",
                            top: "-1px",
                        }}
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
            img.current.src = "/images/default.png";
        };
    }, [img]);

    let title = image.label;
    if (!title) {
        title = image.phrases[0];
    }

    const upscaleLevel = getUpscaleLevel(image.width!, image.height!);

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
                        filter: image.nsfw && !showNSFW ? "blur(30px)" : "",
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
                                {onEdit && (
                                    <button
                                        className="btn btn-primary btn-sm image-popup-button edit-button"
                                        onClick={() => onEdit && onEdit(image)}
                                        style={{ marginRight: "5px" }}
                                    >
                                        <i className="fas fa-edit"></i>
                                        &nbsp;EDIT
                                    </button>
                                )}
                                {onUpscale && upscaleLevel < 2 && (
                                    <button
                                        className="btn btn-primary btn-sm image-popup-button"
                                        onClick={() =>
                                            onUpscale && onUpscale(image)
                                        }
                                        style={{ marginRight: "5px" }}
                                    >
                                        <i className="fas fa-search-plus"></i>
                                        &nbsp;UPSCALE
                                    </button>
                                )}
                                {image.nsfw && (
                                    <button
                                        className="btn btn-primary btn-sm image-popup-button"
                                        onClick={() => setShowNSFW(!showNSFW)}
                                        style={{ marginRight: "5px" }}
                                    >
                                        <i className="fas fa-eye"></i>
                                        &nbsp;{showNSFW ? "HIDE" : "SHOW"}
                                    </button>
                                )}
                            </div>
                        </div>
                        <div
                            className="image-popup-controls"
                            style={{ marginTop: "28px", marginBottom: "85px" }}
                        >
                            <div>
                                Similarity to prompt: {(score * 200).toFixed(2)}
                                %
                            </div>
                            <div>
                                Image dimensions: {image.width} x {image.height}
                            </div>
                            {image.nsfw && (
                                <>
                                    <div>
                                        {/* alert warning icon */}
                                        <i
                                            className="fas fa-exclamation-triangle"
                                            style={{
                                                color: "orange",
                                                fontSize: "18px",
                                                position: "relative",
                                                top: "2px",
                                            }}
                                        ></i>
                                        &nbsp;May contain NSFW content
                                    </div>
                                    {onNSFW && (
                                        <a
                                            href="javascript:void(0)"
                                            onClick={() =>
                                                onNSFW(image, false)
                                            }
                                        >
                                            Mark as Safe for Work
                                        </a>
                                    )}
                                </>
                            )}
                            {!image.nsfw && (
                                <>
                                    <div>
                                        {/* green check icon */}
                                        <i
                                            className="fas fa-check"
                                            style={{
                                                color: "green",
                                                fontSize: "18px",
                                                position: "relative",
                                                top: "2px",
                                            }}
                                        ></i>
                                        &nbsp;Safe for Work
                                    </div>
                                    {onNSFW && (
                                        <a
                                            href="javascript:void(0)"
                                            onClick={() =>
                                                onNSFW(image, true)
                                            }
                                        >
                                            Mark as Not Safe for Work
                                        </a>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </Modal.Body>
        </Modal>
    );
};
