import React, { Component } from 'react';
import Pannellum from '../elements/Pannellum';
import { authService } from '../services/auth';
import { stragingService } from '../services/straging';
import VirtualTourApp from '../views/VirtualTourApp';

const API_BASE = process.env.REACT_APP_BASE_URL + '/api';

class SharedPanoramicView extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            error: null,
            panoramicData: null,
            isAuthenticated: false
        };
    }

    componentDidMount() {
        this.checkAuthenticationAndLoadData();
    }

    checkAuthenticationAndLoadData = async () => {
        // Check if user is authenticated
        const isAuth = authService.isAuthenticated();
        this.setState({ isAuthenticated: isAuth });

        // Get URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const shareId = urlParams.get('share');
        const fileId = urlParams.get('file');
        const imageUrl = urlParams.get('image');

        if (!shareId && !fileId && !imageUrl) {
            this.setState({
                error: 'No valid share parameters found. Please provide a share ID, file ID, or image URL.',
                loading: false
            });
            return;
        }

        try {
            let panoramicData = null;

            if (shareId) {
                // Load by share ID
                panoramicData = await this.loadByShareId(shareId);
            } else if (fileId) {
                // Load by file ID
                panoramicData = await this.loadByFileId(fileId);
            } else if (imageUrl) {
                // Direct image URL
                panoramicData = {
                    type: 'equirectangular',
                    panorama: decodeURIComponent(imageUrl),
                    title: 'Shared Panoramic View',
                    haov: 360,
                    vaov: 180,
                    autoLoad: true,
                    showControls: true,
                    showFullscreenCtrl: true,
                    showZoomCtrl: true
                };
            }

            this.setState({
                panoramicData,
                loading: false
            });
        } catch (error) {
            console.error('Error loading panoramic data:', error);
            this.setState({
                error: 'Failed to load panoramic view. The link may be invalid or expired.',
                loading: false
            });
        }
    }

    loadByShareId = async (shareId) => {
        try {
            const response = await stragingService.getPublicStragingById(shareId);
            // If response has data property, return that, otherwise return response directly
            return response.data || response;
        } catch (error) {
            console.error("Error fetching shared straging:", error);
            throw new Error('Share not found or invalid');
        }
    }

    loadByFileId = async (fileId) => {
        // This would typically call your API to get file data
        const { token } = authService.getAuthData();
        const response = await fetch(`${API_BASE}/files/${fileId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (!response.ok) {
            throw new Error('File not found');
        }
        return await response.json();
    }

    handleBackToLogin = () => {
        this.props.onBackToLogin();
    }

    render() {
        const { loading, error, panoramicData, isAuthenticated } = this.state;

        if (loading) {
            return (
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: '100vh',
                    background: '#f8fafc'
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔄</div>
                        <h2 style={{ margin: '0 0 16px 0', color: '#1f2937' }}>Loading Panoramic View...</h2>
                        <p style={{ margin: 0, color: '#6b7280' }}>Please wait while we load your 360° view.</p>
                    </div>
                </div>
            );
        }

        if (error) {
            return (
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    minHeight: '100vh',
                    background: '#f8fafc'
                }}>
                    <div style={{
                        background: 'white',
                        padding: '40px',
                        borderRadius: '12px',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                        maxWidth: '500px',
                        textAlign: 'center'
                    }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
                        <h2 style={{ margin: '0 0 16px 0', color: '#dc3545' }}>Error Loading View</h2>
                        <p style={{ margin: '0 0 24px 0', color: '#6b7280' }}>{error}</p>
                        {!isAuthenticated && (
                            <div style={{ marginBottom: '24px' }}>
                                <p style={{ margin: '0 0 16px 0', color: '#6b7280' }}>
                                    You may need to login to access this panoramic view.
                                </p>
                                <button
                                    onClick={this.handleBackToLogin}
                                    style={{
                                        background: '#667eea',
                                        color: 'white',
                                        border: 'none',
                                        padding: '12px 24px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '16px',
                                        fontWeight: '500'
                                    }}
                                >
                                    Go to Login
                                </button>
                            </div>
                        )}
                        <button
                            onClick={() => window.close()}
                            style={{
                                background: '#6b7280',
                                color: 'white',
                                border: 'none',
                                padding: '8px 16px',
                                borderRadius: '6px',
                                cursor: 'pointer'
                            }}
                        >
                            Close Window
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <VirtualTourApp
                projectData={panoramicData}
                isViewMode={true}
                user={null}
            />
        );
    }
}

export default SharedPanoramicView;
