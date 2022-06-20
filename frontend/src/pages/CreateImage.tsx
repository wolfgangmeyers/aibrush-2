import React, { FC, useState, useEffect, useRef } from 'react';
import { useHistory } from "react-router-dom"
import { AxiosResponse } from "axios";
import { AIBrushApi, CreateImageInput, CreateImageInputHeightEnum, CreateImageInputWidthEnum } from "../client/api"
import loadImage from "blueimp-load-image"
import qs from "qs";
import { MaskEditor } from "../components/MaskEditor";
import { Uncropper } from "../components/Uncropper";

interface CreateImageProps {
    api: AIBrushApi
    apiUrl: string;
}

export const CreateImage: FC<CreateImageProps> = (props) => {
    const searchParams = qs.parse(window.location.search.substring(1)) as any

    const history = useHistory()
    const [input, setInput] = useState<CreateImageInput>({
        phrases: [],
        negative_phrases: [],
        label: "",
        iterations: 50,
        encoded_image: "",
        encoded_npy: "",
        encoded_mask: "",
        enable_video: false,
        enable_zoom: false,
        zoom_frequency: 10,
        zoom_scale: 0.99,
        zoom_shift_x: 0,
        zoom_shift_y: 0,
        model: "glid_3_xl",
        glid_3_xl_clip_guidance: false,
        glid_3_xl_clip_guidance_scale: 150,
        glid_3_xl_skip_iterations: 0,
        width: 256,
        height: 256,
    });
    const [editingMask, seteditingMask] = useState<string | null>(null);
    const [uncroppingImage, setUncroppingImage] = useState<string | null>(null);
    const [count, setCount] = useState(1)
    const [creating, setCreating] = useState(false)
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (input.model == "swinir" && !input.encoded_image) {
            alert("Init image is required for SwinIR upscaling")
            return
        }
        setCreating(true)
        try {
            for (let i = 0; i < count; i++) {
                await props.api.createImage(input);
            }
        } finally {
            setCreating(false)
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
                encoded_image: base64,
                encoded_npy: undefined,
                width: img.width,
                height: img.height,
            })
            renderInitImage(base64, undefined, img.width, img.height)
        }, {
            maxWidth: 1024,
            maxHeight: 1024,
            canvas: true,
        })
    }

    const onEditMask = () => {
        if (input.encoded_image) {
            seteditingMask(`data:image/jpeg;base64,${input.encoded_image}`)
        }
    }

    const onMaskEdited = (imageUri: string) => {
        // extract base64 portion of the image uri
        const base64 = imageUri.split(",")[1]
        setInput(input => ({
            ...input,
            encoded_mask: base64,
            glid_3_xl_skip_iterations: 0,
        }))
        seteditingMask(null)
        if (input.encoded_image) {
            renderInitImage(input.encoded_image, base64, input.width || 256, input.height || 256)
        }
    }

    const onUncropImage = () => {
        if (input.encoded_image) {
            setUncroppingImage(`data:image/jpeg;base64,${input.encoded_image}`)
        }
    }

    const onImageUncropped = (imageUri: string, maskUri: string, width: number, height: number, offsetX: number, offsetY: number) => {
        const imageBase64 = imageUri.split(",")[1]
        const maskBase64 = maskUri.split(",")[1]
        setInput(input => ({
            ...input,
            encoded_image: imageBase64,
            encoded_mask: maskBase64,
            // encoded_npy: undefined,
            glid_3_xl_skip_iterations: 0,
            width,
            height,
            uncrop_offset_x: offsetX,
            uncrop_offset_y: offsetY,
        }))
        setUncroppingImage(null)
        renderInitImage(imageBase64, maskBase64, width, height)
    }

    const onWidthChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
        const width = parseInt(e.target.value)
        if (width) {
            setInput(input => ({
                ...input,
                width,
            }))
            if (input.encoded_image) {
                renderInitImage(input.encoded_image, input.encoded_mask, width, input.height || 256)
            }
        }
    }

    const onHeightChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
        const height = parseInt(e.target.value)
        if (height) {
            setInput(input => ({
                ...input,
                height,
            }))
            if (input.encoded_image) {
                console.log("onHeightChanged");
                renderInitImage(input.encoded_image, input.encoded_mask, input.width || 256, height)
            }
        }
    }

    const onChangeModel = (model: string) => {
        let newInput = { ...input, model }
        if (model === "vqgan_imagenet_f16_16384") {
            newInput.iterations = 300;
        } else if (model == "glid_3_xl") {
            newInput.iterations = 50;
            newInput.enable_video = false;
        }
        setInput({ ...newInput, model: model })
    }

    const renderInitImage = (encoded_image: string, encoded_mask: string | undefined, width: number, height: number) => {
        if (canvasRef.current && encoded_image) {
            console.log("renderInitImage")
            const ctx = canvasRef.current.getContext("2d")
            if (ctx) {
                const image = new Image()
                image.src = `data:image/jpeg;base64,${encoded_image}`
                image.onload = () => {
                    ctx.globalAlpha = 1
                    ctx.drawImage(image, 0, 0, width, height)
                    if (encoded_mask) {
                        const mask = new Image()
                        mask.src = `data:image/jpeg;base64,${encoded_mask}`
                        mask.onload = () => {
                            ctx.globalAlpha = 0.5
                            ctx.drawImage(mask, 0, 0, width, height)
                        }
                    }
                }
            }
        }
    }

    useEffect(() => {

        const loadParent = async (parentId: string) => {
            const image = await props.api.getImage(parentId)
            // get encoded image data for parent
            const imageDataPromise = props.api.getImageData(image.data.id, {
                responseType: "arraybuffer"
            })
            // only glide-3-xl iamges have .npy files
            let npyDataPromise: Promise<AxiosResponse<any>> | null = null;
            if (image.data.model === "glid_3_xl") {
                npyDataPromise = props.api.getNpyData(image.data.id, {
                    responseType: "arraybuffer",
                })
            }

            const imageResp = await imageDataPromise
            const binaryImageData = Buffer.from(imageResp.data, "binary");
            // convert binary to base64
            const base64ImageData = binaryImageData.toString("base64");

            let base64NpyData = "";

            if (npyDataPromise) {
                try {
                    const npyResp = await npyDataPromise
                    const binaryNpyData = Buffer.from(npyResp.data, "binary");
                    base64NpyData = binaryNpyData.toString("base64");
                    console.log("loaded npy data successfully")
                } catch {
                    console.log("failed to load npy data")
                }
            }

            setInput(input => ({
                ...input,
                label: image.data.label,
                phrases: image.data.phrases,
                negative_phrases: image.data.negative_phrases,
                iterations: image.data.iterations,
                parent: parentId,
                encoded_image: base64ImageData,
                encoded_npy: base64NpyData || undefined,
                enable_video: !!image.data.enable_video,
                enable_zoom: !!image.data.enable_zoom,
                zoom_frequency: image.data.zoom_frequency || 10,
                zoom_scale: image.data.zoom_scale || 0.99,
                zoom_shift_x: image.data.zoom_shift_x || 0,
                zoom_shift_y: image.data.zoom_shift_y || 0,
                model: image.data.model || "vqgan_imagenet_f16_16384",
                glid_3_xl_clip_guidance: !!image.data.glid_3_xl_clip_guidance,
                glid_3_xl_clip_guidance_scale: image.data.glid_3_xl_clip_guidance_scale || 150,
                glid_3_xl_skip_iterations: image.data.glid_3_xl_skip_iterations || 0,
                width: image.data.width as any as CreateImageInputWidthEnum || 256,
                height: image.data.height as any as CreateImageInputHeightEnum || 256,
            }))
            renderInitImage(base64ImageData, base64NpyData, image.data.width as any as CreateImageInputWidthEnum || 256, image.data.height as any as CreateImageInputHeightEnum || 256)
        }

        if (searchParams.parent) {
            loadParent(searchParams.parent)
        }
    }, [searchParams.parent, setInput, props.api])

    useEffect(() => {
        if (searchParams.parent) {
            return
        }
        const suggestion = localStorage.getItem("suggestion")
        if (suggestion) {
            // clear suggestion
            localStorage.setItem("suggestion", "")
            const phrases = suggestion.split("|")
            setInput({
                ...input,
                phrases: phrases,
                label: phrases[0],
            })
        }
    })

    return (
        <>
            {/* Header: Create new image */}
            <div className="row">
                <div className="col-12">
                    <h1>Create new image</h1>
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
                        {input.model !== "swinir" && <div className="form-group">
                            <label>Phrases</label>
                            <input
                                className="form-control"
                                type="text"
                                value={input.phrases?.join("|")}
                                onChange={(e) => setInput({ ...input, phrases: e.target.value.split("|") })}
                                placeholder="Separate | phrases | like this" />
                        </div>}
                        {/* negative phrases for glid 3 xl */}
                        {   input.model === "glid_3_xl" && (
                            <div className="form-group">
                                <label>Negative phrases</label>
                                <input
                                    className="form-control"
                                    type="text"
                                    value={input.negative_phrases?.join("|")}
                                    onChange={(e) => setInput({ ...input, negative_phrases: e.target.value.split("|") })}
                                    placeholder="Separate | phrases | like this" />
                            </div>
                        )}
                        <div className="form-group">
                            <label>Label</label>
                            <input
                                className="form-control"
                                type="text"
                                value={input.label}
                                onChange={(e) => setInput({ ...input, label: e.target.value })}
                                placeholder="Label" />
                        </div>
                        {input.model !== "dalle_mega" && <div className="form-group">
                            <label>Width</label>
                            <input type="number" className="form-control" min={128} max={1024} step={64} value={input.width} onChange={onWidthChanged} />
                        </div>}
                        {input.model !== "dalle_mega" && <div className="form-group">
                            <label>Height</label>
                            <input type="number" className="form-control" min={128} max={1024} step={64} value={input.height} onChange={onHeightChanged} />
                        </div>}
                        {input.model !== "swinir" && input.model !== "dalle_mega" && <div className="form-group">
                            <label>Iterations</label>
                            <input min={1} max={10000} className="form-control" type="number" value={input.iterations} onChange={(e) => setInput({ ...input, iterations: parseInt(e.target.value) })} />
                        </div>}
                        {/* count */}
                        {input.model !== "swinir" && <div className="form-group">
                            <label>Count</label>
                            <input className="form-control" type="number" max={10} min={1} value={count} onChange={(e) => setCount(parseInt(e.target.value))} />
                        </div>}
                        {/* model dropdown */}
                        <div className="form-group">
                            <label>Model</label>
                            <select className="form-control" value={input.model} onChange={(e) => onChangeModel(e.target.value)}>
                                <option value="dalle_mega">DALLE Mega</option>
                                <option value="vqgan_imagenet_f16_16384">VQGAN ImageNet</option>
                                <option value="glid_3_xl">Glid-3 XL</option>
                                <option value="swinir">SwinIR</option>
                            </select>
                        </div>
                        {/* boolean enable_video (bootstrap styled checkbox) */}
                        {input.model == "vqgan_imagenet_f16_16384" && <div className="form-group">
                            <label style={{ marginRight: "10px" }}>Enable video</label>
                            <div className="form-check">
                                <input className="form-check-input" type="checkbox" checked={input.enable_video} onChange={(e) => setInput({ ...input, enable_video: e.target.checked })} />
                            </div>
                        </div>}
                        {/* boolean enable_zoom (bootstrap styled checkbox) */}
                        {input.model == "vqgan_imagenet_f16_16384" && input.enable_video && <div className="form-group">
                            <label style={{ marginRight: "10px" }}>Enable zoom</label>
                            <div className="form-check">
                                <input className="form-check-input" type="checkbox" checked={input.enable_zoom} onChange={(e) => setInput({ ...input, enable_zoom: e.target.checked })} />
                            </div>
                        </div>}

                        {/* if enable_zoom, show zoom_interval input */}
                        {input.model == "vqgan_imagenet_f16_16384" && input.enable_zoom && <div className="form-group">
                            <label>Zoom interval</label>
                            <input min={1} max={100} className="form-control" type="number" value={input.zoom_frequency} onChange={(e) => setInput({ ...input, zoom_frequency: parseInt(e.target.value) })} />
                        </div>}
                        {/* if enable_zoom, show zoom_scale input */}
                        {input.model == "vqgan_imagenet_f16_16384" && input.enable_zoom && <div className="form-group">
                            <label>Zoom scale</label>
                            <input min={0.1} max={10} step={0.01} className="form-control" type="number" value={input.zoom_scale} onChange={(e) => setInput({ ...input, zoom_scale: parseFloat(e.target.value) })} />
                        </div>}
                        {/* if enable_zoom, show zoom_shift_x input */}
                        {input.model == "vqgan_imagenet_f16_16384" && input.enable_zoom && <div className="form-group">
                            <label>Zoom shift x</label>
                            <input min={-10} max={10} className="form-control" type="number" value={input.zoom_shift_x} onChange={(e) => setInput({ ...input, zoom_shift_x: parseInt(e.target.value) })} />
                        </div>}
                        {/* if enable_zoom, show zoom_shift_y input */}
                        {input.model == "vqgan_imagenet_f16_16384" && input.enable_zoom && <div className="form-group">
                            <label>Zoom shift y</label>
                            <input min={-10} max={10} className="form-control" type="number" value={input.zoom_shift_y} onChange={(e) => setInput({ ...input, zoom_shift_y: parseInt(e.target.value) })} />
                        </div>}

                        {/* glid_3_xl_skip_iterations number input*/}
                        {input.model == "glid_3_xl" && !input.encoded_mask && <div className="form-group">
                            <label>Skip iterations</label>
                            <input min={0} max={10000} className="form-control" type="number" value={input.glid_3_xl_skip_iterations} onChange={(e) => setInput({ ...input, glid_3_xl_skip_iterations: parseInt(e.target.value) })} />
                        </div>}

                        {/* glid_3_xl_clip_guidance checkbox */}
                        {input.model == "glid_3_xl" && <div className="form-group">
                            <label style={{ marginRight: "10px" }}>Clip guidance</label>
                            <div className="form-check">
                                <input className="form-check-input" type="checkbox" checked={input.glid_3_xl_clip_guidance} onChange={(e) => setInput({ ...input, glid_3_xl_clip_guidance: e.target.checked })} />
                            </div>
                        </div>}

                        {/* glid_3_xl_clip_guidance_scale number input */}
                        {input.model == "glid_3_xl" && input.glid_3_xl_clip_guidance && <div className="form-group">
                            <label>Clip guidance scale</label>
                            <input min={10} max={2000} step={1} className="form-control" type="number" value={input.glid_3_xl_clip_guidance_scale} onChange={(e) => setInput({ ...input, glid_3_xl_clip_guidance_scale: parseFloat(e.target.value) })} />
                        </div>}

                        {/* If encoded_image (base64 only) is set, show the image using a base64 image url*/}
                        {input.encoded_image && <div className="form-group">
                            <h5>Initial Image</h5>
                            {/* <img alt="" src={`data:image/jpeg;base64,${input.encoded_image}`} style={{ maxWidth: "100%" }} /> */}
                            <canvas ref={canvasRef} style={{ maxWidth: "100%" }} width={input.width} height={input.height} />
                        </div>}
                        {/* If encoded_image is set, display edit button */}
                        {input.model !== "dalle_mega" && <div className="form-group">
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
                            {input.encoded_image && input.model == "glid_3_xl" && !input.encoded_mask && <button type="button" style={{marginRight: "8px"}} className="btn btn-sm btn-primary" onClick={onEditMask}>Edit Mask</button>}
                            {input.encoded_image && input.model == "glid_3_xl" && !input.encoded_mask && input.encoded_npy && <button type="button" className="btn btn-sm btn-primary" onClick={onUncropImage}>Uncrop Image</button>}
                        </div>}

                        <div className="form-group">
                            {/* Cancel button "/" */}
                            <button onClick={onCancel} type="button" className="btn btn-secondary">Cancel</button>
                            &nbsp;
                            <button type="submit" className="btn btn-primary" disabled={creating}>
                                {creating && <i className="fa fa-spinner fa-spin" />}
                                {creating ? "Creating..." : "Create"}
                            </button>
                        </div>

                    </form>
                </div>
            </div>
            {editingMask && (
                <MaskEditor
                    encodedImage={editingMask}
                    onCancel={() => seteditingMask(null)}
                    onSave={onMaskEdited}
                />
            )}
            {uncroppingImage && (
                <Uncropper
                    encodedImage={uncroppingImage}
                    onCancel={() => setUncroppingImage(null)}
                    onSave={onImageUncropped}
                />
            )}
        </>
    )


}