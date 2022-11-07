import React, { FC, useEffect, useState } from "react";
import { Modal, Button } from "react-bootstrap";
import { AIBrushApi, Order } from "../../client";

// TODO: better place to put this?
const COST_PER_HOUR_PER_GPU = 1.35;
const IMAGES_PER_HOUR_PER_GPU = 14 * 60;

interface Props {
    api: AIBrushApi;
}

export const Orders: FC<Props> = ({ api }) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [gpuCount, setGpuCount] = useState(1);
    const [hours, setHours] = useState(1);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        api.getOrders().then((res) => {
            setOrders(res.data.orders);
        });
    }, [api]);

    const onCreateOrder = async () => {
        setCreating(false);
        await api.createOrder({
            gpu_count: gpuCount,
            hours,
        });
        setGpuCount(1);
        setHours(1);
    };

    return (
        <>
            <div className="row">
                <div className="col-12">
                    <h1>Orders</h1>
                </div>
            </div>
            {/* 50px vertical spacer */}
            <div className="row">
                <div className="col-12">
                    <div className="spacer" />
                </div>
            </div>
            <div className="row">
                <div className="col-12">
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setCreating(true)}
                    >
                        Create Order
                    </button>
                </div>
            </div>
            {/* 50px vertical spacer */}
            <div className="row">
                <div className="col-12">
                    <div className="spacer" />
                </div>
            </div>
            <div className="row">
                <div className="col-12">
                    <table className="table">
                        <thead>
                            <tr>
                                <th scope="col">ID</th>
                                <th scope="col">Created By</th>
                                <th scope="col">Created At</th>
                                <th scope="col">Ends At</th>
                                <th scope="col">Is Active</th>
                                <th scope="col">GPU Count</th>
                                <th scope="col">Amount Paid</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.map((order) => (
                                <tr key={order.id}>
                                    <th scope="row">{order.id}</th>
                                    <td>{order.created_by}</td>
                                    <td>{order.created_at}</td>
                                    <td>{order.ends_at}</td>
                                    <td>{order.is_active ? "Yes" : "No"}</td>
                                    <td>{order.gpu_count}</td>
                                    <td>{order.amount_paid_cents}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <Modal show={creating} onHide={() => setCreating(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Create Order</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div className="form-group">
                        <label htmlFor="gpuCount" style={{width: "100%"}}>
                            GPU Count
                            <span
                                className="form-text text-muted"
                                style={{ float: "right" }}
                            >
                                {gpuCount} GPU{gpuCount === 1 ? "" : "s"}
                            </span>
                        </label>
                        <input
                            type="range"
                            min="1"
                            max="4"
                            className="form-control"
                            id="gpuCount"
                            value={gpuCount}
                            onChange={(e) =>
                                setGpuCount(parseInt(e.target.value))
                            }
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="hours" style={{width: "100%"}}>
                            Hours
                            <span
                                className="form-text text-muted"
                                style={{ float: "right" }}
                            >
                                {hours} Hour{hours === 1 ? "" : "s"}
                            </span>
                        </label>
                        <input
                            type="range"
                            min="1"
                            max="8"
                            className="form-control"
                            id="hours"
                            value={hours}
                            onChange={(e) => setHours(parseInt(e.target.value))}
                        />
                    </div>
                    {/* show calculated cost */}
                    <div className="form-group" style={{borderTop: "1px solid #444", paddingTop: "24px"}}>
                        <label htmlFor="cost" style={{width: "100%"}}>
                            Cost
                            <span
                                className="form-text text-muted"
                                style={{ float: "right" }}
                            >
                                $
                                {(
                                    COST_PER_HOUR_PER_GPU * gpuCount * hours
                                ).toFixed(2)}
                            </span>
                        </label>
                    </div>
                    {/* show calculated images */}
                    <div className="form-group">
                        <label htmlFor="images" style={{width: "100%"}}>
                            Max Images per Hour (estimated)
                            <span
                                className="form-text text-muted"
                                style={{ float: "right" }}
                            >
                                {IMAGES_PER_HOUR_PER_GPU * gpuCount}
                            </span>
                        </label>
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button
                        variant="secondary"
                        onClick={() => setCreating(false)}
                    >
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={onCreateOrder}>
                        Create
                    </Button>
                </Modal.Footer>
            </Modal>
        </>
    );
};
