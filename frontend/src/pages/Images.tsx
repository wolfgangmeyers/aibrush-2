// React page to show all images
// use bootstrap
import React, { FC, useState, useEffect } from 'react';
import moment from "moment";
import { Link, useHistory } from "react-router-dom";
import { ImageThumbnail } from "../components/ImageThumbnail";
import { AIBrushApi, Image, UpdateImageInputStatusEnum } from "../client/api";
import { ImagePopup } from "../components/ImagePopup";


interface Props {
    api: AIBrushApi;
    apiUrl: string;
}

export const ImagesPage: FC<Props> = ({ api, apiUrl }) => {
    const history = useHistory();
    const [images, setImages] = useState<Array<Image>>([]);
    const [err, setErr] = useState<string | null>(null);
    const [selectedImage, setSelectedImage] = useState<Image | null>(null);

    const onForkImage = async (image: Image) => {
        // navigate to /create-image with ?parent=image.id
        history.push(`/create-image?parent=${image.id}`)
    }

    const loadImages = async () => {
        // clear error
        setErr(null);
        try {
            const cursor = moment().add(1, "minutes").valueOf()
            const resp = await api.listImages(cursor, 100, "desc")
            if (resp.data.images) {
                setImages(resp.data.images)
            }
            return 0
        } catch (err) {
            setErr("Could not load images")
            console.error(err)
        }
    };

    const pollImages = async (images: Array<Image>) => {
        // clear error
        setErr(null);
        // set cursor to max updated_at from images
        const cursor = images.reduce((max, image) => {
            return Math.max(max, image.updated_at)
        }, 0)

        try {
            const resp = await api.listImages(cursor + 1, 100, "asc")
            if (resp.data.images) {
                // split resp.data.images into "new" and "updated" lists
                // image is "new" if it's not in images
                const newImages = resp.data.images.filter(image => {
                    return images.findIndex(i => i.id === image.id) < 0
                })
                const updatedImages = resp.data.images.filter(image => {
                    return images.findIndex(i => i.id === image.id) >= 0
                })
                setImages([
                    ...images.map(image => {
                        const updatedImage = updatedImages.find(i => i.id === image.id)
                        if (updatedImage) {
                            return updatedImage
                        }
                        return image
                    }),
                    ...newImages
                ].sort((a, b) => {
                    return b.updated_at - a.updated_at
                }))
            }
            return images;
        } catch (err) {
            setErr("Could not load images")
            console.error(err)
        }
    }

    useEffect(() => {
        if (!api) {
            return
        }
        loadImages()
    }, [api])

    useEffect(() => {
        if (!api) {
            return
        }

        const timerHandle = setInterval(() => {
            pollImages(images)
        }, 5000)
        return () => {
            clearInterval(timerHandle)
        }

    }, [api, images])

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
            {/* Link to navigate to CreateImage */}
            <div className="row">
                <div className="col-12">
                    <Link to="/create-image" className="btn btn-primary">
                        <i className="fas fa-plus"></i>&nbsp;
                        Create Image
                    </Link>
                </div>
            </div>
            <hr />
            <div className="row">
                <div className="col-md-12">
                    <div className="row">
                        {images.map(image => (
                            <ImageThumbnail
                                onSave={onSaveImage}
                                onDelete={onDeleteImage}
                                onFork={onForkImage}
                                onClick={setSelectedImage} apiUrl={apiUrl} key={image.id} image={image} />
                        ))}
                    </div>
                </div>
            </div>
            {/* show ImagePopup if selectedImage is set */}
            {selectedImage && <ImagePopup apiUrl={apiUrl} image={selectedImage as Image} onClose={() => setSelectedImage(null)} />}
        </div>
    );
};

