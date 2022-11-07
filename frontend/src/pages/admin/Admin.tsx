import React, { FC, useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { AIBrushApi } from "../../client/api";
import { WorkerList } from "./WorkerList";

interface Props {
    api: AIBrushApi;
}

export const Admin: FC<Props> = ({ api }) => {
    const [links, setLinks] = useState<string[]>([]);

    const onGenerateLink = async () => {
        const inviteCode = await api.createInviteCode();
        setLinks([...links, `/?invite_code=${inviteCode.data.id}`]);
    };

    return (
        <>
            {/* Header: Create new image */}
            <div className="row">
                <div className="col-12">
                    <h1>Admin features</h1>
                </div>
            </div>
            {/* 50px vertical spacer */}
            <div className="row">
                <div className="col-12">
                    <div className="spacer" />
                </div>
            </div>
            {links.length > 0 && (
                <div className="row">
                    <div className="col-12">
                        <p>Right click to copy invite links</p>
                    </div>
                </div>
            )}
            <div className="row">
                <div className="offset-lg-3 col-lg-6 col-sm-12">
                    {/* show a list of hyperlinks */}
                    <div className="btn-group-vertical">
                        {links.map((link, i) => (
                            <a key={i} href={link} className="btn btn-primary">
                                <i className="fas fa-link" />
                                &nbsp; Invite Link
                            </a>
                        ))}
                    </div>
                </div>
            </div>
            <div className="row">
                <div className="col-12">
                    <div className="spacer" />
                </div>
            </div>
            <div className="row">
                <div className="col-12">
                    {/* button to generate links */}
                    <button
                        className="btn btn-primary"
                        onClick={onGenerateLink}
                    >
                        Generate Link
                    </button>
                </div>
            </div>
            <hr />
            <div className="row">
                <div className="col-12">
                    <Link className="btn btn-primary" to="/orders">
                        Orders
                    </Link>
                </div>
            </div>
            <hr />
            <WorkerList api={api} />
        </>
    );
};
