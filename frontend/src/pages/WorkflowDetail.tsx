import React, {FC, useEffect, useState} from 'react';
import { useParams } from "react-router-dom"

import { AIBrushApi, Workflow, Image } from '../client';
import { ImageThumbnail } from "../components/ImageThumbnail";

interface Props {
    api: AIBrushApi;
    apiUrl: string;
    assetsUrl: string;
}

interface Params {
    id: string;
}

export const WorkflowDetail: FC<Props> = ({api, apiUrl, assetsUrl}) => {
    const [workflow, setWorkflow] = useState<Workflow>();
    const [err, setErr] = useState("");
    const [images, setImages] = useState<Image[]>([]);
    const {id} = useParams<Params>();

    const loadWorkflow = async (id: string) => {
        setErr("")
        try {
            const workflow = await api.getWorkflow(id);
            setWorkflow(workflow.data);
        } catch (err) {
            console.error(err);
            setErr("Could not load workflow");
        }
    }

    const loadDisplayImages = async (workflow: Workflow) => {
        const data = JSON.parse(workflow.data_json)
        const displayImages = (data.display_images || []) as Image[];
        setImages(displayImages);
        // console.log("displayImages", displayImages);
        // const images = data.images || [] as Image[]
        // console.log("images", images);
    }

    useEffect(() => {
        loadWorkflow(id);
    }, [id])

    useEffect(() => {
        if (workflow) {
            loadDisplayImages(workflow);
        }
    }, [workflow])

    // refresh every 10 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            loadWorkflow(id);
        }
        , 10000);
        return () => clearInterval(interval);
    }, [id])

    return (
        <>
            <div className="row">
                <div className="col-md-12">
                    <h1>Workflow: {workflow?.label}</h1>
                </div>
            </div>
             {/* display error message if one is set */}
             {err && <div className="row">
                <div className="col-12">
                    <div className="alert alert-danger" role="alert">
                        {err}
                    </div>
                </div>
            </div>}
            <div className="row">
                <div className="col-md-12">
                    <div className="row">
                        {images.map(image => (
                            <ImageThumbnail key={image.id} image={image} apiUrl={apiUrl} assetsUrl={assetsUrl} />
                        ))}
                        {!images.length && <div className="col-12">
                            <div className="alert alert-info" role="alert">
                                No images to display
                            </div>
                        </div>}
                    </div>
                </div>
            </div>
        </>
    )
}
