// V2 page
import { FC, useState, useEffect } from "react";
import { Buffer } from "buffer";
import axios from "axios";
import { useParams, useHistory, Link, useLocation } from "react-router-dom";
import moment from "moment";

import { LocalImagesStore } from "../lib/localImagesStore";
import { LocalImage } from "../lib/models";
import { ErrorNotification, SuccessNotification } from "../components/Alerts";
import { ProgressBar } from "../components/ProgressBar";
import { ImageClient, deleteManifestId } from "../lib/savedimages";
import { ImagesView } from "../components/ImagesView";
import { BusyModal } from "../components/BusyModal";
import { RemoteImagesWidget } from "../components/RemoteImages";
import DropboxHelper from "../lib/dropbox";

interface Props {
    imageClient: ImageClient;
    localImages: LocalImagesStore;
    dropboxHelper?: DropboxHelper;
}

export const SavedImagesPage: FC<Props> = ({
    imageClient,
    localImages,
    dropboxHelper,
}) => {
    const [selectedImage, setSelectedImage] = useState<LocalImage | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [errTime, setErrTime] = useState<number>(0);
    const [importingImages, setImportingImages] = useState<boolean>(false);
    const [exportingImages, setExportingImages] = useState<boolean>(false);
    const [deletingImages, setDeletingImages] = useState<boolean>(false);
    const [progress, setProgress] = useState<number>(0);
    const [listingImages, setListingImages] = useState<boolean>(false);

    const { id } = useParams<{ id?: string }>();
    const history = useHistory();

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
                    history.replace("/saved");
                }
            });
        } else {
            setSelectedImage(null);
        }
    }, [id]);

    // This is a one-time migration of legacy images from the old storage
    useEffect(() => {
        const loadLegacyImages = async () => {
            if (imageClient.manifest) {
                console.log("importing legacy images");
                const missingImageIds: string[] = [];
                for (let imageId of imageClient.manifest.imageIds) {
                    const localImage = await localImages.getImage(imageId);
                    if (!localImage || !localImage.imageData) {
                        missingImageIds.push(imageId);
                    }
                }
                if (missingImageIds.length > 0) {
                    setImportingImages(true);
                    setProgress(0);
                    let progress = 0;
                    try {
                        const batchSize = 20;
                        const numBatches = Math.ceil(
                            missingImageIds.length / batchSize
                        );
                        for (let i = 0; i < numBatches; i++) {
                            const batch = missingImageIds.slice(
                                i * batchSize,
                                (i + 1) * batchSize
                            );
                            const batchImages = await Promise.all(
                                batch.map(async (imageId) => {
                                    console.log(
                                        "importing legacy image",
                                        imageId
                                    );
                                    const image = await imageClient.loadImage(
                                        imageId
                                    );
                                    if (image && image.status !== "error") {
                                        const imageUrl = `https://aibrush2-filestore.s3.amazonaws.com/${image.id}.image.png`;
                                        const resp = await axios.get(
                                            imageUrl,
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
                                        return {
                                            ...image,
                                            imageData: `data:image/png;base64,${base64ImageData}`,
                                        };
                                    }
                                    return null;
                                })
                            );
                            const filteredBatchImages = batchImages.filter(
                                (image) => image !== null
                            ) as LocalImage[];
                            for (let image of filteredBatchImages) {
                                await localImages.saveImage(image);
                            }
                            progress += filteredBatchImages.length;
                            setProgress(progress / missingImageIds.length);
                        }
                    } catch (e: any) {
                        onError("Error importing images");
                        console.error(e);
                    } finally {
                        setImportingImages(false);
                    }
                }
                deleteManifestId();
                console.log("done importing legacy images");
            }
        };
        loadLegacyImages();
    }, []);

    const onDelete = async (image: LocalImage, remote: boolean) => {
        try {
            if (selectedImage) {
                setSelectedImage(null);
            }
            if (remote) {
                if (dropboxHelper) {
                    try {
                        await dropboxHelper.deleteImage(image);
                    } catch (e) {
                        console.error(e);
                        onError("Error deleting image");
                    }
                }
            }
            history.push("/saved");
        } catch (e) {
            console.error(e);
            onError("Error deleting image");
        }
    };

    const onBulkDelete = async (imageIds: string[]) => {
        setDeletingImages(true);
        setProgress(0);
        let progress = 0;
        try {
            for (const id of imageIds) {
                const image = await localImages.getImage(id);
                if (image) {
                    await localImages.deleteImage(id);
                    if (dropboxHelper) {
                        try {
                            await dropboxHelper.deleteImage(image);
                        } catch (e) {
                            console.error(e);
                            onError("Error deleting image");
                        }
                    }
                }

                progress++;
                setProgress(progress / imageIds.length);
            }
        } catch (e) {
            console.error(e);
            onError("Error deleting image");
        } finally {
            setDeletingImages(false);
        }
    };

    const onFork = async (image: LocalImage) => {
        history.push({
            pathname: "/",
            search: `?parent=${image.id}`,
        });
    };

    const onEdit = async (image: LocalImage) => {
        history.push(`/image-editor/${image.id}`);
    };

    const onSelectImage = (image: LocalImage | null) => {
        if (image) {
            history.push(`/saved/${image.id}`);
        } else {
            history.push("/saved");
        }
    };

    const onUploadImages = async () => {
        if (!dropboxHelper) {
            return;
        }
        setListingImages(true);
        const imageIds = await dropboxHelper.listRemoteImages();
        const byId = imageIds.reduce((acc, id) => {
            acc[id] = true;
            return acc;
        }, {} as { [id: string]: boolean });
        const allImageIds = await localImages.listAllImageIds();
        const imagesToUpload = allImageIds.filter((id) => !byId[id]);
        setListingImages(false);
        if (imagesToUpload.length > 0) {
            setExportingImages(true);
            setProgress(0);
            let progress = 0;
            try {
                for (const imageId of imagesToUpload) {
                    const image = await localImages.getImage(imageId);
                    if (image) {
                        await dropboxHelper.uploadImage(image);
                    }
                    progress++;
                    setProgress(progress / imagesToUpload.length);
                }
            } catch (e) {
                onError("Error uploading images");
                console.error(e);
            } finally {
                setExportingImages(false);
            }
        }
    };

    const onDownloadImages = async () => {
        if (!dropboxHelper) {
            return;
        }
        setListingImages(true);
        const imageIds = await dropboxHelper.listRemoteImages();
        
        console.log("remote image ids", imageIds);
        // TODO: popup where user can select which images to download
        const imagesToDownload: string[] = [];
        for (const imageId of imageIds) {
            const image = await localImages.getImage(imageId);
            if (!image || !image.imageData) {
                imagesToDownload.push(imageId);
            }
        }
        setListingImages(false);
        if (imagesToDownload.length > 0) {
            setImportingImages(true);
            setProgress(0);
            let progress = 0;
            let errors = false;
            try {
                for (const imageId of imagesToDownload) {
                    try {
                        const image = await dropboxHelper.downloadImage(
                            imageId
                        );
                        await localImages.saveImage(image);
                    } catch (e) {
                        console.error(e);
                        onError("Some images failed to download");
                        errors = true;
                    }
                    progress++;
                    setProgress(progress / imagesToDownload.length);
                }
            } finally {
                setImportingImages(false);
                if (!errors) {
                    window.location.reload();
                }
            }
        }
    };

    return (
        <>
            <h1 style={{ fontSize: "40px", textAlign: "left" }}>
                Welcome to AiBrush - Saved
            </h1>

            <ErrorNotification message={err} timestamp={errTime} />
            <hr />
            {/* container with flex alignment to the right */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    paddingRight: "185px",
                }}
            >
                <RemoteImagesWidget
                    dropboxHelper={dropboxHelper}
                    onUploadImages={onUploadImages}
                    onDownloadImages={onDownloadImages}
                    listingImages={listingImages}
                />
            </div>
            <ImagesView
                connected={dropboxHelper?.isAuthorized() ?? false}
                onEditImage={onEdit}
                onError={onError}
                onForkImage={onFork}
                onSelectImage={onSelectImage}
                onDeleteImage={onDelete}
                onBulkDelete={onBulkDelete}
                selectedImage={selectedImage}
                store={localImages}
            />

            <BusyModal title="Importing images" show={importingImages}>
                <ProgressBar progress={progress} />
            </BusyModal>
            <BusyModal title="Exporting images" show={exportingImages}>
                <ProgressBar progress={progress} />
            </BusyModal>
            {/* deleting images */}
            <BusyModal title="Deleting images" show={deletingImages}>
                <ProgressBar progress={progress} />
            </BusyModal>
        </>
    );
};
