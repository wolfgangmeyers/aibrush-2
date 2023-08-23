import React, { useState, useEffect } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import { FilterConfig } from '../lib/models';

interface FilterModalProps {
    filterConfig: FilterConfig;
    onUpdate: (newConfig: FilterConfig) => void;
    onCancel: () => void;
    show: boolean;
}

const FilterModal: React.FC<FilterModalProps> = ({ filterConfig, onUpdate, onCancel, show }) => {
    const [localConfig, setLocalConfig] = useState<FilterConfig>(filterConfig);

    useEffect(() => {
        setLocalConfig(filterConfig);
    }, [filterConfig]);

    const handleSave = () => {
        // Persist to local storage
        localStorage.setItem('filterConfig', JSON.stringify(localConfig));
        onUpdate(localConfig);
    };

    return (
        <Modal show={show} onHide={onCancel}>
            <Modal.Header closeButton>
                <Modal.Title>Filter Configuration</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form>
                    <Form.Group>
                        <Form.Label>NSFW Content</Form.Label>
                        <Form.Control
                            as="select"
                            value={localConfig.nsfw}
                            onChange={e => setLocalConfig({ ...localConfig, nsfw: e.target.value as FilterConfig['nsfw'] })}
                        >
                            <option value="show">Show</option>
                            <option value="blur">Blur</option>
                            <option value="hide">Hide</option>
                        </Form.Control>
                    </Form.Group>
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onCancel}>
                    Cancel
                </Button>
                <Button variant="primary" onClick={handleSave}>
                    Apply
                </Button>
            </Modal.Footer>
        </Modal>
    );
}

export default FilterModal;
