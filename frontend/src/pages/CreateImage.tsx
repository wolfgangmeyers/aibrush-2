/**
 * API:
 *
paths:
  /images:
    # create image
    post:
      description: Create a new image
      operationId: createImage
      tags:
        - AIBrush
      requestBody:
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateImageInput"
      responses:
        "201":
          description: Success
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Image"

     CreateImageInput:
      type: object
      properties:
        phrases:
          type: array
          items:
            type: string
        label:
          type: string
        iterations:
          type: integer
 */
// create component to create a new image
import React, { FC, useState, useEffect } from 'react';
import { useHistory } from "react-router-dom"
import { AIBrushApi, CreateImageInput, Image } from "../client/api"
import { loadWorkspace, saveWorkspace } from '../lib/workspace';
import loadImage from "blueimp-load-image"

interface CreateImageProps {
    api: AIBrushApi
}

export const CreateImage: FC<CreateImageProps> = (props) => {
    const history = useHistory()
    const [input, setInput] = useState<CreateImageInput>({
        phrases: [],
        label: "",
        iterations: 100,
        encoded_image: "",
    });

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const image = await props.api.createImage(input);
        // add image to workspace
        const workspace = loadWorkspace()
        workspace.images.push(image.data as Image)
        saveWorkspace(workspace);
        // redirect to workspace page
        history.push("/workspace")
    }

    const onCancel = () => {
        // on cancel, return to the previous page
        // check if there is a previous page. if not, redirect to home
        if (history.length > 1) {
            history.goBack()
        } else {
            history.push("/")
        }
    }

    const onImageSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files && e.target.files[0]
        if (!file) {
            return
        }
        loadImage(file, (img : Event | HTMLImageElement | HTMLCanvasElement) => {
            if (!(img instanceof HTMLCanvasElement)) {
                return
            }
            // convert image to base64
            const canvas = img as HTMLCanvasElement
            const dataUrl = canvas.toDataURL("image/jpeg")
            const base64 = dataUrl.split(",")[1]
            setInput({
                ...input,
                encoded_image: base64
            })
        }, {
            maxWidth: 512,
            maxHeight: 512,
            canvas: true,
        })
    }

    return (
        <>
            <div className="container">
                {/* Header: Create new image */}
                <div className="row">
                    <div className="col-12">
                        <h1>Create new image</h1>
                    </div>
                </div>
            </div>
            {/* 50px vertical spacer */}
            <div className="row">
                <div className="col-12">
                    <div className="spacer" />
                </div>
            </div>
            <div className="row">
                <div className="offset-lg-3 col-lg-6 col-sm-12">
                    <form onSubmit={onSubmit}>
                        <div className="form-group">
                            <label>Phrases</label>
                            <input
                                className="form-control"
                                type="text"
                                value={input.phrases}
                                onChange={(e) => setInput({ ...input, phrases: e.target.value.split("|") })}
                                placeholder="Separate | phrases | like this" />
                        </div>
                        <div className="form-group">
                            <label>Label</label>
                            <input
                                className="form-control"
                                type="text"
                                value={input.label}
                                onChange={(e) => setInput({ ...input, label: e.target.value })}
                                placeholder="Label" />
                        </div>
                        <div className="form-group">
                            <label>Iterations</label>
                            <input className="form-control" type="number" value={input.iterations} onChange={(e) => setInput({ ...input, iterations: parseInt(e.target.value) })} />
                        </div>
                        {!input.encoded_image && <label
                            id="loadimage-wrapper"
                            className={`btn btn-sm btn-primary btn-file${input.encoded_image ? " disabled" : ""}`}
                            style={{ marginTop: "8px" }}
                        >
                            Upload Initial Image
                            <input
                                id="loadimage"
                                type="file"
                                style={{ display: "none" }}
                                onChange={e => onImageSelected(e)}
                            />
                        </label>}
                        {/* If encoded_image (base64 only) is set, show the image using a base64 image url*/}
                        {input.encoded_image && <div className="form-group">
                            <h5>Initial Image</h5>
                            <img src={`data:image/jpeg;base64,${input.encoded_image}`} style={{ maxWidth: "100%" }} />
                        </div>}
                        <div className="form-group">
                            {/* Cancel button "/" */}
                            <button onClick={onCancel} type="button" className="btn btn-secondary">Cancel</button>
                            &nbsp;
                            <button type="submit" className="btn btn-primary">Create</button>
                        </div>

                    </form>
                </div>
            </div>
        </>
    )


}