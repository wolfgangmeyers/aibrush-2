// MainMenu react component with a list of buttons aligned verically
// Buttons are "Create a new image", "Upload an image", and "My Stuff"
// use bootstrap classes

import React, { FC } from 'react';
import { Link } from "react-router-dom"

export const MainMenu: FC = () => {
    return (
        <>
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
                        <Link to="/images" className="btn btn-primary">
                            {/* my items */}
                            <i className="fas fa-folder-open" />&nbsp;
                            My Images
                        </Link>
                        {/* /suggestions */}
                        <Link to="/suggestions" className="btn btn-primary">
                            {/* font awesome comments icon */}
                            <i className="fas fa-comments" />&nbsp;
                            Suggestions
                        </Link>
                        {/* /worker-config */}
                        <Link to="/worker-config" className="btn btn-primary">
                            {/* font awesome wrench icon */}
                            <i className="fas fa-wrench" />&nbsp;
                            Worker Config
                        </Link>
                    </div>
                </div>
            </div>
        </>
    )
}