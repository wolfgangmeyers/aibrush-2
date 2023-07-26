import { FC } from "react";
import { SelectedLora } from "./LoraSelector";

interface Props {
    onRemove: (lora: SelectedLora) => void;
    lora: SelectedLora;
}

// style the button like this:
// <button
//     type="button"
//     className="btn btn-secondary light-button"
//     style={{ marginLeft: "8px" }}
//     onClick={() => setSelectingLora(true)}
// >
//     <i className="fas fa-plus"></i>&nbsp;Add Lora
// </button>

// the button should have an "X" icon, and when you click the icon the onRemove function should be called
// show the name of the lora and the strength
export const SelectedLoraTag: FC<Props> = ({ onRemove, lora }) => {
    return <button
        type="button"
        className="btn btn-secondary light-button"
        style={{ marginLeft: "8px", cursor: "default" }}
    >
        {lora.lora.name}
        &nbsp;
        <i className="fas fa-times" style={{cursor: "pointer"}} onClick={() => onRemove(lora)}></i>
    </button>;
};