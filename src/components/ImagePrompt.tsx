import React, { FC, useEffect, useState } from "react";
import {
    aspectRatios,
    DEFAULT_ASPECT_RATIO,
    getClosestAspectRatio,
    AspectRatio,
} from "../lib/aspecRatios";
import loadImage from "blueimp-load-image";
import { AspectRatioSelector } from "./AspectRatioSelector";
import { getUpscaleLevel } from "../lib/upscale";
import { convertImageFormat, resizeEncodedImage } from "../lib/imageutil";
import { GenerateImageInput, LocalImage } from "../lib/models";
import { controlnetTypes } from "../lib/supportedModels";
import { SeedInput } from "./SeedInput";
import ModelSelector from "./ModelSelector";
import { calculateImagesCost } from "../lib/credits";
import { CostIndicator } from "./CostIndicator";
import { recentPrompts, recentNegativePrompts } from "../lib/recentList";
import TextInputWithHistory from "./TextInputWithHistory";
import {
    LoraModal,
    SelectedLora,
    selectedLorasFromConfigs,
} from "./LoraSelector";
import { SelectedLoraTag } from "./SelectedLora";
import { LoraTriggers } from "./LoraTriggers";
import { recentLoras } from "../lib/recentLoras";
import { Item } from "../lib/civit_loras";
import { HordeClient } from "../lib/hordeclient";

interface Props {
    parent: LocalImage | null;
    creating: boolean;
    onSubmit: (input: GenerateImageInput) => void;
    // go straight to editor without variations
    onEdit: (input: GenerateImageInput) => void;
    onCancel: () => void;
    hordeClient: HordeClient;
    openaiEnabled: boolean;
}

export function defaultArgs(): GenerateImageInput {
    return {
        params: {
            prompt: "",
            negative_prompt: defaultNegativePrompt(),
            width: 512,
            height: 512,
            steps: 20,
            denoising_strength: 0.75,
        },
        encoded_image: "",
        encoded_mask: "",
        model: "Epic Diffusion",
        count: 4,
        hires_fix: false,
    };
}

function defaultNegativePrompt(): string {
    return (
        recentNegativePrompts.getItems()[0] ||
        "low quality, distorted, deformed, dull, boring, plain, ugly, noise"
    );
}

