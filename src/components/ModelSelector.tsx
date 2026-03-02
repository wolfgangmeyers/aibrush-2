import React, { useEffect, useState } from "react";
import { Button, Modal, Form, Row, Col } from "react-bootstrap";
import axios from "axios";
import { StableDiffusionModel } from "../lib/models";
import { NanoGPTDisplayModel, NanoGPTClient, NANOGPT_FEATURED_MODELS, NANOGPT_IMG2IMG_MODELS, extractPricePerImage } from "../lib/nanogptclient";
import { ModelList } from "./ModelList";
import { useCache } from "../lib/localcache";
import { recentModels } from "../lib/recentList";
import { ActiveModel, HordeClient } from "../lib/hordeclient";

function megapixelStepsToImages(megapixelSteps: number): number {
    return Math.ceil(megapixelSteps / (512 * 512 * 30));
}

interface ModelSelectorProps {
    initialSelectedModel: string;
    onSelectModel: (model: string) => void;
    onCancel: () => void;
    inpainting: boolean;
    hordeClient: HordeClient;
    selectedBackend: "horde" | "nanogpt";
    hasInitImage?: boolean;
}

// Adapt NanoGPTDisplayModel to StableDiffusionModel shape for ModelList compatibility
function nanoGPTToStableDiffusion(m: NanoGPTDisplayModel): StableDiffusionModel {
    return {
        name: m.name,
        displayName: m.displayName,
        description: m.description,
        pricePerImage: m.pricePerImage,
        nanogptCapabilities: m.capabilities,
        showcases: [],
        inpainting: false,
        activeModel: {} as ActiveModel,
        available: true,
        baseline: "",
        config: {},
        download_all: false,
        nsfw: false,
        style: "",
        tags: [],
        type: "nanogpt",
        version: "",
    };
}

