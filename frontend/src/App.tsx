import React, { useState, useEffect } from 'react';
import * as axios from "axios";
import { BrowserRouter, Switch, Route } from "react-router-dom"
import logo from './logo.svg';
import './App.css';
import "./bootstrap.min.css";
import { AIBrushApi, LoginResult } from "./client/api";
import { getConfig } from './config';
import { Login } from "./pages/Login"
import { MainMenu } from './pages/MainMenu';

const config = getConfig()
const httpClient = axios.default;
const client = new AIBrushApi(undefined, config.apiUrl, httpClient);

function App() {

  const [credentials, setCredentials] = useState<LoginResult | null>(null);

  const init = async () => {
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
      } catch (e) {
        console.log(e);
      }
    }
  };

  const onLogin = async (credentials: LoginResult) => {
    localStorage.setItem("credentials", JSON.stringify(credentials));
    setCredentials(credentials);
  };

  useEffect(() => {
    init();
  }, []);

  return (
    <div className="App">
      <BrowserRouter>
        {/* if credentials are not set, show Login component */}
        {!credentials && <Login httpClient={httpClient} client={client} onLogin={onLogin} />}
        {/* if credentials are set, show a bootstrap logout button a the far top right corner div */}
        {credentials && <button className="btn btn-primary logout-button" onClick={() => setCredentials(null)}>Logout</button>}
        {/* if credentials are set, show the rest of the app */}
        {credentials && <Switch>
          <Route path="/">
            <MainMenu />
          </Route>
        </Switch>}
      </BrowserRouter>
    </div>
  );
}

export default App;
