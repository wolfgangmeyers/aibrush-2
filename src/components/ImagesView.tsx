import { FC, useEffect, useState } from "react";
import { LocalImagesStore } from "../lib/localImagesStore";
import { Dropdown } from "react-bootstrap";
import { ImagePopup } from "./ImagePopup";
import { GenerationJob, LocalImage } from "../lib/models";
import InfiniteScroll from "react-infinite-scroll-component";
import moment from "moment";
import { PendingJobsThumbnail } from "./PendingJobsThumbnail";
import { ImageThumbnail } from "./ImageThumbnail";
import { PendingJobs } from "./PendingJobs";
import ScrollToTop from "react-scroll-to-top";

interface Props {
    store: LocalImagesStore;
    jobs?: Array<GenerationJob>;
    onError: (err: string) => void;
    onBulkDelete?: (ids: Array<string>) => void;
    selectedImage: LocalImage | null;
    onSelectImage: (image: LocalImage | null) => void;
    onDeleteImage: (image: LocalImage) => void;
    onDeleteRemoteImage?: (image: LocalImage) => void;
    onForkImage: (image: LocalImage) => void;
    onEditImage: (image: LocalImage) => void;
    onUpdateImage?: (image: LocalImage) => void;
    onDeleteJob?: (job: GenerationJob) => void;
}

