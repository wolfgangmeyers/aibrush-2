import React, { useState, useEffect } from "react";
import * as axios from "axios";
import { BrowserRouter, Switch, Route, Link } from "react-router-dom";
import "./App.css";
import "./bootstrap.min.css";
import { AIBrushApi, LoginResult, FeatureList } from "./client/api";
import { getConfig } from "./config";
import { Login } from "./pages/Login";
import { TokenRefresher } from "./components/TokenRefresher";
import { Healthchecker } from "./components/Healthchecker";
import { WorkerConfigPage } from "./pages/WorkerConfig";
import { Admin } from "./pages/admin/Admin";
import { ImageEditor } from "./pages/image-editor/ImageEditor";
import { DeletedImages } from "./pages/DeletedImages";

// V2 UI
import { Homepage } from "./pages/Homepage";
import { Orders } from "./pages/admin/Orders";

const config = getConfig();
const httpClient = axios.default;
const client = new AIBrushApi(
  undefined,
  localStorage.getItem("apiUrl") || config.apiUrl,
  httpClient
);

function updateHttpClient(loginResult: LoginResult) {
  if (loginResult.accessToken) {
    httpClient.defaults.headers.common[
      "Authorization"
    ] = `Bearer ${loginResult.accessToken}`;
  }
}

function App() {
  const [credentials, setCredentials] = useState<LoginResult | null>(null);
  const [assetsUrl, setAssetsUrl] = useState<string>("/api/images");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [features, setFeatures] = useState<FeatureList | null>(null);

  const onLogout = () => {
    setCredentials(null);
    localStorage.removeItem("credentials");
    httpClient.defaults.headers.common["Authorization"] = undefined;
  };

  const init = async () => {
    console.log("App.init");
    client
      .getAssetsUrl()
      .then((result) => setAssetsUrl(result.data.assets_url));
    client.getFeatures().then((result) => setFeatures(result.data));
    const storedCredentials = localStorage.getItem("credentials");
    if (storedCredentials) {
      // attempt to refresh token
      try {
        const credentials = JSON.parse(storedCredentials) as LoginResult;
        const result = await client.refresh({
          refreshToken: credentials.refreshToken,
        });
        setCredentials(result.data);
        // save to storage
        localStorage.setItem("credentials", JSON.stringify(result.data));
        updateHttpClient(result.data);
        const isAdmin = await client.isAdmin();
        setIsAdmin(!!isAdmin.data.is_admin);
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
      <TokenRefresher
        api={client}
        credentials={credentials as LoginResult}
        onCredentialsRefreshed={onLogin}
      />
      <Healthchecker api={client} />

      <BrowserRouter>
        {/* if credentials are not set, show Login component */}
        {!credentials && (
          <Login httpClient={httpClient} client={client} onLogin={onLogin} />
        )}
        {credentials && <div className="container">
          <div className="row">
            <div className="col-lg-12">
              {/* if credentials are set, show a bootstrap logout button a the far top right corner div */}
              {credentials && (
                <>
                  <button
                    className="btn btn-primary top-button"
                    onClick={() => onLogout()}
                  >
                    {/* font awesome logout icon */}
                    <i className="fas fa-sign-out-alt"></i>
                  </button>
                  {/* home button */}
                  <Link className="btn btn-primary top-button" to="/">
                    {/* font awesome home icon */}
                    <i className="fas fa-home"></i>
                  </Link>
                  {/* Link to github project at https://github.com/wolfgangmeyers/aibrush-2 */}
                  <a
                    className="btn btn-primary top-button"
                    href="https://github.com/wolfgangmeyers/aibrush-2"
                    target="_blank"
                  >
                    {/* font awesome github icon */}
                    <i className="fab fa-github"></i>
                  </a>
                </>
              )}
            </div>
          </div>

          {/* if credentials are set, show the rest of the app */}
          
          <Switch>
            <Route path="/" exact={true}>
              {/* <MainMenu isAdmin={isAdmin} /> */}
              <Homepage api={client} assetsUrl={assetsUrl} />
            </Route>
            <Route path="/images/:id">
              <Homepage api={client} assetsUrl={assetsUrl} />
            </Route>
            <Route path="/image-editor/:id">
              <ImageEditor api={client} assetsUrl={assetsUrl} />
            </Route>
            <Route path="/worker-config">
              <WorkerConfigPage api={client} />
            </Route>
            <Route path="/deleted-images">
              <DeletedImages api={client} assetsUrl={assetsUrl} />
            </Route>
            {isAdmin && (
              <>
                <Route path="/admin">
                  <Admin api={client} />
                </Route>
                <Route path="/orders">
                  <Orders api={client} />
                </Route>
              </>
            )}
          </Switch>
          <div className="row" style={{ marginTop: "100px", padding: "50px" }}>
            <div className="col-lg-12">
              {/* show external popout pages to terms and privacy policy, if they are present in the features */}
              {features && features.privacy_uri && (
                <a href={features.privacy_uri} target="_blank">
                  Privacy Policy
                </a>
              )}
              {features && features.terms_uri && (
                <a
                  href={features.terms_uri}
                  target="_blank"
                  style={{ marginLeft: "20px" }}
                >
                  Terms of Service
                </a>
              )}
            </div>
          </div>
        </div>}
      </BrowserRouter>
    </div>
  );
}

export default App;
