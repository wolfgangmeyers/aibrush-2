import React, { FC, useState, useEffect, CSSProperties } from "react";
import { Modal } from "react-bootstrap";
import { BOOST_LEVELS } from "../lib/boost";

import "./BoostLevelPopup.css";

interface Props {
    selectedBoostLevel: number;
    onUpdateBoostLevel: (level: number) => void;
    onCancel: () => void;
}

export const BoostLevelPopup: FC<Props> = ({
    selectedBoostLevel,
    onUpdateBoostLevel,
    onCancel,
}) => {

    const [updatedBoostLevel, setUpdatedBoostLevel] = useState<number>(selectedBoostLevel);

    useEffect(() => {
        setUpdatedBoostLevel(selectedBoostLevel);
    }, [selectedBoostLevel])

    return (<Modal
        onHide={() => onCancel()}
        centered
        show={true}
    >
        <Modal.Header closeButton>
            <Modal.Title>Boost Level</Modal.Title>
        </Modal.Header>
        <Modal.Body>
            {/* Select from the list: Quick (1), Fast (2), Pro (4) and Super (8)
            <div className="form-group">
                <label htmlFor="boost-level">Boost Level</label>
                <select
                    className="form-control"
                    id="boost-level"
                    value={selectedBoostLevel}
                    onChange={(e) =>
                        setUpdatedBoostLevel(parseInt(e.target.value))
                    }
                >
                    <option value={1}>Quick</option>
                    <option value={2}>Fast</option>
                    <option value={4}>Pro</option>
                    <option value={8}>Super</option>
                </select>
            </div> */}
            {BOOST_LEVELS.map(boostLevel => (
                <div
                    className={"boost-item" + (updatedBoostLevel === boostLevel.level ? " selected" : "")}
                    key={boostLevel.level}
                    onClick={() => setUpdatedBoostLevel(boostLevel.level)}
                >
                    <div className="boost-item-label">
                        {boostLevel.name}
                    </div>
                    <div className="boost-item-description">
                        {boostLevel.description}
                    </div>
                </div>
            ))}
        </Modal.Body>
        <Modal.Footer>
            <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onCancel()}
            >
                Close
            </button>
            &nbsp;
            <button
                type="button"
                className="btn btn-primary"
                onClick={() => onUpdateBoostLevel(updatedBoostLevel)}
            >
                Update
            </button>
        </Modal.Footer>
    </Modal>)
}