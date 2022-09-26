import React, { useState, useEffect, useRef } from "react";
import { useParams, useHistory } from "react-router-dom";
import loadImage from "blueimp-load-image";

import { AIBrushApi, Image as APIImage } from "../../client";

import "./ImageEditor.css";
import { createRenderer, Renderer } from "./renderer";
import { Tool } from "./tool";
import { SelectionTool } from "./selection-tool";

interface Props {
    api: AIBrushApi;
    assetsUrl: string;
}


const tools: Array<ToolConfig> = [{
    name: "select",
    iconClass: "far fa-square",
    constructor: (r: Renderer) => new SelectionTool(r),
}];

interface ToolConfig {
    name: string;
    iconClass: string;
    constructor: (r: Renderer) => Tool;
}

export const ImageEditor: React.FC<Props> = ({ api, assetsUrl }) => {
    // const [image, setImage] = useState<APIImage | null>(null);
    const [renderer, setRenderer] = useState<Renderer | null>(null);
    const [tool, setTool] = useState<Tool | null>(null);
    const { id } = useParams<{ id: string }>();
    const history = useHistory();

    const canvasRef = useRef<HTMLCanvasElement>(null);

    const onSelectTool = (toolconfig: ToolConfig) => {
        if (renderer) {
            const tool = toolconfig.constructor(renderer);
            tool.initialize(null); // TODO: save and load config for widget
            setTool(tool);
        }
    }

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
        if (canvasRef.current) {
            const listener = (e: WheelEvent) => {
                    
                if (tool) {
                    e.preventDefault();
                    tool.onWheel(e);
                }
            }
            canvasRef.current.addEventListener("wheel", listener);
            return () => {
                canvasRef.current?.removeEventListener("wheel", listener);
            }
        }
    }, [tool, canvasRef.current]);

    function renderTool(t: ToolConfig) {
        let buttonClass = `btn btn-secondary light-button image-editor-tool-button`
        console.log(`tool: ${tool && tool.name}, t.name: ${t.name}`);
        if (tool && tool.name == t.name) {
            buttonClass = `btn btn-primary image-editor-tool-button`
        }
        return (
            <div className="form-group" key={t.name}>
                <button
                    className={buttonClass}
                    onClick={() => onSelectTool(t)}
                >
                    <i className={t.iconClass}></i>
                </button>
                {/* capitalize tool name */}
                <label>{t.name.charAt(0).toUpperCase() + t.name.slice(1)}</label>
            </div>
        )
    }

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
                    {renderer && (
                        <>
                            {tools.map((tool) => renderTool(tool))}
                        </>
                    )}
                </div>
                <div className="col-lg-9">
                    <canvas
                        ref={canvasRef}
                        className="image-editor-canvas"
                        onMouseDown={e => tool && tool.onMouseDown(e)}
                        onMouseMove={e => tool && tool.onMouseMove(e)}
                        onMouseUp={e => tool && tool.onMouseUp(e)}
                        onMouseLeave={e => tool && tool.onMouseLeave(e)}
                        // onWheel={e => tool && tool.onWheel(e)}
                    />
                    <br/>
                    <button className="btn btn-primary" onClick={() => {
                        if (renderer) {
                            renderer.updateZoomAndOffset(1, 0, 0);
                        }
                    }}>Reset View</button>
                </div>
            </div>
        </>
    );
};
