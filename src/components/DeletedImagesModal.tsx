import React, { FC, useState, useEffect } from 'react';
import { ImageThumbnail } from "../components/ImageThumbnail";
import { LocalImage } from "../lib/models";
import { LocalImagesStore } from "../lib/localImagesStore";
import { Modal, Button, Row, Col } from 'react-bootstrap';

interface Props {
    localImages: LocalImagesStore;
    onHide: () => void;
}

export const DeletedImagesModal: FC<Props> = ({ 
    localImages, 
    onHide,
}) => {
    const [images, setImages] = useState<LocalImage[]>([]);
    const [deleting, setDeleting] = useState(false);

    const loadImages = async () => {
        const deletedImages = await localImages.getDeletedImages();
        setImages(deletedImages);
    };

    const onDeleteImage = async (image: LocalImage) => {
        setImages(images.filter((i) => i.id !== image.id));
        await localImages.deleteImage(image.id);
        if (images.length <= 5) {
            loadImages();
        }
    };

    const onDeleteAllImages = async () => {
        setDeleting(true);
        try {
            await localImages.clearDeletedImages();
            setImages([]);
        } finally {
            setDeleting(false);
        }
    };

    const onRestoreImage = async (image: LocalImage) => {
        image = (await localImages.getImage(image.id))!;
        setImages(images.filter((i) => i.id !== image.id));
        await localImages.saveImage({
            ...image,
            deleted_at: undefined,
        });
    };

    useEffect(() => {
        loadImages();
    }, [localImages]);

    return (
        <Modal onHide={onHide} show={true} size="lg">
            <Modal.Header closeButton>
                <Modal.Title>Deleted Images</Modal.Title>
                <Button variant="danger" onClick={onDeleteAllImages} style={{ marginLeft: 'auto' }}>
                    <i className="fa fa-trash"></i>&nbsp;Delete All
                </Button>
            </Modal.Header>

            <Modal.Body>
                {images.map((image) => (
                    <Row style={{ marginTop: '16px', borderBottom: '1px solid #303030' }} key={image.id}>
                        <Col sm={2}>
                            <ImageThumbnail image={image} censorNSFW={true} />
                        </Col>
                        <Col
                            sm={8}
                            style={{
                                paddingTop: '64px',
                                paddingBottom: '64px',
                                paddingLeft: '32px',
                            }}
                        >
                            <Button variant="danger" style={{ marginRight: '8px' }} onClick={() => onDeleteImage(image)}>
                                <i className="fa fa-trash"></i>&nbsp;Delete
                            </Button>
                            <Button variant="primary" onClick={() => onRestoreImage(image)}>
                                <i className="fa fa-undo"></i>&nbsp;Restore
                            </Button>
                        </Col>
                    </Row>
                ))}
            </Modal.Body>

            <Modal.Footer>
                <Button variant="secondary" onClick={onHide}>Close</Button>
            </Modal.Footer>
        </Modal>
    );
};
