import React, { FC, useState, useEffect } from "react";
import { useHistory } from "react-router-dom";
import { AIBrushApi, SuggestionSeed, SuggestionSeedInput, SuggestionsJob } from "../client";
import { sleep } from "../lib/sleep";

import { SuggestionSeedTile } from "../components/SuggestionSeedTile";
import { SuggestionSeedModal } from "../components/SuggestionSeedModal";
import { SuggestionJobPopup } from "../components/SuggestionJobPopup";
import { ViewSuggestionSeedModal } from "../components/ViewSuggestionSeedModal";

interface Props {
    api: AIBrushApi;
    apiUrl: string;
}

export const SuggestionsPage: FC<Props> = ({ api, apiUrl }) => {
    const [suggestionSeeds, setSuggestionSeeds] = useState<SuggestionSeed[]>([]);
    const [err, setErr] = useState<string | null>(null);

    const [creatingSuggestionSeed, setCreatingSuggestionSeed] = useState<boolean>(false);
    const [editingSuggestionSeed, setEditingSuggestionSeed] = useState<SuggestionSeed | null>(null);
    const [viewingSuggestionSeed, setViewingSuggestionSeed] = useState<SuggestionSeed | null>(null);
    const [selectedSuggestionSeedId, setSelectedSuggestionSeedId] = useState<string | null>(null);
    const [runningSuggestionJobId, setRunningSuggestionJobId] = useState<string | null>(null);

    const history = useHistory();

    const onView = async (suggestionSeed: SuggestionSeed) => {
        // TODO: show details modal
    };

    const onGenerate = async (suggestionSeedId: string) => {
        // clear error
        setErr(null);
        // create a new job with this seed
        try {
            const resp = await api.createSuggestionsJob({
                seed_id: suggestionSeedId,
            });
            setSelectedSuggestionSeedId(suggestionSeedId);
            setRunningSuggestionJobId(resp.data.id);
        } catch (err) {
            console.error(err)
            setErr("Could not generate suggestions")
        }
    }

    const onGenerateClose = () => {
        setSelectedSuggestionSeedId(null);
        setRunningSuggestionJobId(null);
    }

    const onCreateClick = () => {
        setCreatingSuggestionSeed(true);
    }

    const onCancelCreateSuggestionSeed = () => {
        setCreatingSuggestionSeed(false);
    }

    const onCreateSuggestionSeed = async (suggestionSeed: SuggestionSeedInput) => {
        const result = await api.createSuggestionSeed(suggestionSeed);
        setCreatingSuggestionSeed(false);
        setSuggestionSeeds(suggestionSeeds => [...suggestionSeeds, result.data]);
    }

    const onEditSuggestionSeed = (suggestionSeed: SuggestionSeed) => {
        setEditingSuggestionSeed(suggestionSeed);
    }

    const onCancelEditSuggestionSeed = () => {
        setEditingSuggestionSeed(null);
    }

    const onUpdateSuggestionSeed = async (id: string, input: SuggestionSeedInput) => {
        const result = await api.updateSuggestionSeed(id, input);
        setEditingSuggestionSeed(null);
        setSuggestionSeeds(suggestionSeeds => suggestionSeeds.map(suggestionSeed => suggestionSeed.id === id ? result.data : suggestionSeed));
    }

    const onSaveSuggestion = async (suggestionSeedId: string, suggestion: string) => {
        // clear error
        setErr(null);
        try {
            const seed = await api.getSuggestionSeed(suggestionSeedId);
            await onUpdateSuggestionSeed(seed.data.id, {
                ...seed.data,
                items: [...seed.data.items, suggestion],
            });
        } catch(err) {
            console.error(err);
            setErr("Could not save suggestion")
        }
    }

    const onRetryGenerateSuggestions = async (suggestionSeedId: string) => {
        setRunningSuggestionJobId(null);
        await sleep(500);
        await onGenerate(suggestionSeedId);
    }

    const onDeleteSuggestionSeed = async(seed: SuggestionSeed) => {
        if (window.confirm("Are you sure you want to delete this seed?")) {
            // clear error
            setErr(null);
            try {
                await api.deleteSuggestionSeed(seed.id);
                setSuggestionSeeds(suggestionSeeds => suggestionSeeds.filter(s => s.id !== seed.id));
            } catch(err) {
                console.error(err);
                setErr("Could not delete seed");
            }
        }
    }

    const onGenerateImage = async (suggestion: string) => {
        setRunningSuggestionJobId(null);
        setViewingSuggestionSeed(null);
        localStorage.setItem("suggestion", suggestion);
        history.push(`/create-image`);
    }

    const onViewSuggestionSeed = (seed: SuggestionSeed) => {
        setViewingSuggestionSeed(seed);
    }

    const onCloseViewSuggestionSeed = () => {
        setViewingSuggestionSeed(null);
    }

    useEffect(() => {
        const loadSuggestionSeeds = async () => {
            // clear error
            setErr(null);
            try {
                const resp = await api.listSuggestionSeeds()
                if (resp.data.suggestionSeeds) {
                    setSuggestionSeeds(resp.data.suggestionSeeds)
                }
            } catch (err) {
                setErr("Could not load suggestion seeds")
                console.error(err)
            }
        };
        if (!api) {
            return
        }
        loadSuggestionSeeds()
    }, [api])

    return (
        <>
            <div className="row">
                <div className="col-md-12">
                    <h1>Suggestions</h1>
                </div>
            </div>
            {/* display error if one is set in a new row */}
            {err && <div className="row"><div className="col-md-12"><div className="alert alert-danger">{err}</div></div></div>}
            {/* display suggestion seeds */}
            {/* Button for create suggestions seed popup */}
            <div className="row">
                <div className="col-md-12">
                    <button className="btn btn-primary" onClick={onCreateClick}>Create Suggestion Seed</button>
                </div>
            </div>
            <div className="row">
                <div className="col-md-12">
                    <div className="row">
                        {suggestionSeeds.map(suggestionSeed => (
                            <SuggestionSeedTile
                                key={suggestionSeed.id}
                                suggestionSeed={suggestionSeed}
                                onGenerate={seed => onGenerate(seed.id)}
                                onEdit={onEditSuggestionSeed}
                                onDelete={onDeleteSuggestionSeed}
                                onView={onViewSuggestionSeed}
                            />
                        ))}
                    </div>

                </div>
            </div>
            {/* create suggestions seed popup */}
            {creatingSuggestionSeed && <SuggestionSeedModal onHide={onCancelCreateSuggestionSeed} onCreate={onCreateSuggestionSeed} />}
            {/* edit suggestions seed popup */}
            {editingSuggestionSeed && <SuggestionSeedModal onHide={onCancelEditSuggestionSeed} onUpdate={onUpdateSuggestionSeed} editingSuggestionSeed={editingSuggestionSeed} />}
            {runningSuggestionJobId && selectedSuggestionSeedId && (
                <SuggestionJobPopup
                    onClose={onGenerateClose}
                    api={api}
                    suggestionSeedId={selectedSuggestionSeedId}
                    suggestionJobId={runningSuggestionJobId}
                    onSaveSuggestion={onSaveSuggestion}
                    onRetry={onRetryGenerateSuggestions}
                    onGenerateImage={onGenerateImage}
                />
            )}
            {viewingSuggestionSeed && <ViewSuggestionSeedModal
                onClose={onCloseViewSuggestionSeed}
                suggestionSeed={viewingSuggestionSeed}
                onGenerateImage={onGenerateImage}
            />}
        </>
    );
}