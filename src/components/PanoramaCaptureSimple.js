import React, { Component } from 'react';
import './PanoramaCapture.css';
import { captureService } from '../services/captureService';
import PanoramaPreview from './PanoramaPreview';

/**
 * SIMPLE Panorama Capture - No confusing dots!
 * Just rotate and tap to capture.
 */
class PanoramaCapture extends Component {
    constructor(props) {
        super(props);

        this.state = {
            hasPermission: false,
            capturedFrames: [],
            isProcessing: false,
            showPreview: false,
            error: null
        };

        this.videoRef = React.createRef();
        this.canvasRef = React.createRef();
    }

    async componentDidMount() {
        captureService.reset();
        await this.initCamera();
    }

    componentWillUnmount() {
        this.stopCamera();
    }

    initCamera = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');

            console.log('📹 Cameras:', videoDevices.map(d => d.label));

            let rearCamera = videoDevices.find(d =>
                d.label.toLowerCase().includes('back') ||
                d.label.toLowerCase().includes('rear') ||
                d.label.toLowerCase().includes('environment')
            );

            if (!rearCamera && videoDevices.length > 1) {
                rearCamera = videoDevices[videoDevices.length - 1];
            }

            const constraints = [];

            if (rearCamera) {
                constraints.push({ video: { deviceId: { exact: rearCamera.deviceId } }, audio: false });
            }

            constraints.push(
                { video: { facingMode: 'environment' }, audio: false },
                { video: true, audio: false }
            );

            for (const constraint of constraints) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia(constraint);

