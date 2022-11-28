import React, { FC, useEffect, useState } from "react";
import { Modal } from "react-bootstrap";
import { AIBrushApi, Worker } from "../../client";

interface Props {
    api: AIBrushApi;
}

export const WorkerList: FC<Props> = ({ api }) => {
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [code, setCode] = useState<string>("");

    useEffect(() => {
        api.getWorkers().then((resp) => {
            setWorkers(resp.data.workers || []);
        });
    }, [api]);

    const onDeleteWorker = async (worker: Worker) => {
        await api.deleteWorker(worker.id);
        setWorkers(workers.filter((w) => w.id !== worker.id));
    };

    const onGenerateCode = async (worker: Worker) => {
        const resp = await api.generateWorkerLoginCode(worker.id);
        setCode(resp.data.login_code);
    };

    const onCreateWorker = async () => {
        const displayName = window.prompt(`Worker ${workers.length + 1}`);
        if (displayName) {
            const worker = await api.createWorker({
                display_name: displayName,
            });
            setWorkers([...workers, worker.data]);
        }
    };

    const onRenameWorker = async (worker: Worker) => {
        const displayName = window.prompt(worker.display_name, `Worker ${workers.length + 1}`);
        if (displayName) {
            await api.updateWorker(worker.id, {
                display_name: displayName,
            });
            setWorkers(workers.map((w) => (w.id === worker.id ? { ...w, display_name: displayName } : w)));
        }
    };


    // for each worker, render a row
    // show id, display name, and status. actions = delete, generate code

    return (
        <>
            <h1>Workers</h1>
            <div className="row">
                <div className="col-12">
                    <button
                        className="btn btn-primary"
                        onClick={onCreateWorker}
                    >
                        Create Worker
                    </button>
                </div>
            </div>
            <div className="row" style={{ marginTop: "16px" }}>
                <div className="col-12">
                    {workers.length > 0 && (
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Display Name</th>
                                    <th>GPU Count</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {workers.map((worker) => (
                                    <tr key={worker.id}>
                                        <td>{worker.id}</td>
                                        <td>{worker.display_name}</td>
                                        <td>{worker.num_gpus || 1}</td>
                                        <td>
                                            <button
                                                className="btn btn-danger btn-sm"
                                                onClick={() =>
                                                    onDeleteWorker(worker)
                                                }
                                            >
                                                Delete
                                            </button>
                                            &nbsp;
                                            <button
                                                className="btn btn-primary btn-sm"
                                                onClick={() =>
                                                    onGenerateCode(worker)
                                                }
                                            >
                                                Generate Code
                                            </button>
                                            &nbsp;
                                            <button
                                                className="btn btn-primary btn-sm"
                                                onClick={() =>
                                                    onRenameWorker(worker)
                                                }
                                            >
                                                Rename
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
            {code && (
                <Modal show={!!code} onHide={() => setCode("")}>
                    <Modal.Header closeButton>
                        <Modal.Title>Worker Login Code</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <p>
                            Give this code to the worker to login to the
                            application.
                        </p>
                        <p>
                            <strong>{code}</strong>
                        </p>
                    </Modal.Body>
                </Modal>
            )}
        </>
    );
};
