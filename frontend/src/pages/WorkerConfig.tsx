import React, { FC, useState } from "react";
import { saveAs } from "file-saver";

import { AIBrushApi, CreateServiceAccountInputTypeEnum } from "../client/api";

interface Props {
    api: AIBrushApi;
}

export const WorkerConfigPage: FC<Props> = ({ api }) => {

    const [type, setType] = useState<CreateServiceAccountInputTypeEnum>(CreateServiceAccountInputTypeEnum.Private);

    // show some information about what a worker is and does
    // * a worker processes requests to create images with AIBrush
    const info = (): JSX.Element => {
        return (
            <>
                <div className="row">
                    <div className="col-12">
                        <h2>Worker Config</h2>
                    </div>
                </div>
                <div className="row">
                    <div className="col-12">
                        <p>
                            This page allows you to download a worker config file needed to access the AIBrush api.
                            This file can be used to run a worker on a local or cloud machine, or a Colab notebook.
                            Images worker requires an NVidia GPU with at least 12GB of VRAM, but at least 16GB is recommended.
                            Suggestions worker requires an NVidia GPU with at least 16GB of VRAM.

                            See the <a href="https://github.com/wolfgangmeyers/aibrush-2/tree/main/worker#readme" target="_blank">worker readme</a> for details on how to set up a worker process.
                        </p>
                    </div>
                </div>
                <div className="row">
                    <div className="col-lg-6 offset-lg-3">
                        <hr/>
                        <p>
                            Here is a link to a Google Colab notebook that can be used as a worker node:
                        </p>
                        {/* Link to google colab notebook at https://colab.research.google.com/drive/1cW3vVjdeI19o7a9miMu47J5EDyHfZT20#scrollTo=Ed1iT6_JK0Mo */}
                        <a className="btn btn-primary top-button" href="https://colab.research.google.com/drive/1cW3vVjdeI19o7a9miMu47J5EDyHfZT20#scrollTo=Ed1iT6_JK0Mo" target="_blank">
                            {/* font awesome google colab icon */}
                            <i className="fab fa-google"></i>&nbsp;
                            Google Colab Notebook
                        </a>
                    </div>
                </div>
            </>
        )
    }

    const download = async () => {
        const creds = await api.createServiceAccount({
            type: type
        })
        const blob = new Blob([JSON.stringify(creds.data)], { type: "application/json" });
        saveAs(blob, "credentials.json");
    }

    // public / private dropdown
    // download button
    const form = (): JSX.Element => {
        return (
            <div className="row">
                {/* lg-6 with lg-3 offset */}
                <div className="col-lg-6 offset-lg-3">
                    <form>
                        <div className="form-group">
                            <label htmlFor="type">Type</label>
                            <select className="form-control" id="type" value={type} onChange={(e) => setType(e.target.value as CreateServiceAccountInputTypeEnum)}>
                                <option value="public">Public</option>
                                <option value="private">Private</option>
                            </select>
                        </div>
                        <button type="submit" className="btn btn-primary" onClick={() => download()}>Download</button>
                    </form>
                </div>

            </div>
        )
    }

    return (
        <>
            {info()}
            {form()}
        </>
    )
}