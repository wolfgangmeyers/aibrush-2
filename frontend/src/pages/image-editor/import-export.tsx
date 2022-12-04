import React, { FC, useState, useEffect } from "react";
import loadImage from "blueimp-load-image";
import saveAs from "file-saver";

import { AIBrushApi } from "../../client";
import { Renderer } from "./renderer";
import { BaseTool, Tool } from "./tool";

interface Props {
    renderer: Renderer;
    tool: BaseTool;
    api: AIBrushApi;
}

export const ImportExportControls: FC<Props> = ({ renderer, tool }) => {

    const [backupImage, setBackupImage] = useState<string | undefined>();

    const onImageSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            loadImage(
                files[0],
                (img) => {
                    const backupImage = renderer.getEncodedImage(null);
                    setBackupImage(backupImage);
                    renderer.setBaseImage(img as HTMLImageElement);
                },
                { canvas: false }
            );
        }
    };

    const onExport = () => {
        const encodedImage = renderer.getEncodedImage(null);
        if (encodedImage) {
            // base64 decode
            const byteString = atob(encodedImage);
            // save as file
            const buffer = new ArrayBuffer(byteString.length);
            const intArray = new Uint8Array(buffer);
            for (let i = 0; i < byteString.length; i++) {
                intArray[i] = byteString.charCodeAt(i);
            }
            const blob = new Blob([intArray], { type: "image/png" });
            saveAs(blob, "image.png");
        }
    };

    if (backupImage) {
        return (
            <div className="form-group" style={{marginTop: "16px"}}>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        setBackupImage(undefined);
                        const img = new Image();
                        // set src as data uri
                        const src = "data:image/png;base64," + backupImage;
                        img.src = src;
                        img.onload = () => {
                            renderer.setBaseImage(img);
                        };
                    }}
                >
                    {/* cancel icon */}
                    <i className="fas fa-times"></i>&nbsp;
                    Revert
                </button>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        setBackupImage(undefined);
                        if (tool.saveListener) {
                            tool.saveListener(backupImage);
                        }
                    }}
                    style={{marginLeft: "8px"}}
                >
                    {/* save icon */}
                    <i className="fas fa-save"></i>&nbsp;
                    Save
                </button>
            </div>
        );
    }

    // Show buttons for import and export and "save a copy"
    return (
        <>
            <div className="form-group" style={{marginTop: "16px"}}>
                <label
                    id="loadimage-wrapper"
                    className={`btn btn-primary `}
                    style={{ display: "inline" }}
                >
                    {/* upload image */}
                    <i className="fas fa-upload"></i>&nbsp; Import Image
                    <input
                        id="loadimage"
                        type="file"
                        style={{ display: "none" }}
                        onChange={onImageSelected}
                    />
                </label>
            </div>
            <div className="form-group">
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        onExport();
                    }}
                    style={{ marginLeft: "8px"}}
                >
                    <i className="fas fa-download"></i>&nbsp; Export Image
                </button>
            </div>
        </>
    );
};
