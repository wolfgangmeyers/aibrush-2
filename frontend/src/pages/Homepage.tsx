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
    convertPNGToJPG,
    createBlankImage,
    createEncodedThumbnail,
    encodedImageToBlob,
    uploadBlob,
} from "../lib/imageutil";

import InfiniteScroll from "react-infinite-scroll-component";
import { ImagePopup } from "../components/ImagePopup";
import { BusyModal } from "../components/BusyModal";
import { PendingJobsThumbnail } from "../components/PendingJobsThumbnail";
import { PendingJobs } from "../components/PendingJobs";
import { ApiSocket } from "../lib/apisocket";
import { LocalImagesStore } from "../lib/localImagesStore";
import { GenerationJob, LocalImage } from "../lib/models";
import { ErrorNotification, SuccessNotification } from "../components/Alerts";
import { sleep } from "../lib/sleep";
import { ProgressBar } from "../components/ProgressBar";
import OutOfCreditsModal from "../components/OutOfCreditsModal";
import PaymentStatusModal from "../components/PaymentStatusModal";
import { HordeGenerator } from "../lib/hordegenerator";

export const anonymousClient = axios.create();
delete anonymousClient.defaults.headers.common["Authorization"];

interface Props {
    api: AIBrushApi;
    apiSocket: ApiSocket;
    generator: HordeGenerator;
    assetsUrl: string;
    localImages: LocalImagesStore;
    paymentStatus?: "success" | "canceled";
}

