import React, { FC, useState, useEffect } from 'react';
import loadImage from "blueimp-load-image"

import { AIBrushApi, Image, CreateImageInput, ImageStatusEnum } from "../client/api";
import { getDesignerCurrentImageId, setDesignerCurrentImageId } from "../lib/designer";
import { imageStatusToIconClass } from '../lib/iconhelper';
import { ImageEditor } from '../components/ImageEditor';

interface InteractiveDesignerProps {
    api: AIBrushApi;
    apiUrl: string;
}

export const InteractiveDesigner: FC<InteractiveDesignerProps> = ({ api }) => {

    const [image, setImage] = useState<Image | null>(null);
    const [input, setInput] = useState<CreateImageInput>({
        phrases: [],
        label: "",
        iterations: 100,
        encoded_image: "",
        enable_video: false,
    });
    const [currentImageId, setCurrentImageId] = useState<string | null>(getDesignerCurrentImageId());
    const [editingImage, setEditingImage] = useState<string | null>(null);





    const onImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files && e.target.files[0]
        if (!file) {
            return
        }
        loadImage(file, (img: Event | HTMLImageElement | HTMLCanvasElement) => {
            if (!(img instanceof HTMLCanvasElement)) {
                return
            }
            // convert image to base64
            const canvas = img as HTMLCanvasElement
            const dataUrl = canvas.toDataURL("image/jpeg")
            const base64 = dataUrl.split(",")[1]
            setInput({
                ...input,
                encoded_image: base64
            })
        }, {
            maxWidth: 512,
            maxHeight: 512,
            crop: true,
            canvas: true,
        })
    }

    const onPlay = async () => {
        const resp = await api.createImage({
            ...input,
            parent: currentImageId || undefined,
        });
        if (resp.data) {
            setDesignerCurrentImageId(resp.data.id);
            setCurrentImageId(resp.data.id);
            setImage(resp.data);
        }
    }

    const renderPlayButton = () => {
        const playButton = <button type="button" className="btn btn-primary" onClick={onPlay}>
            {/* Play icon */}
            <i className="fas fa-play" />
        </button>
        if (!image || image.status === "completed" || image.status === "saved") {
            return playButton;
        }
        return (
            <button type="button" className="btn btn-primary" disabled={true}>
                <i className={imageStatusToIconClass(image.status as ImageStatusEnum)}></i>&nbsp;
            </button>
        )
    }

    const onEditImage = () => {
        let img = input.encoded_image;
        if (!img) {
            // blank 512 x 512 image with white background
            // create a new canvas
            const canvas = document.createElement("canvas")
            canvas.width = 512
            canvas.height = 512
            const ctx = canvas.getContext("2d")
            if (ctx) {
                ctx.fillStyle = "white"
                ctx.fillRect(0, 0, 512, 512)
                img = canvas.toDataURL("image/jpeg").split(",")[1]
            }
        }
        if (img) {
            setEditingImage(`data:image/jpeg;base64,${img}`)
        }
    }

    const onImageEdited = (imageUri: string) => {
        // extract base64 portion of the image uri
        const base64 = imageUri.split(",")[1]
        setInput({
            ...input,
            encoded_image: base64
        })
        setEditingImage(null)
    }

    useEffect(() => {

        const loadImageData = async (id: string) => {
            try {
                const resp = await api.getImageData(id, {
                    responseType: "arraybuffer"
                })
                const binaryImageData = Buffer.from(resp.data, "binary");
                // convert binary to base64
                const base64ImageData = binaryImageData.toString("base64");
                setInput(input => ({
                    ...input,
                    encoded_image: base64ImageData,
                }))
            } catch (err) {
                console.error(err);
            }
        }

        const fetchImage = async () => {
            if (!currentImageId) {
                return;
            }
            try {
                const resp = await api.getImage(currentImageId);
                setImage(image => {
                    if (resp.data) {
                        // TODO: if updated_at has changed, load image data
                        if (!image || image.updated_at !== resp.data.updated_at) {
                            loadImageData(currentImageId);
                            setInput(input => ({
                                ...input,
                                phrases: resp.data.phrases,
                                label: resp.data.label,
                                iterations: resp.data.iterations,
                                enable_video: resp.data.enable_video,
                            }))
                            return resp.data;
                        }
                    }
                    return image;
                });
            } catch (err) {
                console.error(err)
                // clear current image id
                setCurrentImageId(null);
                // clear image id in local storage
                setDesignerCurrentImageId(null);
            }
        }

        fetchImage();
        const timer = setInterval(fetchImage, 2000);
        return () => clearInterval(timer);
    }, [currentImageId, api])

    const inprogress = (image && (image.status === "pending" || image.status === "processing")) || false;

    return (
        <div className="container">
            <div className="row">
                <div className="col-12">
                    <h1>Interactive Designer</h1>
                </div>
            </div>
            <div className="row">
                <div className="col-12">
                    <div className="spacer" />
                </div>
            </div>
            <div className="row">
                <div className="offset-lg-3 col-lg-6 col-sm-12">
                    <form onSubmit={e => e.preventDefault()}>
                        <div className="form-group">
                            <label>Phrases</label>
                            <input
                                disabled={inprogress}
                                className="form-control"
                                type="text"
                                value={input.phrases?.join("|")}
                                onChange={(e) => setInput({ ...input, phrases: e.target.value.split("|") })}
                                placeholder="Separate | phrases | like this" />
                        </div>
                        <div className="form-group">
                            <label>Label</label>
                            <input
                                disabled={inprogress}
                                className="form-control"
                                type="text"
                                value={input.label}
                                onChange={(e) => setInput({ ...input, label: e.target.value })}
                                placeholder="Label" />
                        </div>
                        <div className="form-group">
                            <label>Iterations</label>
                            <input disabled={inprogress} min={1} max={1000} className="form-control" type="number" value={input.iterations} onChange={(e) => setInput({ ...input, iterations: parseInt(e.target.value) })} />
                        </div>
                        <div className="form-group">
                            <label style={{ marginRight: "10px" }}>Enable video</label>
                            <div className="form-check">
                                <input className="form-check-input" type="checkbox" checked={input.enable_video} onChange={(e) => setInput({ ...input, enable_video: e.target.checked })} />
                            </div>
                        </div>

                        {/* If encoded_image (base64 only) is set, show the image using a base64 image url*/}
                        {input.encoded_image && <div className="form-group">
                            <h5>Image</h5>
                            <img alt="" src={`data:image/jpeg;base64,${input.encoded_image}`} style={{ maxWidth: "100%" }} />
                        </div>}
                        <div className="form-group">
                            {image && image.status === "processing" && <div className="progress">
                                <div className="progress-bar" role="progressbar" style={{ width: `${(image.current_iterations * 1.0) / image.iterations * 100}%` }}>
                                </div>
                            </div>}
                        </div>
                        {/* If encoded_image is set, display edit button */}
                        <div className="form-group">
                            <label
                                id="loadimage-wrapper"
                                className={`btn btn-primary btn-file`}
                                style={{ marginTop: "8px" }}
                            >
                                {/* Browse font-awesome icon */}
                                <i className="fas fa-upload" />

                                <input
                                    disabled={inprogress}
                                    id="loadimage"
                                    type="file"
                                    style={{ display: "none" }}
                                    onChange={e => onImageSelected(e)}
                                />
                            </label>&nbsp;
                            {renderPlayButton()}&nbsp;
                            <button disabled={inprogress} type="button" className="btn btn-primary" onClick={onEditImage}>
                                {/* Edit icon */}
                                <i className="fas fa-edit" />
                            </button>
                        </div>


                    </form>
                </div>
            </div>
            {editingImage && (
                <ImageEditor
                    encodedImage={`${editingImage}`}
                    onCancel={() => setEditingImage(null)}
                    onSave={onImageEdited}
                />
            )}
        </div>
    )
}
