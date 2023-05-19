import React, { useEffect, useState } from "react";
import { Button, Modal, Form, ListGroup, Row, Col } from "react-bootstrap";
import axios from "axios";
import { AIBrushApi, StableDiffusionModel } from "../client";
import { ModelList } from "./ModelList";
import { useCache } from "../lib/localcache";
import { recentModels } from "../lib/recentList";

const httpclient = axios.create();

interface ModelSelectorProps {
    api: AIBrushApi;
    initialSelectedModel: string;
    onSelectModel: (model: string) => void;
    onCancel: () => void;
    inpainting: boolean;
}



const ModelSelector: React.FC<ModelSelectorProps> = ({
    api,
    initialSelectedModel,
    onSelectModel,
    onCancel,
    inpainting,
}) => {
    const [models, setModels] = useCache<StableDiffusionModel[]>("models", []);
    const [selectedModel, setSelectedModel] =
        useState<StableDiffusionModel | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    const filteredModels = models.filter((model) =>
        model.inpainting === inpainting && model.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSelect = () => {
        console.log("Selected model:", selectedModel);
        if (selectedModel) {
            onSelectModel(selectedModel.name);
        }
    };

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
    };

    const handleModelClick = (model: StableDiffusionModel) => {
        setSelectedModel(model);
    };

    useEffect(() => {
        const setSortedModels = (
            selectedModel: StableDiffusionModel,
            models: StableDiffusionModel[]
        ) => {
            recentModels.addItem(selectedModel.name);

            const recentModelNames = recentModels.getItems();
            // map from model name to index
            const recentModelIndices: { [key: string]: number } = {};
            recentModelNames.forEach((name, index) => {
                recentModelIndices[name] = index;
            });
            // sort models by recentness
            const sortedModels = models.sort((a, b) => {
                const aIndex = recentModelIndices[a.name];
                const bIndex = recentModelIndices[b.name];
                if (aIndex === undefined && bIndex === undefined) {
                    return 0;
                } else if (aIndex === undefined) {
                    return 1;
                } else if (bIndex === undefined) {
                    return -1;
                } else {
                    return aIndex - bIndex;
                }
            });

            setModels(sortedModels);
        };

        if (!models || models.length === 0) {
            api.getModels().then((res) => {
                console.log(res);
                const selectedModel =
                    res.data[initialSelectedModel] ||
                    Object.values(res.data)[0];
                console.log("Selected model:", selectedModel);
                setSelectedModel(selectedModel);
                setSortedModels(selectedModel, Object.values(res.data));
            });
        } else {
            const selectedModel =
                models.find((model) => model.name === initialSelectedModel) ||
                models[0];
            setSelectedModel(selectedModel);
            setSortedModels(selectedModel, models);
        }
    }, [api, models]);

    useEffect(() => {
        if (initialSelectedModel) {
            recentModels.addItem(initialSelectedModel);
        }
    }, [initialSelectedModel]);

    return (
        <>
            <Modal show={true} onHide={onCancel} size="xl">
                <Modal.Header closeButton>
                    <Modal.Title>Select Model</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form.Control
                        type="text"
                        placeholder="Search"
                        value={searchTerm}
                        onChange={handleSearch}
                    />
                    <Row className="mt-3">
                        <Col sm={4}>
                            <ModelList
                                models={filteredModels}
                                onSelectModel={handleModelClick}
                                selectedModel={selectedModel?.name || ""}
                            />
                        </Col>
                        <Col sm={8}>
                            {selectedModel && (
                                <>
                                    <h5>{selectedModel.name}</h5>
                                    <p>{selectedModel.description}</p>
                                    {selectedModel.showcases &&
                                        selectedModel.showcases.length > 0 && (
                                            <img
                                                src={selectedModel.showcases[0]}
                                                alt="Showcase"
                                                style={{
                                                    width: "70%",
                                                }}
                                            />
                                        )}
                                </>
                            )}
                        </Col>
                    </Row>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleSelect}
                        disabled={!selectedModel}
                    >
                        Select
                    </Button>
                </Modal.Footer>
            </Modal>
        </>
    );
};

export default ModelSelector;
