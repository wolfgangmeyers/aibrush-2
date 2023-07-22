import { FC, useEffect, useState } from "react";
import { ListGroup } from "react-bootstrap";
import { StableDiffusionModel } from "../client";

interface Props {
    models: StableDiffusionModel[];
    onSelectModel: (model: StableDiffusionModel) => void;
    selectedModel: string;
}

const MOBILE_HEIGHT_PERCENT = 0.3;

export const ModelList: FC<Props> = ({ models, onSelectModel, selectedModel }) => {
    const [maxHeight, setMaxHeight] = useState(window.innerWidth < 576 ? window.innerHeight * MOBILE_HEIGHT_PERCENT : window.innerHeight * 0.7); // Set maxHeight to 80% of the viewport height

    useEffect(() => {
        const handleResize = () => {
            let maxHeight = window.innerHeight * 0.7;
            if (window.innerWidth < 576) {
                maxHeight = window.innerHeight * MOBILE_HEIGHT_PERCENT;
            }
            setMaxHeight(maxHeight); // Update maxHeight based on the current viewport height
        };

        window.addEventListener("resize", handleResize);
        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, []);

    return (
        <ListGroup
            style={{
                maxHeight: `${maxHeight}px`,
                overflowY: "auto",
                border: "1px solid #808080",
                marginBottom: "8px",
            }}
        >
            {models.map((model) => (
                <ListGroup.Item
                    key={model.name}
                    active={selectedModel === model.name}
                    onClick={() => onSelectModel(model)}
                    style={{
                        cursor: "pointer",
                    }}
                >
                    {model.name}
                </ListGroup.Item>
            ))}
        </ListGroup>
    );
};