export const ImagePrompt: FC<Props> = ({
    parent,
    creating,
    onSubmit,
    onCancel,
    onEdit,
    hordeClient,
    openaiEnabled,
}) => {
    const [prompt, setPrompt] = useState<string>("");
    const [negativePrompt, setNegativePrompt] = useState<string>(
        defaultNegativePrompt()
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
    const [size, setSize] = useState<number>(1);
    const [hiresFix, setHiresFix] = useState<boolean>(false);

    const [selectingLora, setSelectingLora] = useState<boolean>(false);
    const [selectedLoras, setSelectedLoras] = useState<SelectedLora[]>([]);

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
        setNegativePrompt(
            recentNegativePrompts.getItems()[0] || defaultNegativePrompt
        );
        // setCount(4);
        setAdvancedView(false);
        setParentId(null);
        // setVariationStrength(0.75);
        setAspectRatio(DEFAULT_ASPECT_RATIO);
        setAspectRatioDetails(aspectRatios[DEFAULT_ASPECT_RATIO]);
        setEncodedImage("");
        // setCfgScale(7.5);
        setSeed("");
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        if (negativePrompt) {
            recentNegativePrompts.addItem(negativePrompt);
        }
        e.preventDefault();
        const args = defaultArgs();
        args.params.prompt = prompt || "";
        args.params.negative_prompt = negativePrompt || "";
        args.count = seed ? 1 : count;
        args.parent = parentId || undefined;
        args.params.denoising_strength = variationStrength;
        args.model = model;
        args.params.controlnet_type = controlnetType as any;
        args.params.cfg_scale = cfgScale;
        args.params.seed = seed || undefined;
        args.params.loras = selectedLoras.map((l) => l.config);
        args.hires_fix = hiresFix;
        if (parent) {
            const bestMatch = getClosestAspectRatio(
                parent.params.width!,
                parent.params.height!
            ).scale(size);
            args.params.width = bestMatch.width;
            args.params.height = bestMatch.height;
        } else {
            const bestMatch = getClosestAspectRatio(
                aspectRatioDetails.width,
                aspectRatioDetails.height
            ).scale(size);
            args.params.width = bestMatch.width;
            args.params.height = bestMatch.height;
        }
        if (encodedImage) {
            args.encoded_image = await resizeEncodedImage(
                encodedImage,
                args.params.width,
                args.params.height,
                "webp",
            );
        }

        resetState();
        onSubmit(args);
    };

    const handleEdit = () => {
        if (negativePrompt) {
            recentNegativePrompts.addItem(negativePrompt);
        }
        const args = defaultArgs();
        args.params.prompt = prompt || "";
        args.params.negative_prompt = negativePrompt || "";
        args.count = 1;
        args.parent = parentId || undefined;
        args.params.denoising_strength = variationStrength;
        args.params.width = originalWidth;
        args.params.height = originalHeight;
        args.params.cfg_scale = cfgScale;
        args.params.loras = selectedLoras.map((l) => l.config);
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
        if (model === "dall-e-3") {
            setCount(1);
        }
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

                // convert image to webp base64
                const dataUrl = canvas.toDataURL("image/webp");
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
            // if it's png, convert to webp
            if (imageData) {
                let encodedImage = imageData.split(",")[1];
                if (imageData.startsWith("data:image/png")) {
                    convertImageFormat(encodedImage, "png", "webp").then(encodedImage => {
                        setEncodedImage(encodedImage);
                    })
                } else {
                    setEncodedImage(encodedImage);
                }
            }
            setPrompt(parent.params.prompt || "");
            setNegativePrompt(
                parent.params.negative_prompt || defaultNegativePrompt()
            );
            setCount(4);
            setParentId(parent.id);
            setAdvancedView(true);
            setVariationStrength(parent.params.denoising_strength || 0.75);
            let model = parent.model;
            if (model === "dall-e-3") {
                model = "Epic Diffusion";
            }
            setModel(model);
            setCfgScale(parent.params.cfg_scale || 7.5);
            if (parent.params.loras && parent.params.loras.length > 0) {
                selectedLorasFromConfigs(parent.params.loras).then((loras) => {
                    setSelectedLoras(loras);
                });
            } else if (selectedLoras.length > 0) {
                setSelectedLoras([]);
            }
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

    const scaledAspectRatio = aspectRatioDetails.scale(size);
    const imagesCost = calculateImagesCost(
        count,
        scaledAspectRatio.width,
        scaledAspectRatio.height
    );

    const onAddLora = (lora: SelectedLora) => {
        setSelectedLoras([...selectedLoras, lora]);
        setSelectingLora(false);
    };

    const onRemoveLora = (lora: SelectedLora) => {
        setSelectedLoras(
            selectedLoras.filter(
                (selectedLora) => selectedLora.config.name !== lora.config.name
            )
        );
    };

    const onAddTrigger = (trigger: string) => {
        const parts = [prompt];
        if (prompt.length > 0 && !prompt.endsWith(",")) {
            parts.push(", ");
        }
        parts.push(trigger);
        setPrompt(parts.join(""));
    };

    return (
        <>
            <form onSubmit={handleSubmit}>
                <div className="homepage-prompt">
                    <div className="input-group">
                        <input
                            className="form-control prompt"
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
                    {selectedLoras.length > 0 && (
                        <LoraTriggers
                            prompt={prompt}
                            selectedLoras={selectedLoras}
                            onAddTrigger={onAddTrigger}
                        />
                    )}
                    {!seed && (
                        <div className="form-group" style={{marginTop: "8px"}}>
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
                                disabled={model === "dall-e-3"}
                            />
                            <span className="helptext">
                                This is how many images you want to generate
                            </span>
                        </div>
                    )}
                    <CostIndicator imagesCost={imagesCost} />
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
                            {model !== "dall-e-3" && encodedImage && (
                                <div className="form-group">
                                    <label>Init Image</label>
                                    <img
                                        style={{
                                            display: "block",
                                            marginLeft: "auto",
                                            marginRight: "auto",
                                            maxWidth: "100%",
                                        }}
                                        src={`data:image/webp;base64,${encodedImage}`}
                                    />
                                </div>
                            )}
                            {model !== "dall-e-3" && !parent && !encodedImage && (
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
                            {model !== "dall-e-3" && <div className="form-group">
                                <div
                                    style={{
                                        display: "block",
                                        maxWidth: encodedImage
                                            ? "350px"
                                            : "180px",
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
                                            ? "Replace"
                                            : "Upload"}
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
                                            <i className="fas fa-trash"></i>
                                            &nbsp; Remove
                                        </label>
                                    )}
                                </div>
                            </div>}
                            <div className="form-group">
                                <label htmlFor="model">Model</label>
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
                            {model !== "dall-e-3" && <div className="form-group">
                                {/* loras */}
                                <label htmlFor="loras">Loras</label>
                                <div>
                                    {selectedLoras.map((lora) => (
                                        <SelectedLoraTag
                                            key={lora.lora.name}
                                            lora={lora}
                                            onRemove={(lora) =>
                                                onRemoveLora(lora)
                                            }
                                        />
                                    ))}
                                    {/* add lora button */}
                                    {selectedLoras.length < 5 && (
                                        <button
                                            type="button"
                                            className="btn btn-secondary light-button"
                                            style={{ marginLeft: "8px" }}
                                            onClick={() =>
                                                setSelectingLora(true)
                                            }
                                        >
                                            <i className="fas fa-plus"></i>
                                            &nbsp;Add Lora
                                        </button>
                                    )}
                                </div>
                            </div>}
                            {model !== "dall-e-3" && <div className="form-group">
                                {/* negative prompt */}
                                <label htmlFor="negativePrompt">
                                    Negative Prompt
                                </label>
                                {/* <input
                                type="text"
                                className="form-control"
                                id="negativePrompt"
                                placeholder="What would you like to avoid?"
                                value={negativePrompt}
                                onChange={(e) =>
                                    setNegativePrompt(e.target.value)
                                }
                            /> */}
                                <TextInputWithHistory
                                    history={recentNegativePrompts.getItems()}
                                    value={negativePrompt}
                                    onChange={setNegativePrompt}
                                />
                                <span className="helptext">
                                    Try descriptive words like "blurry" or
                                    "distorted"
                                </span>
                            </div>}
                            {/* size slider */}
                            {model !== "dall-e-3" && <div className="form-group">
                                <label htmlFor="size">
                                    Size: {scaledAspectRatio.width} x{" "}
                                    {scaledAspectRatio.height}
                                </label>
                                {/* range slider from 1 to 2 in increments of 0.1 */}
                                <input
                                    type="range"
                                    className="form-control-range"
                                    id="size"
                                    min="1"
                                    max="2"
                                    step="0.1"
                                    value={size}
                                    onChange={(e) =>
                                        setSize(parseFloat(e.target.value))
                                    }
                                />
                                <span className="helptext">
                                    This allows you to adjust the size of your
                                    images. Larger images cost more credits.
                                </span>
                            </div>}

                            {model !== "dall-e-3" && (parentId || encodedImage) && (
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
                                        This is how much variation you want to
                                        see from the parent image
                                    </span>
                                </div>
                            )}
                            {model !== "dall-e-3" && encodedImage && (
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
                                        Controlnet is an advanced way of
                                        controlling the output of image
                                        generation. You can read more about it{" "}
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
                            {model !== "dall-e-3" && <div className="form-group">
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
                            </div>}
                            {model !== "dall-e-3" && <SeedInput seed={seed} setSeed={setSeed} />}
                            {/* hires fix checkbox */}
                            {model !== "dall-e-3" && <div className="form-group">
                                <div className="form-check">
                                    <input
                                        className="form-check-input"
                                        type="checkbox"
                                        id="hiresFix"
                                        checked={hiresFix}
                                        onChange={(e) =>
                                            setHiresFix(e.target.checked)
                                        }
                                    />
                                    <label
                                        className="form-check-label"
                                        htmlFor="hiresFix"
                                    >
                                        Hi-Res Fix
                                    </label>
                                </div>
                                <br/>
                                <span className="helptext">
                                    Helps with proportions in high resolution images.
                                </span>
                            </div>}


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

                                    {model !== "dall-e-3" && <button
                                        type="button"
                                        className="btn btn-secondary light-button"
                                        onClick={handleEdit}
                                        style={{ marginLeft: "8px" }}
                                        disabled={!prompt || creating}
                                    >
                                        <i className="fas fa-edit"></i>
                                        &nbsp;EDIT
                                    </button>}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </form>
            {selectingModel && (
                <ModelSelector
                    onCancel={() => setSelectingModel(false)}
                    onSelectModel={onSelectModel}
                    initialSelectedModel={model}
                    inpainting={false}
                    hordeClient={hordeClient}
                    openaiEnabled={openaiEnabled}
                />
            )}
            {selectingLora && (
                <LoraModal
                    onCancel={() => setSelectingLora(false)}
                    onConfirm={(lora) => onAddLora(lora)}
                />
            )}
        </>
    );
};
