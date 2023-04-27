import React, { FC, useEffect, useState } from "react";
import { CreateImageInput, StatusEnum, Image, AIBrushApi } from "../client";
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
import { SeedInput } from "./SeedInput";
import ModelSelector from "./ModelSelector";

interface Props {
    api: AIBrushApi;
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
        params: {
            prompt: "a painting of a happy corgi wearing sunglasses",
            negative_prompt: defaultNegativePrompt,
            width: 512,
            height: 512,
            steps: 20,
            denoising_strength: 0.75,
        },
        label: "",
        encoded_image: "",
        encoded_npy: "",
        encoded_mask: "",
        model: "Epic Diffusion",
        count: 4,
    };
}

const defaultNegativePrompt =
    "low quality, distorted, deformed, dull, boring, plain, ugly, noise";

export const ImagePrompt: FC<Props> = ({
    api,
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
    const [model, setModel] = useState<string>("Epic Diffusion");

    const [selectingModel, setSelectingModel] = useState<boolean>(false);

    const [controlnetType, setControlnetType] = useState<string | undefined>();
    const [cfgScale, setCfgScale] = useState<number>(7.5);
    const [seed, setSeed] = useState<string>("");
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
        setCfgScale(7.5);
        setSeed("");
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const args = defaultArgs();
        args.params.prompt = prompt || "";
        args.params.negative_prompt = negativePrompt || "";
        args.count = seed ? 1 : count;
        args.parent = parentId || undefined;
        args.params.denoising_strength = variationStrength;
        args.nsfw = true;
        args.model = model;
        args.temporary = true;
        args.params.controlnet_type = controlnetType as any;
        args.params.cfg_scale = cfgScale;
        args.params.seed = seed || undefined;
        if (parent) {
            const bestMatch = getClosestAspectRatio(
                parent.params.width!,
                parent.params.height!
            );
            args.params.width = bestMatch.width;
            args.params.height = bestMatch.height;
        } else {
            const bestMatch = getClosestAspectRatio(
                aspectRatioDetails.width,
                aspectRatioDetails.height
            );
            args.params.width = bestMatch.width;
            args.params.height = bestMatch.height;
        }
        if (encodedImage) {
            args.encoded_image = await resizeEncodedImage(
                encodedImage,
                args.params.width,
                args.params.height
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
        args.params.prompt = prompt || "";
        args.params.negative_prompt = negativePrompt || "";
        args.count = 1;
        args.parent = parentId || undefined;
        // args.stable_diffusion_strength = variationStrength;
        args.params.denoising_strength = variationStrength;
        args.status = StatusEnum.Completed;
        args.params.width = originalWidth;
        args.params.height = originalHeight;
        args.params.cfg_scale = cfgScale;
        args.nsfw = true;
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

    const onSelectModel = (model: string) => {
        setModel(model);
        setSelectingModel(false);
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
            setPrompt(parent.params.prompt || "");
            setNegativePrompt(
                parent.params.negative_prompt || defaultNegativePrompt
            );
            setCount(4);
            setParentId(parent.id);
            setAdvancedView(true);
            setVariationStrength(parent.params.denoising_strength || 0.75);
            setModel(
                supportedModels.indexOf(parent.model) > -1
                    ? parent.model
                    : "Epic Diffusion"
            );
            setCfgScale(parent.params.cfg_scale || 7.5);
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
                            {/* <select
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
                            </select> */}
                            {/* replace the select with a button that sets selectingModel to true */}
                            <div>
                                <button
                                    type="button"
                                    className="btn btn-secondary light-button"
                                    onClick={() => setSelectingModel(true)}
                                >
                                    {model}&nbsp;
                                    <i className="fas fa-caret-down"></i>
                                </button>
                            </div>
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
                        {!seed && (
                            <div className="form-group">
                                <label htmlFor="count">Count: {count}</label>
                                {/* range slider from 1 to 20 */}
                                <input
                                    type="range"
                                    className="form-control-range"
                                    id="count"
                                    min="1"
                                    max="10"
                                    value={count}
                                    onChange={(e) =>
                                        setCount(parseInt(e.target.value))
                                    }
                                />
                                <span className="helptext">
                                    This is how many images you want to generate
                                </span>
                            </div>
                        )}
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
                                    Controlnet is an advanced way of controlling
                                    the output of image generation. You can read
                                    more about it{" "}
                                    <a
                                        target="_blank"
                                        href="https://bootcamp.uxdesign.cc/controlnet-and-stable-diffusion-a-game-changer-for-ai-image-generation-83555cb942fc"
                                    >
                                        here.
                                    </a>
                                </span>
                            </div>
                        )}
                        {/* cfg scale. Slider from 1 to 20 in increments of 0.1 */}
                        <div className="form-group">
                            <label>CFG Scale: {cfgScale.toFixed(1)}</label>
                            <input
                                type="range"
                                className="form-control-range"
                                min="1"
                                max="20"
                                step="0.5"
                                value={cfgScale}
                                onChange={(e) =>
                                    setCfgScale(parseFloat(e.target.value))
                                }
                            />
                            <span className="helptext">
                                Adjust the CFG scale to control how much the
                                image looks like the prompt.
                            </span>
                        </div>
                        <SeedInput seed={seed} setSeed={setSeed} />

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
            {selectingModel && (
                <ModelSelector
                    api={api}
                    onCancel={() => setSelectingModel(false)}
                    onSelectModel={onSelectModel}
                    initialSelectedModel={model}
                />
            )}
        </form>
    );
};
