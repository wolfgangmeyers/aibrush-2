import React, { useEffect, useState } from "react";
import { Navbar, Modal, Form, Button } from "react-bootstrap";
import axios from "axios";
import { HordeClient } from "../lib/hordeclient";
import { User } from "../lib/models";

interface Props {
  client: HordeClient;
  onHordeConnected: (apiKey: string, user: User) => void;
  onHordeUserUpdated: (user: User) => void;
  onOpenAIConnected: (apiKey: string) => void;
}

const APIKeysManager = ({client, onHordeConnected: onApiKeyChange, onHordeUserUpdated, onOpenAIConnected}: Props) => {
    const [user, setUser] = useState<User | null>(null);
    const [hordeApiKey, setHordeApiKey] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [hordeApiKeyInput, setHordeApiKeyInput] = useState("");
    const [openAIKeyInput, setOpenAIKeyInput] = useState("");
    const [error, setError] = useState<string | null>(null);

    const loadUserFromHorde = async (apiKey: string) => {
        const response = await axios.get(
            "https://stablehorde.net/api/v2/find_user",
            {
                headers: {
                    accept: "application/json",
                    "Client-Agent": "unknown:0:unknown",
                    apikey: hordeApiKeyInput,
                },
            }
        );

        const user: User = response.data;
        return user;
    };

    const loadUserFromStorage = async () => {
        const storedUser = localStorage.getItem("user");
        const storedHordeApiKey = localStorage.getItem("apiKey");
        const storedOpenaiApiKey = localStorage.getItem("openaiKey");

        if (storedUser && storedHordeApiKey) {
            let user = JSON.parse(storedUser) as User;
            setUser(user);
            setHordeApiKey(storedHordeApiKey);
            setHordeApiKeyInput(storedHordeApiKey);
            client.updateApiKey(storedHordeApiKey);
            onApiKeyChange(storedHordeApiKey, user);
        }

        if (storedOpenaiApiKey) {
            onOpenAIConnected(storedOpenaiApiKey);
            setOpenAIKeyInput(storedOpenaiApiKey);
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
            }
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
                setShowModal(false);
                setError(null);
                onApiKeyChange(hordeApiKeyInput, user);
            } catch (err) {
                setError("Invalid Horde API key");
            }
        }

        if (openAIKeyInput) {
            localStorage.setItem("openaiKey", openAIKeyInput);
            onOpenAIConnected(openAIKeyInput);
        }
        
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
                    {/* info about how users can register for an api key at https://aihorde.net/register. Blue info icon */}
                    <p>
                        <i className="fas fa-info-circle"></i>&nbsp; You can register to get
                        a Horde API key at&nbsp;<a target="_blank" href="https://aihorde.net/register">https://aihorde.net/register</a>
                    </p>
                    <Form>
                        <Form.Group controlId="formApiKey">
                            <Form.Label>Horde API Key</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="Enter API Key"
                                value={hordeApiKeyInput}
                                onChange={(e) => setHordeApiKeyInput(e.target.value)}
                            />
                        </Form.Group>
                        {error && <p style={{ color: "red" }}>{error}</p>}
                    </Form>

                    <p>
                        {/* https://platform.openai.com/api-keys */}
                        <i className="fas fa-info-circle"></i>&nbsp; You can get an OpenAI API key at&nbsp;<a target="_blank" href="https://platform.openai.com/api-keys">https://platform.openai.com/api-keys</a>
                    </p>
                    <Form>
                        <Form.Group controlId="formApiKey">
                            <Form.Label>OpenAI API Key</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="Enter API Key"
                                value={openAIKeyInput}
                                onChange={(e) => setOpenAIKeyInput(e.target.value)}
                            />
                        </Form.Group>
                    </Form>
                </Modal.Body>
                <Modal.Footer>
                    <Button
                        variant="secondary"
                        onClick={() => setShowModal(false)}
                    >
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
