// V2 page
import React, { FC, useState, useEffect } from "react";
import moment from "moment";
import ScrollToTop from "react-scroll-to-top";
import { AIBrushApi } from "../client";
import { CreateImageInput, Image, ImageStatusEnum } from "../client/api";
import { ImageThumbnail } from "../components/ImageThumbnailV2";
import { ImagePrompt } from "../components/ImagePrompt";

import InfiniteScroll from "react-infinite-scroll-component";
import { ImagePopup } from "../components/ImagePopupV2";

interface Props {
    api: AIBrushApi;
    assetsUrl: string;
}

export const Homepage: FC<Props> = ({ api, assetsUrl }) => {
    const [creating, setCreating] = useState(false);
    const [selectedImage, setSelectedImage] = useState<Image | null>(null);
    const [parentImage, setParentImage] = useState<Image | null>(null);

    const [images, setImages] = useState<Array<Image>>([]);
    const [err, setErr] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState<boolean>(true);

    const onSubmit = async (input: CreateImageInput) => {
        setCreating(true);
        setParentImage(null);
        setErr(null);
        window.scrollTo(0, 0);
        try {
            const newImages = await api.createImage(input);
            setImages((images) => {
                    // there is a race condition where poll images can fire before this callback
                    // so double-check to avoid duplicates
                    const imagesToAdd = (newImages.data.images || []).filter((image) => {
                        return !images.find((i) => i.id === image.id);
                    });
                    return [...imagesToAdd, ...images].sort(sortImages)
                }
            );
        } catch (e: any) {
            console.error(e);
            setErr("Error creating image");
        } finally {
            setCreating(false);
        }
    };

    useEffect(() => {
        if (!api) {
            return;
        }
        const loadImages = async () => {
            // clear error
            setErr(null);
            try {
                const cursor = moment().add(1, "minutes").valueOf();
                const resp = await api.listImages(cursor, 100, "desc");
                if (resp.data.images) {
                    setImages(resp.data.images.sort(sortImages));
                }
                return 0;
            } catch (err) {
                setErr("Could not load images");
                console.error(err);
            }
        };
        loadImages();
    }, [api]);

    useEffect(() => {
        if (!api) {
            return;
        }

        const pollImages = async (images: Array<Image>) => {
            // clear error
            setErr(null);
            // set cursor to max updated_at from images
            const cursor = images.reduce((max, image) => {
                return Math.max(max, image.updated_at);
            }, 0);

            try {
                const resp = await api.listImages(cursor + 1, 100, "asc");
                if (resp.data.images) {
                    // split resp.data.images into "new" and "updated" lists
                    // image is "new" if it's not in images
                    const newImages = resp.data.images.filter((image) => {
                        return images.findIndex((i) => i.id === image.id) < 0;
                    });
                    const updatedImages = resp.data.images.filter((image) => {
                        return images.findIndex((i) => i.id === image.id) >= 0;
                    });
                    setImages((images) =>
                        [
                            ...images.map((image) => {
                                const updatedImage = updatedImages.find(
                                    (i) => i.id === image.id
                                );
                                if (updatedImage) {
                                    return updatedImage;
                                }
                                return image;
                            }),
                            ...newImages,
                        ].sort(sortImages)
                    );
                }
                return images;
            } catch (err) {
                setErr("Could not load images");
                console.error(err);
            }
        };

        const timerHandle = setInterval(() => {
            pollImages(images);
        }, 5000);
        return () => {
            clearInterval(timerHandle);
        };
    }, [api, images]);

    const isPendingOrProcessing = (image: Image) => {
        return (
            image.status === ImageStatusEnum.Pending ||
            image.status === ImageStatusEnum.Processing
        );
    };

    const sortImages = (a: Image, b: Image) => {
        // pending and processing images always come first
        if (isPendingOrProcessing(a) && !isPendingOrProcessing(b)) {
            return -1;
        } else if (!isPendingOrProcessing(a) && isPendingOrProcessing(b)) {
            return 1;
        }
        // if the parent is the same, sort by score descending
        // otherwise, sort by updated_at
        if (
            a.parent === b.parent &&
            a.phrases.join("|") == b.phrases.join("|") &&
            a.status !== ImageStatusEnum.Pending &&
            b.status !== ImageStatusEnum.Pending
        ) {
            // if the score is the same, sort by updated_at
            let aScore = a.score;
            let bScore = b.score;
            // working around a bug where negative score was assigned
            // for an empty negative prompt.
            if (a.phrases.join("").trim() !== "") {
                aScore = aScore - a.negative_score;
            }
            if (b.phrases.join("").trim() !== "") {
                bScore = bScore - b.negative_score;
            }
            if (aScore == bScore) {
                return b.updated_at - a.updated_at;
            }
            return bScore - aScore;
        }

        return b.updated_at - a.updated_at;
    };

    const onLoadMore = async () => {
        // get the minimum updated_at from images
        let minUpdatedAt = moment().valueOf();
        images.forEach((image) => {
            minUpdatedAt = Math.min(minUpdatedAt, image.updated_at);
        });
        // load images in descending order from updated_at
        const resp = await api.listImages(minUpdatedAt - 1, 100, "desc");
        if (resp.data.images && resp.data.images.length > 0) {
            // combine images with new images and sort by updated_at descending
            setImages((images) =>
                [...images, ...(resp.data.images || [])].sort(sortImages)
            );
        } else {
            setHasMore(false);
        }
    };

    const onDelete = async (image: Image) => {
        try {
            await api.deleteImage(image.id);
        } catch (e) {
            console.error(e);
            setErr("Error deleting image");
        }
    };

    const onFork = async (image: Image) => {
        setParentImage(image);
        setSelectedImage(null);
        window.scrollTo(0, 0);
    };

    const onThumbnailClicked = (image: Image) => {
        setSelectedImage(image);
    };

    const handleCancelFork = () => {
        setParentImage(null);
        window.scrollTo(0, 0);
    };

    return (
        <>
            <h1 style={{ fontSize: "40px", textAlign: "left" }}>
                Welcome to AiBrush
            </h1>
            
            <ImagePrompt assetsUrl={assetsUrl} creating={creating} onSubmit={onSubmit} parent={parentImage} onCancel={() => handleCancelFork()} />
            <div className="homepage-images" style={{ marginTop: "48px" }}>
                <InfiniteScroll
                    dataLength={images.length}
                    next={onLoadMore}
                    hasMore={hasMore}
                    loader={<h4>Loading...</h4>}
                >
                    {images.map((image) => (
                        <ImageThumbnail
                            key={image.id}
                            image={image}
                            assetsUrl={assetsUrl}
                            onClick={onThumbnailClicked}
                        />
                    ))}
                </InfiniteScroll>
            </div>

            {selectedImage && (
                <ImagePopup
                    assetsUrl={assetsUrl}
                    image={selectedImage}
                    onClose={() => setSelectedImage(null)}
                    onDelete={(image) => {
                        onDelete(image);
                        setImages(images.filter((i) => i.id !== image.id));
                        setSelectedImage(null);
                    }}
                    onFork={(image) => {
                        onFork(image);
                        setSelectedImage(null);
                    }}
                />
            )}
            <ScrollToTop />
        </>
    );
};
