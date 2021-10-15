// Login react component with hooks
import React, { useState, useEffect, FC } from 'react';
import * as axios from "axios";
import { AIBrushApi, LoginResult } from "../client/api";

interface LoginProps {
    httpClient: axios.AxiosInstance;
    client: AIBrushApi;
    onLogin: (loginResult: LoginResult) => void;
}

export const Login: FC<LoginProps> = props => {
    // login form accepts email only
    const [email, setEmail] = useState("");
    const [emailSubmitted, setEmailSubmitted] = useState(false);
    const [code, setCode] = useState("");
    const [err, setErr] = useState("");

    const onLogin = async () => {
        // clear error
        setErr("");
        // validate valid email
        if (!email.match(/^[^@]+@[^@]+\.[^@]+$/)) {
            setErr("Invalid email address");
            return;
        }
        await props.client.login({
            email
        })
        setEmailSubmitted(true);
    }

    const onVerify = async () => {
        // clear error
        setErr("");
        // attempt to verify code
        try {
            const result = await props.client.verify({
                email,
                code
            });
            props.onLogin(result.data);
        } catch (err) {
            console.error(err)
            setErr("Failed to verify code");
        }
    }

    // bootstrap login form
    return (
        <div className="container">
            <div className="row">
                <div className="col-md-6 offset-md-3">
                    <div className="card">
                        <div className="card-body">
                            <h5 className="card-title">Login</h5>
                            {/* Display error if one is set */}
                            {/* Use <p class="text-danger" */}
                            {err && <p className="text-danger">{err}</p>}

                            {/* If email submitted, show verify code form*/}
                            {emailSubmitted && <div>
                                    <div className="form-group">
                                        <label htmlFor="verifyCode">Verify Code</label>
                                        <input type="text" className="form-control" id="verifyCode" placeholder="Verification Code" value={code} onChange={(e) => setCode(e.target.value)} />
                                    </div>
                                    {/* Cancel verification and go back to email */}
                                    <button className="btn btn-secondary" onClick={() => setEmailSubmitted(false)}>Cancel</button>
                                    {/* Verify code */}
                                    <button type="button" className="btn btn-primary" onClick={(e) => {
                                        e.preventDefault();
                                        onVerify();
                                    }}>Verify</button>
                                </div>
                            }
                            {/* Else, show login form */}
                            {!emailSubmitted && <div>
                                <div className="form-group">
                                    <label htmlFor="email">Email address</label>
                                    <input type="email" className="form-control" id="email" aria-describedby="emailHelp" placeholder="Enter email" value={email} onChange={(e) => setEmail(e.target.value)} />
                                    <small id="emailHelp" className="form-text text-muted">We'll never share your email with anyone else.</small>
                                </div>
                                <button type="button" className="btn btn-primary" onClick={(e) => {
                                    e.preventDefault();
                                    onLogin();
                                }}>Login</button>
                            </div>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}