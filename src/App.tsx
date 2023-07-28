import React, { useState, useEffect } from "react";
import * as axios from "axios";
import {
    BrowserRouter,
    Switch,
    Route,
    Link,
    NavLink,
    useHistory,
} from "react-router-dom";
import "./App.css";
import "./bootstrap.min.css";
import { LocalImagesStore } from "./lib/localImagesStore";
import { ImageEditor } from "./pages/image-editor/ImageEditor";

// V2 UI
import { Homepage } from "./pages/Homepage";
import { LocalDeletedImages } from "./pages/LocalDeletedImages";
import { SavedImagesPage } from "./pages/SavedImagesPage";
import { TestPage } from "./pages/TestPage";
import { HordeGenerator } from "./lib/hordegenerator";
import { HordeClient } from "./lib/hordeclient";
import HordeUser from "./components/HordeUser";
import { ImageClient, getManifestId } from "./lib/savedimages";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import DropboxRedirectPage from "./pages/DropboxRedirectPage";
import { Dropbox } from "dropbox";
import DropboxHelper from "./lib/dropbox";

const localImages = new LocalImagesStore();
const savedImagesStore = new LocalImagesStore("saved-images");

const hordeClient = new HordeClient(
    localStorage.getItem("apiKey") || "0000000000"
);
const generator = new HordeGenerator(hordeClient);
const manifestId = getManifestId();
const imageClient = new ImageClient(
    "https://aibrush2-filestore.s3.amazonaws.com",
    manifestId
);

function App() {
    const [initialized, setInitialized] = useState(false);
    const [dropboxHelper, setDropboxHelper] = useState<DropboxHelper | undefined>();

    const init = async () => {
        console.log("App.init");
        await localImages.init();
        await savedImagesStore.init();
        await imageClient.init();
        // await dropboxHelper.init();
        setInitialized(true);
        console.log("App initialized");
    };

    const onApiKeyChange = async (apiKey: string) => {
        const dropboxHelper = new DropboxHelper(apiKey);
        await dropboxHelper.init();
        setDropboxHelper(dropboxHelper);
        
    };

    useEffect(() => {
        init();
        return () => {
            if (dropboxHelper) {
                dropboxHelper.destroy();
            }
        }
    }, []);

    function handleDropboxAuth() {
        window.location.href = "/saved";
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
                                    <HordeUser client={hordeClient} onApiKeyChange={onApiKeyChange} />
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
                                    savedImages={savedImagesStore}
                                    generator={generator}
                                    dropboxHelper={dropboxHelper}
                                />
                            </Route>
                            <Route path="/images/:id">
                                <Homepage
                                    localImages={localImages}
                                    savedImages={savedImagesStore}
                                    generator={generator}
                                    dropboxHelper={dropboxHelper}
                                />
                            </Route>
                            <Route path="/saved" exact={true}>
                                {/* <MainMenu isAdmin={isAdmin} /> */}
                                <SavedImagesPage
                                    localImages={savedImagesStore}
                                    imageClient={imageClient}
                                    dropboxHelper={dropboxHelper}
                                />
                            </Route>
                            <Route path="/saved/:id" exact={true}>
                                {/* <MainMenu isAdmin={isAdmin} /> */}
                                <SavedImagesPage
                                    localImages={savedImagesStore}
                                    imageClient={imageClient}
                                    dropboxHelper={dropboxHelper}
                                />
                            </Route>
                            <Route path="/image-editor/:id">
                                <ImageEditor
                                    generator={generator}
                                    localImages={localImages}
                                    savedImages={savedImagesStore}
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
                            <NavLink
                                to="/privacy-policy"
                                style={{ marginRight: "8px" }}
                            >
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