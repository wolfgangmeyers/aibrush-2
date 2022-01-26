import React, { FC, useEffect, useState } from "react";
import { Modal } from "react-bootstrap";
import { AIBrushApi, Image } from "../client/api";

interface Props {
    api: AIBrushApi;
    onHide: () => void;
    filterOut: string[];
    onSubmit: (input: string[]) => void;
}

export const ImageSearchPopup : FC<Props> = ({ api, onHide, filterOut, onSubmit }) => {
    const [search, setSearch] = useState("");
    const [images, setImages] = useState<Image[]>([]);
    const [filteredImages, setFilteredImages] = useState<Image[]>([]);
    const [selectedImages, setSelectedImages] = useState<{[key: string]: boolean}>({});

    useEffect(() => {
        const loadImages = async () => {
            const images = await api.listImages(undefined, 1000)
            setImages((
                images.data.images || []
            ).filter(image => !filterOut.includes(image.phrases.join("|"))));
        }
        loadImages();
    }, [api]);

    useEffect(() => {
        // case-insensitive match on search value
        const searchValue = search.toLowerCase();
        const dedup: {[key: string]: boolean} = {};
        const filteredImages = images.filter(image => {
            const name = image.label.toLowerCase().trim();
            const phrases = image.phrases.map(phrase => phrase.toLowerCase()).join("|").trim();
            const match = phrases.length > 0 && !dedup[phrases] && (name.includes(searchValue) || phrases.includes(searchValue));
            if (match) {
                dedup[phrases] = true;
            }
            return match;
        });
        setFilteredImages(filteredImages);
    }, [images, search])

    const onSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setSearch(event.target.value);
    }

    const onImageSelected = (image: Image) => {
        setSelectedImages(selectedImages => {
            return {
                ...selectedImages,
                [image.id]: !selectedImages[image.id]
            }
        });
    }

    const onSubmitClick = () => {
        if (Object.keys(selectedImages).length === 0) {
            alert("No images selected");
            return;
        }
        const selected = filteredImages.filter(image => selectedImages[image.id]);
        onHide();
        onSubmit(selected.map(image => image.phrases.join("|")));
    }

    return (
        <Modal show onHide={onHide} size="lg">
            <Modal.Header closeButton>
                <Modal.Title>Search Images</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <div className="form-group">
                    <label>Search</label>
                    <input type="text" className="form-control" value={search} onChange={onSearchChange} />
                </div>
                <div className="form-group">
                    <label>Images</label>
                    <div className="list-group">
                        {filteredImages.map(image => (
                            <div className="list-group-item" key={image.id}>
                                <div className="form-check">
                                    <input type="checkbox" className="form-check-input" checked={selectedImages[image.id]} onChange={() => onImageSelected(image)} />
                                    <label className="form-check-label">{image.phrases.join("|")}</label>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Modal.Body>
            <Modal.Footer>
                <button type="button" className="btn btn-primary" onClick={onSubmitClick}>Submit</button>
                {/* cancel */}
                <button type="button" className="btn btn-secondary" onClick={onHide}>Cancel</button>
            </Modal.Footer>
        </Modal>
    )
}