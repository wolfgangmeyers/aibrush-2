import { FC, useState } from "react";
import { Form, FormGroup, FormControl, FormText, FormCheck } from "react-bootstrap";

interface Props {
    seed: string;
    setSeed: (seed: string) => void;
}

export const SeedInput: FC<Props> = ({seed, setSeed}) => {
    const [useCustomSeed, setUseCustomSeed] = useState(false);

    return (
        <Form>
            <FormGroup>
                <FormCheck 
                    type="checkbox"
                    label="Use Custom Seed"
                    checked={useCustomSeed}
                    onChange={(e) => setUseCustomSeed(e.target.checked)}
                />
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
                </FormGroup> 
            )}
        </Form>
    );
};
