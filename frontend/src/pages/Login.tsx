// Login react component with hooks
import React, { useState, FC } from "react";
import * as axios from "axios";
import qs from "qs";
import { AIBrushApi, LoginResult } from "../client/api";

interface LoginProps {
  httpClient: axios.AxiosInstance;
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
      <div className="row" style={{height: "100vh", marginLeft: "0px", marginRight: "0px"}}>
        <div className="col-md-6 login-splash">
          {/* <div className="center-cropped" style={{backgroundImage: "url(/images/scifi-dreamland.jpg)"}}></div> */}
          <img
            className="center-cropped"
            src="/images/scifi-dreamland.jpg"
          />
        </div>
        <div className="col-md-6">
          <div
            style={{ fontWeight: 500, fontSize: "48px", marginTop: "241px" }}
          >
            AiBrush
          </div>
          {/* Display error if one is set */}
          {/* Use <p class="text-danger" */}
          {err && <p className="text-danger">{err}</p>}
          {err && (
            <p className="text-info">
              If you don't have an account yet, request one by sending an email
              to <a href="mailto:admin@aibrush.art">admin@aibrush.art</a>
            </p>
          )}
          <div style={{marginLeft: "10%", marginRight: "10%", marginTop: "88px", textAlign: "left"}}>
            {/* If email submitted, show verify code form*/}
            {emailSubmitted && (
              <>
                <div className="form-group">
                  <label htmlFor="verifyCode">Verify Code</label>
                  <input
                    type="text"
                    className="form-control"
                    id="verifyCode"
                    placeholder="Verification Code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
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
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{float: "right"}}
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
        </div>
      </div>
    </>
  );
};