                    this.setState({ hasPermission: true });
                    if (this.videoRef.current) {
                        this.videoRef.current.srcObject = stream;
                        await this.videoRef.current.play();
                    }
                    return;
                } catch (err) {
                    console.warn("Camera failed:", err.message);
                }
            }

            throw new Error('Could not access camera');
        } catch (error) {
            this.setState({ error: error.message });
        }
    }

    stopCamera = () => {
        if (this.videoRef.current?.srcObject) {
            this.videoRef.current.srcObject.getTracks().forEach(t => t.stop());
        }
    }

    switchCamera = async () => {
        try {
            this.stopCamera();

            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');

            if (videoDevices.length < 2) {
                alert('Only one camera available');
                return;
            }

            const currentTrack = this.videoRef.current?.srcObject?.getVideoTracks()[0];
            const currentId = currentTrack?.getSettings().deviceId;
            const currentIndex = videoDevices.findIndex(d => d.deviceId === currentId);
            const nextIndex = (currentIndex + 1) % videoDevices.length;
            const nextCamera = videoDevices[nextIndex];

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: { exact: nextCamera.deviceId } },
                audio: false
            });

            if (this.videoRef.current) {
                this.videoRef.current.srcObject = stream;
                await this.videoRef.current.play();
            }

            alert(`Switched to: ${nextCamera.label}`);
        } catch (error) {
            alert('Camera switch failed');
            await this.initCamera();
        }
    }

    captureFrame = async () => {
        if (this.state.isProcessing) return;

        this.setState({ isProcessing: true });

        const video = this.videoRef.current;
        const canvas = this.canvasRef.current;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);

        canvas.toBlob((blob) => {
            const record = captureService.addFrame({
                yaw: 0,
                pitch: 0,
                roll: 0,
                hfov: 70,
                resolution: { width: canvas.width, height: canvas.height }
            }, blob);

            const thumbUrl = URL.createObjectURL(blob);

            this.setState({
                capturedFrames: [...this.state.capturedFrames, {
                    ...record,
                    thumbnail: thumbUrl
                }],
                isProcessing: false
            });
        }, 'image/jpeg', 0.92);
    }

    handleFinished = () => {
        if (this.state.capturedFrames.length < 3) {
            alert('Capture at least 3 images');
            return;
        }
        this.setState({ showPreview: true });
    }

    handleConfirmStitch = () => {
        if (this.props.onComplete) {
            const files = captureService.getFiles();
            this.props.onComplete(files);
        }
    }

    render() {
        const { hasPermission, error, showPreview, isProcessing, capturedFrames } = this.state;

        if (showPreview) {
            return (
                <div className="panorama-capture-container">
                    <PanoramaPreview frames={capturedFrames} />
                    <div className="teleport-controls fixed-bottom">
                        <button className="btn-secondary" onClick={() => this.setState({ showPreview: false })}>RE-CAPTURE</button>
                        <button className="btn-primary" onClick={this.handleConfirmStitch}>CONFIRM & UPLOAD</button>
                    </div>
                </div>
            );
        }

        return (
            <div className="panorama-capture-container">
                <video ref={this.videoRef} playsInline muted className="camera-preview" />
                <canvas ref={this.canvasRef} style={{ display: 'none' }} />

                {hasPermission && (
                    <div className="guides-overlay">
                        {/* Top Bar */}
                        <div className="teleport-top-btns">
                            <div className="points-indicator">{capturedFrames.length} CAPTURED</div>
                            <button
                                className="teleport-nav-btn"
                                onClick={this.switchCamera}
                                style={{ background: 'rgba(255, 165, 0, 0.9)', fontSize: '20px' }}
                            >
                                🔄
                            </button>
                            <button className="teleport-nav-btn close-red" onClick={this.props.onCancel}>✕</button>
                        </div>

                        {/* Instructions */}
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            background: 'rgba(0,0,0,0.9)',
                            padding: '30px',
                            borderRadius: '20px',
                            textAlign: 'center',
                            maxWidth: '90%',
                            pointerEvents: 'none'
                        }}>
                            {capturedFrames.length === 0 ? (
                                <>
                                    <div style={{ fontSize: '48px', marginBottom: '15px' }}>📷</div>
                                    <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#00FF00', marginBottom: '15px' }}>
                                        SIMPLE PANORAMA
                                    </div>
                                    <div style={{ fontSize: '16px', color: '#fff', lineHeight: '1.8' }}>
                                        1. Stand in one spot<br />
                                        2. Slowly rotate 360°<br />
                                        3. Tap 📷 every 30-45°<br />
                                        4. Capture 8-12 images
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={{ fontSize: '36px', marginBottom: '10px' }}>🔄</div>
                                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#00FF00', marginBottom: '10px' }}>
                                        KEEP ROTATING
                                    </div>
                                    <div style={{ fontSize: '16px', color: '#fff' }}>
                                        {capturedFrames.length} / 12 images<br />
                                        <span style={{ fontSize: '14px', opacity: 0.8 }}>
                                            Rotate and tap 📷
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Capture Button */}
                        <div style={{ position: 'absolute', bottom: '80px', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'auto' }}>
                            <button
                                onClick={this.captureFrame}
                                disabled={isProcessing}
                                style={{
                                    width: '100px',
                                    height: '100px',
                                    borderRadius: '50%',
                                    fontSize: '48px',
                                    padding: 0,
                                    background: isProcessing ? '#666' : '#00FF00',
                                    border: '6px solid #fff',
                                    boxShadow: isProcessing ? 'none' : '0 0 40px #00FF00',
                                    cursor: isProcessing ? 'not-allowed' : 'pointer'
                                }}
                            >
                                📷
                            </button>
                        </div>

                        {/* Finish Button */}
                        {capturedFrames.length >= 3 && (
                            <button
                                onClick={this.handleFinished}
                                style={{
                                    position: 'absolute',
                                    bottom: '200px',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    padding: '15px 40px',
                                    fontSize: '18px',
                                    fontWeight: 'bold',
                                    borderRadius: '30px',
                                    background: '#FF6B00',
                                    border: '3px solid #fff',
                                    boxShadow: '0 0 30px rgba(255, 107, 0, 0.8)',
                                    pointerEvents: 'auto',
                                    cursor: 'pointer'
                                }}
                            >
                                ✅ FINISH & STITCH
                            </button>
                        )}
                    </div>
                )}

                {error && (
                    <div className="overlay-full error">
                        <h3>{error}</h3>
                        <button onClick={() => window.location.reload()}>RETRY</button>
                    </div>
                )}
            </div>
        );
    }
}

export default PanoramaCapture;
