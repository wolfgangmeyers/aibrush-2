// React page to show all images
// use bootstrap
import React, { FC, useState, useEffect } from 'react';
import moment from "moment";
import { Link, useHistory } from "react-router-dom";
import { ImageThumbnail } from "../components/ImageThumbnail";
import { AIBrushApi, Image } from "../client/api";
import { ImagePopup } from "../components/ImagePopup";
import { SvgPopup } from "../components/SvgPopup";
import { setDesignerCurrentImageId } from "../lib/designer";
import { LoadMoreImages } from "../components/LoadMoreImages";

interface Props {
    api: AIBrushApi;
    apiUrl: string;
    assetsUrl: string;
}

export const ImagesPage: FC<Props> = ({ api, apiUrl, assetsUrl }) => {
    const history = useHistory();
    const [images, setImages] = useState<Array<Image>>([]);
    const [err, setErr] = useState<string | null>(null);
    const [selectedImage, setSelectedImage] = useState<Image | null>(null);
    const [loadingMore, setLoadingMore] = useState<boolean>(false);
    const [generatingSvg, setGeneratingSvg] = useState<Image | null>(null);

    const onForkImage = async (image: Image) => {
        // navigate to /create-image with ?parent=image.id
        history.push(`/create-image?parent=${image.id}`)
    }

    useEffect(() => {
        if (!api) {
            return
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
        loadImages()
    }, [api])

    useEffect(() => {
        if (!api) {
            return
        }

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
                    setImages(images => [
                        ...images.map(image => {
                            const updatedImage = updatedImages.find(i => i.id === image.id)
                            if (updatedImage) {
                                return updatedImage
                            }
                            return image
                        }),
                        ...newImages
                    ].sort(sortImages))
                }
                return images;
            } catch (err) {
                setErr("Could not load images")
                console.error(err)
            }
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
            // remove image from list
            setImages(images => images.filter(i => i.id !== image.id));
            await api.deleteImage(image.id as string)
        } catch (err) {
            console.error(err)
            setErr("Could not delete image")
        }
    }

    const onSvg = async (image: Image) => {
        setGeneratingSvg(image);
    }

    const sortImages = (a: Image, b: Image) => {
        // if the parent is the same, sort by score descending
        // otherwise, sort by updated_at
        if (a.parent === b.parent) {
            // if the score is the same, sort by updated_at
            if (a.score === b.score) {
                return b.updated_at - a.updated_at
            }
            return b.score - a.score
        }
        return b.updated_at - a.updated_at
    }

    const onLoadMore = async () => {
        setLoadingMore(true)
        try {
            // get the minimum updated_at from images
            let minUpdatedAt = moment().valueOf();
            images.forEach(image => {
                minUpdatedAt = Math.min(minUpdatedAt, image.updated_at)
            })
            // load images in descending order from updated_at
            const resp = await api.listImages(minUpdatedAt - 1, 100, "desc")
            if (resp.data.images) {
                // combine images with new images and sort by updated_at descending
                setImages(images => [
                    ...images,
                    ...(resp.data.images || [])
                ].sort(sortImages))
            }
        } finally {
            setLoadingMore(false)
        }
    }

    return (
        <>
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
                                onDelete={onDeleteImage}
                                onFork={onForkImage}
                                onClick={setSelectedImage}
                                onSvg={onSvg}
                                assetsUrl={assetsUrl}
                                apiUrl={apiUrl}
                                key={image.id}
                                image={image} />
                        ))}
                        <LoadMoreImages isLoading={loadingMore} onLoadMore={onLoadMore} />
                    </div>
                </div>
            </div>
            {/* show ImagePopup if selectedImage is set */}
            {selectedImage && (
                <ImagePopup
                    apiUrl={apiUrl}
                    assetsUrl={assetsUrl}
                    image={selectedImage as Image}
                    onClose={() => setSelectedImage(null)}
                    onDelete={onDeleteImage}
                    onFork={onForkImage}
                />
            )}
            {generatingSvg && (
                <SvgPopup api={api} apiUrl={apiUrl} image={generatingSvg} onClose={() => setGeneratingSvg(null)} />
            )}
        </>
    );
};

