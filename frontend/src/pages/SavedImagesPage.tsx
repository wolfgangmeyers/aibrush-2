// V2 page
import React, { FC, useState, useEffect } from "react";
import axios from "axios";
import Dropdown from "react-bootstrap/Dropdown";
import { useParams, useHistory, Link } from "react-router-dom";
import moment from "moment";
import ScrollToTop from "react-scroll-to-top";
import { AIBrushApi } from "../client";
import { CreateImageInput, Image, StatusEnum } from "../client/api";
import { ImageThumbnail } from "../components/ImageThumbnail";
import { ImagePrompt, defaultArgs } from "../components/ImagePrompt";
import {
    createEncodedThumbnail,
    encodedImageToBlob,
    uploadBlob,
} from "../lib/imageutil";

import InfiniteScroll from "react-infinite-scroll-component";
import { ImagePopup } from "../components/ImagePopup";
import { BusyModal } from "../components/BusyModal";
import { PendingImagesThumbnail } from "../components/PendingImagesThumbnail";
import { PendingImages } from "../components/PendingImages";
import {
    ApiSocket,
    NOTIFICATION_IMAGE_DELETED,
    NOTIFICATION_IMAGE_UPDATED,
} from "../lib/apisocket";
import { KVStore } from "../lib/kvstore";
import { ImagesCache } from "../lib/imagesCache";

interface Props {
    api: AIBrushApi;
    apiSocket: ApiSocket;
    assetsUrl: string;
}

const savedImagesCache = new ImagesCache();

