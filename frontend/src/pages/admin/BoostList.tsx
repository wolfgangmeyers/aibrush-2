import moment from "moment";
import React, { FC, useState, useEffect } from "react";
import { Modal } from "react-bootstrap";
import { AIBrushApi, Boost } from "../../client";

interface Props {
    api: AIBrushApi;
}

export const BoostList: FC<Props> = ({ api }) => {
    const [boosts, setBoosts] = useState<Boost[]>([]);
    const [email, setEmail] = useState<string>("");
    const [amount, setAmount] = useState<number>(0);
    const [level, setLevel] = useState<number>(1);

    const [showDeposit, setShowDeposit] = useState<boolean>(false);

    function refresh() {
        api.listBoosts().then((resp) => {
            const boosts = resp.data.boosts || [];
            setBoosts(boosts);
        });
    }

    useEffect(() => {
        refresh();
    }, [api]);

    const onDepositBoost = async () => {
        await api.depositBoost(email, {
            amount: amount * level * 1000 * 60 * 60,
            level: level,
        });
        refresh();
        setShowDeposit(false);
    };

    return (
        <>
            <h1>Active Boosts</h1>
            <div className="row">
                <button
                    className="btn btn-primary"
                    onClick={() => setShowDeposit(true)}
                >
                    <i className="fas fa-plus" />
                    &nbsp; Deposit Boost
                </button>
                &nbsp;
                <button className="btn btn-primary" onClick={refresh}>
                    <i className="fas fa-sync" />
                    &nbsp; Refresh
                </button>
            </div>
            <hr />
            <div className="row" style={{ marginTop: "16px" }}>
                <table>
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Level</th>
                            <th>Expires</th>
                        </tr>
                    </thead>
                    <tbody>
                        {boosts.map((boost) => (
                            <tr key={boost.user_id}>
                                <td>{boost.user_id}</td>
                                <td>{boost.level}</td>
                                <td>
                                    {!boost.is_active && moment().add(boost.balance, "milliseconds").fromNow()}
                                    {boost.is_active && moment(boost.activated_at + boost.balance).fromNow()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {showDeposit && (
                <Modal show={showDeposit} onHide={() => setShowDeposit(false)}>
                    <Modal.Header closeButton>
                        <Modal.Title>Deposit Boost</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        {/* deposit controls */}
                        <div className="form-group">
                            <label htmlFor="email">Email</label>
                            <input
                                type="text"
                                className="form-control"
                                id="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="amount">Amount</label>
                            <input
                                type="number"
                                className="form-control"
                                id="amount"
                                value={amount}
                                onChange={(e) =>
                                    setAmount(Number(e.target.value))
                                }
                                min={0.1}
                                max={10}
                                step={0.1}
                            />
                        </div>
                        {/* level is a dropdown. 1=quick, 2=fast, 4=pro, 8=super */}
                        <div className="form-group">
                            <label htmlFor="level">Level</label>
                            <select
                                className="form-control"
                                id="level"
                                value={level}
                                onChange={(e) =>
                                    setLevel(parseInt(e.target.value))
                                }
                            >
                                <option value={1}>Quick</option>
                                <option value={2}>Fast</option>
                                <option value={4}>Pro</option>
                                <option value={8}>Super</option>
                            </select>
                        </div>
                    </Modal.Body>
                    <Modal.Footer>
                        {/* cancel button */}
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setShowDeposit(false)}
                        >
                            Cancel
                        </button>
                        &nbsp;
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={onDepositBoost}
                        >
                            Deposit
                        </button>
                    </Modal.Footer>
                </Modal>
            )}
        </>
    );
};
