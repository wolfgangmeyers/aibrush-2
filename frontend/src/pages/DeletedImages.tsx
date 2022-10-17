import React, { FC, useEffect, useState } from "react";
import { AIBrushApi, Image } from "../client";
import moment from "moment";
import { ImageThumbnail } from "../components/ImageThumbnailV2";
import { useHistory } from "react-router-dom";

interface Props {
    api: AIBrushApi;
    assetsUrl: string;
}

export const DeletedImages: FC<Props> = ({ api, assetsUrl }) => {
    const [images, setImages] = useState<Image[]>([]);

    const history = useHistory();

    const loadImages = async () => {
        const cursor = moment().add(-24, "hours").valueOf();
        const resp = await api.listImages(cursor, "", 100, "asc");
        setImages(
            (resp.data.images?.filter((image) => !!image.deleted_at) || []).sort(
                (a, b) => {
                    if (a.deleted_at && b.deleted_at) {
                        return b.deleted_at - a.deleted_at;
                    }
                    return 0;
                }
            )
        );
    };

    const onDeleteImage = async (image: Image) => {
        setImages(images.filter((i) => i.id !== image.id));
        await api.deleteImage(image.id);
    };

    const onRestoreImage = async (image: Image) => {
        setImages(images.filter((i) => i.id !== image.id));
        await api.updateImage(image.id, { deleted_at: null });
    };

    useEffect(() => {
        loadImages();
    }, [api]);

    return (
        <div>
            {/* table made of divs */}
            {/* imagethumbnail, phrases, action */}
            <div>
                {/* <div style={{ marginBottom: "8px" }}>
                    <div style={{ display: "inline-block", width: "200px" }}>
                        Image
                    </div>
                    <div style={{ display: "inline-block", width: "200px" }}>
                        Action
                    </div>
                </div> */}
                <div className="row">
                    <div className="col-12">
                        <h1 style={{ fontSize: "40px", textAlign: "left" }}>
                            <i
                                style={{ cursor: "pointer" }}
                                onClick={() => history.goBack()}
                                className="fas fa-chevron-left"
                            ></i>
                            &nbsp; Deleted Images
                        </h1>
                    </div>
                </div>
                <div className="row" style={{marginTop: "32px"}}>
                    <div className="col-sm-2 offset-sm-2">Image</div>
                    <div className="col-sm-8">Action</div>
                </div>
                {images.map((image) => (
                    <div
                        className="row"
                        style={{
                            marginTop: "16px",
                            borderBottom: "1px solid #303030",
                        }}
                    >
                        <div className="col-sm-2 offset-sm-2">
                            <ImageThumbnail
                                assetsUrl={assetsUrl}
                                image={image}
                            />
                        </div>
                        <div
                            className="col-sm-8"
                            style={{
                                paddingTop: "64px",
                                paddingBottom: "64px",
                            }}
                        >
                            <button
                                className="btn btn-danger btn-sm image-popup-delete-button"
                                onClick={() => onDeleteImage(image)}
                                style={{
                                    marginRight: "8px",
                                }}
                            >
                                <i className="fa fa-trash"></i>&nbsp;Delete
                            </button>
                            <button
                                className="btn btn-primary btn-sm image-popup-restore-button"
                                onClick={() => onRestoreImage(image)}
                            >
                                <i className="fa fa-undo"></i>&nbsp;Restore
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
