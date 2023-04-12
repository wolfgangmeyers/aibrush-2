import React, { FC, useEffect, useRef, useState } from "react";
import { Modal } from "react-bootstrap";
import { propTypes } from "react-bootstrap/esm/Image";

interface Props {
    show: boolean;
    title?: string;
}

// Show modal with child contents
export const BusyModal: FC<Props> = ({ show, title, children }) => {
    return (
        <Modal show={show} backdrop="static" keyboard={false}>
            <Modal.Header closeButton>
                <Modal.Title>{title || "Processing"}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {children || (
                    <div className="d-flex justify-content-center">
                        <div className="spinner-border" role="status">
                            <span className="sr-only">Please Wait...</span>
                        </div>
                    </div>
                )}
            </Modal.Body>
        </Modal>
    );
};
