import React, { useState } from "react";
import { Button, Form, InputGroup, Alert } from "react-bootstrap";
import { AIBrushApi, CreateDepositCodeInput } from "../../client/api";
import CopyToClipboard from "react-copy-to-clipboard";

interface Props {
    api: AIBrushApi;
}

const GenerateCode: React.FC<Props> = ({ api }) => {
    const [amount, setAmount] = useState<number>(100);
    const [generatedCode, setGeneratedCode] = useState<string | null>(null);
    const [copied, setCopied] = useState<boolean>(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        const input: CreateDepositCodeInput = { amount };
        const result = await api.createDepositCode(input);
        setGeneratedCode(result.data.code);
    };

    const handleCopy = () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
    };

    return (
        <div>
            <h4>Generate deposit code</h4>
            <Form onSubmit={handleSubmit} style={{marginTop: "16px"}}>
                <InputGroup className="mb-3">
                    {/* amount label */}
                    <label style={{fontSize: "24px", marginRight: "8px"}}>Amount:</label>
                    <Form.Control
                        type="number"
                        placeholder="Amount"
                        value={amount}
                        onChange={(e) => setAmount(parseInt(e.target.value))}
                    />
                    <InputGroup.Append>
                        <Button
                            variant="primary"
                            type="submit"
                            style={{ marginLeft: "16px" }}
                        >
                            Generate Code
                        </Button>
                    </InputGroup.Append>
                </InputGroup>
            </Form>

            {generatedCode && (
                <div className="mb-3">
                    <strong>Generated Code: </strong> {generatedCode}
                    <CopyToClipboard text={generatedCode} onCopy={handleCopy}>
                        <Button variant="secondary" className="ml-2">
                            Copy to clipboard
                        </Button>
                    </CopyToClipboard>
                </div>
            )}

            {copied && (
                <Alert variant="success">Code copied to clipboard!</Alert>
            )}
        </div>
    );
};

export default GenerateCode;
