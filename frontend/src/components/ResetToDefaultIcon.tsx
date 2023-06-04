import { OverlayTrigger, Tooltip } from "react-bootstrap";

interface Props {
    onClick: () => void;
}

export const ResetToDefaultIcon = ({ onClick }: Props) => {
    return (
        <OverlayTrigger
            placement="top"
            overlay={<Tooltip id="reset-tooltip">Reset to Default</Tooltip>}
        >
            <i className="fa fa-sync" style={{
                cursor: "pointer",
            }} onClick={onClick}></i>
        </OverlayTrigger>
    );
};
