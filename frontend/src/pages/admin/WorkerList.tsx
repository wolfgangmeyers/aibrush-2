import moment from "moment";
import React, { FC, useEffect, useState } from "react";
import { Modal } from "react-bootstrap";
import { AIBrushApi, Worker, WorkerConfig } from "../../client";

interface Props {
    api: AIBrushApi;
}

export const WorkerList: FC<Props> = ({ api }) => {
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [workerConfigs, setWorkerConfigs] = useState<WorkerConfig[]>([]);
    const [code, setCode] = useState<string>("");

    function refresh() {
        api.getWorkers().then((resp) => {
            const workers = resp.data.workers || [];
            setWorkers(workers);
            const workerConfigPromises = workers.map((worker) => {
                return api.getWorkerConfig(worker.id);
            });
            Promise.all(workerConfigPromises).then((workerConfigs) => {
                setWorkerConfigs(workerConfigs.map((resp) => resp.data));
            });
        });
    }

    useEffect(() => {
        refresh();
    }, [api]);

    const configsByWorkerId = workerConfigs.reduce((acc, config) => {
        acc[config.worker_id] = config;
        return acc;
    }, {} as Record<string, WorkerConfig>);

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
        const displayName = window.prompt(
            worker.display_name,
            `Worker ${workers.length + 1}`
        );
        if (displayName) {
            await api.updateWorker(worker.id, {
                display_name: displayName,
            });
            setWorkers(
                workers.map((w) =>
                    w.id === worker.id ? { ...w, display_name: displayName } : w
                )
            );
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
                    &nbsp;
                    {/* refresh button */}
                    <button className="btn btn-primary" onClick={refresh}>
                        Refresh
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
                                    <th>GPU Configurations</th>
                                    <th>Status</th>
                                    <th>Last Ping</th>
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
                                            {configsByWorkerId[worker.id] &&
                                                configsByWorkerId[worker.id]
                                                    .gpu_configs &&
                                                configsByWorkerId[
                                                    worker.id
                                                ].gpu_configs!.map((config) => (
                                                    <div
                                                        key={`${worker.id}_${config.gpu_num}`}
                                                    >
                                                        GPU {config.gpu_num}:{" "}
                                                        {config.model}
                                                    </div>
                                                ))}
                                        </td>
                                        <td>{worker.status}</td>
                                        <td>{!!worker.last_ping && moment(worker.last_ping).fromNow()}</td>
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
