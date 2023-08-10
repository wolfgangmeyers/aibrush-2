import React, { useEffect, useState } from "react";
import { Button, Modal, Form, ListGroup, Row, Col } from "react-bootstrap";
import axios from "axios";
import { StableDiffusionModel } from "../lib/models";
import { ModelList } from "./ModelList";
import { useCache } from "../lib/localcache";
import { recentModels } from "../lib/recentList";
import { ActiveModel, HordeClient } from "../lib/hordeclient";

const httpclient = axios.create();

function megapixelStepsToImages(megapixelSteps: number): number {
    return Math.ceil(megapixelSteps / (512 * 512 * 30));
}

interface ModelSelectorProps {
    initialSelectedModel: string;
    onSelectModel: (model: string) => void;
    onCancel: () => void;
    inpainting: boolean;
    hordeClient: HordeClient;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({
    initialSelectedModel,
    onSelectModel,
    onCancel,
    inpainting,
    hordeClient,
}) => {
    const [models, setModels] = useCache<StableDiffusionModel[]>("models", []);
    const [selectedModel, setSelectedModel] =
        useState<StableDiffusionModel | null>(null);
    const [searchTerm, setSearchTerm] = useState("");

    const filteredModels = models.filter(
        (model) =>
            model.inpainting === inpainting &&
            model.name.toLowerCase().includes(searchTerm.toLowerCase())
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
        const loadModels = async () => {
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
                        // order by count
                        const aCount = a.activeModel?.count || 0;
                        const bCount = b.activeModel?.count || 0;
                        return bCount - aCount;
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
                const modelsPromise = axios.get(
                    "https://raw.githubusercontent.com/Haidra-Org/AI-Horde-image-model-reference/main/stable_diffusion.json"
                );
                const activeModelsPromise = hordeClient.fetchActiveModels();
                const res = await modelsPromise;
                const activeModels = await activeModelsPromise;
                const activeModelsById: { [key: string]: ActiveModel } = {};
                activeModels.forEach((model) => {
                    activeModelsById[model.name] = model;
                });
                const data = res.data as {
                    [key: string]: StableDiffusionModel;
                };
                const modelList = Object.values(data).map((model) => {
                    return {
                        ...model,
                        activeModel: activeModelsById[model.name],
                    };
                });
                // console.log("modelList", modelList);
                const selectedModel =
                    data[initialSelectedModel] || modelList[0];
                setSelectedModel({
                    ...selectedModel,
                    activeModel: activeModelsById[selectedModel.name],
                });
                setSortedModels(selectedModel, modelList);
            } else {
                let needsMigration = true;
                for (let model of models) {
                    if (model.activeModel) {
                        needsMigration = false;
                    }
                }
                if (needsMigration) {
                    setModels([]);
                    return;
                }
                const selectedModel =
                    models.find(
                        (model) => model.name === initialSelectedModel
                    ) || models[0];
                setSelectedModel(selectedModel);
                setSortedModels(selectedModel, models);
            }
        };
        loadModels();
    }, [models]);

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
                                    {selectedModel.activeModel && selectedModel.activeModel.eta < 10000 && (
                                        <>
                                            <p>
                                                <b>Worker Count:</b>&nbsp;
                                                {selectedModel.activeModel
                                                    .count || 0}
                                            </p>
                                            <p>
                                                <b>Queue Size:</b>&nbsp;
                                                {selectedModel.activeModel
                                                    .queued
                                                    ? megapixelStepsToImages(
                                                          selectedModel
                                                              .activeModel
                                                              .queued
                                                      )
                                                    : 0}
                                            </p>
                                            <p>
                                                <b>ETA:</b>&nbsp;
                                                {`${selectedModel.activeModel.eta} seconds` ||
                                                    "unknown"}
                                            </p>
                                        </>
                                    )}
                                    {(!selectedModel.activeModel || selectedModel.activeModel.count === 0 || selectedModel.activeModel.eta === 10000) && (
                                        <p className="text-danger">
                                            This model is currently unavailable.
                                        </p>
                                    )}
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
