import React, { useState, useEffect, useRef } from "react";
import { useParams, useHistory } from "react-router-dom";
import loadImage from "blueimp-load-image";

import { AIBrushApi, Image as APIImage } from "../../client";
import { getUpscaleLevel } from "../../lib/upscale";
import "./ImageEditor.css";
import { createRenderer, Renderer } from "./renderer";
import { Tool, DummyTool } from "./tool";
import { SelectionTool } from "./selection-tool";

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

export const ImageEditor: React.FC<Props> = ({ api, assetsUrl }) => {
    const tools: Array<ToolConfig> = [
        {
            name: "select",
            iconClass: "far fa-square",
            constructor: (r: Renderer) => new SelectionTool(r),
            renderControls: (t: Tool, renderer: Renderer) => {
                const upscaleLevel = getUpscaleLevel(renderer.getWidth(), renderer.getHeight());
                return <></>;
            },
            defaultArgs: {},
        },
        {
            name: "enhance",
            iconClass: "fas fa-magic",
            constructor: (r: Renderer) => new DummyTool("enhance"),
            defaultArgs: {
                variationStrength: 0.75,
            },
            renderControls: (t: Tool, renderer: Renderer) => <></>,
        },
    ];

    // const [image, setImage] = useState<APIImage | null>(null);
    const [renderer, setRenderer] = useState<Renderer | null>(null);
    const [tool, setTool] = useState<Tool | null>(null);
    const [resizing, setResizing] = useState(false);

    const { id } = useParams<{ id: string }>();
    const history = useHistory();

    const canvasRef = useRef<HTMLCanvasElement>(null);

    const loadToolArgs = (toolconfig: ToolConfig) => {
        const toolConfig = tools.find((t) => t.name === toolconfig.name);
        if (toolConfig) {
            const argsString = localStorage.getItem(
                `tool-${toolconfig.name}-args`
            );
            const args = argsString
                ? JSON.parse(argsString)
                : toolConfig.defaultArgs;
            // check if the renderer width/height is a base aspect ratio. If so, automatically
            // set the selection width and height to the base aspect ratio.
            const upscaleLevel = getUpscaleLevel(renderer!.getWidth(), renderer!.getHeight());
            if (upscaleLevel == 0) {
                args.selectionWidth = renderer!.getWidth();
                args.selectionHeight = renderer!.getHeight();
            }
            return args;
        }
        return {};
    };

    const onSelectTool = (toolconfig: ToolConfig) => {
        if (renderer) {
            const tool = toolconfig.constructor(renderer);
            tool.configure(loadToolArgs(toolconfig)); // TODO: save and load config for widget
            setTool(tool);
        }
    };

    useEffect(() => {
        api.getImage(id).then((image) => {
            const src = `${assetsUrl}/${image.data.id}.image.jpg?updated_at=${image.data.updated_at}`;
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
    }, [id]);

    useEffect(() => {
        if (renderer) {
            onSelectTool(tools[0]);
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
        console.log(`tool: ${tool && tool.name}, t.name: ${t.name}`);
        if (tool && tool.name == t.name) {
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
            </div>
        );
    }

    function onResize() {}

    return (
        <>
            <div className="row">
                <div className="col-12">
                    <h1 style={{ fontSize: "40px", textAlign: "left" }}>
                        <i
                            style={{ cursor: "pointer" }}
                            onClick={() => history.goBack()}
                            className="fas fa-chevron-left"
                        ></i>
                        &nbsp; AI Edit
                    </h1>
                </div>
            </div>
            <div className="row">
                <div className="col-lg-3">
                    {renderer && <>{tools.map((tool) => renderTool(tool))}</>}
                </div>
                <div className="col-lg-9">
                    <canvas
                        ref={canvasRef}
                        className="image-editor-canvas"
                        onMouseDown={(e) => tool && tool.onMouseDown(e)}
                        onMouseMove={(e) => tool && tool.onMouseMove(e)}
                        onMouseUp={(e) => tool && tool.onMouseUp(e)}
                        onMouseLeave={(e) => tool && tool.onMouseLeave(e)}
                        // onWheel={e => tool && tool.onWheel(e)}
                    />
                    <br />
                    <button
                        className="btn btn-primary"
                        onClick={() => {
                            if (renderer) {
                                renderer.updateZoomAndOffset(1, 0, 0);
                            }
                        }}
                    >
                        Reset View
                    </button>
                </div>
            </div>
        </>
    );
};
