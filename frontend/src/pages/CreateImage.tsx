import React, { FC, useState, useEffect } from 'react';
import { useHistory } from "react-router-dom"
import { AIBrushApi, CreateImageInput, Image } from "../client/api"
import loadImage from "blueimp-load-image"
import qs from "qs";
import { ImageEditor } from "../components/ImageEditor";

interface CreateImageProps {
    api: AIBrushApi
    apiUrl: string;
}

export const CreateImage: FC<CreateImageProps> = (props) => {
    const searchParams = qs.parse(window.location.search.substring(1)) as any

    const history = useHistory()
    const [input, setInput] = useState<CreateImageInput>({
        phrases: [],
        label: "",
        iterations: 100,
        encoded_image: "",
        enable_video: false,
    });
    const [editingImage, setEditingImage] = useState<string | null>(null);
    const [count, setCount] = useState(1)

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        for (let i = 0; i < count; i++) {
            await props.api.createImage(input);
        }

        // redirect to images page
        history.push("/images")
    }

    const onCancel = () => {
        // on cancel, return to the previous page
        // check if there is a previous page. if not, redirect to home
        if (history.length > 1) {
            history.goBack()
        } else {
            history.push("/")
        }
    }

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

    const loadParent = async (parentId: string) => {
        const image = await props.api.getImage(parentId)
        // get encoded image data for parent
        const resp = await props.api.getImageData(image.data.id, {
            responseType: "arraybuffer"
        })
        const binaryImageData = Buffer.from(resp.data, "binary");
        // convert binary to base64
        const base64ImageData = binaryImageData.toString("base64");
        setInput({
            ...input,
            label: image.data.label,
            phrases: image.data.phrases,
            iterations: image.data.iterations,
            parent: parentId,
            encoded_image: base64ImageData,
            enable_video: !!image.data.enable_video,
        })
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
        if (searchParams.parent) {
            loadParent(searchParams.parent)
        }
    }, [searchParams.parent])

    return (
        <>
            <div className="container">
                {/* Header: Create new image */}
                <div className="row">
                    <div className="col-12">
                        <h1>Create new image</h1>
                    </div>
                </div>
            </div>
            {/* 50px vertical spacer */}
            <div className="row">
                <div className="col-12">
                    <div className="spacer" />
                </div>
            </div>
            <div className="row">
                <div className="offset-lg-3 col-lg-6 col-sm-12">
                    <form onSubmit={onSubmit}>
                        <div className="form-group">
                            <label>Phrases</label>
                            <input
                                className="form-control"
                                type="text"
                                value={input.phrases?.join("|")}
                                onChange={(e) => setInput({ ...input, phrases: e.target.value.split("|") })}
                                placeholder="Separate | phrases | like this" />
                        </div>
                        <div className="form-group">
                            <label>Label</label>
                            <input
                                className="form-control"
                                type="text"
                                value={input.label}
                                onChange={(e) => setInput({ ...input, label: e.target.value })}
                                placeholder="Label" />
                        </div>
                        <div className="form-group">
                            <label>Iterations</label>
                            <input min={1} max={1000} className="form-control" type="number" value={input.iterations} onChange={(e) => setInput({ ...input, iterations: parseInt(e.target.value) })} />
                        </div>
                        {/* count */}
                        <div className="form-group">
                            <label>Count</label>
                            <input className="form-control" type="number" max={10} min={1} value={count} onChange={(e) => setCount(parseInt(e.target.value))} />
                        </div>
                        {/* boolean enable_video (bootstrap styled checkbox) */}
                        <div className="form-group">
                            <label style={{marginRight: "10px"}}>Enable video</label>
                            <div className="form-check">
                                <input className="form-check-input" type="checkbox" checked={input.enable_video} onChange={(e) => setInput({ ...input, enable_video: e.target.checked })} />
                            </div>
                        </div>

                        {/* If encoded_image (base64 only) is set, show the image using a base64 image url*/}
                        {input.encoded_image && <div className="form-group">
                            <h5>Initial Image</h5>
                            <img src={`data:image/jpeg;base64,${input.encoded_image}`} style={{ maxWidth: "100%" }} />
                        </div>}
                        {/* If encoded_image is set, display edit button */}
                        <div className="form-group">
                            <label
                                id="loadimage-wrapper"
                                className={`btn btn-sm btn-primary btn-file`}
                                style={{ marginTop: "8px", marginRight: "8px" }}
                            >
                                {input.encoded_image ? "Replace Image" : "Upload Image"}
                                <input
                                    id="loadimage"
                                    type="file"
                                    style={{ display: "none" }}
                                    onChange={e => onImageSelected(e)}
                                />
                            </label>
                            <button type="button" className="btn btn-sm btn-primary" onClick={onEditImage}>Edit Image</button>
                        </div>

                        <div className="form-group">
                            {/* Cancel button "/" */}
                            <button onClick={onCancel} type="button" className="btn btn-secondary">Cancel</button>
                            &nbsp;
                            <button type="submit" className="btn btn-primary">Create</button>
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
        </>
    )


}