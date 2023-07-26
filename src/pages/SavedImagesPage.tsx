// V2 page
import { FC, useState, useEffect } from "react";
import { Buffer } from "buffer";
import * as uuid from "uuid";
import axios from "axios";
import qs from "qs";
import { useParams, useHistory, Link, useLocation } from "react-router-dom";
import moment from "moment";
import { ImagePrompt, defaultArgs } from "../components/ImagePrompt";
import {
    convertPNGToJPG,
    createBlankImage,
} from "../lib/imageutil";

import { BusyModal } from "../components/BusyModal";
import { PendingJobs } from "../components/PendingJobs";
import { LocalImagesStore } from "../lib/localImagesStore";
import { GenerateImageInput, GenerationJob, LocalImage } from "../lib/models";
import { ErrorNotification, SuccessNotification } from "../components/Alerts";
import { ProgressBar } from "../components/ProgressBar";
import OutOfCreditsModal from "../components/OutOfCreditsModal";
import PaymentStatusModal from "../components/PaymentStatusModal";
import { HordeGenerator } from "../lib/hordegenerator";
import { ImageClient, deleteManifestId } from "../lib/savedimages";
import { ImagesView } from "../components/ImagesView";

export const anonymousClient = axios.create();
delete anonymousClient.defaults.headers.common["Authorization"];

interface Props {
    imageClient: ImageClient;
    localImages: LocalImagesStore;
}

// TODO: extract common parts with new saved images into ImagesView component

export const SavedImagesPage: FC<Props> = ({
    imageClient,
    localImages,
}) => {
    const [selectedImage, setSelectedImage] = useState<LocalImage | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [errTime, setErrTime] = useState<number>(0);

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
                console.log("importing legacy images")
                const missingImageIds: string[] = [];
                for (let imageId of imageClient.manifest.imageIds) {
                    if (!(await localImages.getImage(imageId))) {
                        missingImageIds.push(imageId);
                    }
                }
                if (missingImageIds.length > 0) {
                    for (let imageId of missingImageIds) {
                        console.log("importing legacy image", imageId);
                        const image = await imageClient.loadImage(imageId);
                        if (image && image.status !== "error") {
                            localImages.saveImage(image);
                        }
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
        </>
    );
};
