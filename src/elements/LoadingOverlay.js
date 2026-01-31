import React from 'react';

const LoadingOverlay = ({ message = "Processing..." }) => (
    <div className="global-loading-overlay">
        <div className="spinner-container">
            <div className="spinner-outer"></div>
            <div className="spinner-inner"></div>
        </div>
        <p className="loading-text">{message}</p>
    </div>
);

export default LoadingOverlay;
