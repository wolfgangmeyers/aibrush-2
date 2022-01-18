import React, { FC } from "react";
import { SuggestionSeed } from "../client";

interface Props {
    suggestionSeed: SuggestionSeed;
    onDelete?: (suggestionSeed: SuggestionSeed) => void;
    onView?: (suggestionSeed: SuggestionSeed) => void;
    onGenerate?: (suggestionSeed: SuggestionSeed) => void;
    onEdit?: (suggestionSeed: SuggestionSeed) => void;
}

export const SuggestionSeedTile: FC<Props> = ({ suggestionSeed, onDelete, onView, onGenerate, onEdit }) => {
    return (
        <div className="card" key={suggestionSeed.id} style={{ padding: "10px", width: "230px", margin: "10px" }}>
            <div>
                <div className="card-body">
                    <h5 className="card-title">{suggestionSeed.name}</h5>
                    <p className="card-text">{suggestionSeed.description}</p>
                    {/*  actions: delete, view, generate */}
                    <div>
                        {onDelete && <button className="btn btn-danger btn-sm" onClick={() => { onDelete(suggestionSeed) }} style={{ marginRight: "5px" }}>
                            <i className="fas fa-trash-alt"></i>
                        </button>}
                        {onView && <button className="btn btn-secondary btn-sm" onClick={() => { onView(suggestionSeed) }} style={{ marginRight: "5px" }}>
                            <i className="fas fa-eye"></i>
                        </button>}
                        {onEdit && <button className="btn btn-secondary btn-sm" onClick={() => { onEdit(suggestionSeed) }} style={{ marginRight: "5px" }}>
                            <i className="fas fa-edit"></i>
                        </button>}
                        {onGenerate && <button className="btn btn-secondary btn-sm" onClick={() => { onGenerate(suggestionSeed) }} style={{ marginRight: "5px" }}>
                            <i className="fas fa-play"></i>
                        </button>}
                    </div>
                </div>
                
            </div>
        </div>
    );
};
