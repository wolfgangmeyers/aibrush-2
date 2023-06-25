import React, { FC, useEffect, useState, useCallback } from "react";
import axios from "axios";
import Modal from "react-bootstrap/Modal";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Alert from "react-bootstrap/Alert";
import DOMPurify from "dompurify";

import { Item } from "../lib/civit_loras";
import { Col, ListGroup, Row } from "react-bootstrap";
import { LoraConfig } from "../client";
import { recentLoras } from "../lib/recentLoras";

// https://chat.openai.com/share/34a593c7-a8e5-4490-9cc7-8a1d019b8b82

export interface SelectedLora {
    config: LoraConfig;
    lora: Item;
}

interface LoraModalProps {
    onConfirm: (lora: SelectedLora) => void;
    onCancel: () => void;
}

export const LoraModal: FC<LoraModalProps> = ({ onConfirm, onCancel }) => {
    const [inputValue, setInputValue] = useState("");
    const [strength, setStrength] = useState(1);
    const [item, setItem] = useState<Item | null>(null);
    const [recentItems, setRecentItems] = useState<Item[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(event.target.value);
    };

    const handleSearch = useCallback(async () => {
        const modelId = inputValue.match(/(\d+)/)?.[0] || inputValue;

        if (!modelId) {
            setError("Invalid input");
            return;
        }

        setBusy(true);
        try {
            const response = await axios.get(
                `https://civitai.com/api/v1/models/${modelId}`
            );
            setItem(response.data);
            setError(null);
        } catch (error) {
            setError("Failed to fetch data");
        } finally {
            setBusy(false);
        }
    }, [inputValue]);

    const handleConfirm = () => {
        recentLoras.addLora(item!);
        onConfirm({
            config: {
                name: `${item!.id}`,
                strength,
            },
            lora: item!,
        })
    }

    useEffect(() => {
        // Fetch recent Loras when component mounts
        const fetchRecentLoras = async () => {
            const items = await recentLoras.listRecentLoras();
            setRecentItems(items);
        };
        fetchRecentLoras();
    }, []);

    const renderContent = () => {
        if (error) {
            return <Alert variant="danger">{error}</Alert>;
        }

        if (item) {
            return (
                <div>
                    <h5>{item.name}</h5>
                    <div
                        dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(item.description),
                        }}
                    />

                    <p>Allow Commercial Use: {item.allowCommercialUse}</p>
                    <p>Creator: {item.creator.username}</p>

                    <h6>Tags:</h6>
                    <div style={{ marginBottom: "16px" }}>
                        {item.tags.map((tag, index) => (
                            // <li key={index}>{tag}</li>
                            // comma separated instead
                            <span key={index}>
                                {tag}
                                {index < item.tags.length - 1 && ", "}
                            </span>
                        ))}
                    </div>

                    <h6>Model Versions:</h6>
                    {/* TODO: support multiple model versions in the horde */}
                    {item.modelVersions.slice(0, 1).map((version, index) => (
                        <div key={index}>
                            <strong>{version.name}</strong>
                            <p>Base Model: {version.baseModel}</p>

                            <strong>Trained Words:</strong>
                            <ul>
                                {version.trainedWords.map((word, idx) => (
                                    <li key={idx}>{word}</li>
                                ))}
                            </ul>

                            <strong>Images:</strong>
                            <div className="row">
                                {version.images.map((image, idx) => (
                                    <div
                                        key={idx}
                                        className="col-sm-4 col-md-3"
                                    >
                                        <div className="thumbnail">
                                            <img
                                                src={image.url}
                                                alt=""
                                                style={{
                                                    maxWidth: "100%",
                                                    height: "auto",
                                                    marginBottom: "16px",
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            );
        }

        return null;
    };

    return (
        <Modal show onHide={onCancel} size="xl">
            <Modal.Header closeButton>
                <Modal.Title>Enter LORA URL or Model Number</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {!item && (
                    <>
                        <Form
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleSearch();
                            }}
                        >
                            <Form.Group as={Row}>
                                <Col sm={10}>
                                    <Form.Control
                                        type="text"
                                        placeholder="Enter LORA URL or Model Number"
                                        value={inputValue}
                                        onChange={handleInputChange}
                                    />
                                </Col>
                                <Col sm={2}>
                                    <Button
                                        variant="primary"
                                        onClick={handleSearch}
                                        disabled={busy || !inputValue}
                                    >
                                        {busy ? "Loading..." : "Search"}
                                    </Button>
                                </Col>
                            </Form.Group>
                        </Form>
                        <h5 className="mt-3">Recently Used Loras:</h5>
                        <ListGroup>
                            {recentItems.map((recentItem, index) => (
                                <ListGroup.Item key={index} action onClick={() => setItem(recentItem)}>
                                    {recentItem.name}
                                </ListGroup.Item>
                            ))}
                        </ListGroup>
                    </>
                )}
                {/* show a strength slider only if an item has been loaded */}
                {item && (
                    <Form.Group as={Row}>
                        <Form.Label column sm={2}>
                            Strength: {strength}
                        </Form.Label>
                        <Col sm={10}>
                            <Form.Control
                                type="range"
                                min={0}
                                max={5}
                                step={0.1}
                                value={strength}
                                onChange={(e) =>
                                    setStrength(parseFloat(e.target.value))
                                }
                            />
                        </Col>
                    </Form.Group>
                )}
                {renderContent()}
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onCancel}>
                    Cancel
                </Button>
                <Button
                    variant="primary"
                    disabled={!item}
                    onClick={() => handleConfirm()}
                >
                    OK
                </Button>
            </Modal.Footer>
        </Modal>
    );
};
