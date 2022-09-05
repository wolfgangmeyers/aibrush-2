import React, { FC, useEffect, useState } from "react";
import { CreateImageInput, Image } from "../client";
import { aspectRatios, DEFAULT_ASPECT_RATIO } from "../lib/aspecRatios";

interface Props {
    parent: Image | null;
    creating: boolean;
    assetsUrl: string;
    onSubmit: (input: CreateImageInput) => void;
    onCancel: () => void;
}

function defaultArgs(): CreateImageInput {
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
        model: "stable_diffusion_text2im",
        glid_3_xl_clip_guidance: false,
        glid_3_xl_clip_guidance_scale: 150,
        glid_3_xl_skip_iterations: 0,
        width: 512,
        height: 512,
        stable_diffusion_strength: 0.75,
        count: 4,
    };
}

export const ImagePrompt: FC<Props> = ({
    parent,
    creating,
    assetsUrl,
    onSubmit,
    onCancel,
}) => {
    const [prompt, setPrompt] = useState<string>("");
    const [negativePrompt, setNegativePrompt] = useState<string>("");
    const [count, setCount] = useState<number>(4);
    const [variationStrength, setVariationStrength] = useState<number>(0.75);
    const [aspectRatio, setAspectRatio] = useState<number>(DEFAULT_ASPECT_RATIO);
    const [parentId, setParentId] = useState<string | null>(null);
    const [advancedView, setAdvancedView] = useState<boolean>(false);

    const aspectRatioDetails = aspectRatios[aspectRatio];

    const resetState = () => {
        setPrompt("");
        setNegativePrompt("");
        setCount(4);
        setAdvancedView(false);
        setParentId(null);
        setVariationStrength(0.75);
        setAspectRatio(DEFAULT_ASPECT_RATIO);
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const args = defaultArgs();
        args.phrases = [prompt || ""];
        args.negative_phrases = [negativePrompt || ""];
        args.count = count;
        args.parent = parentId || undefined;
        args.stable_diffusion_strength = variationStrength;
        if (parent) {
            args.width = parent.width as any;
            args.height = parent.height as any;
        } else {
            args.width = aspectRatioDetails.width;
            args.height = aspectRatioDetails.height;
        }
        
        resetState();
        onSubmit(args);
    };

    const handleCancel = () => {
        resetState();
        onCancel();
    };

    useEffect(() => {
        if (parent) {
            setPrompt(parent.phrases.join(", "));
            setNegativePrompt(parent.negative_phrases.join(", "));
            setCount(4);
            setParentId(parent.id);
            setAdvancedView(true);
            setVariationStrength(parent.stable_diffusion_strength);
        } else {
            resetState();
        }
    }, [parent]);

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
                    {!advancedView && (
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
                    )}
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
                        {parent && <div className="form-group">
                            <label>Parent Image</label>
                            {/* ${assetsUrl}/${image.id}.image.jpg?updated_at=${image.updated_at} */}
                                <img
                                    style={{display: "block", marginLeft: "auto", marginRight: "auto", maxWidth: "100%"}}
                                    src={`${assetsUrl}/${parentId}.image.jpg?updated_at=${parent.updated_at}`} />
                        </div>}
                        {!parent && <div className="form-group">
                            <div style={{minHeight: "140px", display: "flex", alignItems: "center"}}>
                            {/* aspect ratio slider, goes from 0 -> aspectRatios.length - 1 */}
                                <div style={{
                                    width: aspectRatioDetails.width / 8,
                                    height: aspectRatioDetails.height / 8,
                                    // dotted line options: dotted, dashed, solid, double, groove, ridge, inset, outset, none, hidden
                                    border: "1px dashed white",
                                    margin: "auto",
                                }}></div>
                            </div>
                            <label>Aspect Ratio: {aspectRatioDetails.displayName}</label>
                            <input
                                type="range"
                                className="form-control-range"
                                min={0}
                                max={aspectRatios.length - 1}
                                value={aspectRatio}
                                onChange={(e) => {
                                    setAspectRatio(parseInt(e.target.value));
                                }}
                            />
                        </div>}
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
                        {parentId && (
                            <div className="form-group">
                                {/* variation strength */}
                                <label htmlFor="variationStrength">
                                    Variation Strength: {(variationStrength * 100).toFixed(0)}%
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
                        {advancedView && (
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
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </form>
    );
};
