// V2 page
import React, { FC, useState, useEffect } from "react";
import Dropdown from "react-bootstrap/Dropdown";
import { useParams, useHistory, Link } from "react-router-dom";
import moment from "moment";
import ScrollToTop from "react-scroll-to-top";
import { ImageThumbnail } from "../components/ImageThumbnail";

import InfiniteScroll from "react-infinite-scroll-component";
import { ImagePopup } from "../components/ImagePopup";
import { BusyModal } from "../components/BusyModal";
import { PendingJobsThumbnail } from "../components/PendingJobsThumbnail";
import {
    NOTIFICATION_IMAGE_DELETED,
    NOTIFICATION_IMAGE_UPDATED,
} from "../lib/apisocket";
import { ImagesCache } from "../lib/imagesCache";
import { ImageClient } from "../lib/savedimages";
import { Image } from "../lib/models";

interface Props {
    imageClient: ImageClient;
}

const savedImagesCache = new ImagesCache();

export const SavedImagesPage: FC<Props> = ({ imageClient }) => {
    const [selectedImage, setSelectedImage] = useState<Image | null>(null);

    const [images, setImages] = useState<Array<Image>>([]);
    const [err, setErr] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState<boolean>(true);
    const [search, setSearch] = useState<string>("");
    const [searchDebounce, setSearchDebounce] = useState<string>("");

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
            imageClient.loadImage(id).then((image) => {
                setSelectedImage(image);
            });
        } else {
            setSelectedImage(null);
        }
    }, [id]);

    useEffect(() => {
        const loadImages = async () => {
            console.log("Initial load images");
            // clear error
            setErr(null);
            setHasMore(true);
            try {
                // const resp = await api.listImages(cursor, search, 100, "desc");
                const imagesResult = await savedImagesCache.listImages(
                    imageClient,
                    undefined,
                    search,
                    100
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
    }, [imageClient, search]);

    const sortImages = (a: Image, b: Image) => {
        return b.updated_at - a.updated_at;
    };

    const onLoadMore = async () => {
        // get the minimum updated_at from images
        let minUpdatedAt = moment().valueOf();
        let cursor: string | undefined = undefined;
        for (const image of images) {
            if (image.updated_at < minUpdatedAt) {
                minUpdatedAt = image.updated_at;
                cursor = image.id;
            }
        }
        // load images in descending order from updated_at
        let imagesResult = await savedImagesCache.listImages(
            imageClient,
            cursor,
            search,
            100
        );
        if (imagesResult && imagesResult.length > 0) {
            // combine images with new images and sort by updated_at descending
            setImages((images) => {
                const imagesById = images.reduce((acc, image) => {
                    acc[image.id] = image;
                    return acc;
                }, {} as { [key: string]: Image });
                imagesResult = (imagesResult || []).filter(
                    (image) => !imagesById[image.id]
                );
                return [...images, ...(imagesResult || [])].sort(sortImages);
            });
        } else {
            setHasMore(false);
        }
    };

    const onFork = async (image: Image) => {
        history.push({
            pathname: "/",
            search: `?parent=${image.id}`,
        });
    };

    const onThumbnailClicked = (image: Image) => {
        // setSelectedImage(image);
        history.push(`/saved/${image.id}`);
    };

    const onSwipe = (image: Image, direction: number) => {
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

    const onEdit = async (image: Image) => {
        history.push(`/image-editor/${image.id}`);
    };

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
                            <>
                                <button
                                    style={{ display: "inline" }}
                                    className="btn btn-primary image-popup-button"
                                    onClick={() => setCensorNSFW(!censorNSFW)}
                                >
                                    {!censorNSFW && (
                                        <i className="fas fa-eye"></i>
                                    )}
                                    {censorNSFW && (
                                        <i className="fas fa-eye-slash"></i>
                                    )}
                                </button>
                            </>
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
                    {images.map((image) => (
                        <ImageThumbnail
                            key={image.id}
                            image={image}
                            onClick={(img) => onThumbnailClicked(img as Image)}
                            censorNSFW={censorNSFW}
                        />
                    ))}
                </InfiniteScroll>
            </div>

            {selectedImage && (
                <ImagePopup
                    image={selectedImage}
                    onClose={() => history.push("/saved")}
                    onFork={(image) => {
                        onFork(image as Image);
                    }}
                    censorNSFW={censorNSFW}
                    onEdit={onEdit}
                    onSwipe={onSwipe}
                />
            )}
            <ScrollToTop />
        </>
    );
};
