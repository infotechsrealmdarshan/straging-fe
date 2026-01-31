import React, { Component } from 'react';
import { stragingService } from '../services/straging';
import { authService } from '../services/auth';
import LoadingOverlay from '../elements/LoadingOverlay';
import './MyStragings.css';

class MyStragings extends Component {
    constructor(props) {
        super(props);
        this.state = {
            stragings: [],
            loading: true,
            isDeleting: false,
            error: ''
        };
    }

    componentDidMount() {
        this.fetchMyStragings();
    }

    fetchMyStragings = async () => {
        try {
            const { token } = authService.getAuthData();
            if (!token) {
                this.setState({ error: 'You must be logged in to view your stragings', loading: false });
                return;
            }

            const response = await stragingService.getMyStragings(token, 1, 10, "");

            if (response && response.data) {
                // Handle the response structure: {data: {straging: [...], pagination: {...}}}
                const fetchedStragings = response.data.straging || [];

                this.setState({ stragings: fetchedStragings });
            } else {
                this.setState({ error: response?.message || 'Invalid response from server' });
            }
        } catch (err) {
            const errorMessage = err.response?.data?.message || 'Failed to fetch stragings';
            this.setState({ error: errorMessage });
        } finally {
            this.setState({ loading: false });
        }
    }

    handleViewStraging = (straging) => {
        // Navigate to straging detail view or editor
        if (this.props.onViewStraging) {
            this.props.onViewStraging(straging);
        }
    }

    handleEditStraging = (straging) => {
        // Navigate to edit straging
        if (this.props.onEditStraging) {
            this.props.onEditStraging(straging);
        }
    }

    handleDeleteStraging = async (stragingId) => {
        if (window.confirm('Are you sure you want to delete this straging?')) {
            this.setState({ isDeleting: true });
            try {
                const { token } = authService.getAuthData();
                const response = await stragingService.deleteStraging(stragingId, token);

                if (response && (response.statusCode === 200 || response.status === 1)) {
                    // Success - refresh the list
                    this.fetchMyStragings();
                } else {
                    this.setState({ error: response?.message || 'Delete failed' });
                    this.fetchMyStragings();
                }
            } catch (err) {
                const errorMessage = err.response?.data?.message || 'Failed to delete straging';
                this.setState({ error: errorMessage });
                this.fetchMyStragings();
            } finally {
                this.setState({ isDeleting: false });
            }
        }
    }

    formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    render() {
        const { stragings, loading, error } = this.state;

        if (loading) {
            return (
                <div className="my-stragings">
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Loading your stragings...</p>
                    </div>
                </div>
            );
        }

        return (
            <div className="my-stragings">
                <div className="stragings-header">
                    <h2>My Stragings</h2>
                    <p>Manage your virtual tour projects</p>
                </div>

                {error && <div className="error-message">{error}</div>}

                {stragings.length === 0 ? (
                    <div className="no-stragings">
                        <div className="empty-icon">🏗️</div>
                        <h3>No stragings yet</h3>
                        <p>Create your first straging project to get started</p>
                        {this.props.onCreateNew && (
                            <button
                                className="create-first-btn"
                                onClick={this.props.onCreateNew}
                            >
                                Create Your First Straging
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="stragings-grid">
                        {stragings.map((straging) => (
                            <div key={straging._id || straging.project?._id || `straging-${Math.random()}`} className="straging-card">
                                <div className="straging-image">
                                    {straging.areas && straging.areas.length > 0 && straging.areas[0].imageUrl ? (
                                        <img
                                            src={straging.areas[0].imageUrl}
                                            alt={straging.project?.projectName || 'Straging Project'}
                                        />
                                    ) : (
                                        <div className="no-image-placeholder">
                                            <span>📷</span>
                                            <p>No Image</p>
                                        </div>
                                    )}
                                    <div className="straging-overlay">
                                        <button
                                            className="view-btn"
                                            onClick={() => this.handleViewStraging(straging)}
                                        >
                                            View Tour
                                        </button>
                                    </div>
                                </div>

                                <div className="straging-info">
                                    <h3>{straging.project?.projectName || 'Untitled Project'}</h3>
                                    <div className="address">
                                        <p>📍 {straging.project?.streetAddress || 'No address'}</p>
                                        {straging.project?.aptLandmark && (
                                            <p>🏢 {straging.project.aptLandmark}</p>
                                        )}
                                        <p>🌍 {straging.project?.cityLocality || ''}, {straging.project?.state || ''}</p>
                                        <p>🏳️ {straging.project?.country || ''}</p>
                                    </div>

                                    {straging.project?.note && (
                                        <div className="notes">
                                            <p><strong>Notes:</strong> {straging.project.note}</p>
                                        </div>
                                    )}

                                    <div className="straging-meta">
                                        <span className="meta-item">
                                            🎯 {straging.areas?.reduce((total, area) => total + (area.hotspots || []).length, 0) || 0} hotspots
                                        </span>
                                        <span className="meta-item">
                                            📄 {straging.areas?.reduce((total, area) => total + (area.info || []).length, 0) > 0 ? 'Has info' : 'No info'}
                                        </span>
                                        <span className="meta-item">
                                            📅 {this.formatDate(straging.project?.createdAt)}
                                        </span>
                                    </div>

                                    <div className="straging-actions">
                                        <button
                                            className="action-btn primary"
                                            onClick={() => this.handleViewStraging(straging)}
                                        >
                                            View
                                        </button>
                                        <button
                                            className="action-btn secondary"
                                            onClick={() => this.handleEditStraging(straging)}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            className="action-btn danger"
                                            onClick={() => this.handleDeleteStraging(straging.project?._id || straging._id)}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {this.state.isDeleting && <LoadingOverlay message="Deleting project..." />}
            </div>
        );
    }
}

export default MyStragings;
