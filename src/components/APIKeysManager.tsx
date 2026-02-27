import React, { useEffect, useState } from "react";
import { Modal, Form, Button } from "react-bootstrap";
import axios from "axios";
import { HordeClient } from "../lib/hordeclient";
import { User } from "../lib/models";

interface Props {
    client: HordeClient;
    onHordeConnected: (apiKey: string, user: User) => void;
    onHordeUserUpdated: (user: User) => void;
    onNanoGPTConnected: (apiKey: string) => void;
}

const APIKeysManager = ({ client, onHordeConnected: onApiKeyChange, onHordeUserUpdated, onNanoGPTConnected }: Props) => {
    const [user, setUser] = useState<User | null>(null);
    const [hordeApiKey, setHordeApiKey] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [hordeApiKeyInput, setHordeApiKeyInput] = useState("");
    const [nanoGPTKeyInput, setNanoGPTKeyInput] = useState("");
    const [showHordeKey, setShowHordeKey] = useState(false);
    const [showNanoGPTKey, setShowNanoGPTKey] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadUserFromHorde = async (apiKey: string) => {
        const response = await axios.get(
            "https://stablehorde.net/api/v2/find_user",
            {
                headers: {
                    accept: "application/json",
                    "Client-Agent": "unknown:0:unknown",
                    apikey: apiKey,
                },
            }
        );
        const user: User = response.data;
        return user;
    };

    const loadUserFromStorage = async () => {
        const storedUser = localStorage.getItem("user");
        const storedHordeApiKey = localStorage.getItem("apiKey");
        const storedNanoGPTKey = localStorage.getItem("nanogptKey");

        if (storedUser && storedHordeApiKey) {
            let user = JSON.parse(storedUser) as User;
            setUser(user);
            setHordeApiKey(storedHordeApiKey);
            setHordeApiKeyInput(storedHordeApiKey);
            client.updateApiKey(storedHordeApiKey);
            onApiKeyChange(storedHordeApiKey, user);
        }

        if (storedNanoGPTKey) {
            setNanoGPTKeyInput(storedNanoGPTKey);
            onNanoGPTConnected(storedNanoGPTKey);
        }
    };

    useEffect(() => {
        if (hordeApiKey) {
            const reloadUser = async () => {
                const user = await loadUserFromHorde(hordeApiKey);
                setUser(user);
                localStorage.setItem("user", JSON.stringify(user));
                onHordeUserUpdated(user);
            };
            const handle = setInterval(reloadUser, 60000);
            reloadUser();
            return () => {
                clearInterval(handle);
            };
        } else {
            loadUserFromStorage();
        }
    }, [hordeApiKey]);

    const onSaveKeys = async () => {
        if (hordeApiKeyInput) {
            try {
                const user = await loadUserFromHorde(hordeApiKeyInput);
                setUser(user);
                setHordeApiKey(hordeApiKeyInput);
                localStorage.setItem("user", JSON.stringify(user));
                localStorage.setItem("apiKey", hordeApiKeyInput);
                client.updateApiKey(hordeApiKeyInput);
                setError(null);
                onApiKeyChange(hordeApiKeyInput, user);
            } catch (err) {
                setError("Invalid Horde API key");
                return;
            }
        }

        // NanoGPT key: save if provided, clear if empty
        if (nanoGPTKeyInput) {
            localStorage.setItem("nanogptKey", nanoGPTKeyInput);
            onNanoGPTConnected(nanoGPTKeyInput);
        } else {
            localStorage.removeItem("nanogptKey");
            onNanoGPTConnected("");
        }

        setShowModal(false);
    };

    return (
        <>
            <span
                style={{ cursor: "pointer", color: "#00f0f0" }}
                className="top-button"
                onClick={() => setShowModal(true)}
            >
                <i className="fas fa-user"></i>&nbsp;
                {user ? `${user.username}` : "Anonymous"}
            </span>

            <Modal show={showModal} onHide={() => setShowModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>API Keys</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p>
                        <i className="fas fa-info-circle"></i>&nbsp; Register for a Horde API key at&nbsp;
                        <a target="_blank" href="https://aihorde.net/register">https://aihorde.net/register</a>
                    </p>
                    <Form>
                        <Form.Group controlId="formHordeApiKey">
                            <Form.Label>Horde API Key</Form.Label>
                            <div className="d-flex">
                                <Form.Control
                                    type={showHordeKey ? "text" : "password"}
                                    placeholder="Enter Horde API Key"
                                    value={hordeApiKeyInput}
                                    onChange={(e) => setHordeApiKeyInput(e.target.value)}
                                />
                                <Button
                                    variant="outline-secondary"
                                    onClick={() => setShowHordeKey(!showHordeKey)}
                                    style={{ marginLeft: "4px" }}
                                >
                                    <i className={showHordeKey ? "fas fa-eye-slash" : "fas fa-eye"} />
                                </Button>
                            </div>
                        </Form.Group>
                        {error && <p style={{ color: "red" }}>{error}</p>}
                    </Form>

                    <p style={{ marginTop: "16px" }}>
                        <i className="fas fa-info-circle"></i>&nbsp; Get a NanoGPT API key at&nbsp;
                        <a target="_blank" href="https://nano-gpt.com/api">https://nano-gpt.com/api</a>
                    </p>
                    <Form>
                        <Form.Group controlId="formNanoGPTKey">
                            <Form.Label>NanoGPT API Key</Form.Label>
                            <div className="d-flex">
                                <Form.Control
                                    type={showNanoGPTKey ? "text" : "password"}
                                    placeholder="Enter NanoGPT API Key (leave empty to clear)"
                                    value={nanoGPTKeyInput}
                                    onChange={(e) => setNanoGPTKeyInput(e.target.value)}
                                />
                                <Button
                                    variant="outline-secondary"
                                    onClick={() => setShowNanoGPTKey(!showNanoGPTKey)}
                                    style={{ marginLeft: "4px" }}
                                >
                                    <i className={showNanoGPTKey ? "fas fa-eye-slash" : "fas fa-eye"} />
                                </Button>
                            </div>
                        </Form.Group>
                    </Form>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowModal(false)}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={onSaveKeys}>
                        Save
                    </Button>
                </Modal.Footer>
            </Modal>
        </>
    );
};

export default APIKeysManager;
