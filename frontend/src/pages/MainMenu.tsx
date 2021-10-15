// MainMenu react component with a list of buttons aligned verically
// Buttons are "Create a new image", "Upload an image", and "My Stuff"
// use bootstrap classes

import React, { FC } from 'react';

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
                        <button type="button" className="btn btn-primary">Create a new image</button>
                        <button type="button" className="btn btn-primary">Upload an image</button>
                        <button type="button" className="btn btn-primary">My Stuff</button>
                    </div>
                </div>
            </div>
        </div>
    )
}