// React page to show all images
// use bootstrap
import React, { FC, useState, useEffect } from 'react';
import { useHistory } from "react-router-dom";
import { ImageThumbnail } from "../components/ImageThumbnail";
import { AIBrushApi, Image } from "../client/api";

interface Props {
    api: AIBrushApi;
    apiUrl: string;
}

export const ImagesPage: FC<Props> = ({ api, apiUrl }) => {
    const history = useHistory();
    const [images, setImages] = useState<Array<Image>>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
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
            setError(err.message);
            setLoading(false);
        });
    }, [api]);

    if (loading) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div>Error: {error}</div>;
    }

    return (
        <div className="container">
            <div className="row">
                <div className="col-md-12">
                    <h1>Images</h1>
                </div>
            </div>
            <div className="row">
                <div className="col-md-12">
                    <div className="row">
                        {images.map(image => (
                            <ImageThumbnail
                                onFork={onForkImage}
                                onClick={setSelectedImage} apiUrl={apiUrl} key={image.id} image={image} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