export const Homepage: FC<Props> = ({
    api,
    generator,
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
    const [jobs, setJobs] = useState<Array<GenerationJob>>([]);

    const [err, setErr] = useState<string | null>(null);
    const [errTime, setErrTime] = useState<number>(0);

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
                input.encoded_image = await convertPNGToJPG(
                    input.encoded_image
                );
            }
            const job = await generator.generateImages(input, (progress) => {
                setUploadingProgress(progress.loaded / progress.total);
            });
            setJobs((jobs) => [...jobs, job]);
        } catch (e: any) {
            // TODO: deal with insufficient kudos
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
            let encodedImage = input.encoded_image;
            if (!encodedImage) {
                encodedImage = createBlankImage(
                    "#ffffff",
                    input.params.width!,
                    input.params.height!
                );
            }
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
        let lock = false;

        const pollImages = async (images: Array<LocalImage>) => {
            if (lock) {
                return;
            }
            lock = true;

            try {
                const updatedJobs = await generator.checkGenerationJobs(jobs);
                let pendingJobs: GenerationJob[] = [];
                let newImages: LocalImage[] = [];
                for (let job of updatedJobs) {
                    if (job.status === "pending" || job.status == "processing") {
                        pendingJobs.push(job);
                    } else if (job.status === "completed" && job.images) {
                        for (let img of job.images) {
                            if (img.status == StatusEnum.Error) {
                                onError(
                                    img.error ||
                                        "Some images failed to generate, please make sure your prompt doesn't violate our terms of service"
                                );
                                continue;
                            }
                            newImages.push(img);
                            localImages.saveImage(img);
                        }
                    }
                }
                if (newImages.length > 0) {
                    setImages((images) => [...newImages, ...images]);
                }
                setJobs(pendingJobs);
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
    }, [generator, jobs, images, search]);

    // load parent image from saved images if an id is on the query string
    // TODO: restore this once google drive integration is in place
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

        return b.updated_at - a.updated_at;
    };

    const onLoadMore = async () => {
        // get the minimum updated_at from images
        let minUpdatedAt = moment().valueOf();
        images.forEach((image) => {
            minUpdatedAt = Math.min(minUpdatedAt, image.updated_at);
        });
        // load images in descending order from updated_at
        let resp = await localImages.listImages(
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

    const onDelete = async (image: LocalImage) => {
        try {
            // await api.deleteImage(image.id);
            let nextImage = null;
            if (selectedImage) {
                const index = images.findIndex(
                    (i) => i.id === selectedImage.id
                );
                if (index > 0) {
                    nextImage = images[index - 1];
                } else if (index === 0 && images.length > 1) {
                    nextImage = images[1];
                }
            }
            await localImages.deleteImage(image.id);
            setImages((images) => {
                return images.filter((i) => i.id !== image.id);
            });
            if (nextImage) {
                history.push(`/images/${nextImage.id}`);
            } else {
                history.push("/");
            }
        } catch (e) {
            console.error(e);
            onError("Error deleting image");
        }
    };

    const onDeleteJob = async (job: GenerationJob) => {
        await generator.client.deleteImageRequest(job.id);
        setJobs((jobs) => jobs.filter((j) => j.id !== job.id));
    }

    const onFork = async (image: LocalImage) => {
        setParentImage(image);
        // setSelectedImage(null);
        history.push("/");
        window.scrollTo(0, 0);
    };

    // TODO: refactor to use google drive
    // const onSave = async (image: LocalImage) => {
    //     setSavingImage(true);
    //     try {
    //         history.push("/");
    //         const createInput: CreateImageInput = {
    //             count: 1,
    //             params: image.params,
    //             status: StatusEnum.Saved,
    //             temporary: false,
    //             label: "",
    //             model: image.model,
    //             nsfw: image.nsfw,
    //         };

    //         const encodedImage = image.imageData!.split(",")[1];

    //         // convert base64 to binary
    //         const binaryImageData = Buffer.from(encodedImage, "base64");
    //         const encodedThumbnail = await createEncodedThumbnail(encodedImage);
    //         const binaryThumbnailData = Buffer.from(encodedThumbnail, "base64");

    //         const createResp = await api.createImage(createInput);
    //         const imageId = createResp.data.images![0].id;
    //         const uploadUrls = await api.getImageUploadUrls(imageId);
    //         await anonymousClient.put(
    //             uploadUrls.data.thumbnail_url!,
    //             binaryThumbnailData,
    //             {
    //                 headers: {
    //                     "Content-Type": "image/png",
    //                 },
    //                 onUploadProgress: (progressEvent: any) => {
    //                     const percentCompleted =
    //                         progressEvent.loaded / progressEvent.total;
    //                     setUploadingProgress(percentCompleted / 2);
    //                 },
    //             }
    //         );
    //         await anonymousClient.put(
    //             uploadUrls.data.image_url!,
    //             binaryImageData,
    //             {
    //                 headers: {
    //                     "Content-Type": "image/png",
    //                 },
    //                 onUploadProgress: (progressEvent: any) => {
    //                     const percentCompleted =
    //                         progressEvent.loaded / progressEvent.total;
    //                     setUploadingProgress(percentCompleted / 2 + 0.5);
    //                 },
    //             }
    //         );

    //         await localImages.hardDeleteImage(image.id);
    //         setImages((images) => {
    //             return images.filter((i) => i.id !== image.id);
    //         });
    //         setSuccess("Image saved");
    //         setSuccessTime(moment().valueOf());
    //     } catch (e) {
    //         console.error(e);
    //         onError("Error saving image");
    //     } finally {
    //         setSavingImage(false);
    //     }
    // };

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

    const pendingJobs = jobs.filter((job) => job.status === "pending");
    const processingJobs = jobs.filter((job) => job.status === "processing");

    return (
        <>
            <h1 style={{ fontSize: "40px", textAlign: "left" }}>
                Welcome to AiBrush - Home
            </h1>

            <ErrorNotification message={err} timestamp={errTime} />

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
                    {jobs.length > 0 && (
                        <PendingJobsThumbnail
                            pendingCount={pendingJobs.length}
                            processingCount={processingJobs.length}
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
                    // onSave={(image) => {
                    //     onSave(image);
                    // }}
                    onNSFW={onNSFW}
                    censorNSFW={censorNSFW}
                    onSwipe={onSwipe}
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
            <PendingJobs
                jobs={jobs}
                onCancel={() => setShowPendingImages(false)}
                show={showPendingImages}
                onDeleteJob={(job) => {
                    onDeleteJob(job);
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
