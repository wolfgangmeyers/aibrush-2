// RedeemPopup.tsx
import React from 'react';
import { Modal, Button, Spinner } from 'react-bootstrap';

interface RedeemPopupProps {
  state: 'busy' | 'success' | 'failure';
  onHide: () => void;
}

const RedeemPopup: React.FC<RedeemPopupProps> = ({ state, onHide }) => {
  const getContent = () => {
    switch (state) {
      case 'busy':
        return (
          <>
            <Modal.Header>
              <Modal.Title>Redeeming Code</Modal.Title>
            </Modal.Header>
            <Modal.Body className="text-center">
              <Spinner animation="border" />
              <p>Processing your code...</p>
            </Modal.Body>
          </>
        );
      case 'success':
        return (
          <>
            <Modal.Header>
              <Modal.Title>Code Redeemed</Modal.Title>
            </Modal.Header>
            <Modal.Body className="text-center">
              <p>Your code has been successfully redeemed! You should see an update to your credits balance shortly.</p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="primary" onClick={onHide}>
                Close
              </Button>
            </Modal.Footer>
          </>
        );
      case 'failure':
        return (
          <>
            <Modal.Header>
              <Modal.Title>Code Redemption Failed</Modal.Title>
            </Modal.Header>
            <Modal.Body className="text-center">
              <p>Something went wrong. Please try again later or contact support.</p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="danger" onClick={onHide}>
                Close
              </Button>
            </Modal.Footer>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <Modal show onHide={state === 'busy' ? undefined : onHide} centered>
      {getContent()}
    </Modal>
  );
};

export default RedeemPopup;
