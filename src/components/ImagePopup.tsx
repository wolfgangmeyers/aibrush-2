import React, { FC, useEffect, useRef, useState } from "react";
import { Dropdown, Modal } from "react-bootstrap";
import { LocalImage, LoraConfig } from "../lib/models";
import CopyToClipboard from "react-copy-to-clipboard";
import CopyToClipboardIcon from "./CopyToClipboardIcon";
import { Swipe } from "./Swipe";
import { downloadImage } from "../lib/imageutil";
import moment from "moment";
import { recentLoras } from "../lib/recentLoras";
import { SelectedLora } from "./LoraSelector";

interface ImagePopupProps {
    image: LocalImage;
    censorNSFW: boolean;
    onClose: () => void;
    onDelete?: (image: LocalImage) => void;
    onDeleteRemote?: (image: LocalImage) => void;
    onFork?: (image: LocalImage) => void;
    onEdit?: (image: LocalImage) => void;
    onNSFW?: (image: LocalImage, nsfw: boolean) => void;
    onSave?: (image: LocalImage) => void;
    onSwipe?: (image: LocalImage, direction: number) => void;
}

function civitLink(id: number): string {
    return `https://civitai.com/models/${id}`;
}

export const ImagePopup: FC<ImagePopupProps> = ({
    image,
    censorNSFW,
    onClose,
    onDelete,
    onDeleteRemote,
    onFork,
    onEdit,
    onNSFW,
    onSave,
    onSwipe,
}) => {
    const img = useRef<HTMLImageElement>(null);
    const src = image.imageData;
    let score = image.score || 0;
    if (image.params.negative_prompt && image.negative_score != 0) {
        score -= image.negative_score || 0;
    }
    const [showNSFW, setShowNSFW] = useState(false);
    const [loras, setLoras] = useState<SelectedLora[]>([]);

    useEffect(() => {
        const updateLoras = async () => {
            const selectedLoras = await Promise.all((image.params.loras || []).map(async (lora): Promise<SelectedLora> => {
                let item = await recentLoras.getLora(lora.name);
                if (!item) {
                    item = {
                        name: lora.name,
                        id: parseInt(lora.name),
                    } as any;
                }
                return {
                    config: lora,
                    lora: item as any,
                };
            }));
            setLoras(selectedLoras);
        };
        updateLoras();
    }, [image])

    const renderLoras = () => {
        return <>
            {loras.map(lora => (
                <div key={lora.lora.id} style={{
                    marginRight: "8px",
                    marginLeft: "8px"
                }}>
                    <a href={civitLink(lora.lora.id)} target="_blank">
                        {/* this is an item in a list. Display a good icon for it */}
                        <i className="fas fa-palette"></i>&nbsp;
                        {lora.lora.name}
                    </a>
                </div>
            ))}
        </>
    };

    const statusBadge = (status: string) => {
        const displayStatus = status.charAt(0).toUpperCase() + status.slice(1);
        let icon = "fa fa-question-circle";
        switch (status) {
            case "pending":
                icon = "fas fa-hourglass-half";
                break;
            case "processing":
                icon = "fas fa-cog fa-spin";
                break;
            case "completed":
                icon = "fas fa-check";
                break;
            case "saved":
                icon = "fas fa-save";
                break;
            case "error":
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

    const onDownloadImage = (format: string) => {
        downloadImage(image.id, image.imageData!, format);
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
        title = image.params.prompt!;
    }
    if (title.indexOf(",") > 0) {
        title = title.substring(0, title.indexOf(","));
    }

    let swipeArrowMargin = "10px";
    if (window.innerWidth < 992) {
        swipeArrowMargin = "-30px";
    }
    const maxImageHeight = window.innerHeight * 0.6 + "px";

    // if open, show modal with image
    return (
        <Modal show={true} onHide={onClose} size="xl">
            <Modal.Header closeButton>
                <Modal.Title>{title}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <div style={{ position: "relative" }}>
                    {/* Left button */}
                    {onSwipe && (
                        <button
                            className="btn btn-secondary btn-sm image-popup-left-button"
                            style={{
                                position: "absolute",
                                left: swipeArrowMargin,
                                top: "50%",
                                transform: "translateY(-50%)",
                                zIndex: 1,
                                padding: "5px 10px",
                            }}
                            onClick={() => onSwipe(image, -1)}
                        >
                            <i className="fas fa-chevron-left"></i>
                        </button>
                    )}
                    <Swipe
                        onSwipe={(direction) =>
                            onSwipe && onSwipe(image, direction)
                        }
                    >
                        <img
                            ref={img}
                            style={{
                                maxWidth: "100%",
                                maxHeight: maxImageHeight,
                                display: "block",
                                marginLeft: "auto",
                                marginRight: "auto",
                                filter:
                                    image.nsfw && censorNSFW && !showNSFW
                                        ? "blur(30px)"
                                        : "",
                            }}
                            id={`image-popup-${image.id}`}
                            src={src}
                            alt={image.label}
                        />
                    </Swipe>
                    {/* Right button */}
                    <button
                        className="btn btn-secondary btn-sm .image-popup-right-button"
                        style={{
                            position: "absolute",
                            right: swipeArrowMargin,
                            top: "50%",
                            transform: "translateY(-50%)",
                            zIndex: 1,
                            padding: "5px 10px",
                        }}
                        onClick={() => onSwipe && onSwipe(image, 1)}
                    >
                        <i className="fas fa-chevron-right"></i>
                    </button>
                </div>
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
                                    (image.status === "saved" ||
                                        image.status === "completed") && (
                                        <button
                                            className="btn btn-secondary btn-sm image-popup-button"
                                            onClick={() => onFork(image)}
                                            style={{
                                                marginRight: "5px",
                                                marginTop: "8px",
                                            }}
                                        >
                                            <i className="fas fa-code-branch"></i>
                                            &nbsp;VARIATIONS
                                        </button>
                                    )}
                                {onDelete && !onDeleteRemote && (
                                    <button
                                        className="btn btn-danger btn-sm image-popup-delete-button"
                                        onClick={() =>
                                            onDelete && onDelete(image)
                                        }
                                        style={{
                                            marginRight: "5px",
                                            marginTop: "8px",
                                        }}
                                    >
                                        <i className="fas fa-trash-alt"></i>
                                        &nbsp;DELETE
                                    </button>
                                )}
                                {onDelete && onDeleteRemote && (
                                    <Dropdown
                                        style={{
                                            display: "inline",
                                            marginRight: "5px",
                                        }}
                                    >
                                        <Dropdown.Toggle
                                            variant="danger"
                                            className="btn-sm image-popup-delete-button"
                                            style={{ marginTop: "8px" }}
                                        >
                                            <i className="fas fa-trash-alt"></i>
                                            &nbsp;DELETE
                                        </Dropdown.Toggle>
                                        <Dropdown.Menu>
                                            <Dropdown.Item
                                                onClick={() =>
                                                    onDelete && onDelete(image)
                                                }
                                            >
                                                Locally
                                            </Dropdown.Item>
                                            <Dropdown.Item
                                                onClick={() =>
                                                    onDeleteRemote &&
                                                    onDeleteRemote(image)
                                                }
                                            >
                                                Remotely
                                            </Dropdown.Item>
                                        </Dropdown.Menu>
                                    </Dropdown>
                                )}
                                {onEdit && (
                                    <button
                                        className="btn btn-primary btn-sm image-popup-button edit-button"
                                        onClick={() => onEdit && onEdit(image)}
                                        style={{
                                            marginRight: "5px",
                                            marginTop: "8px",
                                        }}
                                    >
                                        <i className="fas fa-edit"></i>
                                        &nbsp;EDIT
                                    </button>
                                )}
                                {onSave && (
                                    <button
                                        className="btn btn-primary btn-sm image-popup-button"
                                        onClick={() => onSave && onSave(image)}
                                        style={{
                                            marginRight: "5px",
                                            marginTop: "8px",
                                        }}
                                    >
                                        <i className="fas fa-save"></i>
                                        &nbsp;SAVE
                                    </button>
                                )}
                                <Dropdown style={{ display: "inline" }}>
                                    <Dropdown.Toggle
                                        variant="primary"
                                        className="btn-sm image-popup-button"
                                        style={{ marginTop: "8px" }}
                                    >
                                        <i className="fas fa-download"></i>
                                        &nbsp;DOWNLOAD
                                    </Dropdown.Toggle>
                                    <Dropdown.Menu>
                                        <Dropdown.Item
                                            onClick={() =>
                                                onDownloadImage("png")
                                            }
                                        >
                                            AS PNG
                                        </Dropdown.Item>
                                        <Dropdown.Item
                                            onClick={() =>
                                                onDownloadImage("webp")
                                            }
                                        >
                                            AS WEBP
                                        </Dropdown.Item>
                                        <Dropdown.Item
                                            onClick={() =>
                                                onDownloadImage("jpeg")
                                            }
                                        >
                                            AS JPEG
                                        </Dropdown.Item>
                                    </Dropdown.Menu>
                                </Dropdown>
                                {image.nsfw && censorNSFW && (
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
                            {/* Horde interface doesn't support score yet */}
                            {/* <div>
                                Similarity to prompt: {(score * 200).toFixed(2)}
                                %
                            </div> */}
                            <div>
                                Image dimensions: {image.params.width} x{" "}
                                {image.params.height}
                            </div>
                            <div>Model: {image.model}</div>
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
                                            onClick={() => onNSFW(image, false)}
                                        >
                                            Mark as Safe for Work
                                        </a>
                                    )}
                                </>
                            )}
                            {image.params.seed && (
                                <div>Seed: {image.params.seed}</div>
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
                                            onClick={() => onNSFW(image, true)}
                                        >
                                            Mark as Not Safe for Work
                                        </a>
                                    )}
                                </>
                            )}
                            <div style={{ marginTop: "8px" }}>
                                Prompt: {image.params.prompt}
                                <CopyToClipboardIcon
                                    text={image.params.prompt!}
                                />
                            </div>
                            <div style={{ marginTop: "8px" }}>
                                Negative Prompt: {image.params.negative_prompt}
                                <CopyToClipboardIcon
                                    text={image.params.negative_prompt!}
                                />
                            </div>
                            {/* updated at */}
                            <div style={{ marginTop: "8px" }}>
                                Last Updated:{" "}
                                {moment(image.updated_at).format(
                                    "YYYY-MM-DD HH:mm:ss"
                                )}
                            </div>
                            {loras.length > 0 && <div style={{ marginTop: "8px" }}>
                                Loras:{" "}
                                { renderLoras() }
                            </div>}
                            
                        </div>
                    </div>
                </div>
            </Modal.Body>
        </Modal>
    );
};
