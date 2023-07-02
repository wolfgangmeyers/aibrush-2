import { FC } from "react";
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

    return (
        <div style={{textAlign: "left", padding: "8px"}}>
            <h5>Available Triggers</h5>
            {allTriggers.map((trigger, index) => (
                <span
                    key={index}
                    className="badge bg-secondary me-2"
                    style={{ cursor: "pointer", marginRight: "8px" }}
                    onClick={() => onAddTrigger(trigger)}
                >
                    <i className="fas fa-plus ms-2"></i>&nbsp;
                    {trigger}
                </span>
            ))}
        </div>
    );
};