export const ImagesView: FC<Props> = ({
    store,
    jobs,
    onError,
    onBulkDelete,
    selectedImage,
    onSelectImage,
    onDeleteImage,
    onForkImage,
    onEditImage,
    onUpdateImage,
    onDeleteJob,
}) => {
    const [searchDebounce, setSearchDebounce] = useState<string>("");
    const [search, setSearch] = useState<string>("");
    const [bulkDeleteSelecting, setBulkDeleteSelecting] = useState(false);
    const [censorNSFW, setCensorNSFW] = useState(true);
    const [bulkDeleteIds, setBulkDeleteIds] = useState<{
        [key: string]: boolean;
    }>({});
    const [images, setImages] = useState<Array<LocalImage>>([]);
    const [hasMore, setHasMore] = useState<boolean>(true);
    const [showPendingImages, setShowPendingImages] = useState(false);

    const onConfirmBulkDelete = async () => {
        try {
            const promises = Object.keys(bulkDeleteIds).map((id) => {
                return store.deleteImage(id);
            });
            await Promise.all(promises);
            setImages((images) => {
                return images.filter((image) => !bulkDeleteIds[image.id]);
            });
            setBulkDeleteIds({});
            setBulkDeleteSelecting(false);
            if (onBulkDelete) {
                onBulkDelete(Object.keys(bulkDeleteIds));
            }
        } catch (e) {
            console.error(e);
            onError("Error deleting images");
        }
    };

    const onLoadMore = async () => {
        // get the minimum updated_at from images
        let minUpdatedAt = moment().valueOf();
        images.forEach((image) => {
            minUpdatedAt = Math.min(minUpdatedAt, image.updated_at);
        });
        // load images in descending order from updated_at
        let resp = await store.listImages(
            minUpdatedAt - 1,
            "prev",
            100,
            search
        );
        if (resp.length > 0) {
            // combine images with new images and sort by updated_at descending
            setImages((images) => {
                // filtering is required due to a race condition
                const imagesById = images.reduce((acc, image) => {
                    acc[image.id] = image;
                    return acc;
                }, {} as { [key: string]: LocalImage });
                resp = resp.filter((image) => !imagesById[image.id]);
                return [...images, ...resp]
                    .filter((image) => !image.deleted_at)
                    .sort(sortImages);
            });
        } else {
            setHasMore(false);
        }
    };

    const sortImages = (a: LocalImage, b: LocalImage) => {
        return b.updated_at - a.updated_at;
    };

    const onThumbnailClicked = (image: LocalImage) => {
        // setSelectedImage(image);
        if (bulkDeleteSelecting) {
            setBulkDeleteIds({
                ...bulkDeleteIds,
                [image.id]: !bulkDeleteIds[image.id],
            });
        } else {
            onSelectImage(image);
        }
    };

    const onDelete = async (image: LocalImage) => {
        try {
            await store.deleteImage(image.id);
            setImages((images) => {
                return images.filter((i) => i.id !== image.id);
            });
            // TODO: delete just locally or also remotely?
            if (onDeleteImage) {
                onDeleteImage(image);
            }
        } catch (e) {
            console.error(e);
            onError("Error deleting image");
        }
    };

    const onSwipe = (image: LocalImage, direction: number) => {
        // select the previous or next image from the currently selected one
        const index = images.findIndex((i) => i.id === image.id);
        if (index === -1) {
            return;
        }
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= images.length) {
            return;
        }
        const newImage = images[newIndex];
        onThumbnailClicked(newImage);
    };

    const onNSFW = async (image: LocalImage) => {
        try {
            const updatedImage = {
                ...image,
                nsfw: !image.nsfw,
            };
            await store.saveImage(updatedImage);
            if (onUpdateImage) {
                onUpdateImage(updatedImage);
            }
        } catch (e) {
            console.error(e);
            onError("Error updating image");
        }
    };

    const loadImages = async (search: string) => {
        console.log("Initial load images");
        // clear error
        setHasMore(true);
        try {
            const cursor = moment().add(1, "minutes").valueOf();
            const resp = await store.listImages(cursor, "prev", 100, search);
            setImages(resp.sort(sortImages));
            return;
        } catch (err) {
            onError("Could not load images");
            console.error(err);
        }
    };

    useEffect(() => {
        loadImages(search);
    }, [search]);

    // poll for updates. Images may be added as jobs complete.
    useEffect(() => {
        const handle = setInterval(async () => {
            const maxUpdatedAt = images.reduce((acc, image) => {
                return Math.max(acc, image.updated_at);
            }, 0);
            const resp = await store.listImages(
                maxUpdatedAt,
                "next",
                100,
                search
            );
            if (resp.length > 0) {
                setImages((images) => {
                    const imagesById = images.reduce((acc, image) => {
                        acc[image.id] = image;
                        return acc;
                    }, {} as { [key: string]: LocalImage });
                    const newImages = resp.filter(
                        (image) => !imagesById[image.id]
                    );
                    return [...images, ...newImages].sort(sortImages);
                });
            }
        }, 1000);
        return () => {
            clearInterval(handle);
        };
    }, [store, search, images]);

    useEffect(() => {
        let handle = setTimeout(() => {
            setSearch(searchDebounce);
        }, 500);
        return () => {
            clearTimeout(handle);
        };
    }, [searchDebounce]);

    const pendingJobs = jobs
        ? jobs.filter((job) => job.status === "pending")
        : [];
    const processingJobs = jobs
        ? jobs.filter((job) => job.status === "processing")
        : [];

    return (
        <>
            <div
                className="homepage-images"
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
                                            {/* TODO: make this a popup */}
                                            {/* <Dropdown.Item
                                                onClick={() =>
                                                    history.push(
                                                        "/local-deleted-images"
                                                    )
                                                }
                                            >
                                                View Deleted Images
                                            </Dropdown.Item> */}
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
                    {pendingJobs.length + processingJobs.length > 0 && (
                        <PendingJobsThumbnail
                            pendingCount={pendingJobs.length}
                            processingCount={processingJobs.length}
                            onClick={() => {
                                setShowPendingImages(true);
                            }}
                        />
                    )}
                    {images.map((image) => (
                        <ImageThumbnail
                            key={image.id}
                            image={image}
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
                    image={selectedImage}
                    onClose={() => onSelectImage(null)}
                    onDelete={(image) => {
                        onDelete(image);
                    }}
                    onFork={(image) => {
                        onForkImage(image);
                    }}
                    onEdit={(image) => {
                        onEditImage(image);
                    }}
                    // onSave={(image) => {
                    //     onSave(image);
                    // }}
                    onNSFW={(image) => {
                        onNSFW(image);
                    }}
                    censorNSFW={censorNSFW}
                    onSwipe={onSwipe}
                />
            )}
            {jobs && onDeleteJob && (
                <PendingJobs
                    jobs={jobs}
                    onCancel={() => {
                        setShowPendingImages(false);
                    }}
                    onDeleteJob={onDeleteJob}
                    show={showPendingImages}
                />
            )}
            <ScrollToTop />
        </>
    );
};
