import React, {FC, useEffect, useState} from "react";
import { useHistory } from "react-router-dom"

import { Link } from "react-router-dom";
import { AIBrushApi, Workflow } from "../client";

interface Props {
    api: AIBrushApi;
}

export const Workflows: FC<Props> = ({api}) => {

    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const history = useHistory();

    const loadWorkflows = async () => {
        const resp = await api.getWorkflows();
        setWorkflows(resp.data.workflows);
    }

    const onDeleteWorkflow = async (workflow: Workflow) => {
        if (!window.confirm(`Are you sure you want to delete ${workflow.label}?`)) {
            return;
        }
        await api.deleteWorkflow(workflow.id);
        loadWorkflows();
    }

    const onDeactivateWorkflow = async (workflow: Workflow) => {
        await api.updateWorkflow(workflow.id, {is_active: false});
    }

    const onActivateWorkflow = async (workflow: Workflow) => {
        await api.updateWorkflow(workflow.id, {is_active: true});
    }

    const onViewDetail = (workflow: Workflow) => {
        history.push(`/workflows/${workflow.id}`);
    }

    useEffect(() => {
        loadWorkflows();
    })

    return (<>
        <div className="row">
            <div className="col-12">
                <h1>Workflows</h1>
            </div>
        </div>
        {/* Link to navigate to CreateImage */}
        <div className="row">
                <div className="col-12">
                    <Link to="/create-workflow" className="btn btn-primary">
                        <i className="fas fa-plus"></i>&nbsp;
                        Create Workflow
                    </Link>
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
                {/* table that displays workflow label, state, and actions */}
                <table className="table table-striped">
                    <thead>
                        <tr>
                            <th>Label</th>
                            <th>State</th>
                            <th>Active</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {workflows.map(workflow => (
                            <tr key={workflow.id}>
                                <td>{workflow.label}</td>
                                <td>{workflow.state}</td>
                                <td>{workflow.is_active ? "Yes" : "No"}</td>
                                <td>
                                    {/* View detail */}
                                    <button className="btn btn-primary" onClick={() => onViewDetail(workflow)}>
                                        <i className="fas fa-eye"></i>
                                    </button>
                                    &nbsp;
                                    {/* Delete action */}
                                    <button className="btn btn-danger" onClick={() => onDeleteWorkflow(workflow)}>
                                        <i className="fas fa-trash-alt" />
                                    </button>
                                    &nbsp;
                                    {/* deactivate button */}
                                    {workflow.is_active && <button className="btn btn-warning" onClick={() => onDeactivateWorkflow(workflow)}>
                                        <i className="fas fa-minus-circle" />
                                    </button>}
                                    {/* activate button */}
                                    {!workflow.is_active && <button className="btn btn-success" onClick={() => onActivateWorkflow(workflow)}>
                                        <i className="fas fa-plus-circle" />
                                    </button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    </>)
}