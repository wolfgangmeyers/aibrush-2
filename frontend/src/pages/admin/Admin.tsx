import React, { FC, useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { AIBrushApi } from "../../client/api";
import GenerateCode from "./GenerateCode";
import { GlobalSettings } from "./GlobalSettings";

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
        <div style={{ paddingBottom: "48px" }}>
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
            <div className="row">
                <div className="col-12">
                    <div
                        className="d-flex justify-content-center align-items-center"
                        style={{ height: "100%" }}
                    >
                        <GenerateCode api={api} />
                    </div>
                </div>
            </div>
            <hr />
            <GlobalSettings api={api} />
        </div>
    );
};
