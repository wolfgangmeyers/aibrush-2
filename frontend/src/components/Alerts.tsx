import React, { FC, useEffect, useState } from 'react';

// implement an error notification component
// error message and timestamp are passed in as props
// but close button can make the error message disappear

// show error when the timestamp or message changes with useEffect hook
// hide error when the close button is clicked

interface Props {
    message: string | null;
    timestamp: number;
}

interface AlertProps {
    message: string;
    timestamp: number;
    alertType: 'success' | 'info' | 'warning' | 'danger';
}

const Alert: FC<AlertProps> = ({ message, timestamp, alertType }) => {
    const [show, setShow] = useState(!!message);

    useEffect(() => {
        setShow(!!message);
    }, [message, timestamp]);

    if (!show) {
        return null;
    }

    return (
        <div className={`alert alert-${alertType} ${show ? 'show' : 'hide'}`}>
            <button
                type="button"
                className="close"
                onClick={() => setShow(false)}
            >
                &times;
            </button>
            {message}
        </div>
    );
};

export const ErrorNotification: FC<Props> = ({ message, timestamp }) => {
    return (
        <Alert message={message || ''} timestamp={timestamp} alertType="danger" />
    );
};

export const SuccessNotification: FC<Props> = ({ message, timestamp }) => {
    return (
        <Alert message={message || ''} timestamp={timestamp} alertType="success" />
    );
};
