import React, {FC, useEffect, useState} from "react";
import { useHistory } from "react-router-dom"
import { AIBrushApi, Image } from "../client/api";
import { workflowSchemas, WorkflowSchema, WorkflowConfigField, toInputJSX } from "../lib/workflow";
import qs from "qs";

import { ImageThumbnail } from "../components/ImageThumbnail";

interface Props {
    api: AIBrushApi;
    apiUrl: string;
    assetsUrl: string;
}

export const CreateWorkflow: FC<Props> = ({api, apiUrl, assetsUrl}) => {
    const searchParams = qs.parse(window.location.search.substring(1)) as any
    const [workflowSchema, setWorkflowSchema] = useState<WorkflowSchema | undefined>(undefined);

    const history = useHistory()
    const [label, setLabel] = useState("");
    const [executionDelay, setExecutionDelay] = useState(30);
    const [config, setConfig] = useState<any>({})
    const [creating, setCreating] = useState(false);
    const [parent, setParent] = useState<Image | undefined>();

    useEffect(() => {
        if (searchParams.parent) {
            api.getImage(searchParams.parent).then(resp => {
                setParent(resp.data)
            }).catch(err => {
                console.error(err)
            })
        }
    }, [searchParams.parent])

    const onChangeWorkflowType = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const workflowType = event.target.value;
        const workflowSchema = workflowSchemas.find((schema: WorkflowSchema) => schema.workflow_type === workflowType);
        setWorkflowSchema(workflowSchema);
        let cfg: any = {}
        if (workflowSchema) {
            for (let field of workflowSchema.config_fields) {
                cfg[field.name] = field.default;
            }
        }
        setConfig(cfg);
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

    const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!workflowSchema) {
            console.error("No workflow schema selected")
            return
        }
        setCreating(true);
        config.parent = parent?.id;
        try {
            const workflow = await api.createWorkflow({
                label,
                execution_delay: executionDelay,
                config_json: JSON.stringify(config),
                workflow_type: workflowSchema.workflow_type,
                data_json: "{}",
                is_active: true,
                state: "init",
            })
            history.push("/workflows")
        } finally {
            setCreating(false);
        }
    }

    return <>
        <div className="row">
            <div className="col-md-12">
                <h1>Create new workflow</h1>
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
                    {/* label */}
                    <div className="form-group">
                        <label htmlFor="label">Label</label>
                        <input required className="form-control" type="text" id="label" value={label} onChange={(event) => setLabel(event.target.value)} />
                    </div>
                    {/* execution delay (10-60) */}
                    <div className="form-group">
                        <label htmlFor="executionDelay">Execution delay (seconds)</label>
                        <input className="form-control" type="number" id="executionDelay" value={executionDelay} onChange={(event) => setExecutionDelay(parseInt(event.target.value))} min={10} max={600} />
                    </div>
                    {/* select element that lists workflow schemas */}
                    <div className="form-group">
                        <label htmlFor="workflow-type">Workflow type</label>
                        <select required value={workflowSchema && workflowSchema.workflow_type} className="form-control" id="workflow-type" onChange={onChangeWorkflowType}>
                            <option value="">Select workflow type</option>
                            {workflowSchemas.map((schema: WorkflowSchema) => (
                                <option key={schema.workflow_type} value={schema.workflow_type}>
                                    {schema.display_name}
                                </option>
                            ))}
                        </select>
                    </div>
                    {workflowSchema && <>
                        {workflowSchema.config_fields.map((configField: WorkflowConfigField) => (
                            <div className="form-group" key={configField.name}>
                                <label htmlFor={configField.name}>{configField.name}</label>
                                    {toInputJSX(configField, config, setConfig)}
                            </div>
                        ))}
                    </>}
                    {
                        parent && <div className="form-group">
                            {/* show image thumbnail */}
                            <label>Parent:</label>
                            <ImageThumbnail image={parent} apiUrl={apiUrl} assetsUrl={assetsUrl} />
                        </div>
                    }
                    {/* footer */}
                    <div className="form-group">
                        {/* cancel button */}
                        <button className="btn btn-secondary" type="button" onClick={onCancel}>Cancel</button>
                        &nbsp;
                        <button className="btn btn-primary" type="submit">Create</button>
                    </div>
                </form>
            </div>
        </div>
    </>
}
