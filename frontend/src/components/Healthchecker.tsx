import React, { FC, useEffect, useState } from 'react';
import { AIBrushApi } from "../client/api";

interface HealthcheckerProps {
    api: AIBrushApi;
}

export const Healthchecker: FC<HealthcheckerProps> = ({ api }) => {
    // automatically check health every 5 seconds
    const [healthCheck, setHealthCheck] = useState(true);
    
    useEffect(() => {
        const interval = setInterval(() => {
            api.healthcheck().then(() => setHealthCheck(true)).catch(() => setHealthCheck(false));
        }, 5000);

        return () => clearInterval(interval);
    }, [api]);

    // only display bootstrap danger alert if healthcheck failed
    // "service is unavailable"
    return (
        <div className="alert alert-danger" role="alert" style={{ display: healthCheck ? 'none' : 'block' }}>
            <strong>Service is unavailable</strong>
        </div>
    );
}

