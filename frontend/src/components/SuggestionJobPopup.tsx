import React, { FC, useEffect, useState } from "react";
import { Modal } from "react-bootstrap";
import { AIBrushApi, SuggestionsJob, SuggestionSeed, SuggestionsJobStatusEnum } from "../client";
import { imageStatusToIconClass } from "../lib/iconhelper";

interface Props {
    api: AIBrushApi;
    suggestionJobId: string;
    suggestionSeedId: string;
    onClose: () => void;
    onSaveSuggestion: (suggestionSeedId: string, suggestion: string) => void;
    onRetry: (suggestionSeedId: string) => void;
    onGenerateImage: (suggestion: string) => void;
}

export const SuggestionJobPopup: FC<Props> = ({ api, suggestionJobId, suggestionSeedId, onClose, onSaveSuggestion, onRetry, onGenerateImage }) => {
    const [suggestionSeed, setSuggestionSeed] = useState<SuggestionSeed | null>(null);
    const [suggestionJob, setSuggestionJob] = useState<SuggestionsJob | null>(null);
    const [savedSuggestions, setSavedSuggestions] = useState<{ [key: string]: boolean }>({});

    useEffect(() => {
        if (!api) {
            return
        }
        let handle: number;
        const loadSuggestionJob = async () => {
            try {
                const resp = await api.getSuggestionsJob(suggestionJobId)
                if (resp.data) {
                    setSuggestionJob(resp.data)
                    // if status is pending or processing,
                    // poll for updates
                    if (resp.data.status === "pending" || resp.data.status === "processing") {
                        handle = window.setTimeout(() => {
                            loadSuggestionJob()
                        }, 1000);
                    }
                }
            } catch (err) {
                console.error(err)
            }
        };
        loadSuggestionJob()
        return () => {
            if (handle) {
                window.clearTimeout(handle)
            }
        }
    }, [api, suggestionJobId]);

    const saveSuggestion = (result: string) => {
        onSaveSuggestion(suggestionSeedId, result)
        setSavedSuggestions({
            ...savedSuggestions,
            [result]: true,
        })
    }

    useEffect(() => {
        if (!api) {
            return
        }
        const loadSuggestionSeed = async () => {
            // clear error
            setSuggestionSeed(null);
            try {
                const resp = await api.getSuggestionSeed(suggestionSeedId)
                if (resp.data) {
                    setSuggestionSeed(resp.data)
                }
            } catch (err) {
                console.error(err)
            }
        };
        loadSuggestionSeed()
    }, [api, suggestionSeedId]);

    // modal
    return (
        <Modal show={true} onHide={onClose} onBackdropClick={e => { }}>
            <Modal.Header>
                <Modal.Title>{suggestionSeed && `Generating suggestions for ${suggestionSeed.name}`}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {suggestionJob && (
                    <>
                        {/* Show status */}
                        <div className="row">
                            <div className="col-md-12">
                                {/* status font awesome icon */}
                                <i className={imageStatusToIconClass(suggestionJob.status)} />&nbsp;
                                {suggestionJob.status}
                            </div>
                        </div>
                        {/* one row per result */}
                        {suggestionJob.result && suggestionJob.result.map((result, index) => (
                            <div className="row" key={index}>
                                <div className="col-md-12">
                                    <div className="row" style={{ backgroundColor: "gray", margin: "5px", padding: "10px", borderRadius: "5px" }}>
                                        <div className="col-md-8">
                                            {result}
                                        </div>


                                        <div className="col-md-4">
                                            {/* actions to the right: save, generate */}
                                            <div className="pull-right">
                                                <button className="btn btn-primary btn-sm" disabled={savedSuggestions[result]} onClick={() => saveSuggestion(result)}>
                                                    {!savedSuggestions[result] && <i className="fas fa-save" />}
                                                    {savedSuggestions[result] && <i className="fas fa-check" />}
                                                </button>
                                                <button className="btn btn-primary btn-sm" style={{ marginLeft: "5px" }} onClick={() => onGenerateImage(result)}>
                                                    <i className="fas fa-play" />&nbsp;
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </>
                )}
            </Modal.Body>
            <Modal.Footer>
                {/* retry button */}
                {onRetry && suggestionJob && suggestionJob.status == SuggestionsJobStatusEnum.Completed && (
                    <button className="btn btn-primary" onClick={() => onRetry(suggestionSeedId)}>
                        <i className="fas fa-redo" />&nbsp;
                        Retry
                    </button>
                )}
                <button className="btn btn-primary" onClick={onClose}>Close</button>
            </Modal.Footer>
        </Modal>
    )
}
