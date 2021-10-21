// React page to show all images
// use bootstrap
import React, { FC, useState, useEffect } from 'react';
import { useHistory } from "react-router-dom";
import { ImageThumbnail } from "../components/ImageThumbnail";
import { AIBrushApi, Image, UpdateImageInputStatusEnum } from "../client/api";

interface Props {
    api: AIBrushApi;
    apiUrl: string;
}

export const ImagesPage: FC<Props> = ({ api, apiUrl }) => {
    const history = useHistory();
    const [images, setImages] = useState<Array<Image>>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [err, setErr] = useState<string | null>(null);
    const [selectedImage, setSelectedImage] = useState<Image | null>(null);

    const onForkImage = async (image: Image) => {
        // navigate to /create-image with ?parent=image.id
        history.push(`/create-image?parent=${image.id}`)
    }

    useEffect(() => {
        api.listImages().then(images => {
            if (images.data.images) {
                setImages(images.data.images);
            }
            setLoading(false);
        }).catch(err => {
            setErr("Could not load images");
            setLoading(false);
        });
    }, [api]);

    const onDeleteImage = async (image: Image) => {
        // clear error
        setErr("")
        // attempt to delete image
        try {
            await api.deleteImage(image.id as string)
            // remove image from list
            setImages(images.filter(i => i.id !== image.id));
        } catch (err) {
            console.error(err)
            setErr("Could not delete image")
        }
    }

    const onSaveImage = async (image: Image) => {
        // patch image with status=saved
        try {
            const resp = await api.updateImage(image.id as string, { status: UpdateImageInputStatusEnum.Saved })
            // update image in list
            setImages(images.map(i => i.id === image.id ? resp.data : i))
        } catch (err) {
            console.error(err)
            setErr("Could not save image")
        }
    }

    if (loading) {
        return <div>Loading...</div>;
    }

    return (
        <div className="container">
            <div className="row">
                <div className="col-md-12">
                    <h1>Images</h1>
                </div>
            </div>
            {/* display error message if one is set */}
            {err && <div className="row">
                <div className="col-12">
                    <div className="alert alert-danger" role="alert">
                        {err}
                    </div>
                </div>
            </div>}
            <hr />
            <div className="row">
                <div className="col-md-12">
                    <div className="row">
                        {images.map(image => (
                            <ImageThumbnail
                                onSave={() => onSaveImage(image)}
                                onDelete={() => onDeleteImage(image)}
                                onFork={onForkImage}
                                onClick={setSelectedImage} apiUrl={apiUrl} key={image.id} image={image} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

