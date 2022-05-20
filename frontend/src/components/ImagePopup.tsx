import React, { FC, useEffect, useRef } from "react";
import { Modal } from "react-bootstrap";
import { Image } from "../client/api";

interface ImagePopupProps {
    apiUrl: string;
    assetsUrl: string;
    image: Image;
    onClose: () => void;
    onDelete?: (image: Image) => void;
    onFork?: (image: Image) => void;
}

export const ImagePopup: FC<ImagePopupProps> = ({ apiUrl, assetsUrl, image, onClose, onDelete, onFork }) => {

    const img = useRef<HTMLImageElement>(null);
    const src = `${assetsUrl}/${image.id}.image.jpg?updated_at=${image.updated_at}`;

    useEffect(() => {
        if (!img.current) {
            return;
        }
        img.current.onerror = () => {
            if (!img.current) {
                return;
            }
            img.current.src = "/images/default.jpg"
        }
    }, [img])

    // if open, show modal with image
    return (
        <Modal show={true} onHide={onClose} size="lg">
            <Modal.Header closeButton>
                <Modal.Title>{image.label}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <img ref={img} style={{ maxWidth: "100%", maxHeight: "1024px", display: "block", marginLeft: "auto", marginRight: "auto" }} id={`image-popup-${image.id}`} src={src} alt={image.label} />
                {/* List these fields: status, iterations, phrases */}
                <div className="row">
                    <div className="col-lg-12">
                        <p>Status: {image.status}</p>
                        <p>Width: {image.width}</p>
                        <p>Height: {image.height}</p>
                        <p>Iterations: {image.iterations}</p>
                        <p>Phrases: {image.phrases.join(", ")}</p>
                        {/* show negative phrases if model is glid_3_xl */}
                        {image.model === "glid_3_xl" && <p>Negative phrases: {image.negative_phrases.join(", ")}</p>}
                        {/* score */}
                        <p>Score: {image.score.toFixed(5)}</p>
                        <p>Model: {image.model}</p>
                        {/* enable_video */}
                        {image.model == "vqgan_imagenet_f16_16384" && <p>Enable Video: {image.enable_video ? "Yes" : "No"}</p>}
                        {/* enable_zoom */}
                        {image.model == "vqgan_imagenet_f16_16384" && image.enable_video && <p>Enable Zoom: {image.enable_zoom ? "Yes" : "No"}</p>}
                        {/* zoom_frequency */}
                        {image.model == "vqgan_imagenet_f16_16384" && image.enable_zoom && <p>Zoom Frequency: {image.zoom_frequency}</p>}
                        {/* zoom_scale */}
                        {image.model == "vqgan_imagenet_f16_16384" && image.enable_zoom && <p>Zoom Scale: {image.zoom_scale}</p>}
                        {/* zoom_shift_x */}
                        {image.model == "vqgan_imagenet_f16_16384" && image.enable_zoom  && <p>Zoom Shift X: {image.zoom_shift_x}</p>}
                        {/* zoom_shift_y */}
                        {image.model == "vqgan_imagenet_f16_16384" && image.enable_zoom && <p>Zoom Shift Y: {image.zoom_shift_y}</p>}
                        {/* glid_3_xl_skip_iterations */}
                        {image.model == "glid_3_xl" &&<p>Skip Iterations: {image.glid_3_xl_skip_iterations}</p>}
                        {/* glid_3_xl_clip_guidance */}
                        {image.model == "glid_3_xl" &&<p>Clip Guidance: {image.glid_3_xl_clip_guidance ? "Yes" : "No"}</p>}
                        {/* glid_3_xl_clip_guidance_scale */}
                        {image.model == "glid_3_xl" &&<p>Clip Guidance Scale: {image.glid_3_xl_clip_guidance_scale}</p>}
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
                        {(image.status === "completed" || image.status === "saved") && image.enable_video && <button className="btn btn-secondary btn-sm" onClick={() => window.open(`${apiUrl}/api/images/${image.id}.mp4`)} style={{ marginRight: "5px", marginTop: "5px" }}>
                            <i className="fas fa-video"></i>
                        </button>}
                    </div>
                </div>
            </Modal.Body>
        </Modal>
    );

}