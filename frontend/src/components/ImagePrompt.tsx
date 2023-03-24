import React, { FC, useEffect, useState } from "react";
import { CreateImageInput, CreateImageInputStatusEnum, Image } from "../client";
import {
    aspectRatios,
    DEFAULT_ASPECT_RATIO,
    getClosestAspectRatio,
    upscale,
    compareSize,
    AspectRatio,
} from "../lib/aspecRatios";
import loadImage from "blueimp-load-image";
import { AspectRatioSelector } from "./AspectRatioSelector";
import { getUpscaleLevel } from "../lib/upscale";
import { resizeEncodedImage } from "../lib/imageutil";
import { LocalImage } from "../lib/localImagesStore";
import { controlnetTypes, supportedModels } from "../lib/supportedModels";

interface Props {
    parent: LocalImage | null;
    creating: boolean;
    assetsUrl: string;
    onSubmit: (input: CreateImageInput) => void;
    // go straight to editor without variations
    onEdit: (input: CreateImageInput) => void;
    onCancel: () => void;
}

export function defaultArgs(): CreateImageInput {
    return {
        phrases: ["a painting of a happy corgi wearing sunglasses"],
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
        model: "Epic Diffusion",
        glid_3_xl_clip_guidance: false,
        glid_3_xl_clip_guidance_scale: 150,
        glid_3_xl_skip_iterations: 0,
        width: 512,
        height: 512,
        stable_diffusion_strength: 0.75,
        count: 4,
    };
}

const defaultNegativePrompt =
    "low quality, distorted, deformed, dull, boring, plain, ugly, noise";

