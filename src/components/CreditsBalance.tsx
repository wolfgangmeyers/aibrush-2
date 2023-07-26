import {FC, useEffect, useState} from "react";
import { ApiSocket, NOTIFICATION_CREDITS_UPDATED } from "../lib/apisocket";

interface Props {
}

// TODO: restore when refactoring to kudos
// this component should fetch the credits balance {free_credits, paid_credits} from the server on mount.
// it should also subscribe to the apisocket to receive updates to the credits balance (NOTIFICATION_CREDITS_UPDATED).
// display paid credits above, free credits below.

export const CreditsBalance: FC<Props> = () => {
    // const [credits, setCredits] = useState({free_credits: 0, paid_credits: 0});

    // useEffect(() => {
    //     const fetchCredits = async () => {
    //         const credits = await api.getCredits();
    //         setCredits(credits.data);
    //     };
    //     fetchCredits();
    //     const pollHandle = setInterval(fetchCredits, 60000);

    //     const onMessage = (message: string) => {
    //         const data = JSON.parse(message);
    //         if (data.type === NOTIFICATION_CREDITS_UPDATED) {
    //             fetchCredits();
    //         }
    //     }
    //     apisocket.addMessageListener(onMessage);

    //     return () => {
    //         clearInterval(pollHandle);
    //         apisocket.removeMessageListener(onMessage);
    //     }
    // }, [api, apisocket]);

    // return (
    //     <div>
    //         <div style={{color: "#00f0f0"}}>
    //             <span>Paid credits: </span>
    //             <span>{credits.paid_credits}</span>
    //         </div>
    //         <div>
    //             <span>Free credits: </span>
    //             <span>{credits.free_credits}</span>
    //         </div>
    //     </div>
    // );
    return <></>;
};