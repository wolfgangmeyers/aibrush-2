// MainMenu react component with a list of buttons aligned verically
// Buttons are "Create a new image", "Upload an image", and "My Stuff"
// use bootstrap classes

import React, { FC } from 'react';
import { Link } from "react-router-dom"

export const MainMenu: FC = () => {
    return (
        <div className="container">
            {/* Header: Welcome to AIBrush! */}
            <div className="row">
                <div className="col-12">
                    <h1>Welcome to AIBrush!</h1>
                </div>
            </div>
            {/* 50px vertical spacer */}
            <div className="row">
                <div className="col-12">
                    <div className="spacer" />
                </div>
            </div>
            <div className="row">
                <div className="col-sm-12">
                    <div className="btn-group-vertical">
                        <Link to="/create-image" className="btn btn-primary">
                            {/* font awesome image icon */}
                            <i className="fas fa-image" />&nbsp;
                            Create a new image
                        </Link>
                        <button type="button" className="btn btn-primary">
                            {/* my items */}
                            <i className="fas fa-folder-open" />&nbsp;
                            My Images
                        </button>
                        {/* Workspace */}
                        <Link to="/workspace" className="btn btn-primary">
                            {/* font awesome workspace icon */}
                            <i className="fas fa-th" />&nbsp;
                            Workspace
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}