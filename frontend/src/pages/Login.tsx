// Login react component with hooks
import React, { useState, FC } from "react";
import * as axios from "axios";
import qs from "qs";
import { AIBrushApi, LoginResult } from "../client/api";

console.log(process.env)
const DISCORD_CLIENT_ID = "1043951225944678490";

interface LoginProps {
    client: AIBrushApi;
    onLogin: (loginResult: LoginResult) => void;
}

export const Login: FC<LoginProps> = (props) => {
    // login form accepts email only
    const [email, setEmail] = useState("");
    const [emailSubmitted, setEmailSubmitted] = useState(false);
    const [code, setCode] = useState("");
    const [err, setErr] = useState("");

    // check query string for invite_code
    const query = window.location.search;
    const queryParams = qs.parse(query.substring(1));
    const inviteCode = queryParams["invite_code"];

    const onLogin = async () => {
        // clear error
        setErr("");
        // validate valid email
        if (!email.match(/^[^@]+@[^@]+\.[^@]+$/)) {
            setErr("Invalid email address");
            return;
        }

        try {
            await props.client.login({
                email: email,
                invite_code: inviteCode as string,
            });
            setEmailSubmitted(true);
        } catch (err) {
            console.error(err);
            setErr("Could not login");
        }
    };

    const discordLink = () => {
        // localhost url:
        // https://discord.com/api/oauth2/authorize?client_id=1043951225944678490&redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fdiscord-login&response_type=code&scope=identify%20email
        // prod url:
        // https://discord.com/api/oauth2/authorize?client_id=1043951225944678490&redirect_uri=https%3A%2F%2Fwww.aibrush.art%2Fdiscord-login&response_type=code&scope=identify%20email
        const host = window.location.host;
        const protocol = window.location.protocol;
        const redirectUri = `${protocol}//${host}/discord-login`;
        const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=identify%20email`;
        return url;
    };

    const onVerify = async () => {
        // clear error
        setErr("");
        // attempt to verify code
        try {
            const result = await props.client.verify({
                email,
                code,
            });
            props.onLogin(result.data);
        } catch (err) {
            console.error(err);
            setErr("Failed to verify code");
        }
    };

    // bootstrap login form
    return (
        <>
            <div
                className="row"
                style={{
                    height: "100vh",
                    marginLeft: "0px",
                    marginRight: "0px",
                }}
            >
                <div className="col-md-6 login-splash">
                    {/* <div className="center-cropped" style={{backgroundImage: "url(/images/scifi-dreamland.jpg)"}}></div> */}
                    <img
                        className="center-cropped"
                        src="/images/scifi-dreamland.jpg"
                    />
                </div>
                <div className="col-md-6">
                    <div
                        style={{
                            fontWeight: 500,
                            fontSize: "48px",
                            marginTop: "200px",
                        }}
                    >
                        AiBrush
                    </div>

                    <div
                        style={{
                            marginLeft: "10%",
                            marginRight: "10%",
                            marginTop: "88px",
                            marginBottom: "24px",
                        }}
                    >
                        Login With Email
                    </div>
                    {/* Display error if one is set */}
                    {/* Use <p class="text-danger" */}
                    {err && <p className="text-danger">{err}</p>}
                    {err && (
                        <p className="text-info">
                            If you don't have an account yet, request one by
                            sending an email to{" "}
                            <a href="mailto:admin@aibrush.art">
                                admin@aibrush.art
                            </a>
                        </p>
                    )}
                    <div
                        style={{
                            marginLeft: "10%",
                            marginRight: "10%",
                            marginTop: "24px",
                            textAlign: "left",
                        }}
                    >
                        {/* If email submitted, show verify code form*/}
                        {emailSubmitted && (
                            <>
                                <div className="form-group">
                                    <label htmlFor="verifyCode">
                                        Verify Code
                                    </label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        id="verifyCode"
                                        placeholder="Verification Code"
                                        value={code}
                                        onChange={(e) =>
                                            setCode(e.target.value)
                                        }
                                    />
                                </div>
                                {/* Cancel verification and go back to email */}
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => setEmailSubmitted(false)}
                                >
                                    Cancel
                                </button>
                                &nbsp;
                                {/* Verify code */}
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        onVerify();
                                    }}
                                >
                                    Verify
                                </button>
                            </>
                        )}
                        {/* Else, show login form */}
                        {!emailSubmitted && (
                            <>
                                <div className="form-group">
                                    <label htmlFor="email">Email address</label>
                                    <input
                                        type="email"
                                        className="form-control"
                                        id="email"
                                        aria-describedby="emailHelp"
                                        placeholder="Enter email"
                                        value={email}
                                        onChange={(e) =>
                                            setEmail(e.target.value.trim())
                                        }
                                    />
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    style={{ float: "right" }}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        onLogin();
                                    }}
                                >
                                    Login
                                </button>
                            </>
                        )}
                    </div>
                    <div
                        style={{
                            marginLeft: "10%",
                            marginRight: "10%",
                            marginTop: "88px",
                            marginBottom: "24px",
                        }}
                    >
                        <hr/>
                        OR
                    </div>
                    <div
                        style={{
                            marginLeft: "10%",
                            marginRight: "10%",
                            marginTop: "24px",
                        }}
                    >
                        <a href={discordLink()} className="btn btn-primary">
                            <i className="fab fa-discord"></i> Login With Discord
                        </a>
                    </div>
                </div>
            </div>
        </>
    );
};
