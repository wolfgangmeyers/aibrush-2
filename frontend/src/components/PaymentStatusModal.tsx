import React, { useEffect, useState } from "react";
import { Modal, Button } from "react-bootstrap";
import { useHistory } from "react-router-dom";

interface PaymentStatusModalProps {
    paymentStatus?: "success" | "canceled";
}

const PaymentStatusModal: React.FC<PaymentStatusModalProps> = ({
    paymentStatus,
}) => {
    const [show, setShow] = useState(false);
    const history = useHistory();

    useEffect(() => {
        if (paymentStatus) {
            setShow(true);
        }
    }, [paymentStatus]);

    const handleClose = () => {
        setShow(false);
        history.push("/");
    };

    return (
        <Modal show={show} onHide={handleClose}>
            <Modal.Header closeButton>
                <Modal.Title>Payment Status</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {paymentStatus === "success"
                    ? "Payment succeeded!"
                    : "Payment canceled."}
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={handleClose}>
                    Close
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default PaymentStatusModal;
