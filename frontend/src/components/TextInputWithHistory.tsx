import React, { useState } from "react";
import { InputGroup, FormControl, Dropdown } from "react-bootstrap";

interface TextInputWithHistoryProps {
    value: string;
    onChange: (newValue: string) => void;
    history: string[];
}

const TextInputWithHistory: React.FC<TextInputWithHistoryProps> = ({
    value,
    onChange,
    history,
}) => {
    const [show, setShow] = useState(false);

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        onChange(event.target.value);
    };

    const handleDropdownSelect = (eventKey: string | null) => {
        if (eventKey) {
            onChange(eventKey);
        }
        setShow(false);
    };

    const handleInputClick = () => {
        setShow(!show);
    };

    return (
        <div>
            <FormControl
                value={value}
                onChange={handleInputChange}
                onClick={handleInputClick}
                onBlur={() => {
                    setTimeout(() => setShow(false), 200);
                }}
            />
            <Dropdown show={show} onSelect={handleDropdownSelect}>
                <Dropdown.Toggle
                    variant="success"
                    id="dropdown-basic"
                    style={{ height: "0px", padding: "0px", visibility: "hidden", position: "absolute" }}
                />
                <Dropdown.Menu style={{width: "100%", overflow: "hidden"}}>
                    {history.map((item, index) => (
                        <Dropdown.Item eventKey={item} key={index}>
                            {item}
                        </Dropdown.Item>
                    ))}
                </Dropdown.Menu>
            </Dropdown>
        </div>
    );
};

export default TextInputWithHistory;
