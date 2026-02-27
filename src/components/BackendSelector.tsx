import React, { FC } from "react";

interface Props {
    selectedBackend: "horde" | "nanogpt";
    onBackendChange: (backend: "horde" | "nanogpt") => void;
    /** Derived from !!nanoGPTGenerator in App.tsx (reactive to key save/clear) */
    nanogptEnabled: boolean;
}

const BackendSelector: FC<Props> = ({ selectedBackend, onBackendChange, nanogptEnabled }) => {
    if (!nanogptEnabled) return null;
    return (
        <div className="btn-group top-button" role="group" aria-label="Generation backend">
            <button
                type="button"
                className={`btn ${selectedBackend === "horde" ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => onBackendChange("horde")}
            >
                Horde
            </button>
            <button
                type="button"
                className={`btn ${selectedBackend === "nanogpt" ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => onBackendChange("nanogpt")}
            >
                NanoGPT
            </button>
        </div>
    );
};

export default BackendSelector;
