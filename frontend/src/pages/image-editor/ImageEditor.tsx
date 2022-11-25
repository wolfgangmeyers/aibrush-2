import React, { useState, useEffect, useRef } from "react";
import { useParams, useHistory } from "react-router-dom";

import { AIBrushApi, CreateImageInputStatusEnum, Image as APIImage } from "../../client";
import { getUpscaleLevel } from "../../lib/upscale";
import "./ImageEditor.css";
import { createRenderer, Renderer } from "./renderer";
import { Tool, BaseTool } from "./tool";
import { SelectionTool, Controls as SelectionControls } from "./selection-tool";
import { EnhanceTool, EnhanceControls } from "./enhance-tool";
import { PencilTool, Controls as PencilControls } from "./pencil-tool";
import { SmudgeTool, SmudgeControls } from "./smudge-tool";
import { ImportExportControls } from "./import-export";
import { InpaintControls, InpaintTool } from "./inpaint-tool";
import { defaultArgs } from "../../components/ImagePrompt";

interface CanPreventDefault {
    preventDefault: () => void;
}

interface Props {
    api: AIBrushApi;
    assetsUrl: string;
}

interface ToolConfig {
    name: string;
    iconClass: string;
    constructor: (r: Renderer) => Tool;
    renderControls: (t: Tool, renderer: Renderer) => JSX.Element;
    defaultArgs: any;
}

