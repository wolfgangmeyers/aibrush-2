import React from "react";
import { Modal, Button } from "react-bootstrap";
import { Link, useHistory } from "react-router-dom";

interface OutOfCreditsModalProps {
    show: boolean;
    onHide: () => void;
}

const OutOfCreditsModal: React.FC<OutOfCreditsModalProps> = ({
    show,
    onHide,
}) => {
    const history = useHistory();

    const redirectToPricing = () => {
        onHide();
        history.push("/pricing");
    };

    return (
        <Modal show={show} onHide={onHide} centered>
            <Modal.Header closeButton>
                <Modal.Title>Out of Credits</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                Oops! It looks like you've run out of credits for today. But
                don't worry, you'll receive 100 free credits tomorrow to
                continue creating amazing images. Can't wait? Check out our
                affordable <Link to="/pricing">pricing options</Link> to get instant access to more credits
                and unleash your creativity without limits!
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onHide}>
                    Close
                </Button>
                <Button variant="primary" onClick={redirectToPricing}>
                    Visit Pricing Page
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default OutOfCreditsModal;
