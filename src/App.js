import React, { Component } from 'react';
import SignIn from './components/SignIn';
import SignUp from './components/SignUp';
import Home from './components/Home';
import VirtualTourApp from './views/VirtualTourApp';
import StragingUpload from './components/StragingUpload';
import MyStragings from './components/MyStragings';
import SharedPanoramicView from './components/SharedPanoramicView';
import PanoramaDemo from './components/PanoramaDemo';
import { authService } from './services/auth';
import { stragingService } from './services/straging';
import './App.css';

class App extends Component {
    constructor(props) {
        super(props);
        this.state = {
            currentPage: 'signin', // signin, signup, home, stragings, upload, editor, shared
            user: null,
            currentProject: null,
            currentStraging: null,
            initialImages: []
        };
    }

    componentDidMount() {
        // Check for shared panoramic view or tour first
        const urlParams = new URLSearchParams(window.location.search);
        const shareId = urlParams.get('share');
        const fileId = urlParams.get('file');
        const imageUrl = urlParams.get('image');
        const tourId = urlParams.get('tour');

        if (shareId || fileId || imageUrl) {
            this.setState({ currentPage: 'shared' });
            return;
        }

        if (tourId) {
            // Direct tour access - go to editor with view mode
            this.setState({ currentPage: 'editor' });
            return;
        }

        // Check if user is already authenticated
        if (authService.isAuthenticated()) {
            const { user } = authService.getAuthData();
            this.setState({
                user: user,
                currentPage: 'home'
            });
        }

        // Check if returning from a specific page
        const page = urlParams.get('page');
        const id = urlParams.get('id');
        if (page === 'editor') {
            this.setState({ currentPage: 'editor' });

            if (id) {
                this.setState({ currentStraging: { _id: id } });

                (async () => {
                    try {
                        if (!authService.isAuthenticated()) return;

                        const { token } = authService.getAuthData();
                        const response = await stragingService.getStragingById(id, token);

                        if (response && response.data) {
                            this.setState({
                                currentStraging: response.data
                            });
                        } else {
                            // Fallback to minimal data if ID fetch fails
                            this.setState({
                                currentStraging: { _id: id }
                            });
                        }
                    } catch (error) {
                        console.error("Error fetching straging by ID:", error);
                        this.setState({
                            currentStraging: { _id: id }
                        });
                    }
                })();
            }
        }
    }

    handleSignIn = (userData) => {
        this.setState({ user: userData, currentPage: 'home' });
    }

    handleSignUp = (userData) => {
        this.setState({ user: userData, currentPage: 'home' });
    }

    handleSignOut = () => {
        authService.clearAuthData();
        this.setState({ user: null, currentPage: 'signin' });
    }

    handleCreateStraging = (images = []) => {
        const files = Array.isArray(images) ? images : [];
        this.setState(prev => ({
            ...prev,
            currentPage: 'upload',
            initialImages: files
        }));
    }

    handleViewStragings = () => {
        this.setState({ currentPage: 'stragings' });
    }

    handleRefreshStraging = async () => {
        const { currentStraging } = this.state;
        const id = currentStraging?._id || currentStraging?.id;
        if (!id) return;

        try {
            if (!authService.isAuthenticated()) return;
            const { token } = authService.getAuthData();
            const response = await stragingService.getStragingById(id, token);

            if (response && response.data) {
                this.setState({
                    currentStraging: response.data
                });
            }
        } catch (error) {
            console.error("Error refreshing straging:", error);
        }
    }

    handleViewStraging = async (straging) => {
        const stragingId = straging?._id || straging?.project?._id;
        if (stragingId) {
            window.history.pushState({}, '', `?page=editor&id=${encodeURIComponent(stragingId)}`);
        }

        // Use the straging data directly from the list instead of fetching again
        this.setState({
            currentStraging: straging,
            currentPage: 'editor'
        });

        // Only fetch fresh data if the straging object doesn't have full details
        if (!straging.project || !straging.areas) {
            try {
                if (!authService.isAuthenticated()) return;

                const { token } = authService.getAuthData();
                const response = await stragingService.getStragingById(stragingId, token);

                if (response && response.data) {
                    this.setState({
                        currentStraging: response.data,
                        currentPage: 'editor'
                    });
                }
            } catch (error) {
                console.error("Error fetching straging by ID:", error);
                // Keep using the data from the list
            }
        }
    }

    handleEditStraging = async (straging) => {
        this.handleViewStraging(straging);
    }

    handleStragingUploadSuccess = (stragingData) => {
        // Navigate straight to editor after successful upload
        this.setState({
            currentPage: 'editor',
            currentStraging: stragingData
        });
    }

    handleBackToHome = () => {
        this.setState({
            currentPage: 'home',
            currentProject: null,
            currentStraging: null
        });

        window.history.pushState({}, '', window.location.pathname);
    }

    handleBackToLogin = () => {
        this.setState({
            currentPage: 'signin',
            currentProject: null,
            currentStraging: null
        });

        window.history.pushState({}, '', window.location.pathname);
    }

    renderPage = () => {
        const { currentPage, user, currentProject, currentStraging } = this.state;

        switch (currentPage) {
            case 'signin':
                return (
                    <SignIn
                        onSignIn={this.handleSignIn}
                        onSwitchToSignUp={() => this.setState({ currentPage: 'signup' })}
                    />
                );

            case 'signup':
                return (
                    <SignUp
                        onSignUp={this.handleSignUp}
                        onSwitchToSignIn={() => this.setState({ currentPage: 'signin' })}
                    />
                );

            case 'home':
                return (
                    <Home
                        user={user}
                        onSignOut={this.handleSignOut}
                        onCreateStraging={this.handleCreateStraging}
                        onViewStragings={this.handleViewStragings}
                        onViewStraging={this.handleViewStraging}
                        onEditStraging={this.handleEditStraging}
                    />
                );

            case 'stragings':
                return (
                    <MyStragings
                        onViewStraging={this.handleViewStraging}
                        onEditStraging={this.handleEditStraging}
                        onCreateNew={this.handleCreateStraging}
                    />
                );

            case 'upload':
                return (
                    <StragingUpload
                        key={`upload-${(this.state.initialImages || []).length}-${(this.state.initialImages || [])[0]?.name || ''}`}
                        initialImages={this.state.initialImages || []}
                        onUploadSuccess={this.handleStragingUploadSuccess}
                        onCancel={() => this.setState({ currentPage: 'home' })}
                    />
                );

            case 'editor':
                return (
                    <VirtualTourApp
                        key={(currentStraging || currentProject)?._id || 'no_id'}
                        projectData={currentStraging || currentProject}
                        user={user}
                        onBackToHome={this.handleBackToHome}
                        onRefresh={this.handleRefreshStraging}
                    />
                );

            case 'shared':
                return (
                    <SharedPanoramicView
                        onBackToLogin={this.handleBackToLogin}
                    />
                );

            case 'demo':
                return <PanoramaDemo />;

            default:
                return (
                    <SignIn
                        onSignIn={this.handleSignIn}
                        onSwitchToSignUp={() => this.setState({ currentPage: 'signup' })}
                    />
                );
        }
    }

    render() {
        return (
            <div className="app">
                {this.renderPage()}
            </div>
        );
    }
}

export default App;