export const ImagePrompt: FC<Props> = ({
    parent,
    creating,
    assetsUrl,
    onSubmit,
    onCancel,
    onEdit,
}) => {
    const [prompt, setPrompt] = useState<string>("");
    const [negativePrompt, setNegativePrompt] = useState<string>(
        defaultNegativePrompt
    );
    const [count, setCount] = useState<number>(4);
    const [variationStrength, setVariationStrength] = useState<number>(0.75);
    const [aspectRatio, setAspectRatio] =
        useState<number>(DEFAULT_ASPECT_RATIO);
    const [parentId, setParentId] = useState<string | null>(null);
    const [advancedView, setAdvancedView] = useState<boolean>(false);
    const [encodedImage, setEncodedImage] = useState<string>("");
    const [nsfw, setNsfw] = useState<boolean>(false);
    const [model, setModel] = useState<string>("Epic Diffusion");
    const [controlnetType, setControlnetType] = useState<string | undefined>();
    const defaultAspectRatio = aspectRatios[DEFAULT_ASPECT_RATIO];

    const [aspectRatioDetails, setAspectRatioDetails] = useState<AspectRatio>(
        aspectRatios[DEFAULT_ASPECT_RATIO]
    );
    let [originalWidth, setOriginalWidth] = useState<number>(
        defaultAspectRatio.width
    );
    let [originalHeight, setOriginalHeight] = useState<number>(
        defaultAspectRatio.height
    );

    // const aspectRatioDetails = aspectRatios[aspectRatio];

    const resetState = () => {
        setPrompt("");
        setNegativePrompt(defaultNegativePrompt);
        setCount(4);
        setAdvancedView(false);
        setParentId(null);
        setVariationStrength(0.75);
        setAspectRatio(DEFAULT_ASPECT_RATIO);
        setAspectRatioDetails(aspectRatios[DEFAULT_ASPECT_RATIO]);
        setEncodedImage("");
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const args = defaultArgs();
        args.phrases = [prompt || ""];
        args.negative_phrases = [negativePrompt || ""];
        args.count = count;
        args.parent = parentId || undefined;
        args.stable_diffusion_strength = variationStrength;
        args.nsfw = nsfw;
        args.model = model;
        args.temporary = true;
        args.controlnet_type = controlnetType as any;
        if (parent) {
            const bestMatch = getClosestAspectRatio(
                parent.width!,
                parent.height!
            );
            args.width = bestMatch.width;
            args.height = bestMatch.height;
        } else {
            const bestMatch = getClosestAspectRatio(
                aspectRatioDetails.width,
                aspectRatioDetails.height
            );
            args.width = bestMatch.width;
            args.height = bestMatch.height;
        }
        if (encodedImage) {
            args.encoded_image = await resizeEncodedImage(
                encodedImage,
                args.width,
                args.height
            );
        }

        resetState();
        onSubmit(args);
    };

    const handleEdit = () => {
        if (!encodedImage) {
            console.error("Cannot edit without existing image");
            return;
        }
        const args = defaultArgs();
        args.phrases = [prompt || ""];
        args.negative_phrases = [negativePrompt || ""];
        args.count = 1;
        args.parent = parentId || undefined;
        args.stable_diffusion_strength = variationStrength;
        args.status = CreateImageInputStatusEnum.Completed;
        args.width = originalWidth;
        args.height = originalHeight;
        args.nsfw = nsfw;
        args.model = model;
        if (encodedImage) {
            args.encoded_image = encodedImage;
        }

        resetState();
        onEdit(args);
    };

    const handleCancel = () => {
        resetState();
        onCancel();
    };

    const onImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files && e.target.files[0];
        if (!file) {
            return;
        }
        loadImage(
            file,
            (img: Event | HTMLImageElement | HTMLCanvasElement) => {
                if (!(img instanceof HTMLCanvasElement)) {
                    return;
                }
                // try to match width and height to a supported aspect ratio
                const width = img.width;
                const height = img.height;
                let bestMatch = getClosestAspectRatio(width, height);
                while (compareSize(upscale(bestMatch), width, height) <= 0) {
                    bestMatch = upscale(bestMatch);
                    if (
                        getUpscaleLevel(bestMatch.width, bestMatch.height) >= 2
                    ) {
                        break;
                    }
                }
                console.log("best match", bestMatch);

                const canvas = document.createElement("canvas");
                // canvas.width = bestMatch.width;
                // canvas.height = bestMatch.height;
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    return;
                }
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                // convert image to base64
                // const canvas = img as HTMLCanvasElement
                const dataUrl = canvas.toDataURL("image/png");
                const base64 = dataUrl.split(",")[1];
                setEncodedImage(base64);
                // get the index of the best match
                setAspectRatio(
                    aspectRatios.findIndex((a) => a.id === bestMatch.id)
                );
                setAspectRatioDetails(bestMatch);
                setOriginalWidth(width);
                setOriginalHeight(height);
                // remove canvas
                canvas.remove();
            },
            {
                maxWidth: 4096,
                maxHeight: 4096,
                canvas: true,
            }
        );
    };

    useEffect(() => {
        if (parent) {
            const imageData = parent.imageData;
            if (imageData) {
                setEncodedImage(imageData.split(",")[1]);
            }
            setPrompt(parent.phrases.join(", "));
            setNegativePrompt(
                parent.negative_phrases.join(", ") || defaultNegativePrompt
            );
            setCount(4);
            setParentId(parent.id);
            setAdvancedView(true);
            setVariationStrength(parent.stable_diffusion_strength);
            setNsfw(parent.nsfw);
            setModel(
                supportedModels.indexOf(parent.model) > -1 ? parent.model : "Epic Diffusion"
            );
        } else {
            resetState();
        }
    }, [parent]);

    // unset controlnet when encodedImage is null
    useEffect(() => {
        if (!encodedImage) {
            setControlnetType(undefined);
        }
    }, [encodedImage]);

    return (
        <form onSubmit={handleSubmit}>
            <div className="homepage-prompt">
                <div className="input-group">
                    <input
                        className="form-control"
                        placeholder="What would you like to create?"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                    />

                    <div className="input-group-append">
                        <button
                            type="submit"
                            className="btn btn-secondary light-button"
                            style={{ marginLeft: "8px" }}
                            disabled={!prompt || creating}
                        >
                            {/* paintbrush button */}
                            {!creating && (
                                <i className="fas fa-paint-brush"></i>
                            )}
                            {/* spinner button */}
                            {creating && (
                                <i className="fas fa-spinner fa-spin"></i>
                            )}
                        </button>
                    </div>
                </div>
                <div
                    style={{
                        marginTop: "24px",
                    }}
                >
                    <a
                        href="javascript:void(0)"
                        onClick={() => setAdvancedView(!advancedView)}
                        style={{
                            color: "white",
                            textDecoration: "underline",
                        }}
                    >
                        Advanced
                    </a>
                    &nbsp;
                    {advancedView ? (
                        <i className="fas fa-chevron-up"></i>
                    ) : (
                        <i className="fas fa-chevron-down"></i>
                    )}
                </div>
                {advancedView && (
                    <div className="homepage-prompt-advanced">
                        {encodedImage && (
                            <div className="form-group">
                                <label>Init Image</label>
                                <img
                                    style={{
                                        display: "block",
                                        marginLeft: "auto",
                                        marginRight: "auto",
                                        maxWidth: "100%",
                                    }}
                                    src={`data:image/png;base64,${encodedImage}`}
                                />
                            </div>
                        )}
                        {!parent && !encodedImage && (
                            <AspectRatioSelector
                                aspectRatio={aspectRatio}
                                onChange={(aspectRatioId) => {
                                    setAspectRatio(aspectRatioId);
                                    setAspectRatioDetails(
                                        aspectRatios[aspectRatioId]
                                    );
                                }}
                            />
                        )}
                        <div className="form-group">
                            <div
                                style={{
                                    display: "block",
                                    maxWidth: encodedImage ? "350px" : "180px",
                                    marginTop: "40px",
                                    marginRight: "auto",
                                    marginLeft: "auto",
                                }}
                            >
                                <label
                                    id="loadimage-wrapper"
                                    className={`btn btn-primary `}
                                    style={{ display: "inline" }}
                                >
                                    {/* upload image */}
                                    <i className="fas fa-upload"></i>&nbsp;
                                    {encodedImage || parent
                                        ? "Replace Image"
                                        : "Upload Image"}
                                    <input
                                        id="loadimage"
                                        type="file"
                                        style={{ display: "none" }}
                                        onChange={onImageSelected}
                                    />
                                </label>
                                {encodedImage && (
                                    <label
                                        className="btn btn-secondary"
                                        onClick={() => setEncodedImage("")}
                                        style={{ display: "inline" }}
                                    >
                                        {/* remove image */}
                                        <i className="fas fa-trash"></i>&nbsp;
                                        Remove Image
                                    </label>
                                )}
                            </div>
                        </div>
                        <div className="form-group">
                            <label htmlFor="model">Model</label>
                            <select
                                className="form-control"
                                id="model"
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                            >
                                {supportedModels.map((model) => (
                                    <option
                                        value={model}
                                        key={`model-${model}`}
                                    >
                                        {model}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            {/* negative prompt */}
                            <label htmlFor="negativePrompt">
                                Negative Prompt
                            </label>
                            <input
                                type="text"
                                className="form-control"
                                id="negativePrompt"
                                placeholder="What would you like to avoid?"
                                value={negativePrompt}
                                onChange={(e) =>
                                    setNegativePrompt(e.target.value)
                                }
                            />
                            <span className="helptext">
                                Try descriptive words like "blurry" or
                                "distorted"
                            </span>
                        </div>
                        <div className="form-group">
                            <label htmlFor="count">Count: {count}</label>
                            {/* range slider from 1 to 20 */}
                            <input
                                type="range"
                                className="form-control-range"
                                id="count"
                                min="1"
                                max="20"
                                value={count}
                                onChange={(e) =>
                                    setCount(parseInt(e.target.value))
                                }
                            />
                            <span className="helptext">
                                This is how many images you want to generate
                            </span>
                        </div>
                        {(parentId || encodedImage) && (
                            <div className="form-group">
                                {/* variation strength */}
                                <label htmlFor="variationStrength">
                                    Variation Strength:&nbsp;
                                    {(variationStrength * 100).toFixed(0)}%
                                </label>
                                <input
                                    type="range"
                                    className="form-control-range"
                                    id="variationStrength"
                                    min="0.05"
                                    max="0.95"
                                    step="0.05"
                                    value={variationStrength}
                                    onChange={(e) =>
                                        setVariationStrength(
                                            parseFloat(e.target.value)
                                        )
                                    }
                                />
                                <span className="helptext">
                                    This is how much variation you want to see
                                    from the parent image
                                </span>
                            </div>
                        )}
                        {encodedImage && (
                            // controlnet type - canny, hed, depth, normal, openpose, seg, scribble, fakescribbles, hough
                            <div className="form-group">
                                <label htmlFor="controlNetType">
                                    Control Net Type
                                </label>
                                <select
                                    className="form-control"
                                    id="controlNetType"
                                    value={controlnetType}
                                    onChange={(e) =>
                                        setControlnetType(e.target.value)
                                    }
                                >
                                    <option value="">None</option>
                                    {controlnetTypes.map((type) => (
                                        <option
                                            value={type}
                                            key={`type-${type}`}
                                        >
                                            {type}
                                        </option>
                                    ))}
                                </select>
                                <span className="helptext">
                                    Controlnet is an advanced way of controlling the output of image generation. You can read more about it <a target="_blank" href="https://bootcamp.uxdesign.cc/controlnet-and-stable-diffusion-a-game-changer-for-ai-image-generation-83555cb942fc">here.</a>
                                </span>
                            </div>
                        )}
                        {/* nsfw toggle button */}
                        <div className="form-group">
                            <label>NSFW</label>
                            <button
                                style={{ marginLeft: "16px" }}
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => setNsfw(!nsfw)}
                            >
                                {nsfw && (
                                    <>
                                        <i className="fa fa-check"></i>
                                        &nbsp;Enabled
                                    </>
                                )}
                                {!nsfw && (
                                    <>
                                        <i className="fa fa-times"></i>
                                        &nbsp;Disabled
                                    </>
                                )}
                            </button>

                            <br />
                            <span className="helptext">
                                Toggle this if you want to generate NSFW images
                            </span>
                        </div>
                        <div
                            className="form-group"
                            style={{ minHeight: "20px" }}
                        >
                            <div className="float-right">
                                {parent && (
                                    <button
                                        type="button"
                                        className="btn btn-secondary light-button"
                                        onClick={handleCancel}
                                    >
                                        <i className="fas fa-times"></i>
                                        &nbsp;CANCEL
                                    </button>
                                )}
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    style={{ marginLeft: "8px" }}
                                    disabled={!prompt || creating}
                                >
                                    {/* paintbrush button */}
                                    {!creating && (
                                        <i className="fas fa-paint-brush"></i>
                                    )}
                                    {/* spinner button */}
                                    {creating && (
                                        <i className="fas fa-spinner fa-spin"></i>
                                    )}
                                    &nbsp;PAINT
                                </button>
                                {encodedImage && (
                                    <button
                                        type="button"
                                        className="btn btn-secondary light-button"
                                        onClick={handleEdit}
                                        style={{ marginLeft: "8px" }}
                                        disabled={!prompt || creating}
                                    >
                                        <i className="fas fa-edit"></i>
                                        &nbsp;EDIT
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </form>
    );
};
