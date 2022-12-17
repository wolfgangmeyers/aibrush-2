import React, { FC, useState, useEffect, CSSProperties } from "react";
import moment from "moment";
import { Boost } from "../client";

interface Props {
    boost: Boost;
    onUpdateActive: (active: boolean) => void;
    onUpdateBoostLevel: (level: number) => void;
}

const COOLDOWN_MILLISECONDS = 1000 * 60 * 10; // 10 minutes
const boostLevelToLabel = [undefined, "QUICK", "FAST", "PRO", "SUPER"];

export const BoostWidget: FC<Props> = ({
    boost,
    onUpdateActive,
    onUpdateBoostLevel,
}) => {
    const [remainingTime, setRemainingTime] = useState<string>("00:00:00");
    const [hidden, setHidden] = useState<boolean>(false);
    const [cooldown, setCooldown] = useState(false);

    const style: CSSProperties = {
        // width: "100%",
        height: "50px",
        // background:
        //     "linear-gradient(-45deg, #3D3BB5, #8B41D6, #26D6E1)",
        background: "#3D3BB5",
        backgroundSize: "400% 400%",
        borderRadius: "8px",
        textAlign: "left",
        paddingTop: "8px",
        paddingLeft: "16px",
        paddingRight: "16px",
        fontSize: "24px",
        fontWeight: "bolder",
        // italic
        // fontStyle: "italic",
        // animationName: "boost",
        // animationDuration: "5s",
        // animationIterationCount: "infinite",
    };
    if (boost.is_active) {
        style.background = "linear-gradient(-45deg, #3D3BB5, #8B41D6, #26D6E1)";
        style.animationName = "boost";
        style.animationDuration = "5s";
        style.animationIterationCount = "infinite";
    }

    useEffect(() => {
        const updateRemainingTime = () => {
            // boost.balance is specified in milliseconds
            // use the moment library to show remaining time in the form of
            // "HH:MM:SS"
            let remainingMilliseconds = boost.balance;

            if (boost.is_active) {
                remainingMilliseconds -= moment()
                    .diff(moment(boost.activated_at))
                    .valueOf();
                if (remainingMilliseconds <= 0) {
                    remainingMilliseconds = 0;
                }
                setHidden(remainingMilliseconds === 0);
            } else {
                const millisecondsSinceLastActivated =
                    moment().valueOf() - boost.activated_at;
                if (millisecondsSinceLastActivated < COOLDOWN_MILLISECONDS) {
                    setCooldown(true);
                    remainingMilliseconds = COOLDOWN_MILLISECONDS - millisecondsSinceLastActivated;
                } else {
                    setCooldown(false);
                }
                setHidden(boost.balance === 0);
            }

            let remainingTime = moment
                .utc(remainingMilliseconds)
                .format("HH:mm:ss");
            setRemainingTime(remainingTime);
        };
        updateRemainingTime();
        const interval = setInterval(updateRemainingTime, 1000);
        return () => clearInterval(interval);
    }, [boost]);

    if (hidden) {
        return <div></div>;
    }

    return (
        <div className="boost-widget" style={style}>
            {boostLevelToLabel[boost.level]}

            <div
                style={{
                    float: "right",
                }}
            >
                {!boost.is_active && (
                    <i
                        className="fas fa-play"
                        onClick={() => onUpdateActive(true)}
                        style={{ cursor: "pointer" }}
                    />
                )}
                {boost.is_active && (
                    <i
                        className="fas fa-pause"
                        onClick={() => onUpdateActive(false)}
                        style={{ cursor: "pointer" }}
                    />
                )}
            </div>
            <span
                style={{
                    fontStyle: "normal",
                    fontSize: "16px",
                    float: "right",
                    paddingTop: "6px",
                    marginRight: "8px",
                }}
            >
                {remainingTime}&nbsp;
            </span>
            {cooldown && <span
                style={{
                    fontStyle: "normal",
                    fontSize: "12px",
                    float: "right",
                    paddingTop: "8px",
                    marginRight: "8px",
                    color: "#26D6E1",
                    animation: "cooldown 5s ease infinite",
                }}
            >
                COOLDOWN&nbsp;
            </span>}
        </div>
    );
};
