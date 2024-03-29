import { FC, useEffect, useState } from "react";
import { ApiSocket, NOTIFICATION_CREDITS_UPDATED } from "../lib/apisocket";
import { User } from "../lib/models";

interface Props {
    user: User;
}

export const KudosBalance: FC<Props> = ({ user }) => {
    // format with commas
    const kudosBalance = user.kudos.toLocaleString();
    return (
        <div style={{ color: "#00f0f0", marginTop: "16px" }}>
            <span>Kudos: </span>
            <span>{kudosBalance}</span>
        </div>
    );
    return <></>;
};
