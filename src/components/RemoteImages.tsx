import { FC, useEffect, useState } from "react";
import { Button, Dropdown } from "react-bootstrap";
import DropboxHelper from "../lib/dropbox";

interface Props {
    dropboxHelper?: DropboxHelper;
    onUploadImages: () => void;
    onDownloadImages: () => void;
}

export const RemoteImagesWidget: FC<Props> = ({
    dropboxHelper,
    onUploadImages,
    onDownloadImages,
}) => {
    const [connected, setConnected] = useState<boolean>(false);

    const handleDisconnect = async () => {
        if (!dropboxHelper) {
            return;
        }
        await dropboxHelper.disconnect();
        setConnected(false);
    };

    useEffect(() => {
        if (dropboxHelper) {
            setConnected(dropboxHelper.isAuthorized());
        }
    }, [dropboxHelper]);

    const handleClick = () => {
        if (!dropboxHelper) {
            alert("Make sure to set your api key first!");
            return;
        }
        dropboxHelper.initiateAuth();
    };

    if (!connected) {
        return (
            <Button
                variant="success"
                onClick={() => handleClick()}
            >
                <i className="fa fa-cloud"></i>&nbsp;Connect
            </Button>
        );
    }

    return (
        <Dropdown>
            <Dropdown.Toggle variant="success" id="dropdown-basic">
                <i className="fa fa-cloud"></i>&nbsp;Remote Images
            </Dropdown.Toggle>
            {/* options: upload unsaved images, download images */}
            <Dropdown.Menu>
                <Dropdown.Item onClick={onUploadImages}>
                    Upload Unsaved Images
                </Dropdown.Item>
                <Dropdown.Item onClick={onDownloadImages}>
                    Download Images
                </Dropdown.Item>
                <Dropdown.Item onClick={() => handleDisconnect()}>
                    Disconnect
                </Dropdown.Item>
            </Dropdown.Menu>
        </Dropdown>
    );
};
