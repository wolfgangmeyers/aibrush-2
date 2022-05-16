import React, { FC, useState, useEffect, useRef } from 'react';
import { useHistory } from "react-router-dom"
import { AxiosResponse } from "axios";
import { AIBrushApi, CreateImageInput, CreateImageInputSizeEnum } from "../client/api"
import loadImage from "blueimp-load-image"
import qs from "qs";
import { MaskEditor } from "../components/MaskEditor";

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
        iterations: 300,
        encoded_image: "",
        encoded_npy: "",
        encoded_mask: "",
        enable_video: false,
        enable_zoom: false,
        zoom_frequency: 10,
        zoom_scale: 0.99,
        zoom_shift_x: 0,
        zoom_shift_y: 0,
        model: "vqgan_imagenet_f16_16384",
        glid_3_xl_clip_guidance: false,
        glid_3_xl_clip_guidance_scale: 150,
        glid_3_xl_skip_iterations: 0,
        size: 256,
    });
    const [editingMask, seteditingMask] = useState<string | null>(null);
    const [count, setCount] = useState(1)
    const canvasRef = useRef<HTMLCanvasElement>(null);

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
                encoded_image: base64,
                encoded_npy: undefined,
            })
        }, {
            maxWidth: 512,
            maxHeight: 512,
            crop: true,
            canvas: true,
        })
    }

    const onEditMask = () => {
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
            seteditingMask(`data:image/jpeg;base64,${img}`)
        }
    }

    const onMaskEdited = (imageUri: string) => {
        // extract base64 portion of the image uri
        const base64 = imageUri.split(",")[1]
        setInput(input => ({
            ...input,
            encoded_mask: base64,
        }))
        seteditingMask(null)
        if (input.encoded_image) {
            renderInitImage(input.encoded_image, base64, input.size || 256)
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

    const renderInitImage = (encoded_image: string, encoded_mask: string, size: number) => {
        if (canvasRef.current && encoded_image) {
            console.log("renderInitImage")
            const ctx = canvasRef.current.getContext("2d")
            if (ctx) {
                const image = new Image()
                image.src = `data:image/jpeg;base64,${encoded_image}`
                image.onload = () => {
                    ctx.globalAlpha = 1
                    ctx.drawImage(image, 0, 0, size, size)
                    if (encoded_mask) {
                        const mask = new Image()
                        mask.src = `data:image/jpeg;base64,${encoded_mask}`
                        mask.onload = () => {
                            ctx.globalAlpha = 0.5
                            ctx.drawImage(mask, 0, 0, size, size)
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
                size: image.data.size as any as CreateImageInputSizeEnum || 256,
            }))
            renderInitImage(base64ImageData, base64NpyData, image.data.size as any as CreateImageInputSizeEnum || 256)
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
                        {/* size - dropdown with 128, 256, 384 and 512 */}
                        <div className="form-group">
                            <label>Size</label>
                            <select
                                className="form-control"
                                value={input.size}
                                onChange={(e) => setInput({ ...input, size: parseInt(e.target.value) })}
                            >
                                <option value="128">128x128</option>
                                <option value="256">256x256</option>
                                <option value="384">384x384</option>
                                <option value="512">512x512</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Iterations</label>
                            <input min={1} max={10000} className="form-control" type="number" value={input.iterations} onChange={(e) => setInput({ ...input, iterations: parseInt(e.target.value) })} />
                        </div>
                        {/* count */}
                        <div className="form-group">
                            <label>Count</label>
                            <input className="form-control" type="number" max={10} min={1} value={count} onChange={(e) => setCount(parseInt(e.target.value))} />
                        </div>
                        {/* model dropdown */}
                        <div className="form-group">
                            <label>Model</label>
                            <select className="form-control" value={input.model} onChange={(e) => onChangeModel(e.target.value)}>
                                <option value="vqgan_imagenet_f16_16384">VQGAN ImageNet</option>
                                <option value="glid_3_xl">Glid-3 XL</option>
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
                        {input.model == "glid_3_xl" && <div className="form-group">
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
                            <canvas ref={canvasRef} style={{ maxWidth: "100%" }} width={input.size} height={input.size} />
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
                            {input.encoded_image && input.model == "glid_3_xl" && <button type="button" className="btn btn-sm btn-primary" onClick={onEditMask}>Edit Mask</button>}
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
            {editingMask && (
                <MaskEditor
                    encodedImage={editingMask}
                    onCancel={() => seteditingMask(null)}
                    onSave={onMaskEdited}
                />
            )}
        </>
    )


}