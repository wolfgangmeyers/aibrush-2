import React, {FC, useEffect, useState} from "react";
import { Modal } from "react-bootstrap";
import { GenerationJob } from "../lib/models";

// TODO: refactor to generation job
interface Props {
    jobs: GenerationJob[];
    onDeleteJob: (job: GenerationJob) => void;
    onCancel: () => void;
    show: boolean;
}

export const PendingJobs: FC<Props> = ({
    jobs,
    onDeleteJob,
    onCancel,
    show,
}) => {

    function imageIcon(job: GenerationJob) {
        if (job.status === "pending") {
            return <i className="fa fa-hourglass-half"></i>;
        } else if (job.status === "processing") {
            return <i className="fa fa-cog fa-spin"></i>;
        }
    }

    const truncate = (phrases: string) => {
        if (phrases.length > 35) {
            return phrases.substring(0, 35) + "...";
        }
        return phrases;
    }

    // refactor from table to div layout
    const pendingDiv = (
        <div>
            <div style={{marginBottom: "8px"}}>
                <div style={{display: "inline-block", width: "100px"}}>
                    Status
                </div>
                <div style={{display: "inline-block", width: "200px"}}>
                    Prompt
                </div>
                <div style={{display: "inline-block", width: "50px"}}>
                    Count
                </div>
                <div style={{display: "inline-block", width: "100px"}}>
                    Action
                </div>
            </div>
            {jobs.map((job) => (
                <div key={job.id} style={{marginBottom: "8px"}}>
                    <div style={{display: "inline-block", width: "100px"}}>
                        {imageIcon(job)}&nbsp;{job.status}
                    </div>
                    <div style={{display: "inline-block", width: "200px"}}>
                        {/* if more than 30 chars, truncate with ellipsis*/}
                        {truncate(job.params.prompt || "")}
                    </div>
                    <div style={{display: "inline-block", width: "50px"}}>
                        {job.count}
                    </div>
                    <div style={{display: "inline-block", width: "100px"}}>
                        <button
                            className="btn btn-danger btn-sm image-popup-delete-button"
                            onClick={() => onDeleteJob(job)}
                        >
                            <i className="fa fa-trash"></i>&nbsp;Delete
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <Modal show={show} onHide={onCancel}>
            <Modal.Header closeButton>
                <Modal.Title>Pending Jobs</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {pendingDiv}
            </Modal.Body>
            <Modal.Footer>
                <button className="btn btn-secondary" onClick={onCancel}>
                    Close
                </button>
            </Modal.Footer>
        </Modal>
    );
};