import React, { useState, useEffect } from "react";
import * as axios from "axios";
import { BrowserRouter, Switch, Route, Link, NavLink } from "react-router-dom";
import "./App.css";
import "./bootstrap.min.css";
import { LocalImagesStore } from "./lib/localImagesStore";
import { ImageEditor } from "./pages/image-editor/ImageEditor";

// V2 UI
import { Homepage } from "./pages/Homepage";
import { LocalDeletedImages } from "./pages/LocalDeletedImages";
import { SavedImagesPage } from "./pages/LegacySavedImagesPage";
import { TestPage } from "./pages/TestPage";
import { HordeGenerator } from "./lib/hordegenerator";
import { HordeClient } from "./lib/hordeclient";
import HordeUser from "./components/HordeUser";
import { ImageClient } from "./lib/savedimages";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import DropboxRedirectPage from "./pages/DropboxRedirectPage";
import { Dropbox } from "dropbox";
import DropboxHelper from "./lib/dropbox";

const localImages = new LocalImagesStore();
const hordeClient = new HordeClient(
    localStorage.getItem("apiKey") || "0000000000"
);
const generator = new HordeGenerator(hordeClient);

// get manifest_id from query string params
function getManifestId(): string | undefined {
    let manifestId: string | undefined =
        localStorage.getItem("manifest_id") || undefined;
    if (manifestId) {
        return manifestId;
    }
    const urlParams = new URLSearchParams(window.location.search);
    manifestId = urlParams.get("manifest_id") || undefined;
    if (manifestId) {
        localStorage.setItem("manifest_id", manifestId);
    }
    return manifestId;
}

const manifestId = getManifestId();
const imageClient = new ImageClient(
    "https://aibrush2-filestore.s3.amazonaws.com",
    manifestId
);
const dropboxHelper = new DropboxHelper();

function App() {
    const [initialized, setInitialized] = useState(false);
    const init = async () => {
        console.log("App.init");
        await localImages.init();
        console.log("App.init: localImages.init");
        setInitialized(true);
    };

    const testDrive = async () => {
        dropboxHelper.initiateAuth();
    }

    useEffect(() => {
        init();
    }, []);

    async function handleDropboxAuth(dropbox: Dropbox): Promise<void> {
        console.log("Dropbox auth worked!")
        const files = await dropbox.filesListFolder({path: ""});
        console.log("files", files);
    }

    return (
        <div className="App">
            {!initialized && (
                <div className="row">
                    <div className="col-lg-12">
                        <div className="spinner-border text-primary"></div>
                    </div>
                </div>
            )}
            {initialized && (
                <BrowserRouter>
                    <div className="container">
                        <div className="row">
                            <div className="col-lg-12">
                                <>
                                    {/* saved images */}
                                    <Link
                                        className="btn btn-primary top-button"
                                        to="/saved"
                                    >
                                        {/* font awesome save icon */}
                                        <i className="fas fa-save"></i>
                                    </Link>
                                    {/* home button */}
                                    <Link
                                        className="btn btn-primary top-button"
                                        to="/"
                                    >
                                        {/* font awesome home icon */}
                                        <i className="fas fa-home"></i>
                                    </Link>
                                    {/* Link to discord */}
                                    <a
                                        className="btn btn-primary top-button"
                                        href="https://discord.gg/HYcFpDeqKJ"
                                        target="_blank"
                                    >
                                        {/* font awesome discord icon */}
                                        <i className="fab fa-discord"></i>
                                    </a>
                                    {/* link to github */}
                                    <a
                                        className="btn btn-primary top-button"
                                        href="https://github.com/wolfgangmeyers/aibrush-2"
                                        target="_blank"
                                    >
                                        {/* font awesome github icon */}
                                        <i className="fab fa-github"></i>
                                    </a>
                                    <button className="btn btn-primary top-button" onClick={testDrive}>
                                        {/* google drive */}
                                        <i className="fab fa-google-drive"></i>
                                    </button>
                                    <HordeUser client={hordeClient} />
                                </>
                            </div>
                            <div
                                className="col-lg-12"
                                style={{ textAlign: "right" }}
                            >
                                {/* TODO: replace with KudosBalance */}
                                {/* <CreditsBalance
                                api={client}
                                apisocket={apiSocket}
                            /> */}
                            </div>
                        </div>

                        {/* if credentials are set, show the rest of the app */}

                        <Switch>
                            <Route path="/" exact={true}>
                                {/* <MainMenu isAdmin={isAdmin} /> */}
                                <Homepage
                                    localImages={localImages}
                                    generator={generator}
                                    imageClient={imageClient}
                                />
                            </Route>
                            <Route path="/images/:id">
                                <Homepage
                                    localImages={localImages}
                                    generator={generator}
                                    imageClient={imageClient}
                                />
                            </Route>
                            <Route path="/saved" exact={true}>
                                {/* <MainMenu isAdmin={isAdmin} /> */}
                                <SavedImagesPage imageClient={imageClient} />
                            </Route>
                            <Route path="/saved/:id" exact={true}>
                                {/* <MainMenu isAdmin={isAdmin} /> */}
                                <SavedImagesPage imageClient={imageClient} />
                            </Route>
                            <Route path="/image-editor/:id">
                                <ImageEditor
                                    generator={generator}
                                    localImages={localImages}
                                    imageClient={imageClient}
                                />
                            </Route>
                            <Route path="/local-deleted-images">
                                <LocalDeletedImages localImages={localImages} />
                            </Route>
                            <Route path="/testpage">
                                <TestPage />
                            </Route>
                            <Route path="/privacy-policy">
                                <PrivacyPage />
                            </Route>
                            <Route path="/terms-of-service">
                                <TermsPage />
                            </Route>
                            <Route path="/dropbox">
                                <DropboxRedirectPage 
                                    onDropboxReady={handleDropboxAuth}
                                />
                            </Route>
                        </Switch>
                        <div
                            // style={{ marginTop: "100px", padding: "50px" }}

                            // use position:fixed to make the footer stick to the bottom of the page
                            style={{
                                position: "fixed",
                                bottom: "0",
                                left: "0",
                                width: "100%",
                                height: "50px",
                                paddingTop: "16px",
                                backgroundColor: "#000000",
                            }}
                        >
                            <NavLink to="/privacy-policy" style={{marginRight: "8px"}}>
                                Privacy Policy
                            </NavLink>
                            <NavLink to="/terms-of-service">
                                Terms of Service
                            </NavLink>
                            {/* link to mail to admin@aibrush.art */}
                            <a
                                href="mailto:admin@aibrush.art"
                                style={{ marginLeft: "20px" }}
                            >
                                Contact
                            </a>
                            <span
                                style={{ float: "right", marginRight: "50px" }}
                            >
                                Powered by the{" "}
                                <a
                                    href="https://stablehorde.net/"
                                    target="_blank"
                                >
                                    Stable Horde
                                </a>
                            </span>
                        </div>
                    </div>
                </BrowserRouter>
            )}
        </div>
    );
}

export default App;
