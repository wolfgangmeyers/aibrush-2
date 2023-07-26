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

export const anonymousClient = axios.create();
delete anonymousClient.defaults.headers.common["Authorization"];

interface Props {
    imageClient: ImageClient;
    localImages: LocalImagesStore;
}

export const SavedImagesPage: FC<Props> = ({ imageClient, localImages }) => {
    const [selectedImage, setSelectedImage] = useState<LocalImage | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [errTime, setErrTime] = useState<number>(0);
    const [importingImages, setImportingImages] = useState<boolean>(false);
    const [importProgress, setImportProgress] = useState<number>(0);

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
                    if (!(await localImages.getImage(imageId))) {
                        missingImageIds.push(imageId);
                    }
                }
                if (missingImageIds.length > 0) {
                    setImportingImages(true);
                    setImportProgress(0);
                    let progress = 0;
                    try {
                        const batchSize = 20;
                        const numBatches = Math.ceil(missingImageIds.length / batchSize);
                        for (let i = 0; i < numBatches; i++) {
                            const batch = missingImageIds.slice(i * batchSize, (i + 1) * batchSize);
                            const batchImages = await Promise.all(batch.map(async (imageId) => {
                                console.log("importing legacy image", imageId);
                                const image = await imageClient.loadImage(imageId);
                                if (image && image.status !== "error") {
                                    const imageUrl = `https://aibrush2-filestore.s3.amazonaws.com/${image.id}.image.png`;
                                    const resp = await anonymousClient.get(
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
                            }));
                            const filteredBatchImages = batchImages.filter((image) => image !== null) as LocalImage[];
                            for (let image of filteredBatchImages) {
                                await localImages.saveImage(image);
                            }
                            progress += filteredBatchImages.length;
                            setImportProgress(progress / missingImageIds.length);
                        }
                    } catch (e) {
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

    const onDelete = async (image: LocalImage) => {
        try {
            if (selectedImage) {
                setSelectedImage(null);
            }
            // TODO: delete from server
            history.push("/saved");
        } catch (e) {
            console.error(e);
            onError("Error deleting image");
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

    return (
        <>
            <h1 style={{ fontSize: "40px", textAlign: "left" }}>
                Welcome to AiBrush - Saved
            </h1>

            <ErrorNotification message={err} timestamp={errTime} />
            <hr />

            <ImagesView
                onEditImage={onEdit}
                onError={onError}
                onForkImage={onFork}
                onSelectImage={onSelectImage}
                onDeleteImage={onDelete}
                selectedImage={selectedImage}
                store={localImages}
            />

            <BusyModal title="Importing images" show={importingImages}>
                <ProgressBar progress={importProgress} />
            </BusyModal>
        </>
    );
};
