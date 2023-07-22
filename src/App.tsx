import React, { useState, useEffect } from "react";
import * as axios from "axios";
import { BrowserRouter, Switch, Route, Link } from "react-router-dom";
import "./App.css";
import "./bootstrap.min.css";
import { LocalImagesStore } from "./lib/localImagesStore";
import { getConfig } from "./config";
import { ImageEditor } from "./pages/image-editor/ImageEditor";

// V2 UI
import { Homepage } from "./pages/Homepage";
import { DiscordLogin } from "./pages/DiscordLogin";
import { LocalDeletedImages } from "./pages/LocalDeletedImages";
import { SavedImagesPage } from "./pages/SavedImagesPage";
import { TestPage } from "./pages/TestPage";
import { CreditsBalance } from "./components/CreditsBalance";
import { HordeGenerator } from "./lib/hordegenerator";
import { HordeClient } from "./lib/hordeclient";
import HordeUser from "./components/HordeUser";
import { ImageClient } from "./lib/savedimages";

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

function App() {
    const [initialized, setInitialized] = useState(false);
    const init = async () => {
        console.log("App.init");
        await localImages.init();
        console.log("App.init: localImages.init");
        setInitialized(true);
    };

    useEffect(() => {
        init();
    }, []);

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
                            {/* show external popout pages to terms and privacy policy, if they are present in the features */}
                            <a
                                href="https://www.termsfeed.com/live/4f40dfff-6360-40cb-82bd-ac31dcb250e8"
                                target="_blank"
                            >
                                Privacy Policy
                            </a>
                            <a
                                href="https://www.termsfeed.com/live/03dfa444-2227-4654-954d-98a6dbe297fd"
                                target="_blank"
                                style={{ marginLeft: "20px" }}
                            >
                                Terms of Service
                            </a>
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
