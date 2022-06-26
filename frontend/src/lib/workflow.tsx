
import React from "react";

export interface WorkflowConfigField {
    name: string;
    type: "string" | "number" | "boolean" | "enum";
    enum?: string[];
    min?: number;
    max?: number;
    required?: boolean;
    default: string | number | boolean;
    placeholder?: string;
}

export interface WorkflowSchema {
    display_name: string;
    workflow_type: string;
    config_fields: WorkflowConfigField[];
}

export function toInputJSX(configField: WorkflowConfigField, value: any, setValue: React.Dispatch<React.SetStateAction<any>>): JSX.Element | null {

    const onHandleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        let value: any;
        if (configField.type === "string") {
            value = event.target.value;
        } else if (configField.type === "number") {
            value = parseFloat(event.target.value);
        } else if (configField.type === "boolean") {
            value = event.target.checked;
        }
        setValue((prevState: any) => {
            return {
                ...prevState,
                [configField.name]: value
            }
        });
    }

    const onHandleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const value = event.target.value;
        setValue((prevState: any) => {
            return {
                ...prevState,
                [configField.name]: value
            }
        });
    }

    switch (configField.type) {
        case "string":
            return <input placeholder={configField.placeholder} className="form-control" type="text" value={value[configField.name] as string} onChange={onHandleInputChange} />;
        case "number":
            return <input className="form-control" type="number" value={value[configField.name] as number} onChange={onHandleInputChange} min={configField.min} max={configField.max} />;
        case "boolean":
            return <input className="form-control" type="checkbox" checked={value[configField.name] as boolean} onChange={onHandleInputChange} />;
        case "enum":
            return <select className="form-control" value={value[configField.name] as string} onChange={onHandleSelectChange}>
                {configField.enum!.map((value: string) => {
                    return <option key={value} value={value}>{value}</option>;
                })}
                </select>
        default:
            return null
    }
}

export const workflowSchemas: WorkflowSchema[] = [
    {
        display_name: "Basic Genetic Algorithm",
        workflow_type: "basic_ga",
        config_fields: [
            {
                name: "phrases",
                type: "string",
                default: "",
                placeholder: "Separate phrases | like this",
            },
            {
                name: "negative_phrases",
                type: "string",
                default: "",
                placeholder: "Separate phrases | like this",
            },
            {
                name: "generation_size",
                type: "number",
                max: 1000,
                min: 1,
                default: 10,
            },
            {
                name: "keep_count",
                type: "number",
                max: 100,
                min: 1,
                default: 2,
            },
            {
                name: "generations",
                type: "number",
                max: 100,
                min: 1,
                default: 10,
            }
        ],
    },
    {
        display_name: "Parallel Genetic Algorithm",
        workflow_type: "parallel_ga",
        config_fields: [
            {
                name: "phrases",
                type: "string",
                default: "",
            },
            {
                name: "negative_phrases",
                type: "string",
                default: "",
            },
            {
                name: "initial_model",
                type: "enum",
                default: "glid_3_xl",
                enum: [
                    "glid_3_xl",
                    "dalle_mega",
                    "vqgan_imagenet_f16_16384",
                ],
            },
            {
                name: "parallel_model",
                type: "enum",
                default: "glid_3_xl",
                enum: [
                    "glid_3_xl",
                    "vqgan_imagenet_f16_16384",
                ],
            },
            {
                name: "initial_generation_size",
                type: "number",
                max: 1000,
                min: 1,
                default: 10,
            },
            {
                name: "initial_keep_count",
                type: "number",
                max: 100,
                min: 1,
                default: 2,
            },
            {
                name: "parallel_generation_size",
                type: "number",
                max: 1000,
                min: 1,
                default: 10,
            },
            {
                name: "parallel_keep_count",
                type: "number",
                max: 100,
                min: 1,
                default: 2,
            },
            {
                name: "generations",
                type: "number",
                max: 100,
                min: 1,
                default: 10,
            },
        ],
    }
];