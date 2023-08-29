import React, { useState, useEffect, useRef } from "react";
import { useParams, useHistory } from "react-router-dom";
import axios, { AxiosInstance } from "axios";
import * as uuid from "uuid";

import { Buffer } from "buffer";
import { getUpscaleLevel } from "../../lib/upscale";
import "./ImageEditor.css";
import { createRenderer, Renderer } from "./renderer";
import { Tool, BaseTool } from "./tool";
import { SelectionTool, Controls as SelectionControls } from "./selection-tool";
import { EnhanceTool, EnhanceControls } from "./enhance-tool";
import {
    PencilTool,
    Controls as PencilControls,
    defaultColors,
} from "./pencil-tool";
import { SmudgeTool, SmudgeControls } from "./smudge-tool";
import { ImportExportControls } from "./import-export";
import { InpaintControls, InpaintTool } from "./inpaint-tool";
import { AugmentControls } from "./augment-tool";
import { defaultArgs } from "../../components/ImagePrompt";
import { ApiSocket } from "../../lib/apisocket";
import { BusyModal } from "../../components/BusyModal";
import { LocalImagesStore } from "../../lib/localImagesStore";
import { LocalImage } from "../../lib/models";
import { render } from "@testing-library/react";
import { HordeGenerator } from "../../lib/hordegenerator";
import { ImageClient } from "../../lib/savedimages";
import moment from "moment";
import { createEncodedThumbnail } from "../../lib/imageutil";
import { HordeClient } from "../../lib/hordeclient";

interface CanPreventDefault {
    preventDefault: () => void;
}

interface Props {
    generator: HordeGenerator;
    hordeClient: HordeClient;
    localImages: LocalImagesStore;
    savedImages: LocalImagesStore;
}

interface ToolConfig {
    name: string;
    iconClass: string;
    constructor: (r: Renderer) => Tool;
    renderControls: (t: Tool, renderer: Renderer) => JSX.Element;
    defaultArgs: any;
}

export const anonymousClient = axios.create();
delete anonymousClient.defaults.headers.common["Authorization"];

