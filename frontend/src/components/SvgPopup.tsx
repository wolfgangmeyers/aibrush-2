import React, { FC, useState, useEffect, useRef } from "react";
import { saveAs } from "file-saver";
import { Modal } from "react-bootstrap";
import { AIBrushApi, SvgJobStatusEnum, Image } from "../client/api";

interface Props {
    apiUrl: string;
    api: AIBrushApi;
    image: Image;
    onClose: () => void;
}

export const SvgPopup: FC<Props> = ({ apiUrl, api, image, onClose }) => {
    const [svgData, setSvgData] = useState("");
    const [svgImageUri, setSvgImageUri] = useState("");
    const [svgJobId, setSvgJobId] = useState("");
    const [err, setErr] = useState<string | null>(null);

    const onGenerateSvg = async () => {
        setSvgData("");
        setSvgImageUri("");
        setErr(null);
        try {
            const resp = await api.createSvgJob({
                image_id: image.id,
            })
            setSvgJobId(resp.data.id)
        } catch (err) {
            setErr("Could not generate SVG")
            console.error(err)
        }
    }

    const onDownloadSvg = () => {
        const blob = new Blob([svgData], { type: "text/plain;charset=utf-8" });
        saveAs(blob, `${image.label}.svg`);
    }

    useEffect(() => {
        if (!api) {
            return;
        }
        let handle: number;
        const pollSvg = async () => {
            try {
                const resp = await api.getSvgJob(svgJobId)
                if (resp.data.status === SvgJobStatusEnum.Completed) {
                    const result = await api.getSvgJobResult(svgJobId)
                    setSvgData(result.data)
                    // convert svgData to image uri
                    const blob = new Blob([result.data], { type: "image/svg+xml" });
                    const url = URL.createObjectURL(blob);
                    setSvgImageUri(url)
                    setSvgJobId("")
                }
            } catch (err) {
                console.error(err)
            }
        }
        handle = window.setInterval(pollSvg, 1000)
        return () => clearInterval(handle)
    }, [api, svgJobId])

    return (
        <Modal show={true} onHide={onClose}>
            <Modal.Header closeButton>
                <Modal.Title>SVG</Modal.Title>
            </Modal.Header>
            {(err || svgJobId || svgImageUri) && <Modal.Body>
                {/* error if set */}
                {err && <div className="alert alert-danger">{err}</div>}
                {/* display svg if set */}
                {svgImageUri && (
                    <div style={{width: "100%"}}>
                        <img src={svgImageUri} alt="svg" style={{width: "100%"}} />
                    </div>
                )}
                {/* loading indicator if svgJobId is set0 */}
                {svgJobId && (
                    <div className="spinner-border text-primary" role="status">
                        <span className="sr-only">Loading...</span>
                    </div>
                )}
                
            </Modal.Body>}
            <Modal.Footer>
                {/* generate svg button */}
                {!svgData && <button disabled={!!svgJobId} className="btn btn-primary" onClick={onGenerateSvg}>
                    {svgJobId ? "Generating" : "Generate SVG"}
                </button>}
                {/* if svgData, show a download button */}
                {svgData && (
                    <button className="btn btn-primary" onClick={onDownloadSvg}>
                        Download SVG
                    </button>
                )}
            </Modal.Footer>
        </Modal>
    )
}