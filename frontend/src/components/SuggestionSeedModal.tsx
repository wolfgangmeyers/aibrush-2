import React, { FC, useEffect, useState } from "react";
import { Modal } from "react-bootstrap";
import { SuggestionSeedInput, SuggestionSeed, AIBrushApi } from "../client/api";
import { ImageSearchPopup } from "./ImageSearchPopup";

interface Props {
    api: AIBrushApi;
    editingSuggestionSeed?: SuggestionSeed;
    onHide: () => void;
    onCreate?: (input: SuggestionSeedInput) => void;
    onUpdate?: (id: string, input: SuggestionSeedInput) => void;
}

export const SuggestionSeedModal: FC<Props> = ({ api, editingSuggestionSeed, onHide, onCreate, onUpdate }) => {
    const [input, setInput] = useState<SuggestionSeedInput>({
        name: "",
        description: "",
        items: []
    });
    const [searchingImages, setSearchingImages] = useState(false);

    const submit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (input.items.length === 0) {
            alert("Please add at least one item");
            return;
        }
        onHide();
        if (onCreate) {
            onCreate(input);
        } else if (editingSuggestionSeed && onUpdate) {
            onUpdate(editingSuggestionSeed.id, input);
        }
    };

    useEffect(() => {
        if (editingSuggestionSeed) {
            setInput({
                name: editingSuggestionSeed.name,
                description: editingSuggestionSeed.description,
                items: editingSuggestionSeed.items
            });
        }
    }, [editingSuggestionSeed])

    return (
        <>
            <Modal show={true} onHide={onHide}>
                <form onSubmit={submit}>
                    <Modal.Header closeButton>
                        <Modal.Title>Create Suggestions Seed</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        {/* name (required) */}
                        <div className="form-group">
                            <label htmlFor="name">Name</label>
                            <input
                                required
                                type="text"
                                className="form-control"
                                id="name"
                                placeholder="Name"
                                value={input.name}
                                onChange={(e) => setInput({ ...input, name: e.target.value })}
                            />
                        </div>
                        {/* description */}
                        <div className="form-group">
                            <label htmlFor="description">Description</label>
                            <input
                                type="text"
                                className="form-control"
                                id="description"
                                placeholder="Description"
                                value={input.description}
                                onChange={(e) => setInput({ ...input, description: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="suggestions">Suggestions</label>
                            <textarea
                                className="form-control"
                                id="suggestions"
                                rows={10}
                                value={input.items.join("\n")}
                                onChange={(e) => {
                                    setInput({
                                        ...input,
                                        items: e.target.value.split("\n")
                                    });
                                }}
                            />
                        </div>
                        <div className="form-group">
                            <button type="button" className="btn btn-primary" onClick={() => setSearchingImages(true)}>
                                <i className="fas fa-search"></i>&nbsp;
                                Search Images
                            </button>
                        </div>

                    </Modal.Body>
                    <Modal.Footer>
                        <button type="submit" className="btn btn-primary">
                            {editingSuggestionSeed ? "Update" : "Create"}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={onHide}>Close</button>
                    </Modal.Footer>
                </form>
            </Modal>
            {searchingImages && <ImageSearchPopup
                api={api}
                filterOut={input.items}
                onHide={() => setSearchingImages(false)}
                onSubmit={(items) => {
                    setInput({
                        ...input,
                        items: [...input.items, ...items]
                    });
                }}
            />}
        </>

    );
}