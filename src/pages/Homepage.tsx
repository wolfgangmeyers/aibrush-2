// V2 page
import { FC, useState, useEffect } from "react";
import { Buffer } from "buffer";
import * as uuid from "uuid";
import axios from "axios";
import qs from "qs";
import { useParams, useHistory, Link, useLocation } from "react-router-dom";
import moment from "moment";
import { ImagePrompt, defaultArgs } from "../components/ImagePrompt";
import { convertImageFormat, createBlankImage } from "../lib/imageutil";

import { BusyModal } from "../components/BusyModal";
import { PendingJobs } from "../components/PendingJobs";
import { LocalImagesStore } from "../lib/localImagesStore";
import { GenerateImageInput, GenerationJob, LocalImage } from "../lib/models";
import { ErrorNotification, SuccessNotification } from "../components/Alerts";
import { ProgressBar } from "../components/ProgressBar";
import { HordeGenerator } from "../lib/hordegenerator";
import { ImageClient } from "../lib/savedimages";
import { ImagesView } from "../components/ImagesView";

export const anonymousClient = axios.create();
delete anonymousClient.defaults.headers.common["Authorization"];

interface Props {
    generator: HordeGenerator;
    localImages: LocalImagesStore;
    savedImages: LocalImagesStore;
}

export const Homepage: FC<Props> = ({
    generator,
    localImages,
    savedImages,
}) => {
    const [creating, setCreating] = useState(false);
    const [selectedImage, setSelectedImage] = useState<LocalImage | null>(null);
    const [parentImage, setParentImage] = useState<LocalImage | null>(null);
    const [loadingParent, setLoadingParent] = useState(false);
    // const [savingImage, setSavingImage] = useState(false);
    const [uploadProgress, setUploadingProgress] = useState(0);

    const [showPendingImages, setShowPendingImages] = useState(false);

    const [jobs, setJobs] = useState<Array<GenerationJob>>([]);

    const [err, setErr] = useState<string | null>(null);
    const [errTime, setErrTime] = useState<number>(0);

    const [outOfCredits, setOutOfCredits] = useState(false);

    const { id } = useParams<{ id?: string }>();
    const history = useHistory();
    const location = useLocation();

    const onError = (err: string) => {
        setErr(err);
        setErrTime(moment().valueOf());
    };

    useEffect(() => {
        if (id) {
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

    const onSubmit = async (input: GenerateImageInput) => {
        setCreating(true);
        setParentImage(null);
        setErr(null);
        window.scrollTo(0, 0);
        setUploadingProgress(0);
        try {
            if (input.encoded_image) {
                input.encoded_image = await convertImageFormat(
                    input.encoded_image,
                    "webp",
                    "jpeg",
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

    const onEditNewImage = async (input: GenerateImageInput) => {
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
                nsfw: false,
                parent: input.parent!,
                score: 0,
                status: "completed",
                temporary: false,
                imageData: `data:image/webp;base64,${encodedImage}`,
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

    useEffect(() => {
        let lock = false;

        const pollImages = async () => {
            if (lock) {
                return;
            }
            lock = true;

            try {
                const updatedJobs = await generator.checkGenerationJobs(jobs);
                let pendingJobs: GenerationJob[] = [];
                let newImages: LocalImage[] = [];
                for (let job of updatedJobs) {
                    if (
                        job.status === "pending" ||
                        job.status == "processing"
                    ) {
                        pendingJobs.push(job);
                    } else if (job.status === "completed" && job.images) {
                        for (let img of job.images) {
                            if (img.status == "error") {
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
                setJobs(pendingJobs);
            } catch (err) {
                onError("Could not load images");
                console.error(err);
            } finally {
                lock = false;
            }
        };

        const timerHandle = setInterval(() => {
            pollImages();
        }, 2 * 1000);
        return () => {
            clearInterval(timerHandle);
        };
    }, [generator, jobs]);

    // load parent image from saved images if an id is on the query string
    // TODO: load this from saved images store
    useEffect(() => {
        const loadParent = async () => {
            const search = qs.parse(location.search, {
                ignoreQueryPrefix: true,
            });
            if (search.parent) {
                setLoadingParent(true);
                try {
                    // const parentImage = await api.getImage(
                    //     search.parent as string
                    // );
                    const parentImage = await savedImages.getImage(
                        search.parent as string
                    );
                    if (parentImage) {
                        // // const downloadUrls = await api.getImageDownloadUrls(
                        // //     parentImage.data.id
                        // // );
                        // const imageUrl = `https://aibrush2-filestore.s3.amazonaws.com/${parentImage.id}.image.png`;
                        // const resp = await anonymousClient.get(imageUrl, {
                        //     responseType: "arraybuffer",
                        // });
                        // const binaryImageData = Buffer.from(
                        //     resp.data,
                        //     "binary"
                        // );
                        // const base64ImageData =
                        //     binaryImageData.toString("base64");
                        // const src = `data:image/png;base64,${base64ImageData}`;
                        // setParentImage({
                        //     ...parentImage,
                        //     imageData: src,
                        // });
                        setParentImage(parentImage);
                        history.push("/");
                    }
                } finally {
                    setLoadingParent(false);
                }
            }
        };
        loadParent();
    }, [location.search]);

    const onDelete = async (image: LocalImage) => {
        try {
            if (selectedImage) {
                setSelectedImage(null);
            }
            history.push("/");
        } catch (e) {
            console.error(e);
            onError("Error deleting image");
        }
    };

    const onDeleteJob = async (job: GenerationJob) => {
        await generator.client.deleteImageRequest(job.id);
        setJobs((jobs) => jobs.filter((j) => j.id !== job.id));
    };

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

    const onSelectImage = (image: LocalImage | null) => {
        if (image) {
            history.push(`/images/${image.id}`);
        } else {
            history.push("/");
        }
    };

    const handleCancelFork = () => {
        setParentImage(null);
        window.scrollTo(0, 0);
    };

    return (
        <>
            <h1 style={{ fontSize: "40px", textAlign: "left" }}>
                Welcome to AiBrush - Home
            </h1>

            <ErrorNotification message={err} timestamp={errTime} />

            <ImagePrompt
                creating={creating}
                onSubmit={onSubmit}
                onEdit={onEditNewImage}
                parent={parentImage}
                onCancel={() => handleCancelFork()}
            />
            <hr />

            <ImagesView
                jobs={jobs}
                onDeleteJob={onDeleteJob}
                onEditImage={onEdit}
                onError={onError}
                onForkImage={onFork}
                onSelectImage={onSelectImage}
                onDeleteImage={onDelete}
                selectedImage={selectedImage}
                store={localImages}
            />

            <BusyModal show={creating} title="Creating images">
                <p>Please wait while we create your image.</p>
                <ProgressBar progress={uploadProgress} />
            </BusyModal>
            {/* <BusyModal show={bulkDeleting} title="Deleting images">
                <p>Please wait while we delete your images.</p>
            </BusyModal> */}
            <BusyModal show={loadingParent} title="Loading parent image">
                <p>Please wait while we load the parent image.</p>
            </BusyModal>
            {/* <BusyModal show={savingImage} title="Saving image">
                <ProgressBar progress={uploadProgress} />
            </BusyModal> */}
            <PendingJobs
                jobs={jobs}
                onCancel={() => setShowPendingImages(false)}
                show={showPendingImages}
                onDeleteJob={(job) => {
                    onDeleteJob(job);
                }}
            />
        </>
    );
};