export const ImageEditor: React.FC<Props> = ({ api }) => {
    const [showSelectionControls, setShowSelectionControls] = useState(false);
    const tools: Array<ToolConfig> = [
        {
            name: "inpaint",
            iconClass: "fas fa-paint-brush",
            constructor: (r: Renderer) => new InpaintTool(r),
            defaultArgs: {},
            renderControls: (t: Tool, renderer: Renderer) => {
                t.onShowSelectionControls(setShowSelectionControls);
                return (
                    <InpaintControls
                        tool={t as InpaintTool}
                        renderer={renderer}
                        api={api}
                        image={image!}
                    />
                )
            },
        },
        {
            name: "enhance",
            iconClass: "fas fa-magic",
            constructor: (r: Renderer) => new EnhanceTool(r),
            defaultArgs: {
                variationStrength: 0.75,
            },
            renderControls: (t: Tool, renderer: Renderer) => {
                t.onShowSelectionControls(setShowSelectionControls);
                return (
                    <EnhanceControls
                        tool={t as EnhanceTool}
                        renderer={renderer}
                        api={api}
                        image={image!}
                    />
                );
            },
        },
        {
            name: "pencil",
            iconClass: "fas fa-pencil-alt",
            constructor: (r: Renderer) => new PencilTool(r),
            defaultArgs: {},
            renderControls: (t: Tool, renderer: Renderer) => {
                return (
                    <PencilControls
                        tool={t as PencilTool}
                        renderer={renderer}
                    />
                );
            },
        },
        {
            name: "smudge",
            // finger icon
            iconClass: "fas fa-hand-pointer",
            constructor: (r: Renderer) => new SmudgeTool(r),
            defaultArgs: {},
            renderControls: (t: Tool, renderer: Renderer) => {
                return (
                    <SmudgeControls
                        tool={t as SmudgeTool}
                        renderer={renderer}
                    />
                );
            },
        },
        {
            name: "import-export",
            iconClass: "fas fa-file-import",
            constructor: (r: Renderer) => new BaseTool(r, "import-export"),
            defaultArgs: {},
            renderControls: (t: Tool, renderer: Renderer) => {
                return (
                    <ImportExportControls
                        renderer={renderer}
                        tool={t as BaseTool}
                        api={api}
                    />
                );
            },
        },
    ];

    const [image, setImage] = useState<APIImage | null>(null);
    const [renderer, setRenderer] = useState<Renderer | null>(null);
    const [tool, setTool] = useState<Tool | null>(null);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);

    const { id } = useParams<{ id: string }>();
    const history = useHistory();

    const canvasRef = useRef<HTMLCanvasElement>(null);

    const onSelectTool = (toolconfig: ToolConfig) => {
        if (renderer) {
            if (tool) {
                if (!tool.destroy()) {
                    return;
                }
            }
            const newTool = toolconfig.constructor(renderer);
            setTool(newTool);
            newTool.onSaveImage((encodedImage) => {
                console.log("Saving image...");
                saveNewImage(encodedImage);
            });
        }
    };

    const saveNewImage = async (encodedImage: string) => {
        if (!image || !encodedImage) {
            throw new Error("Cannot save new image without existing image");
        }
        const args = defaultArgs();
        args.phrases = image.phrases;
        args.negative_phrases = image.negative_phrases;
        args.count = 1;
        args.parent = image.id;
        args.stable_diffusion_strength = image.stable_diffusion_strength;
        args.status = CreateImageInputStatusEnum.Completed;
        args.width = image.width as any;
        args.height = image.height as any;
        args.nsfw = image.nsfw;
        args.encoded_image = encodedImage;
        const newImage = (await api.createImage(args)).data!.images![0];
        setImage(newImage)
        // history.push(`/image-editor/${newImage.id}`);
        history.replace(`/image-editor/${newImage.id}`);
    }

    useEffect(() => {
        if (image) {
            return;
        }
        api.getImage(id).then((image) => {
            setImage(image.data);
            api.getImageData(id, {
                responseType: "arraybuffer",
            }).then((resp) => {
                const binaryImageData = Buffer.from(resp.data, "binary");
                const base64ImageData = binaryImageData.toString("base64");
                const src = `data:image/jpeg;base64,${base64ImageData}`;
                const imageElement = new Image();
                imageElement.src = src;
                imageElement.onload = () => {
                    if (!canvasRef.current) {
                        console.error("Failed to get canvas");
                        return;
                    }
                    const renderer = createRenderer(canvasRef.current);
                    renderer.setBaseImage(imageElement);
                    setRenderer(renderer);
                };
            });
        });
    }, [image, id]);

    useEffect(() => {
        if (renderer) {
            onSelectTool(tools[0]);
            renderer.onSnapshot(() => {
                setCanUndo(renderer.canUndo());
                setCanRedo(renderer.canRedo());
            });
        }
    }, [renderer]);

    useEffect(() => {
        if (canvasRef.current) {
            const listener = (e: WheelEvent) => {
                if (tool) {
                    e.preventDefault();
                    tool.onWheel(e);
                }
            };
            canvasRef.current.addEventListener("wheel", listener);
            return () => {
                canvasRef.current?.removeEventListener("wheel", listener);
            };
        }
    }, [tool, canvasRef.current]);

    function renderTool(t: ToolConfig) {
        let buttonClass = `btn btn-secondary light-button image-editor-tool-button`;
        const isSelected = tool && tool.name == t.name;
        if (isSelected) {
            buttonClass = `btn btn-primary image-editor-tool-button`;
        }
        return (
            <div className="form-group" key={t.name}>
                <button className={buttonClass} onClick={() => onSelectTool(t)}>
                    <i className={t.iconClass}></i>
                </button>
                {/* capitalize tool name */}
                <label>
                    {t.name.charAt(0).toUpperCase() + t.name.slice(1)}
                </label>
                {isSelected && t.renderControls(tool!, renderer!)}
            </div>
        );
    }

    function preventDefault(e: CanPreventDefault): boolean {
        e.preventDefault();
        return true;
    }

    return (
        <>
            <div className="row">
                <div className="col-12">
                    <h1 style={{ fontSize: "40px", textAlign: "left" }}>
                        <i
                            style={{ cursor: "pointer" }}
                            onClick={() => history.push(`/images/${id}`)}
                            className="fas fa-chevron-left"
                        ></i>
                        &nbsp; AI Edit
                    </h1>
                </div>
            </div>
            <div className="row" style={{ marginTop: "32px" }}>
                <div className="col-lg-3">
                    {renderer && (
                        <>
                            {tools.map((tool) => renderTool(tool))}
                            {(canRedo || canUndo) && (
                                <div className="form-group">
                                    <div className="btn-group">
                                        <button
                                            className="btn btn-primary image-popup-button"
                                            disabled={!renderer || !canUndo}
                                            onClick={() =>
                                                renderer && renderer.undo()
                                            }
                                        >
                                            {/* undo */}
                                            <i className="fas fa-undo"></i>
                                        </button>
                                        <button
                                            className="btn btn-primary image-popup-button"
                                            disabled={!renderer || !canRedo}
                                            onClick={() =>
                                                renderer && renderer.redo()
                                            }
                                        >
                                            <i className="fas fa-redo"></i>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
                <div className="col-lg-9">
                    <div style={{ verticalAlign: "middle" }}>
                        <div>
                            <canvas
                                style={{
                                    cursor: "none",
                                    touchAction: "none",
                                    userSelect: "none",
                                }}
                                ref={canvasRef}
                                className="image-editor-canvas"
                                onMouseDown={(e) =>
                                    preventDefault(e) &&
                                    tool &&
                                    tool.onMouseDown(e)
                                }
                                onMouseMove={(e) =>
                                    preventDefault(e) &&
                                    tool &&
                                    tool.onMouseMove(e)
                                }
                                onMouseUp={(e) =>
                                    preventDefault(e) &&
                                    tool &&
                                    tool.onMouseUp(e)
                                }
                                onMouseLeave={(e) =>
                                    preventDefault(e) &&
                                    tool &&
                                    tool.onMouseLeave(e)
                                }
                                onTouchStart={(e) =>
                                    preventDefault(e) &&
                                    tool &&
                                    // (() => {
                                        
                                    //     const rect = canvasRef.current!.getBoundingClientRect();
                                    //     const touch = e.touches[0];
                                    //     if (touch) {
                                    //         tool.onMouseDown({
                                    //             type: "touch",
                                    //             button: 0,
                                    //             nativeEvent: {
                                    //                 offsetX: touch.clientX - rect.left,
                                    //                 offsetY: touch.clientY - rect.top,
                                    //             }
                                    //         } as any);
                                    //     }
                                    // })()
                                    tool.onTouchStart(e)
                                }

                                onTouchMove={(e) =>
                                    preventDefault(e) &&
                                    tool &&
                                    // (() => {
                                    //     const rect = canvasRef.current!.getBoundingClientRect();
                                    //     const touch = e.touches[0];
                                    //     if (touch) {
                                    //         tool.onMouseMove({
                                    //             nativeEvent: {
                                    //                 offsetX: touch.clientX - rect.left,
                                    //                 offsetY: touch.clientY - rect.top,
                                    //             }
                                    //         } as any);
                                    //     }
                                    // })()
                                    tool.onTouchMove(e)
                                }

                                onTouchEnd={(e) =>
                                    preventDefault(e) &&
                                    tool &&
                                    // tool.onMouseUp({
                                    //     button: 0
                                    // } as any)
                                    tool.onTouchEnd(e)
                                }
                                

                            ></canvas>
                            {showSelectionControls && (
                                <>
                                    <button
                                        className="btn btn-secondary canvas-select-left"
                                        onClick={() => tool!.select("left")}
                                    >
                                        <i className="fas fa-chevron-left"></i>
                                    </button>
                                    <button
                                        className="btn btn-secondary canvas-select-right"
                                        onClick={() => tool!.select("right")}
                                    >
                                        <i className="fas fa-chevron-right"></i>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="row">
                        <button
                            className="btn btn-primary"
                            // center horizontally
                            style={{
                                position: "absolute",
                                left: "50%",
                                transform: "translate(-50%, 0)",
                            }}
                            onClick={() => {
                                if (renderer) {
                                    renderer.resetView();
                                }
                            }}
                        >
                            {/* reset zoom */}
                            <i className="fas fa-search-plus"></i>&nbsp; Reset
                            View
                        </button>
                        {/* redo */}
                    </div>
                    {/* vertically center button within the div */}
                </div>
            </div>
        </>
    );
};
