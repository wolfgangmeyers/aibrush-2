// React page to show all images
// use bootstrap
import React, { FC, useState, useEffect } from 'react';
import moment from "moment";
import { Link, useHistory } from "react-router-dom";
import { ImageThumbnail } from "../components/ImageThumbnail";
import { AIBrushApi, Image } from "../client/api";
import { ImagePopup } from "../components/ImagePopup";
import { SvgPopup } from "../components/SvgPopup";
import { setDesignerCurrentImageId } from "../lib/designer";
import { LoadMoreImages } from "../components/LoadMoreImages";

interface Props {
    api: AIBrushApi;
    apiUrl: string;
    assetsUrl: string;
}

export const ImagesPage: FC<Props> = ({ api, apiUrl, assetsUrl }) => {

    const history = useHistory();
    useEffect(() => {
        history.push("/");
    }, [history]);

    return (
        <>
            
        </>
    );
};

