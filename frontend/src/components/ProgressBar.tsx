import { FC } from "react";

interface Props {
    progress: number;
}

export const ProgressBar: FC<Props> = ({ progress }) => {
    return (
        <div className="progress" style={{ height: "20px", marginTop: "16px" }}>
            <div
                className="progress-bar"
                role="progressbar"
                style={{ width: `${progress * 100}%` }}
                aria-valuenow={progress * 100}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                {Math.round(progress * 100)}%
            </div>
        </div>
    );
};
