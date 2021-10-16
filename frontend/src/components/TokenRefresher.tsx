// Given a set of credentials, this component will refresh them
// every 5 minutes and invoke the onCredentialsRefreshed callback

import React, { useEffect, FC } from "react"
import { LoginResult, AIBrushApi } from "../client/api";

interface TokenRefresherProps {
    onCredentialsRefreshed: (loginResult: LoginResult) => void;
    api: AIBrushApi;
    credentials: LoginResult;
}

export const TokenRefresher : FC<TokenRefresherProps> = ({ onCredentialsRefreshed, api, credentials }) => {
    useEffect(() => {
        const interval = setInterval(() => {
            if (credentials && credentials.refreshToken) {
                api.refresh({refreshToken: credentials.refreshToken}).then(loginResult => {
                    onCredentialsRefreshed(loginResult.data);
                });
            }

        }, 5 * 60 * 1000);
        return () => {
            clearInterval(interval);
        };
    }, [credentials && credentials.refreshToken]);
    return <div></div>;
}