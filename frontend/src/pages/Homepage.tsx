// V2 page
import { FC, useState, useEffect } from "react";
import * as uuid from "uuid";
import axios from "axios";
import qs from "qs";
import Dropdown from "react-bootstrap/Dropdown";
import { useParams, useHistory, Link, useLocation } from "react-router-dom";
import moment from "moment";
import ScrollToTop from "react-scroll-to-top";
import { AIBrushApi } from "../client";
import { CreateImageInput, StatusEnum, TemporaryImage } from "../client/api";
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
import { ApiSocket } from "../lib/apisocket";
import { LocalImagesStore, LocalImage } from "../lib/localImagesStore";
import { ErrorNotification, SuccessNotification } from "../components/Alerts";
import { sleep } from "../lib/sleep";
import { ProgressBar } from "../components/ProgressBar";
import OutOfCreditsModal from "../components/OutOfCreditsModal";
import PaymentStatusModal from "../components/PaymentStatusModal";

export const anonymousClient = axios.create();
delete anonymousClient.defaults.headers.common["Authorization"];

interface Props {
    api: AIBrushApi;
    apiSocket: ApiSocket;
    assetsUrl: string;
    localImages: LocalImagesStore;
    paymentStatus?: "success" | "canceled";
}

export const Homepage: FC<Props> = ({
    api,
    apiSocket,
    assetsUrl,
    localImages,
    paymentStatus,
}) => {
    const [creating, setCreating] = useState(false);
    const [selectedImage, setSelectedImage] = useState<LocalImage | null>(null);
    const [parentImage, setParentImage] = useState<LocalImage | null>(null);
    const [loadingParent, setLoadingParent] = useState(false);
    const [savingImage, setSavingImage] = useState(false);
    const [uploadProgress, setUploadingProgress] = useState(0);

    const [showPendingImages, setShowPendingImages] = useState(false);

    const [images, setImages] = useState<Array<LocalImage>>([]);
    const [err, setErr] = useState<string | null>(null);
    const [errTime, setErrTime] = useState<number>(0);
    const [success, setSuccess] = useState<string | null>(null);
    const [successTime, setSuccessTime] = useState<number>(0);

    const [hasMore, setHasMore] = useState<boolean>(true);
    const [search, setSearch] = useState<string>("");
    const [searchDebounce, setSearchDebounce] = useState<string>("");

    const [bulkDeleteSelecting, setBulkDeleteSelecting] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [bulkDeleteIds, setBulkDeleteIds] = useState<{
        [key: string]: boolean;
    }>({});

    const [censorNSFW, setCensorNSFW] = useState(true);
    const [outOfCredits, setOutOfCredits] = useState(false);

    const { id } = useParams<{ id?: string }>();
    const history = useHistory();
    const location = useLocation();

    const onError = (err: string) => {
        setErr(err);
        setErrTime(moment().valueOf());
    };

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
            localImages.getImage(id).then((image) => {
                setSelectedImage(image);
                if (!image) {
                    history.replace("/");
                }
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
        setUploadingProgress(0);
        try {
            if (input.encoded_image) {
                const tmpInitImage = await api.createTemporaryImage();
                // convert base64 to binary
                const binaryImageData = Buffer.from(
                    input.encoded_image,
                    "base64"
                );
                await anonymousClient.put(
                    tmpInitImage.data.upload_url,
                    binaryImageData,
                    {
                        headers: {
                            "Content-Type": "image/png",
                        },
                        onUploadProgress: (progressEvent: any) => {
                            const percentCompleted =
                                progressEvent.loaded / progressEvent.total;
                            setUploadingProgress(percentCompleted);
                        },
                    }
                );
                input.encoded_image = undefined;
                input.tmp_image_id = tmpInitImage.data.id;
            }

            const newImages = await api.createImage(input);
            if (newImages.data.images) {
                for (let image of newImages.data.images || []) {
                    localImages.saveImage(image);
                }
                setImages((images) => {
                    return [...newImages.data.images!, ...images].sort(
                        sortImages
                    );
                });
            } else {
                onError("Could not create images");
            }
        } catch (e: any) {
            console.error(e);
            if (e.response?.data?.message?.includes("credits")) {
                setOutOfCredits(true);
                return;
            }
            onError("Error creating images");
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
            const newImage: LocalImage = {
                created_at: moment().valueOf(),
                updated_at: moment().valueOf(),
                created_by: "",
                params: {
                    steps: 20,
                    width: input.params.width,
                    height: input.params.height,
                    prompt: input.params.prompt,
                    negative_prompt: input.params.negative_prompt,
                    denoising_strength: input.params.denoising_strength,
                },
                label: "",
                id: uuid.v4(),
                model: input.model!,
                negative_score: 0,
                nsfw: !!input.nsfw,
                parent: input.parent!,
                score: 0,
                status: StatusEnum.Completed,
                temporary: false,
                imageData: `data:image/png;base64,${encodedImage}`,
            };
            await localImages.saveImage(newImage);

            history.push(`/image-editor/${newImage.id}`);
        } catch (e: any) {
            console.error(e);
            onError("Error creating image");
        } finally {
            setCreating(false);
        }
    };

    const onNSFW = async (updatedImage: LocalImage, nsfw: boolean) => {
        updatedImage = {
            ...updatedImage,
            nsfw,
        };
        await localImages.saveImage(updatedImage);
        setImages((images) => {
            return images.map((image) => {
                if (updatedImage.id === image.id) {
                    return {
                        ...image,
                        nsfw,
                    };
                }
                return image;
            });
        });
        setSelectedImage(updatedImage);
    };

    const loadImages = async (search: string) => {
        console.log("Initial load images");
        // clear error
        setErr(null);
        setHasMore(true);
        try {
            const cursor = moment().add(1, "minutes").valueOf();
            const resp = await localImages.listImages(
                cursor,
                "prev",
                100,
                search
            );
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

    useEffect(() => {
        if (!api) {
            return;
        }
        let lock = false;

        const pollImages = async (images: Array<LocalImage>) => {
            if (lock) {
                return;
            }
            lock = true;

            const pendingOrProcessingImages = images.filter((image) => {
                return (
                    image.status === "pending" || image.status === "processing"
                );
            });
            if (pendingOrProcessingImages.length === 0) {
                return;
            }

            const pendingById = pendingOrProcessingImages.reduce(
                (acc, image) => {
                    acc[image.id] = image;
                    return acc;
                },
                {} as Record<string, LocalImage>
            );

            try {
                const resp = await api.batchGetImages("id,status,nsfw,error", {
                    ids: pendingOrProcessingImages.map((image) => image.id),
                });

                if (resp.data.images) {
                    const updatedImages: Array<LocalImage> =
                        resp.data.images || [];
                    let statusChange = false;
                    for (let i = 0; i < updatedImages.length; i++) {
                        let img = updatedImages[i];
                        if (pendingById[img.id].status !== img.status) {
                            statusChange = true;
                        }
                        img = {
                            ...pendingById[img.id],
                            ...img,
                        };
                        updatedImages[i] = img;

                        if (img.status == StatusEnum.Error) {
                            onError(
                                img.error ||
                                    "Some images failed to generate, please make sure your prompt doesn't violate our terms of service"
                            );
                            await api.deleteImage(img.id);
                            await localImages.deleteImage(img.id);
                            continue;
                        }

                        if (img.status === StatusEnum.Completed) {
                            const downloadUrls = await api.getImageDownloadUrls(
                                img.id
                            );
                            const resp = await anonymousClient.get(
                                downloadUrls.data.image_url!,
                                {
                                    responseType: "arraybuffer",
                                }
                            );
                            const binaryImageData = Buffer.from(
                                resp.data,
                                "binary"
                            );
                            const base64ImageData =
                                binaryImageData.toString("base64");
                            const src = `data:image/png;base64,${base64ImageData}`;
                            img.imageData = src;
                        }
                        await localImages.saveImage(img);
                    }
                    if (statusChange) {
                        setImages((images) => {
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
                            ].sort(sortImages);
                        });
                    }
                }
            } catch (err) {
                onError("Could not load images");
                console.error(err);
            } finally {
                lock = false;
            }
        };

        const timerHandle = setInterval(() => {
            pollImages(images);
        }, 2 * 1000);
        return () => {
            clearInterval(timerHandle);
        };
    }, [api, images, search]);

    // load parent image from saved images if an id is on the query string
    useEffect(() => {
        const loadParent = async () => {
            const search = qs.parse(location.search, {
                ignoreQueryPrefix: true,
            });
            if (search.parent) {
                setLoadingParent(true);
                try {
                    const parentImage = await api.getImage(
                        search.parent as string
                    );
                    if (parentImage.data) {
                        const downloadUrls = await api.getImageDownloadUrls(
                            parentImage.data.id
                        );
                        const resp = await anonymousClient.get(
                            downloadUrls.data.image_url!,
                            {
                                responseType: "arraybuffer",
                            }
                        );
                        const binaryImageData = Buffer.from(
                            resp.data,
                            "binary"
                        );
                        const base64ImageData =
                            binaryImageData.toString("base64");
                        const src = `data:image/png;base64,${base64ImageData}`;
                        setParentImage({
                            ...parentImage.data,
                            imageData: src,
                        });
                        history.push("/");
                    }
                } finally {
                    setLoadingParent(false);
                }
            }
        };
        loadParent();
    }, [location.search]);

    const isPendingOrProcessing = (image: LocalImage) => {
        return (
            image.status === StatusEnum.Pending ||
            image.status === StatusEnum.Processing
        );
    };

    const sortImages = (a: LocalImage, b: LocalImage) => {
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
        const resp = await localImages.listImages(
            minUpdatedAt - 1,
            "prev",
            100,
            search
        );
        if (resp.length > 0) {
            // combine images with new images and sort by updated_at descending
            setImages((images) =>
                [...images, ...resp]
                    .filter((image) => !image.deleted_at)
                    .sort(sortImages)
            );
        } else {
            setHasMore(false);
        }
    };

    const onDelete = async (image: LocalImage) => {
        try {
            // await api.deleteImage(image.id);
            await localImages.deleteImage(image.id);
            setImages((images) => {
                return images.filter((i) => i.id !== image.id);
            });
            history.push("/");
        } catch (e) {
            console.error(e);
            onError("Error deleting image");
        }
    };

    const onFork = async (image: LocalImage) => {
        setParentImage(image);
        // setSelectedImage(null);
        history.push("/");
        window.scrollTo(0, 0);
    };

    const onSave = async (image: LocalImage) => {
        setSavingImage(true);
        try {
            history.push("/");
            const createInput: CreateImageInput = {
                count: 1,
                // encoded_image: image.imageData!.split(",")[1],
                params: image.params,
                status: StatusEnum.Saved,
                temporary: false,
                label: "",
                model: image.model,
            };

            const encodedImage = image.imageData!.split(",")[1];

            // convert base64 to binary
            const binaryImageData = Buffer.from(encodedImage, "base64");
            const encodedThumbnail = await createEncodedThumbnail(encodedImage);
            const binaryThumbnailData = Buffer.from(encodedThumbnail, "base64");

            const createResp = await api.createImage(createInput);
            const imageId = createResp.data.images![0].id;
            const uploadUrls = await api.getImageUploadUrls(imageId);
            await anonymousClient.put(
                uploadUrls.data.thumbnail_url!,
                binaryThumbnailData,
                {
                    headers: {
                        "Content-Type": "image/png",
                    },
                    onUploadProgress: (progressEvent: any) => {
                        const percentCompleted =
                            progressEvent.loaded / progressEvent.total;
                        setUploadingProgress(percentCompleted / 2);
                    },
                }
            );
            await anonymousClient.put(
                uploadUrls.data.image_url!,
                binaryImageData,
                {
                    headers: {
                        "Content-Type": "image/png",
                    },
                    onUploadProgress: (progressEvent: any) => {
                        const percentCompleted =
                            progressEvent.loaded / progressEvent.total;
                        setUploadingProgress(percentCompleted / 2 + 0.5);
                    },
                }
            );

            await localImages.hardDeleteImage(image.id);
            setImages((images) => {
                return images.filter((i) => i.id !== image.id);
            });
            setSuccess("Image saved");
            setSuccessTime(moment().valueOf());
        } catch (e) {
            console.error(e);
            onError("Error saving image");
        } finally {
            setSavingImage(false);
        }
    };

    const onEdit = async (image: LocalImage) => {
        history.push(`/image-editor/${image.id}`);
    };

    const onThumbnailClicked = (image: LocalImage) => {
        // setSelectedImage(image);
        if (bulkDeleteSelecting) {
            setBulkDeleteIds({
                ...bulkDeleteIds,
                [image.id]: !bulkDeleteIds[image.id],
            });
        } else {
            history.push(`/images/${image.id}`);
        }
    };

    const handleCancelFork = () => {
        setParentImage(null);
        window.scrollTo(0, 0);
    };

    const onConfirmBulkDelete = async () => {
        try {
            setBulkDeleting(true);
            const promises = Object.keys(bulkDeleteIds).map((id) => {
                return localImages.deleteImage(id);
            });
            await Promise.all(promises);
            setImages((images) => {
                return images.filter((image) => !bulkDeleteIds[image.id]);
            });
            setBulkDeleteIds({});
            setBulkDeleteSelecting(false);
        } catch (e) {
            console.error(e);
            onError("Error deleting images");
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
                Welcome to AiBrush - Home
            </h1>

            <ErrorNotification message={err} timestamp={errTime} />
            <SuccessNotification message={success} timestamp={successTime} />

            <ImagePrompt
                api={api}
                assetsUrl={assetsUrl}
                creating={creating}
                onSubmit={onSubmit}
                onEdit={onEditNewImage}
                parent={parentImage}
                onCancel={() => handleCancelFork()}
            />
            <hr />

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
                                            <Dropdown.Item
                                                onClick={() =>
                                                    history.push(
                                                        "/local-deleted-images"
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
                    onClose={() => history.push("/")}
                    onDelete={(image) => {
                        onDelete(image);
                        setImages(images.filter((i) => i.id !== image.id));
                        history.push("/");
                    }}
                    onFork={(image) => {
                        onFork(image);
                        history.push("/");
                    }}
                    onEdit={(image) => {
                        onEdit(image);
                    }}
                    onSave={(image) => {
                        onSave(image);
                    }}
                    onNSFW={onNSFW}
                    censorNSFW={censorNSFW}
                />
            )}
            <ScrollToTop />
            <BusyModal show={creating} title="Creating images">
                <p>Please wait while we create your image.</p>
                <ProgressBar progress={uploadProgress} />
            </BusyModal>
            <BusyModal show={bulkDeleting} title="Deleting images">
                <p>Please wait while we delete your images.</p>
            </BusyModal>
            <BusyModal show={loadingParent} title="Loading parent image">
                <p>Please wait while we load the parent image.</p>
            </BusyModal>
            <BusyModal show={savingImage} title="Saving image">
                {/* bootstrap progress bar for uploadProgress (0-1 value) */}
                <ProgressBar progress={uploadProgress} />
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
            <OutOfCreditsModal
                show={outOfCredits}
                onHide={() => setOutOfCredits(false)}
            />
            <PaymentStatusModal paymentStatus={paymentStatus} />
        </>
    );
};
