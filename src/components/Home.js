import React, { Component } from 'react';
import './Home.css';
import MyStragings from './MyStragings';
import StragingUpload from './StragingUpload';
import PanoramaCapture from './PanoramaCapture';

class Home extends Component {
    constructor(props) {
        super(props);
        this.state = {
            user: props.user || null,
            currentView: 'overview', // overview, stragings, upload, panorama-capture
            searchQuery: '',
            showCreateDialog: false,
            selectedFiles: []
        };
        this.fileInputRef = React.createRef();
        this.captureInputRef = React.createRef();
    }

    handlePanoramaCancel = () => {
        this.setState({ currentView: 'overview' });
    }

    handleCaptureComplete = (files) => {
        console.log("🔄 Panorama Capture Done. Switching to Upload...", files.length);
        if (this.props.onCreateStraging) {
            this.props.onCreateStraging(files);
        } else {
            this.handleCreateStraging(files);
        }
    }

    handleCreateClick = (e) => {
        if (e) e.stopPropagation();
        this.setState({ showCreateDialog: true });
    }

    handleGallerySelect = () => {
        this.fileInputRef.current.click();
        this.setState({ showCreateDialog: false });
    }

    handleCaptureSelect = async () => {
        this.setState({ showCreateDialog: false });

        // 1. Request orientation permission immediately (must be on user gesture)
        try {
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                await DeviceOrientationEvent.requestPermission();
            }
        } catch (e) {
            console.warn("Orientation pre-auth failed:", e);
        }

