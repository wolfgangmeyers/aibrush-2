import React, { FC, useState, useEffect } from "react";
import { Modal } from "react-bootstrap";
import { SuggestionSeed } from "../client/api";

interface Props {
    suggestionSeed: SuggestionSeed;
    onClose: () => void;
    onGenerateImage: (suggestion: string) => void;
}

export const ViewSuggestionSeedModal: FC<Props> = ({ suggestionSeed, onClose, onGenerateImage }) => {
    return (
        <Modal show={true} onHide={onClose}>
            <Modal.Header closeButton>
                <Modal.Title>{suggestionSeed.name}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <div className="row">
                    <div className="col-md-12">
                        {suggestionSeed.items.map((item, index) => (
                            <div style={{ backgroundColor: "gray", margin: "5px", padding: "10px", borderRadius: "5px" }}>
                            {item}

                            {/* actions to the right: save, generate */}
                            <div className="pull-right">
                                <button className="btn btn-primary btn-sm" style={{marginLeft: "5px"}} onClick={() => onGenerateImage(item)}>
                                    <i className="fas fa-play" />&nbsp;
                                </button>
                            </div>
                        </div>
                        ))}
                    </div>
                </div>
            </Modal.Body>
            <Modal.Footer>
                <button className="btn btn-secondary" onClick={onClose}>Close</button>
            </Modal.Footer>
        </Modal>
    )
}
