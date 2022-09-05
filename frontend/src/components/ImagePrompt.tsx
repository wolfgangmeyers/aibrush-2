import React, { FC, useEffect, useState } from "react";
import { CreateImageInput, Image } from "../client";

interface Props {
    parent: Image | null;
    creating: boolean;
    onSubmit: (input: CreateImageInput) => void;
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

export const ImagePrompt: FC<Props> = ({ parent, creating, onSubmit }) => {
    const [prompt, setPrompt] = useState<string>("");
    const [negativePrompt, setNegativePrompt] = useState<string>("");
    const [count, setCount] = useState<number>(4);
    const [variationStrength, setVariationStrength] = useState<number>(0.75);
    const [parentId, setParentId] = useState<string | null>(null);
    const [advancedView, setAdvancedView] = useState<boolean>(false);

    const resetState = () => {
        setPrompt("");
        setNegativePrompt("");
        setCount(4);
        setAdvancedView(false);
        setParentId(null);
        setVariationStrength(0.75);
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const args = defaultArgs();
        args.phrases = [prompt || ""];
        args.negative_phrases = [negativePrompt || ""];
        args.count = count;
        args.parent = parentId || undefined;
        args.stable_diffusion_strength = variationStrength;
        resetState();
        onSubmit(args);
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
                    </a>&nbsp;{advancedView ? <i className="fas fa-chevron-up"></i> : <i className="fas fa-chevron-down"></i>}
                </div>
                {advancedView && (
                    <div className="homepage-prompt-advanced">
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
                                onChange={(e) => setNegativePrompt(e.target.value)}
                            />
                            <span className="helptext">
                                Try descriptive words like "blurry" or "distorted"
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
                                onChange={(e) => setCount(parseInt(e.target.value))}
                            />
                            <span className="helptext">
                                This is how many images you want to generate
                            </span>
                        </div>
                        {parentId && (
                            <div className="form-group">
                                {/* variation strength */}
                                <label htmlFor="variationStrength">
                                    Variation Strength: 
                                </label>
                                <input
                                    type="range"
                                    className="form-control-range"
                                    id="variationStrength"
                                    min="0.05"
                                    max="0.95"
                                    step="0.05"
                                    value={variationStrength}
                                    onChange={(e) => setVariationStrength(parseFloat(e.target.value))}
                                />
                                <span className="helptext">
                                    This is how much variation you want to see from the parent image
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </form>
    );
};
