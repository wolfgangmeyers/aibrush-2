import { FC, useEffect, useState } from "react";
import { Button, Dropdown } from "react-bootstrap";
import DropboxHelper from "../lib/dropbox";

interface Props {
    dropboxHelper: DropboxHelper;
    onUploadImages: () => void;
    onDownloadImages: () => void;
}

export const RemoteImagesWidget: FC<Props> = ({
    dropboxHelper,
    onUploadImages,
    onDownloadImages,
}) => {
    const [connected, setConnected] = useState<boolean>(false);

    const handleDisconnect = () => {
        dropboxHelper.disconnect();
        setConnected(false);
    };

    useEffect(() => {
        setConnected(dropboxHelper.isAuthorized());
    }, [dropboxHelper]);

    if (!connected) {
        return (
            <Button
                variant="success"
                onClick={() => dropboxHelper.initiateAuth()}
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
