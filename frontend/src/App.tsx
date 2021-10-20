import React, { useState, useEffect } from 'react';
import * as axios from "axios";
import { BrowserRouter, Switch, Route, Link } from "react-router-dom"
import logo from './logo.svg';
import './App.css';
import "./bootstrap.min.css";
import { AIBrushApi, LoginResult } from "./client/api";
import { getConfig } from './config';
import { Login } from "./pages/Login"
import { MainMenu } from './pages/MainMenu';
import { CreateImage } from "./pages/CreateImage"
import { WorkspacePage } from "./pages/WorkspacePage";
import { ImagesPage } from "./pages/Images";
import { TokenRefresher } from "./components/TokenRefresher";

const config = getConfig()
const httpClient = axios.default;
const client = new AIBrushApi(undefined, config.apiUrl, httpClient);

function updateHttpClient(loginResult: LoginResult) {
  if (loginResult.accessToken) {
    httpClient.defaults.headers.common['Authorization'] = `Bearer ${loginResult.accessToken}`;
  }
}

function App() {

  const [credentials, setCredentials] = useState<LoginResult | null>(null);

  const init = async () => {
    console.log("App.init")
    const storedCredentials = localStorage.getItem("credentials");
    if (storedCredentials) {
      // attempt to refresh token
      try {
        const credentials = JSON.parse(storedCredentials) as LoginResult;
        const result = await client.refresh({
          refreshToken: credentials.refreshToken
        });
        setCredentials(result.data);
        // save to storage
        localStorage.setItem("credentials", JSON.stringify(result.data));
        updateHttpClient(result.data);
      } catch (e) {
        console.log(e);
      }
    }
  };

  const onLogin = async (credentials: LoginResult) => {
    localStorage.setItem("credentials", JSON.stringify(credentials));
    setCredentials(credentials);
    updateHttpClient(credentials);
  };

  useEffect(() => {
    init();
  }, []);

  return (
    <div className="App">
      <TokenRefresher api={client} credentials={credentials as LoginResult} onCredentialsRefreshed={onLogin} />
      <BrowserRouter>
        {/* if credentials are not set, show Login component */}
        {!credentials && <Login httpClient={httpClient} client={client} onLogin={onLogin} />}
        {/* if credentials are set, show a bootstrap logout button a the far top right corner div */}
        {credentials && <>
          <button className="btn btn-primary top-button" onClick={() => setCredentials(null)}>
            {/* font awesome logout icon */}
            <i className="fas fa-sign-out-alt"></i>&nbsp;
            Logout
          </button>
          {/* home button */}
          <Link className="btn btn-primary top-button" to="/">
            {/* font awesome home icon */}
            <i className="fas fa-home"></i>&nbsp;
            Home
          </Link>
        </>}
        {/* if credentials are set, show the rest of the app */}
        {credentials && <Switch>
          <Route path="/" exact={true}>
            <MainMenu />
          </Route>
          <Route path="/create-image">
            <CreateImage api={client} apiUrl={config.apiUrl} />
          </Route>
          <Route path="/workspace">
            <WorkspacePage apiUrl={config.apiUrl} api={client} />
          </Route>
          <Route path="/images">
            <ImagesPage apiUrl={config.apiUrl} api={client} />
          </Route>
          {/* <Route path="/image-editor">
            <ImageEditor onCancel={() => {}} onSave={img => console.log(img)} />
          </Route> */}
        </Switch>}
      </BrowserRouter>
    </div>
  );
}

export default App;