const ModelSelector: React.FC<ModelSelectorProps> = ({
    initialSelectedModel,
    onSelectModel,
    onCancel,
    inpainting,
    hordeClient,
    selectedBackend,
    hasInitImage,
}) => {
    const [hordeModels, setHordeModels] = useCache<StableDiffusionModel[]>("models", []);
    const [nanoGPTModels, setNanoGPTModels] = useCache<NanoGPTDisplayModel[]>("nanogpt_models_v2", []);
    const [selectedModel, setSelectedModel] = useState<StableDiffusionModel | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [nanoGPTError, setNanoGPTError] = useState<string | null>(null);
    const [nanoGPTSort, setNanoGPTSort] = useState<"default" | "price-asc" | "price-desc">("default");

    const getNanoGPTModels = (): StableDiffusionModel[] => {
        const featuredNames = new Set(NANOGPT_FEATURED_MODELS.map((m) => m.name));
        const apiModelMap = new Map(nanoGPTModels.map((m) => [m.name, m]));
        // Merge API data (pricing, capabilities) into featured models
        const featured = NANOGPT_FEATURED_MODELS.map((fm) =>
            nanoGPTToStableDiffusion(apiModelMap.get(fm.name) || fm)
        );
        const additional = nanoGPTModels
            .filter((m) => !featuredNames.has(m.name))
            .map(nanoGPTToStableDiffusion);
        return [...featured, ...additional];
    };

    const models: StableDiffusionModel[] =
        selectedBackend === "nanogpt" ? getNanoGPTModels() : hordeModels;

    const filteredModels = (() => {
        const base = models.filter((model) => {
            if (selectedBackend === "nanogpt") {
                // For inpainting/img2img, strictly require the capability flag.
                // For text-to-image, show all models.
                if (inpainting) {
                    if (model.nanogptCapabilities && !model.nanogptCapabilities.inpainting) return false;
                } else if (hasInitImage) {
                    if (!NANOGPT_IMG2IMG_MODELS.has(model.name)) return false;
                }
                // text-to-image: no capability filter (show all)
            } else {
                if (model.inpainting !== inpainting) return false;
            }
            return (
                model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (model.displayName || "").toLowerCase().includes(searchTerm.toLowerCase())
            );
        });
        if (selectedBackend !== "nanogpt" || nanoGPTSort === "default") return base;
        return [...base].sort((a, b) => {
            const pa = a.pricePerImage ?? Infinity;
            const pb = b.pricePerImage ?? Infinity;
            return nanoGPTSort === "price-asc" ? pa - pb : pb - pa;
        });
    })();

    const handleSelect = () => {
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

    // Load NanoGPT models when backend is nanogpt
    useEffect(() => {
        if (selectedBackend !== "nanogpt") return;

        // Select initial model from featured list if not already set
        if (!selectedModel) {
            const initial = getNanoGPTModels().find((m) => m.name === initialSelectedModel)
                || getNanoGPTModels()[0];
            if (initial) setSelectedModel(initial);
        }

        if (nanoGPTModels.length > 0) return; // already cached

        const apiKey = localStorage.getItem("nanogptKey");
        if (!apiKey) return;

        const client = new NanoGPTClient(apiKey);
        client.listImageModels().then((apiModels) => {
            const displayModels: NanoGPTDisplayModel[] = apiModels
                .filter((m) => !!m.id)
                .map((m) => ({
                    name: m.id,
                    displayName: m.name || m.id,
                    description: m.description || m.name || m.id,
                    featured: false,
                    pricePerImage: extractPricePerImage(m.pricing),
                    capabilities: m.capabilities ? {
                        image_to_image: !!m.capabilities.image_to_image,
                        inpainting: !!m.capabilities.inpainting,
                        nsfw: !!m.capabilities.nsfw,
                    } : undefined,
                }));
            setNanoGPTModels(displayModels);
            setNanoGPTError(null);
        }).catch((err) => {
            setNanoGPTError(`Could not load full model list: ${err.message}. Showing featured models only.`);
        });
    }, [selectedBackend]);

    // Load Horde models
    useEffect(() => {
        if (selectedBackend !== "horde") return;

        const loadModels = async () => {
            const setSortedModels = (
                selectedModel: StableDiffusionModel,
                models: StableDiffusionModel[]
            ) => {
                recentModels.addItem(selectedModel.name);
                const recentModelNames = recentModels.getItems();
                const recentModelIndices: { [key: string]: number } = {};
                recentModelNames.forEach((name, index) => {
                    recentModelIndices[name] = index;
                });
                const sortedModels = models.sort((a, b) => {
                    const aIndex = recentModelIndices[a.name];
                    const bIndex = recentModelIndices[b.name];
                    if (aIndex === undefined && bIndex === undefined) {
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
                setHordeModels(sortedModels);
            };

            if (!hordeModels || hordeModels.length === 0) {
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
                const data = res.data as { [key: string]: StableDiffusionModel };
                const modelList = Object.values(data).map((model) => ({
                    ...model,
                    activeModel: activeModelsById[model.name],
                }));
                const selectedModel = data[initialSelectedModel] || modelList[0];
                setSelectedModel({
                    ...selectedModel,
                    activeModel: activeModelsById[selectedModel.name],
                });
                setSortedModels(selectedModel, modelList);
            } else {
                let needsMigration = true;
                for (let model of hordeModels) {
                    if (model.activeModel) {
                        needsMigration = false;
                    }
                }
                if (needsMigration) {
                    setHordeModels([]);
                    return;
                }
                const selectedModel =
                    hordeModels.find((model) => model.name === initialSelectedModel) || hordeModels[0];
                setSelectedModel(selectedModel);
                setSortedModels(selectedModel, hordeModels);
            }
        };
        loadModels();
    }, [hordeModels, selectedBackend]);

    useEffect(() => {
        if (initialSelectedModel) {
            recentModels.addItem(initialSelectedModel);
        }
    }, [initialSelectedModel]);

    const isNanoGPTModel = selectedModel?.type === "nanogpt";

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
                    {selectedBackend === "nanogpt" && (
                        <div className="d-flex align-items-center gap-2 mt-2">
                            <span className="text-nowrap text-light small">Sort by price:</span>
                            <select
                                className="form-control form-control-sm bg-dark text-light border-secondary"
                                style={{ width: "auto" }}
                                value={nanoGPTSort}
                                onChange={(e) =>
                                    setNanoGPTSort(e.target.value as "default" | "price-asc" | "price-desc")
                                }
                                aria-label="Sort models by price"
                            >
                                <option value="default">Default</option>
                                <option value="price-asc">Low → High</option>
                                <option value="price-desc">High → Low</option>
                            </select>
                        </div>
                    )}
                    {nanoGPTError && (
                        <p className="text-warning mt-2" style={{ fontSize: "0.9em" }}>
                            <i className="fas fa-exclamation-triangle" />&nbsp;{nanoGPTError}
                        </p>
                    )}
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
                                    <h5>{selectedModel.displayName || selectedModel.name}</h5>
                                    {/* NanoGPT-specific info */}
                                    {isNanoGPTModel && (
                                        <>
                                            {selectedModel.displayName && selectedModel.displayName !== selectedModel.name && (
                                                <p className="text-muted small mb-1"><code>{selectedModel.name}</code></p>
                                            )}
                                            {selectedModel.pricePerImage !== undefined && (
                                                <p>
                                                    <b>Price:</b>&nbsp;
                                                    ${selectedModel.pricePerImage.toFixed(4)}&nbsp;/ image
                                                </p>
                                            )}
                                            {selectedModel.nanogptCapabilities && (
                                                <div className="mb-2">
                                                    {selectedModel.nanogptCapabilities.image_to_image && (
                                                        <span className="badge bg-info me-1">Image-to-Image</span>
                                                    )}
                                                    {selectedModel.nanogptCapabilities.inpainting && (
                                                        <span className="badge bg-success me-1">Inpainting</span>
                                                    )}
                                                    {selectedModel.nanogptCapabilities.nsfw && (
                                                        <span className="badge bg-warning text-dark me-1">NSFW</span>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                    {/* Horde-specific info — only for Horde models */}
                                    {!isNanoGPTModel && selectedModel.activeModel &&
                                        selectedModel.activeModel.eta < 10000 && (
                                            <>
                                                <p>
                                                    <b>Worker Count:</b>&nbsp;
                                                    {selectedModel.activeModel.count || 0}
                                                </p>
                                                <p>
                                                    <b>Queue Size:</b>&nbsp;
                                                    {selectedModel.activeModel.queued
                                                        ? megapixelStepsToImages(selectedModel.activeModel.queued)
                                                        : 0}
                                                </p>
                                                <p>
                                                    <b>ETA:</b>&nbsp;
                                                    {`${selectedModel.activeModel.eta} seconds` || "unknown"}
                                                </p>
                                            </>
                                        )}
                                    {!isNanoGPTModel &&
                                        (!selectedModel.activeModel ||
                                            selectedModel.activeModel.count === 0 ||
                                            selectedModel.activeModel.eta === 10000) && (
                                            <p className="text-danger">
                                                This model is currently unavailable.
                                            </p>
                                        )}
                                    <p>{selectedModel.description}</p>
                                    {selectedModel.showcases && selectedModel.showcases.length > 0 && (
                                        <img
                                            src={selectedModel.showcases[0]}
                                            alt="Showcase"
                                            style={{ width: "70%" }}
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
                    <Button variant="primary" onClick={handleSelect} disabled={!selectedModel}>
                        Select
                    </Button>
                </Modal.Footer>
            </Modal>
        </>
    );
};

export default ModelSelector;