        // 2. Switch to Panorama view immediately
        this.setState({ currentView: 'panorama-capture' });
    }

    handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            if (this.props.onCreateStraging) {
                this.props.onCreateStraging(files);
            } else {
                this.handleCreateStraging(files);
            }
        }
    }

    handleCreateStraging = (files = []) => {
        this.setState({
            currentView: 'upload',
            selectedFiles: files
        });
        if (this.props.onCreateStraging) {
            this.props.onCreateStraging(files);
        }
    }

    handleViewStragings = () => {
        this.setState({ currentView: 'stragings' });
        if (this.props.onViewStragings) {
            this.props.onViewStragings();
        }
    }

    handleBackToOverview = () => {
        this.setState({ currentView: 'overview' });
    }

    handleSearch = (e) => {
        this.setState({ searchQuery: e.target.value });
    }

    render() {
        const { user, currentView, searchQuery, showCreateDialog } = this.state;

        // If not in overview view, render the appropriate component
        if (currentView === 'stragings') {
            return (
                <div className="home-container">
                    <MyStragings
                        onViewStraging={this.props.onViewStraging}
                        onEditStraging={this.props.onEditStraging}
                        onCreateNew={this.handleCreateClick}
                    />
                </div>
            );
        }

        if (currentView === 'panorama-capture') {
            return (
                <PanoramaCapture
                    onComplete={this.handleCaptureComplete}
                    onCancel={this.handlePanoramaCancel}
                />
            );
        }

        if (currentView === 'upload') {
            return (
                <div className="home-container">
                    <StragingUpload
                        initialImages={this.state.selectedFiles}
                        onUploadSuccess={this.handleViewStragings}
                        onCancel={this.handleBackToOverview}
                    />
                </div>
            );
        }

        return (
            <div className="home-container">
                {/* Hidden Inputs for Capture/Gallery */}
                <input
                    type="file"
                    ref={this.fileInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    multiple
                    onChange={this.handleFileChange}
                />
                <input
                    type="file"
                    ref={this.captureInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    capture="environment"
                    onChange={this.handleFileChange}
                />

                {/* Create Dialog */}
                {showCreateDialog && (
                    <div className="dialog-overlay" onClick={() => this.setState({ showCreateDialog: false })}>
                        <div className="dialog-container create-choice-dialog" onClick={(e) => e.stopPropagation()}>
                            <div className="dialog-header">
                                <h3>Select Source</h3>
                                <button className="close-btn" onClick={() => this.setState({ showCreateDialog: false })}>×</button>
                            </div>
                            <div className="choice-options">
                                <div className="choice-option" onClick={this.handleCaptureSelect}>
                                    <div className="choice-icon">🌐</div>
                                    <div className="choice-text">
                                        <h4>Panorama (360°)</h4>
                                        <p>Guided point-wise capture (Requires HTTPS)</p>
                                    </div>
                                </div>
                                <div className="choice-option" onClick={() => {
                                    this.captureInputRef.current.click();
                                    this.setState({ showCreateDialog: false });
                                }}>
                                    <div className="choice-icon">📸</div>
                                    <div className="choice-text">
                                        <h4>Simple Camera</h4>
                                        <p>Standard phone camera</p>
                                    </div>
                                </div>
                                <div className="choice-option" onClick={this.handleGallerySelect}>
                                    <div className="choice-icon">🖼️</div>
                                    <div className="choice-text">
                                        <h4>Gallery</h4>
                                        <p>Select images from your device</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Header */}
                <header className="home-header">
                    <div className="header-left">
                        <div className="logo">
                            <div className="logo-icon">🌐</div>
                            <h1>Virtual Tour Creator</h1>
                        </div>
                    </div>

                    <div className="header-right">
                        <div className="search-bar">
                            <input
                                type="text"
                                placeholder="Search stragings..."
                                value={searchQuery}
                                onChange={this.handleSearch}
                            />
                            <span className="search-icon">🔍</span>
                        </div>

                        <div className="user-menu">
                            <div className="user-avatar">
                                <span>{user?.fullName?.[0] || user?.email?.[0] || 'U'}</span>
                            </div>
                            <div className="user-dropdown">
                                <div className="user-info">
                                    <p className="user-name">{user?.fullName || user?.email}</p>
                                    <p className="user-email">{user?.email}</p>
                                </div>
                                <div className="dropdown-menu">
                                    <button className="menu-item">⚙️ Settings</button>
                                    <button className="menu-item">📊 Analytics</button>
                                    <button className="menu-item">❓ Help</button>
                                    <button
                                        className="menu-item logout"
                                        onClick={this.props.onSignOut}
                                    >
                                        🚪 Sign Out
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="home-main">
                    <div className="content-header">
                        <div>
                            <h2>Welcome to Virtual Tour Creator</h2>
                            <p>Create and manage your virtual staging projects</p>
                        </div>
                        <div className="header-buttons">
                            <button
                                className="straging-btn primary"
                                onClick={this.handleViewStragings}
                            >
                                <span className="view-icon">📋</span>
                                View My Stragings
                            </button>
                            <button
                                className="straging-btn secondary"
                                onClick={this.handleCreateClick}
                            >
                                <span className="plus-icon">+</span>
                                Create New Straging
                            </button>
                        </div>
                    </div>

                    {/* Overview Section */}
                    <div className="overview-section">
                        <div className="overview-cards">
                            <div className="overview-card" onClick={this.handleViewStragings}>
                                <div className="card-icon">📋</div>
                                <h3>My Stragings</h3>
                                <p>View and manage all your virtual staging projects</p>
                                <button className="card-btn">View All</button>
                            </div>

                            <div className="overview-card" onClick={this.handleCreateClick}>
                                <div className="card-icon">➕</div>
                                <h3>Create New</h3>
                                <p>Start a new virtual staging project with images</p>
                                <button className="card-btn">Create Now</button>
                            </div>

                            <div className="overview-card">
                                <div className="card-icon">📊</div>
                                <h3>Analytics</h3>
                                <p>Track performance and engagement of your tours</p>
                                <button className="card-btn">Coming Soon</button>
                            </div>

                            <div className="overview-card">
                                <div className="card-icon">🎯</div>
                                <h3>Tutorials</h3>
                                <p>Learn how to create amazing virtual tours</p>
                                <button className="card-btn">Learn More</button>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        );
    }
}

export default Home;
