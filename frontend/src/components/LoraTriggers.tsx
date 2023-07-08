import { FC } from "react";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import { SelectedLora } from "./LoraSelector";

interface Props {
    prompt: string;
    selectedLoras: SelectedLora[];
    onAddTrigger: (trigger: string) => void;
}

export const LoraTriggers: FC<Props> = ({
    prompt,
    selectedLoras,
    onAddTrigger,
}) => {
    const allTriggers = [];
    for (const lora of selectedLoras) {
        for (let trigger of lora.lora.modelVersions[0].trainedWords) {
            if (
                prompt.toLowerCase().indexOf(trigger.toLowerCase()) === -1 &&
                allTriggers.indexOf(trigger) === -1
            ) {
                allTriggers.push(trigger);
            }
        }
    }

    const renderTooltip = (trigger: string) => (
        <Tooltip id="button-tooltip">{trigger}</Tooltip>
    );

    return (
        <div style={{textAlign: "left", padding: "8px"}}>
            <h5>Available Triggers</h5>
            {allTriggers.map((trigger, index) => (
                <OverlayTrigger
                    key={index}
                    placement="top"
                    overlay={renderTooltip(trigger)}
                >
                    <span
                        className="badge bg-secondary me-2"
                        style={{ cursor: "pointer", marginRight: "8px" }}
                        onClick={() => onAddTrigger(trigger)}
                    >
                        <i className="fas fa-plus ms-2"></i>&nbsp;
                        {trigger.length > 20 ? trigger.slice(0, 20) + "..." : trigger}
                    </span>
                </OverlayTrigger>
            ))}
        </div>
    );
};
