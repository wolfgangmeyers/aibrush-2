import React, { FC } from "react";

interface LoadMoreImagesProps {
    onLoadMore: () => void;
    isLoading: boolean;
}

export const LoadMoreImages: FC<LoadMoreImagesProps> = ({ onLoadMore, isLoading }) => {
    return (
        <div className="card" style={{ padding: "10px", width: "200px", margin: "10px" }}>
            <div className="card-body">
                <button disabled={isLoading} className="btn btn-primary" onClick={onLoadMore}>
                    {isLoading ? (
                        <>
                            <i className="fa fa-spinner fa-spin" /> Loading...
                        </>
                    ) : (
                        <>
                            <i className="fa fa-plus" /> Load more
                        </>
                    )}
                </button>
            </div>
        </div>
    )
};