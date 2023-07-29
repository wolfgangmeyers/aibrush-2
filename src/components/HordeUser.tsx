import React, { useEffect, useState } from "react";
import { Navbar, Modal, Form, Button } from "react-bootstrap";
import axios from "axios";
import { HordeClient } from "../lib/hordeclient";
import { User } from "../lib/models";

interface Props {
  client: HordeClient;
  onHordeConnected: (apiKey: string, user: User) => void;
  onHordeUserUpdated: (user: User) => void;
}

const HordeUser = ({client, onHordeConnected: onApiKeyChange, onHordeUserUpdated}: Props) => {
    const [user, setUser] = useState<User | null>(null);
    const [_, setApiKey] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [apiKeyInput, setApiKeyInput] = useState("");
    const [error, setError] = useState<string | null>(null);

    const loadUserFromHorde = async (apiKey: string) => {
        const response = await axios.get(
            "https://stablehorde.net/api/v2/find_user",
            {
                headers: {
                    accept: "application/json",
                    "Client-Agent": "unknown:0:unknown",
                    apikey: apiKeyInput,
                },
            }
        );

        const user: User = response.data;
        return user;
    };

    const loadUserFromStorage = async () => {
        const storedUser = localStorage.getItem("user");
        const storedApiKey = localStorage.getItem("apiKey");

        if (storedUser && storedApiKey) {
            let user = JSON.parse(storedUser) as User;
            setUser(user);
            setApiKey(storedApiKey);
            setApiKeyInput(storedApiKey);
            client.updateApiKey(storedApiKey);
            onApiKeyChange(storedApiKey, user);
        }
    };

    useEffect(() => {
        loadUserFromStorage();
        const reloadUser = async () => {
            const user = await loadUserFromHorde(apiKeyInput);
            setUser(user);
            onHordeUserUpdated(user);
        };
        const handle = setInterval(reloadUser, 60000);
        return () => {
            clearInterval(handle);
        }
    }, []);

    const validateApiKey = async () => {
        try {
            const user = await loadUserFromHorde(apiKeyInput);
            setUser(user);
            setApiKey(apiKeyInput);
            localStorage.setItem("user", JSON.stringify(user));
            localStorage.setItem("apiKey", apiKeyInput);
            client.updateApiKey(apiKeyInput);
            setShowModal(false);
            setError(null);
            onApiKeyChange(apiKeyInput, user);
        } catch (err) {
            setError("Invalid API key");
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
                    <Modal.Title>Enter API Key</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {/* info about how users can register for an api key at https://aihorde.net/register. Blue info icon */}
                    <p>
                        <i className="fas fa-info-circle"></i>&nbsp; You can register to get
                        an API key at&nbsp;<a target="_blank" href="https://aihorde.net/register">https://aihorde.net/register</a>
                    </p>
                    <Form>
                        <Form.Group controlId="formApiKey">
                            <Form.Label>API Key</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="Enter API Key"
                                value={apiKeyInput}
                                onChange={(e) => setApiKeyInput(e.target.value)}
                            />
                        </Form.Group>
                        {error && <p style={{ color: "red" }}>{error}</p>}
                    </Form>
                </Modal.Body>
                <Modal.Footer>
                    <Button
                        variant="secondary"
                        onClick={() => setShowModal(false)}
                    >
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={validateApiKey}>
                        Save
                    </Button>
                </Modal.Footer>
            </Modal>
        </>
    );
};

export default HordeUser;