export const ImageEditor: React.FC<Props> = ({
    generator,
    hordeClient,
    localImages,
    savedImages,
}) => {
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
                        generator={generator}
                        hordeClient={hordeClient}
                        image={image!}
                    />
                );
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
                        image={image!}
                        generator={generator}
                        hordeClient={hordeClient}
                    />
                );
            },
        },
        {
            name: "pencil",
            iconClass: "fas fa-pencil-alt",
            constructor: (r: Renderer) => new PencilTool(r, "base"),
            defaultArgs: {},
            renderControls: (t: Tool, renderer: Renderer) => {
                return (
                    <PencilControls
                        tool={t as PencilTool}
                        renderer={renderer}
                        colors={defaultColors}
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
                    />
                );
            },
        },
        {
            name: "augment",
            iconClass: "fas fa-image",
            constructor: (r: Renderer) => new BaseTool(r, "augment"),
            defaultArgs: {},
            renderControls: (t: Tool, renderer: Renderer) => {
                return (
                    <AugmentControls
                        renderer={renderer}
                        tool={t as BaseTool}
                        generator={generator}
                        image={image!}
                    />
                );
            },
        },
    ];

    const [image, setImage] = useState<LocalImage | null>(null);
    const [renderer, setRenderer] = useState<Renderer | null>(null);
    const [tool, setTool] = useState<Tool | null>(null);
    const [toolConfig, setToolConfig] = useState<ToolConfig | null>(null);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const [busyMessage, setBusyMessage] = useState<string | null>(null);

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
            setToolConfig(toolconfig);
            newTool.onSaveImage((encodedImage) => {
                console.log("Saving image...");
                saveNewImage(encodedImage);
            });
        }
    };

    /**
     * Saves a new image to the server
     *
     * @param encodedImage base64 encoded image
     * @param newArgs may contain new phrases and negative phrases
     */
    const saveNewImage = async (encodedImage: string) => {
        if (!image || !encodedImage) {
            throw new Error("Cannot save new image without existing image");
        }
        if (!renderer) {
            throw new Error("Cannot save new image without renderer");
        }
        setBusyMessage("Saving image...");
        // make sure to make this png so the thumbnail doesn't try to convert to webp
        encodedImage = `data:image/png;base64,${encodedImage}`
        const encodedThumbanil = await createEncodedThumbnail(encodedImage);
        try {
            const newImage: LocalImage = {
                ...image,
                params: {
                    ...image.params,
                    width: renderer!.getWidth() as any,
                    height: renderer!.getHeight() as any,
                },
                id: uuid.v4(),
                imageData: encodedImage,
                thumbnailData: encodedThumbanil,
                created_at: moment().valueOf(),
                updated_at: moment().valueOf(),
                status: "completed",
            };
            await localImages.saveImage(newImage);

            // switch url and state to new image
            setImage(newImage);
            history.replace(`/image-editor/${newImage.id}`);
        } finally {
            setBusyMessage(null);
        }
    };

    useEffect(() => {
        if (image) {
            return;
        }

        async function loadImage() {
            // TODO: replace with google drive / legacy load
            const localImage = await localImages.getImage(id);
            let imageSrc = "";
            if (localImage) {
                setImage(localImage);
                imageSrc = localImage.imageData!;
            } else {
                const image = await savedImages.getImage(id);
                if (image) {
                    setImage(image);
                    // const imageUrl = `https://aibrush2-filestore.s3.us-west-2.amazonaws.com/${id}.image.png`;
                    // // Loading up data as binary, base64 encoding into image url
                    // // bypasses browser security nonsense about cross-domain images
                    // const resp = await anonymousClient.get(imageUrl, {
                    //     responseType: "arraybuffer",
                    // });
                    // const binaryImageData = Buffer.from(resp.data, "binary");
                    // const base64ImageData = binaryImageData.toString("base64");
                    // imageSrc = `data:image/png;base64,${base64ImageData}`;
                    imageSrc = image.imageData!;
                }
            }

            const imageElement = new Image();
            imageElement.src = imageSrc;
            imageElement.onload = () => {
                if (!canvasRef.current) {
                    console.error("Failed to get canvas");
                    return;
                }
                const renderer = createRenderer(canvasRef.current);
                renderer.setBaseImage(imageElement);
                setRenderer(renderer);
            };
        }
        loadImage();
    }, [image, id]);

    // this covers the case that an image is upscaled to max, the upscale tool needs to
    // be hidden and deselected.
    useEffect(() => {
        if (
            image &&
            tool &&
            tool.name == "upscale" &&
            image.params.width! * image.params.height! >= 2048 * 2048
        ) {
            onSelectTool(tools[0]);
        }
    }, [image, tool]);

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

    // implement a useEffect hook that resizes the canvas (renderer.updateCanvasSize(width, height)) when the window is resized, and also on initial load
    // the canvas size should be set based on the current screen size
    useEffect(() => {
        if (renderer) {
            const listener = () => {
                let width = window.innerWidth * 0.85;
                let height = window.innerHeight;
                if (window.innerWidth <= 992) {
                    width = window.innerWidth;
                    height = window.innerHeight * 0.85;
                }
                renderer.updateCanvasSize(width, height);
                // renderer.resetView();
            };
            window.addEventListener("resize", listener);
            listener();
            renderer.resetView();
            return () => {
                window.removeEventListener("resize", listener);
            };
        }
    }, [renderer]);

    function renderTool(t: ToolConfig) {
        if (!image) {
            return null;
        }
        let buttonClass = `btn btn-secondary light-button image-editor-tool-button`;
        const isSelected = tool && tool.name == t.name;
        if (isSelected) {
            buttonClass = `btn btn-primary image-editor-tool-button`;
        }
        return (
            <>
                <button
                    style={{ margin: "4px" }}
                    className={buttonClass}
                    onClick={() => onSelectTool(t)}
                >
                    <i className={t.iconClass}></i>
                </button>
                {/* capitalize tool name */}
                {/* <label>
                    {t.name.charAt(0).toUpperCase() + t.name.slice(1)}
                </label>
                {isSelected && t.renderControls(tool!, renderer!)} */}
            </>
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
            <div
                className="row"
                style={{ marginTop: "32px", paddingBottom: "120px" }}
            >
                <div
                    className="col-lg-3"
                    style={{ textAlign: "left", marginBottom: "8px" }}
                >
                    {renderer && (
                        <>
                            <div style={{ marginBottom: "16px" }}>
                                {tools.map((t) => renderTool(t))}
                            </div>
                            {tool && toolConfig && (
                                <>
                                    {/* capitalize tool name */}
                                    <h4 style={{ marginLeft: "16px" }}>
                                        {tool.name.charAt(0).toUpperCase() +
                                            tool.name.slice(1)}
                                    </h4>
                                    {toolConfig.renderControls(
                                        tool!,
                                        renderer!
                                    )}
                                </>
                            )}
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
                                width={768}
                                height={512}
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
                                    tool.onTouchStart(e)
                                }
                                onTouchMove={(e) =>
                                    preventDefault(e) &&
                                    tool &&
                                    tool.onTouchMove(e)
                                }
                                onTouchEnd={(e) =>
                                    preventDefault(e) &&
                                    tool &&
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
            {busyMessage && (
                <BusyModal show={true} title="Please Wait">
                    {busyMessage}
                </BusyModal>
            )}
        </>
    );
};
