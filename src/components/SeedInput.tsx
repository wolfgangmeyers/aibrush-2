import { FC, useState, FormEvent } from "react";
import {
    Form,
    FormGroup,
    FormControl,
    FormText,
    FormCheck,
} from "react-bootstrap";

interface Props {
    seed: string;
    setSeed: (seed: string) => void;
}

export const SeedInput: FC<Props> = ({ seed, setSeed }) => {
    const [useCustomSeed, setUseCustomSeed] = useState(false);

    const onChangeCustomSeed = () => {
        setUseCustomSeed(!useCustomSeed);
        if (useCustomSeed) {
            setSeed("");
        } else {
            // set seed to a random number
            setSeed(Math.floor(Math.random() * 1000000000).toString());
        }
    };

    return (
        <>
            <FormGroup>
                <FormCheck
                    type="checkbox"
                    label="Use Custom Seed"
                    checked={useCustomSeed}
                    onChange={(e) => onChangeCustomSeed()}
                />
                <br />
                {!useCustomSeed && (
                    <span className="helptext">
                        Setting a custom seed leads to deterministic image
                        generation.
                    </span>
                )}
            </FormGroup>

            {useCustomSeed && (
                <FormGroup>
                    <FormControl
                        type="text"
                        // value={seed}
                        // onChange={(e) => setSeed(e.target.value)}
                        placeholder="Enter seed"
                        value={seed}
                        onChange={(e: any) => setSeed(e.target.value)}
                    />
                    <span className="helptext">
                        Setting a custom seed leads to deterministic image
                        generation.
                    </span>
                </FormGroup>
            )}
        </>
    );
};
