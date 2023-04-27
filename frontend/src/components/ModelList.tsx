import { FC, useEffect, useState } from "react";
import { ListGroup } from "react-bootstrap";
import { StableDiffusionModel } from "../client";

interface Props {
    models: StableDiffusionModel[];
    onSelectModel: (model: StableDiffusionModel) => void;
    selectedModel: string;
}

export const ModelList: FC<Props> = ({ models, onSelectModel, selectedModel }) => {
    const [maxHeight, setMaxHeight] = useState(window.innerWidth < 576 ? window.innerHeight * 0.2 : window.innerHeight * 0.7); // Set maxHeight to 80% of the viewport height

    useEffect(() => {
        const handleResize = () => {
            let maxHeight = window.innerHeight * 0.7;
            if (window.innerWidth < 576) {
                maxHeight = window.innerHeight * 0.2;
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
