import { FC, useEffect, useState } from "react";
import { AIBrushApi } from "../../client/api";
import { WorkerSettings, WorkerSettingsJson } from "../../lib/globalSettings";

interface Props {
    api: AIBrushApi;
}

// global settings all have a "settings_key" and "settings_json" field. settings_json is any.

// default "workers" setting:
// {
//     "minimum_worker_allocations": {
//         "stable_diffusion": 0,
//         "stable_diffusion_inpainting": 0,
//         "swinir": 0,
//     }
// }

export const GlobalSettings: FC<Props> = ({ api }) => {
    const [workerSettings, setWorkerSettings] = useState<WorkerSettingsJson>({
        minimum_worker_allocations: {
            stable_diffusion: 0,
            stable_diffusion_inpainting: 0,
            swinir: 0,
        },
    });
    const [saving, setSaving] = useState<boolean>(false);

    const loadWorkerSettings = async () => {
        const settings = await api.getGlobalSettings("workers");
        setWorkerSettings(settings.data.settings_json as any);
    };

    const saveWorkerSettings = async () => {
        setSaving(true);
        try {
            await api.updateGlobalSettings("workers", {
                settings_json: workerSettings,
            });
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        loadWorkerSettings();
    }, []);

    return (
        <div style={{paddingBottom: "48px"}}>
            {/* Header: Create new image */}
            <div className="row">
                <div className="col-12">
                    <h1>Global Settings</h1>
                </div>
            </div>
            {/* 50px vertical spacer */}
            <div className="row">
                <div className="col-12">
                    <div className="spacer" />
                </div>
            </div>
            {/* slider from 0 to 10 for each model */}
            <div className="row">
                <div className="col-12">
                    <label htmlFor="stable_diffusion">
                        stable_diffusion: {workerSettings.minimum_worker_allocations.stable_diffusion}
                    </label>
                    <input
                        style={{marginLeft: "16px"}}
                        type="range"
                        min={0}
                        max={10}
                        value={workerSettings.minimum_worker_allocations.stable_diffusion}
                        className="form-range"
                        id="stable_diffusion"
                        onChange={(e) => {
                            setWorkerSettings({
                                ...workerSettings,
                                minimum_worker_allocations: {
                                    ...workerSettings.minimum_worker_allocations,
                                    stable_diffusion: parseInt(e.target.value),
                                },
                            });
                        }}
                    />
                </div>
            </div>
            <div className="row">
                <div className="col-12">
                    <label htmlFor="stable_diffusion_inpainting">
                        stable_diffusion_inpainting: {workerSettings.minimum_worker_allocations.stable_diffusion_inpainting}
                    </label>
                    <input
                        style={{marginLeft: "16px"}}
                        type="range"
                        min={0}
                        max={10}
                        value={workerSettings.minimum_worker_allocations.stable_diffusion_inpainting}
                        className="form-range"
                        id="stable_diffusion_inpainting"
                        onChange={(e) => {
                            setWorkerSettings({
                                ...workerSettings,
                                minimum_worker_allocations: {
                                    ...workerSettings.minimum_worker_allocations,
                                    stable_diffusion_inpainting: parseInt(e.target.value),
                                },
                            });
                        }}
                    />
                </div>
            </div>
            <div className="row">
                <div className="col-12">
                    <label htmlFor="swinir">
                        swinir: {workerSettings.minimum_worker_allocations.swinir}
                    </label>
                    <input
                        style={{marginLeft: "16px"}}
                        type="range"
                        min={0}
                        max={10}
                        value={workerSettings.minimum_worker_allocations.swinir}
                        className="form-range"
                        id="swinir"
                        onChange={(e) => {
                            setWorkerSettings({
                                ...workerSettings,
                                minimum_worker_allocations: {
                                    ...workerSettings.minimum_worker_allocations,
                                    swinir: parseInt(e.target.value),
                                },
                            });
                        }}
                    />
                </div>
            </div>
            
            
            {/* bottom row: save button */}
            <div className="row">
                <div className="col-12">
                    <button className="btn btn-primary" onClick={saveWorkerSettings} disabled={saving}>
                        {saving ? <>
                            <i className="fas fa-spinner fa-spin" />
                            &nbsp; Saving...
                        </> : "Save"}
                    </button>
                </div>
            </div>
        </div>
    );
};