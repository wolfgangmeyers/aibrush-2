import React, { useEffect } from "react";
import { useHistory } from "react-router-dom";
import { AIBrushApi, LoginResult } from "../client";

interface LoginProps {
    client: AIBrushApi;
    onLogin: (loginResult: LoginResult) => void;
}

export const DiscordLogin: React.FC<LoginProps> = ({client, onLogin}) => {
    const history = useHistory();
    const code = new URLSearchParams(window.location.search).get("code");
    
    useEffect(() => {
        if (code) {
            console.log("logging in with code", code);
            client.discordLogin({code}).then((result) => {
                console.log("login result", result);
                if (result.data.accessToken) {
                    onLogin(result.data);
                }
                
                history.push("/");
            });
        } else {
            history.push("/");
        }
    }, [])

    return null;
}