export const SavedImagesPage: FC<Props> = ({ api, apiSocket, assetsUrl }) => {
    const [creating, setCreating] = useState(false);
    const [selectedImage, setSelectedImage] = useState<Image | null>(null);
    const [parentImage, setParentImage] = useState<Image | null>(null);

    const [showPendingImages, setShowPendingImages] = useState(false);

    const [images, setImages] = useState<Array<Image>>([]);
    const [err, setErr] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState<boolean>(true);
    const [search, setSearch] = useState<string>("");
    const [searchDebounce, setSearchDebounce] = useState<string>("");

    const [bulkDeleteSelecting, setBulkDeleteSelecting] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [bulkDeleteIds, setBulkDeleteIds] = useState<{
        [key: string]: boolean;
    }>({});

    const [censorNSFW, setCensorNSFW] = useState(true);

    const { id } = useParams<{ id?: string }>();
    const history = useHistory();

    useEffect(() => {
        let handle = setTimeout(() => {
            setSearch(searchDebounce);
        }, 500);
        return () => {
            clearTimeout(handle);
        };
    }, [searchDebounce]);

    useEffect(() => {
        if (id) {
            // check if the image is already loaded
            const image = images.find((image) => image.id === id);
            if (image) {
                setSelectedImage(image);
            }
            // refresh
            api.getImage(id).then((image) => {
                setSelectedImage(image.data);
            });
        } else {
            setSelectedImage(null);
        }
    }, [id]);

    const onSubmit = async (input: CreateImageInput) => {
        setCreating(true);
        setParentImage(null);
        setErr(null);
        window.scrollTo(0, 0);
        try {
            await api.createImage(input);
        } catch (e: any) {
            console.error(e);
            setErr("Error creating image");
        } finally {
            setCreating(false);
        }
    };

    const onEditNewImage = async (input: CreateImageInput) => {
        setCreating(true);
        setParentImage(null);
        setErr(null);
        window.scrollTo(0, 0);
        try {
            const encodedImage = input.encoded_image!;
            const encodedThumbnail = await createEncodedThumbnail(encodedImage);
            const newImages = await api.createImage({
                ...input,
                encoded_image: undefined,
            });
            if (newImages.data.images) {
                const image = newImages.data.images![0];
                const uploadUrls = await api.getImageUploadUrls(image.id);
                // convert base64 encoded image to binary to upload as image/png with axios
                const blob = encodedImageToBlob(encodedImage);
                const thumbnailBlob = encodedImageToBlob(encodedThumbnail);
                const imagePromise = uploadBlob(
                    uploadUrls.data.image_url!,
                    blob
                );
                const thumbnailPromise = uploadBlob(
                    uploadUrls.data.thumbnail_url!,
                    thumbnailBlob
                );
                await Promise.all([imagePromise, thumbnailPromise]);

                history.push(`/image-editor/${image.id}`);
            }
        } catch (e: any) {
            console.error(e);
            setErr("Error creating image");
        } finally {
            setCreating(false);
        }
    };

    const onNSFW = (image: Image, nsfw: boolean) => {
        api.updateImage(image.id, { nsfw }).then((res) => {
            setImages((images) => {
                return images.map((i) => {
                    if (i.id === image.id) {
                        return res.data;
                    }
                    return i;
                });
            });
            setSelectedImage(res.data);
        });
    };

    useEffect(() => {
        if (!api) {
            return;
        }
        const loadImages = async () => {
            console.log("Initial load images");
            // clear error
            setErr(null);
            setHasMore(true);
            try {
                const cursor = moment().add(1, "minutes").valueOf();
                // const resp = await api.listImages(cursor, search, 100, "desc");
                const imagesResult = await savedImagesCache.listImages(
                    api,
                    cursor,
                    search,
                    100,
                    "desc"
                );
                if (imagesResult) {
                    console.log("Initial load images", imagesResult.length);
                    setImages(imagesResult.sort(sortImages));
                }
                return 0;
            } catch (err) {
                setErr("Could not load images");
                console.error(err);
            }
        };
        loadImages();
    }, [api, search]);

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
                const imagesResult = await savedImagesCache.listImages(
                    api,
                    cursor + 1,
                    search,
                    100,
                    "asc"
                );
                if (imagesResult) {
                    let latestCursor = cursor;
                    for (let image of imagesResult) {
                        if (image.updated_at > latestCursor) {
                            latestCursor = image.updated_at;
                        }
                    }

                    // split resp.data.images into "new" and "updated" lists
                    // image is "new" if it's not in images
                    const newImages = imagesResult.filter((image) => {
                        return images.findIndex((i) => i.id === image.id) < 0;
                    });
                    const updatedImages = imagesResult.filter((image) => {
                        return images.findIndex((i) => i.id === image.id) >= 0;
                    });
                    setImages((images) => {
                        const deletedIds: { [key: string]: boolean } = {};
                        for (let image of newImages) {
                            if (image.deleted_at) {
                                deletedIds[image.id] = true;
                                console.log(
                                    `Deleting image ${image.id} from list`
                                );
                            }
                        }
                        for (let image of updatedImages) {
                            if (image.deleted_at) {
                                deletedIds[image.id] = true;
                                console.log(
                                    `Deleting image ${image.id} from list`
                                );
                            }
                        }
                        images = images.filter(
                            (image) => !deletedIds[image.id]
                        );
                        return [
                            ...images.map((image) => {
                                const updatedImage = updatedImages.find(
                                    (i) => i.id === image.id
                                );
                                if (updatedImage) {
                                    return updatedImage;
                                }
                                return image;
                            }),
                            ...newImages.filter((image) => !image.deleted_at),
                        ].sort(sortImages);
                    });
                }
                return images;
            } catch (err) {
                setErr("Could not load images");
                console.error(err);
            }
        };

        // polling is now a fallback for when the websocket connection fails
        const timerHandle = setInterval(() => {
            pollImages(images);
        }, 60 * 1000);
        return () => {
            clearInterval(timerHandle);
        };
    }, [api, images, search]);

    useEffect(() => {
        // de-duplicate images by id
        // first check if there are any duplicates
        // I know, I should figure out where the duplicates are coming from,
        // but I'm lazy.
        const ids = images.map((image) => image.id);
        const uniqueIds = new Set(ids);
        if (ids.length !== uniqueIds.size) {
            setImages((images) => {
                // there are duplicates
                const uniqueImages = images.filter((image, index) => {
                    return ids.indexOf(image.id) === index;
                });
                return uniqueImages.sort(sortImages);
            });
        }
    }, [images]);

    useEffect(() => {
        const onMessage = async (message: string) => {
            const payload = JSON.parse(message);
            if (
                payload.type === NOTIFICATION_IMAGE_UPDATED ||
                payload.type === NOTIFICATION_IMAGE_DELETED
            ) {
                const updatedImage = await api.getImage(payload.id);
                if (updatedImage.data.temporary) {
                    return;
                }
                setImages((images) => {
                    const index = images.findIndex(
                        (image) => image.id === updatedImage.data.id
                    );
                    let updatedImages = images;
                    if (index >= 0) {
                        updatedImages = images.map((image) => {
                            if (image.id === updatedImage.data.id) {
                                return updatedImage.data;
                            }
                            return image;
                        });
                    } else {
                        updatedImages = [...images, updatedImage.data];
                    }
                    return updatedImages.sort(sortImages);
                });
            }
        }
        apiSocket.addMessageListener(onMessage);
        return () => {
            apiSocket.removeMessageListener(onMessage);
        };
    }, [apiSocket]);

    const isPendingOrProcessing = (image: Image) => {
        return (
            image.status === StatusEnum.Pending ||
            image.status === StatusEnum.Processing
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
            a.params.prompt == b.params.prompt &&
            a.status !== StatusEnum.Pending &&
            b.status !== StatusEnum.Pending
        ) {
            // if the score is the same, sort by updated_at
            let aScore = a.score;
            let bScore = b.score;
            // working around a bug where negative score was assigned
            // for an empty negative prompt.
            if (a.params.prompt!.trim() !== "") {
                aScore = aScore - a.negative_score;
            }
            if (b.params.prompt!.trim() !== "") {
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
        const imagesResult = await savedImagesCache.listImages(
            api,
            minUpdatedAt - 1,
            search,
            100,
            "desc"
        );
        if (imagesResult && imagesResult.length > 0) {
            // combine images with new images and sort by updated_at descending
            setImages((images) =>
                [...images, ...(imagesResult || [])].sort(sortImages)
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
        history.push({
            pathname: "/",
            search: `?parent=${image.id}`,
        });
    };

    const onEdit = async (image: Image) => {
        history.push(`/image-editor/${image.id}`);
    };

    const onThumbnailClicked = (image: Image) => {
        // setSelectedImage(image);
        if (bulkDeleteSelecting) {
            setBulkDeleteIds({
                ...bulkDeleteIds,
                [image.id]: !bulkDeleteIds[image.id],
            });
        } else {
            history.push(`/saved/${image.id}`);
        }
    };

    const handleCancelFork = () => {
        setParentImage(null);
        window.scrollTo(0, 0);
    };

    const onConfirmBulkDelete = async () => {
        try {
            setBulkDeleting(true);
            // await api.deleteImages(Object.keys(bulkDeleteIds));
            const promises = Object.keys(bulkDeleteIds).map((id) => {
                return api.deleteImage(id);
            });
            await Promise.all(promises);
            setImages((images) => {
                return images.filter((image) => !bulkDeleteIds[image.id]);
            });
            setBulkDeleteIds({});
            setBulkDeleteSelecting(false);
        } catch (e) {
            console.error(e);
            setErr("Error deleting images");
        } finally {
            setBulkDeleting(false);
        }
    };

    const completedOrSavedImages = images.filter((image) => {
        return (
            !image.deleted_at &&
            (image.status === StatusEnum.Completed ||
                image.status === StatusEnum.Saved)
        );
    });

    const pendingOrProcessingImages = images.filter(
        (image) =>
            !image.deleted_at &&
            (image.status === StatusEnum.Pending ||
                image.status === StatusEnum.Processing)
    );

    const pendingImages = pendingOrProcessingImages.filter(
        (image) => image.status === StatusEnum.Pending
    );

    const processingImages = pendingOrProcessingImages.filter(
        (image) => image.status === StatusEnum.Processing
    );

    return (
        <>
            <h1 style={{ fontSize: "40px", textAlign: "left" }}>
                Welcome to AiBrush - Saved
            </h1>

            <div
                className="saved-images"
                style={{ marginTop: "48px", paddingBottom: "48px" }}
            >
                <div style={{ textAlign: "left" }}>
                    <div
                        className="input-group"
                        style={{ marginBottom: "16px" }}
                    >
                        <input
                            style={{}}
                            value={searchDebounce}
                            type="search"
                            className="form-control image-search"
                            placeholder="Search..."
                            onChange={(e) => setSearchDebounce(e.target.value)}
                        />

                        <div
                            style={{
                                float: "right",
                            }}
                        >
                            {!bulkDeleteSelecting && (
                                <>
                                    <button
                                        style={{ display: "inline" }}
                                        className="btn btn-primary image-popup-button"
                                        onClick={() =>
                                            setCensorNSFW(!censorNSFW)
                                        }
                                    >
                                        {!censorNSFW && (
                                            <i className="fas fa-eye"></i>
                                        )}
                                        {censorNSFW && (
                                            <i className="fas fa-eye-slash"></i>
                                        )}
                                    </button>
                                    <Dropdown
                                        style={{
                                            display: "inline",
                                            marginLeft: "8px",
                                        }}
                                    >
                                        <Dropdown.Toggle variant="danger">
                                            <i className="fas fa-trash"></i>
                                        </Dropdown.Toggle>

                                        <Dropdown.Menu>
                                            <Dropdown.Item
                                                onClick={() =>
                                                    setBulkDeleteSelecting(true)
                                                }
                                            >
                                                Bulk Delete
                                            </Dropdown.Item>
                                            <Dropdown.Item
                                                onClick={() =>
                                                    history.push(
                                                        "/deleted-images"
                                                    )
                                                }
                                            >
                                                View Deleted Images
                                            </Dropdown.Item>
                                        </Dropdown.Menu>
                                    </Dropdown>
                                </>
                            )}
                            {bulkDeleteSelecting && (
                                <>
                                    <button
                                        className="btn btn-primary image-popup-button"
                                        onClick={() => {
                                            setBulkDeleteSelecting(false);
                                            setBulkDeleteIds({});
                                        }}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        style={{ marginLeft: "8px" }}
                                        className="btn image-popup-delete-button"
                                        onClick={() => {
                                            onConfirmBulkDelete();
                                        }}
                                    >
                                        Delete
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <InfiniteScroll
                    dataLength={images.length}
                    next={onLoadMore}
                    hasMore={hasMore}
                    loader={
                        <>
                            <hr />
                            <h4>Loading...</h4>
                        </>
                    }
                >
                    {pendingOrProcessingImages.length > 0 && (
                        <PendingImagesThumbnail
                            pendingCount={pendingImages.length}
                            processingCount={processingImages.length}
                            onClick={() => {
                                setShowPendingImages(true);
                            }}
                        />
                    )}
                    {completedOrSavedImages.map((image) => (
                        <ImageThumbnail
                            key={image.id}
                            image={image}
                            assetsUrl={assetsUrl}
                            onClick={onThumbnailClicked}
                            bulkDelete={
                                bulkDeleteSelecting && bulkDeleteIds[image.id]
                            }
                            censorNSFW={censorNSFW}
                        />
                    ))}
                </InfiniteScroll>
            </div>

            {selectedImage && (
                <ImagePopup
                    assetsUrl={assetsUrl}
                    image={selectedImage}
                    onClose={() => history.push("/saved")}
                    onDelete={(image) => {
                        onDelete(image);
                        setImages(images.filter((i) => i.id !== image.id));
                        history.push("/saved");
                    }}
                    onFork={(image) => {
                        onFork(image);
                    }}
                    onEdit={(image) => {
                        onEdit(image);
                    }}
                    onNSFW={onNSFW}
                    censorNSFW={censorNSFW}
                />
            )}
            <ScrollToTop />
            <BusyModal show={creating} title="Creating images">
                <p>Please wait while we create your image.</p>
            </BusyModal>
            <BusyModal show={bulkDeleting} title="Deleting images">
                <p>Please wait while we delete your images.</p>
            </BusyModal>
            <PendingImages
                images={pendingOrProcessingImages}
                onCancel={() => setShowPendingImages(false)}
                show={showPendingImages}
                onDeleteImage={(image) => {
                    onDelete(image);
                    setImages(images.filter((i) => i.id !== image.id));
                }}
            />
        </>
    );
};
