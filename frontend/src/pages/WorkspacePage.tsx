// Workspace react component
// Display the workspace images
// use bootstrap

import React, { FC, useState, useEffect } from "react";
import { Link } from "react-router-dom"
import { ImageThumbnail } from "../components/ImageThumbnail"
import { Workspace, loadWorkspace, saveWorkspace } from "../lib/workspace"
import { AIBrushApi, Image } from "../client/api";
import { Config } from "@testing-library/react";

interface WorkspacePageProps {
    apiUrl: string;
    api: AIBrushApi;
}

export const WorkspacePage: FC<WorkspacePageProps> = ({ apiUrl, api }) => {
    const [workspace, setWorkspace] = useState<Workspace>({ images: [] })
    const [err, setErr] = useState("")
    const [showPending, setShowPending] = useState(true)
    const [showCompleted, setShowCompleted] = useState(true)
    const [showSaved, setShowSaved] = useState(true)

    useEffect(() => {
        let workspace = loadWorkspace()
        setWorkspace(workspace)
        let lock = false;

        const timerHandle = setInterval(async () => {
            if (lock) {
                return;
            }
            lock = true;
            const responses = await Promise.all(workspace.images.map(async (image) => {
                return api.getImage(image.id as string)
            }))
            workspace = {
                images: responses.map(r => r.data)
            }
            setWorkspace(workspace)
            saveWorkspace(workspace)
            lock = false;
        }, 5000)
        return () => {
            clearInterval(timerHandle)
        }
    }, [])

    const onDeleteImage = async (image: Image) => {
        // clear error
        setErr("")
        // attempt to delete image
        try {
            await api.deleteImage(image.id as string)
            const updatedWorkspace = {
                ...workspace,
                images: workspace.images.filter(i => i.id !== image.id)
            }
            setWorkspace(updatedWorkspace)
            saveWorkspace(updatedWorkspace)
        } catch (err) {
            console.error(err)
            setErr("Could not delete image")
        }
    }

    const onClickImage = (image: Image) => {
        console.log(image)
    }

    // show the images in the workspace
    return (
        <div className="container">
            <div className="row">
                <div className="col-12">
                    <h1>Workspace</h1>
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
            {/* Link to navigate to CreateImage */}
            <div className="row">
                <div className="col-12">
                    <Link to="/create-image" className="btn btn-primary">Create Image</Link>
                </div>
            </div>
            {/*  spacer */}
            <div className="row">
                <div className="col-12">
                    <div className="spacer"></div>
                </div>
            </div>
            <div className="row">
                <div className="col-12">
                    <div className="row">
                        {workspace.images.map(image => (
                            <ImageThumbnail key={`image-thumbnail-${image.id}`} apiUrl={apiUrl} image={image} onClick={onClickImage} onDelete={onDeleteImage} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}