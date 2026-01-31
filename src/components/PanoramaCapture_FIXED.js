import React, { Component } from 'react';
import './PanoramaCapture.css';
import { captureService } from '../services/captureService';
import PanoramaPreview from './PanoramaPreview';
import { SensorFusion } from '../utils/sensorFusion';
import { CaptureStateMachine, CaptureState } from '../utils/captureStateMachine';
import * as THREE from 'three';

/**
 * PanoramaCapture.js - TELEPORT360 EXACT MATCH
 * 
 * CRITICAL ARCHITECTURE:
 * - Dots are FIXED in world space (never move)
 * - Camera rotates INSIDE a static sphere
 * - Dots appear to move across screen as camera rotates
 * - This is EXACTLY how Teleport360 works
 */
class PanoramaCapture extends Component {
    constructor(props) {
        super(props);

        // WORLD-SPACE DOT POSITIONS (FIXED, COMPUTED ONCE)
        this.capturePoints = [
            // Sky ring (10 points)
            ...Array.from({ length: 10 }, (_, i) => ({
                id: `sky_${i}`,
                yaw: (360 / 10) * i,
                pitch: 50,
                ring: 'sky',
                color: '#00f2fe'
            })),
            // Horizon ring (12 points)
            ...Array.from({ length: 12 }, (_, i) => ({
                id: `horizon_${i}`,
                yaw: (360 / 12) * i,
                pitch: 0,
                ring: 'horizon',
                color: '#00ffa3'
            })),
            // Floor ring (10 points)
            ...Array.from({ length: 10 }, (_, i) => ({
                id: `floor_${i}`,
                yaw: (360 / 10) * i,
                pitch: -50,
                ring: 'floor',
                color: '#4facfe'
            }))
        ];

        // PRECOMPUTE WORLD-SPACE 3D POSITIONS (ONCE, NEVER CHANGE)
        this.worldDots = this.capturePoints.map(point => {
            const yawRad = THREE.MathUtils.degToRad(point.yaw);
            const pitchRad = THREE.MathUtils.degToRad(point.pitch);
            const radius = 10; // Arbitrary sphere radius

            // Spherical to Cartesian conversion
            const x = radius * Math.cos(pitchRad) * Math.sin(yawRad);
            const y = radius * Math.sin(pitchRad);
            const z = radius * Math.cos(pitchRad) * Math.cos(yawRad);

            return {
                ...point,
                worldPosition: new THREE.Vector3(x, y, z)
            };
        });

        this.state = {
            hasPermission: false,
            needsSensorClick: true,
            error: null,
            capturedFrames: [],
            isProcessing: false,
            showPreview: false,
            message: 'Initialize sensors',
            currentTargetIndex: 0,
            captureState: CaptureState.IDLE,
            stabilityProgress: 0
        };

        this.videoRef = React.createRef();
        this.canvasRef = React.createRef();

        // Sensor fusion and state machine
        this.sensorFusion = new SensorFusion();
        this.stateMachine = new CaptureStateMachine({
            alignmentThreshold: 10,
            lockThreshold: 4,
            stabilityDuration: 600,
            rollTolerance: 5
        });

        // Three.js camera for projection math
        this.camera = new THREE.PerspectiveCamera(
            70, // FOV
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 0, 0); // Camera at origin

        this.autoCaptureTimer = null;
        this.renderLoopId = null;
    }

    async componentDidMount() {
        captureService.reset();
        await this.handleStart(true);

        // Update camera aspect on resize
        window.addEventListener('resize', this.handleResize);
    }

    componentWillUnmount() {
        if (this.orientationHandler) {
            window.removeEventListener('deviceorientation', this.orientationHandler, true);
        }
        if (this.renderLoopId) {
            cancelAnimationFrame(this.renderLoopId);
        }
        window.removeEventListener('resize', this.handleResize);
        this.stopCamera();
    }

    handleResize = () => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
    }

    handleStart = async (isAuto = false) => {
        try {
            await this.initCamera();

            // Request sensor permissions (iOS)
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                if (!isAuto) {
                    const permission = await DeviceOrientationEvent.requestPermission();
                    if (permission !== 'granted') throw new Error('Sensor access denied');
                }
            }

            // Setup sensor handler
            this.orientationHandler = (e) => {
                const smoothed = this.sensorFusion.update(e);
                if (smoothed && !this.sensorFusion.isCalibrated) {
                    this.sensorFusion.calibrate();
                }
            };

            window.addEventListener('deviceorientation', this.orientationHandler, true);
            this.setState({ needsSensorClick: false });

            // Start render loop
            this.startRenderLoop();

        } catch (err) {
            this.setState({ error: err.message, needsSensorClick: true });
        }
    }

    initCamera = async () => {
        try {
            // Enumerate all video devices
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');

            console.log('📹 Available cameras:', videoDevices.map(d => d.label));

            // Find rear camera by label
            let rearCamera = videoDevices.find(device =>
                device.label.toLowerCase().includes('back') ||
                device.label.toLowerCase().includes('rear') ||
                device.label.toLowerCase().includes('environment')
            );

            // Fallback: use last camera (usually rear on mobile)
            if (!rearCamera && videoDevices.length > 1) {
                rearCamera = videoDevices[videoDevices.length - 1];
            }

            const constraints = [];

            // Prefer specific deviceId if found
            if (rearCamera) {
                constraints.push(
                    { video: { deviceId: { exact: rearCamera.deviceId }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false },
                    { video: { deviceId: { exact: rearCamera.deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }
                );
            }

            // Fallback constraints
            constraints.push(
                { video: { facingMode: { exact: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
                { video: { facingMode: 'environment' }, audio: false },
                { video: true, audio: false }
            );

            // Try each constraint
            for (const constraint of constraints) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia(constraint);
                    const videoTrack = stream.getVideoTracks()[0];
                    const settings = videoTrack.getSettings();

                    console.log('✅ Camera:', videoTrack.label, '| Facing:', settings.facingMode);

                    // Detect front camera
                    const isFront = settings.facingMode === 'user' ||
                        videoTrack.label.toLowerCase().includes('front');

                    if (isFront && constraint !== constraints[constraints.length - 1]) {
                        console.warn('⚠️ Front camera detected, trying next...');
                        stream.getTracks().forEach(t => t.stop());
                        continue;
                    }

                    this.setState({ hasPermission: true });
                    if (this.videoRef.current) {
                        this.videoRef.current.srcObject = stream;
                        await this.videoRef.current.play();
                    }
                    return;
                } catch (err) {
                    console.warn("❌ Constraint failed:", err.message);
                    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                        throw new Error('Camera permission denied.');
                    }
                }
            }

            throw new Error('Could not access rear camera.');
        } catch (error) {
            console.error('Camera error:', error);
            throw error;
        }
    }

    stopCamera = () => {
        if (this.videoRef.current && this.videoRef.current.srcObject) {
            this.videoRef.current.srcObject.getTracks().forEach(t => t.stop());
        }
    }

    switchCamera = async () => {
        try {
            // Stop current camera
            this.stopCamera();

            // Get all video devices
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');

            if (videoDevices.length < 2) {
                alert('Only one camera available');
                return;
            }

            // Get current device ID
            const currentTrack = this.videoRef.current?.srcObject?.getVideoTracks()[0];
            const currentId = currentTrack?.getSettings().deviceId;

            // Find next camera
            const currentIndex = videoDevices.findIndex(d => d.deviceId === currentId);
            const nextIndex = (currentIndex + 1) % videoDevices.length;
            const nextCamera = videoDevices[nextIndex];

            console.log('Switching to:', nextCamera.label);

            // Open next camera
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
            console.error('Camera switch failed:', error);
            alert('Failed to switch camera');
            // Try to restart original camera
            await this.initCamera();
        }
    }

    /**
     * MAIN RENDER LOOP - Decoupled from sensor events
     */
    startRenderLoop = () => {
        const loop = () => {
            this.updateCaptureLogic();
            this.renderLoopId = requestAnimationFrame(loop);
        };
        loop();
    }

    /**
     * Update camera quaternion from device orientation
     * THIS IS THE ONLY THING THAT MOVES
     */
    updateCameraOrientation = () => {
        if (!this.sensorFusion.isCalibrated) return;

        const yaw = this.sensorFusion.getRelativeYaw();
        const pitch = this.sensorFusion.getPitch();
        const roll = this.sensorFusion.getRoll();

        // Convert Euler angles to quaternion
        const euler = new THREE.Euler(
            THREE.MathUtils.degToRad(-pitch), // Pitch (X-axis)
            THREE.MathUtils.degToRad(yaw),    // Yaw (Y-axis)
            THREE.MathUtils.degToRad(roll),   // Roll (Z-axis)
            'YXZ' // Rotation order
        );

        this.camera.quaternion.setFromEuler(euler);
        this.camera.updateMatrixWorld();
    }

    /**
     * Update capture logic at 60fps
     */
    updateCaptureLogic = () => {
        if (!this.sensorFusion.isCalibrated) return;

        // Update camera orientation (ONLY THIS MOVES)
        this.updateCameraOrientation();

        const currentTarget = this.getCurrentTarget();
        if (!currentTarget) return;

        const alignmentData = this.calculateAlignment(currentTarget);
        const newState = this.stateMachine.update(alignmentData, this.sensorFusion);

        const visualState = this.stateMachine.getVisualState();

        this.setState({
            captureState: newState,
            stabilityProgress: visualState.progress,
            message: visualState.message
        });

        // Auto-capture when ready
        if (this.stateMachine.canCapture() && !this.autoCaptureTimer) {
            this.autoCaptureTimer = setTimeout(() => {
                this.captureFrame(currentTarget);
            }, 100);
        } else if (!this.stateMachine.canCapture() && this.autoCaptureTimer) {
            clearTimeout(this.autoCaptureTimer);
            this.autoCaptureTimer = null;
        }
    }

    /**
     * Get current target point (world-space, FIXED)
     */
    getCurrentTarget = () => {
        const captured = this.state.capturedFrames;
        return this.worldDots.find(point =>
            !captured.some(frame => frame.pointId === point.id)
        );
    }

    /**
     * Calculate alignment to target (WORLD-SPACE MATH)
     * Uses vector dot product - EXACTLY like Teleport360
     */
    calculateAlignment = (target) => {
        // Get camera forward vector (where camera is looking)
        const cameraForward = new THREE.Vector3(0, 0, -1);
        cameraForward.applyQuaternion(this.camera.quaternion);
        cameraForward.normalize();

        // Get direction to target dot (from origin)
        const dotDirection = target.worldPosition.clone().normalize();

        // Calculate angle between camera and dot
        const dotProduct = cameraForward.dot(dotDirection);
        const alignmentAngle = THREE.MathUtils.radToDeg(Math.acos(Math.max(-1, Math.min(1, dotProduct))));

        // Calculate yaw/pitch differences for state machine
        const currentYaw = this.sensorFusion.getRelativeYaw();
        const currentPitch = this.sensorFusion.getPitch();
        const yawDiff = this.angleDiff(target.yaw, currentYaw);
        const pitchDiff = target.pitch - currentPitch;

        return {
            target,
            yawDiff,
            pitchDiff,
            alignmentAngle // This is the TRUE angular distance
        };
    }

    angleDiff = (a, b) => {
        let d = a - b;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        return d;
    }

    /**
     * PROJECT WORLD DOT TO SCREEN COORDINATES
     * This is where the "magic" happens - dots stay fixed, camera moves
     */
    projectDotToScreen = (worldDot) => {
        // Clone the world position
        const worldPos = worldDot.worldPosition.clone();

        // Project to screen using camera
        worldPos.project(this.camera);

        // Convert NDC (-1 to 1) to screen coordinates
        const x = (worldPos.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-(worldPos.y * 0.5) + 0.5) * window.innerHeight;

        // Check if dot is in front of camera (z < 1 means in front)
        const isVisible = worldPos.z < 1;

        // Calculate angular distance for color/state
        const cameraForward = new THREE.Vector3(0, 0, -1);
        cameraForward.applyQuaternion(this.camera.quaternion);
        const dotDirection = worldDot.worldPosition.clone().normalize();
        const dotProduct = cameraForward.dot(dotDirection);
        const alignmentAngle = THREE.MathUtils.radToDeg(Math.acos(Math.max(-1, Math.min(1, dotProduct))));

        return {
            x,
            y,
            isVisible: isVisible && alignmentAngle < 90, // Only show if in front hemisphere
            alignmentAngle
        };
    }

    /**
     * CAPTURE with quality gating
     */
    captureFrame = async (target) => {
        if (this.state.isProcessing || !this.stateMachine.capture()) return;

        this.setState({ isProcessing: true });

        const video = this.videoRef.current;
        const canvas = this.canvasRef.current;
        if (!video || !canvas) return;

        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0);

        canvas.toBlob((blob) => {
            const frameMetadata = {
                yaw: this.sensorFusion.getRelativeYaw(),
                pitch: this.sensorFusion.getPitch(),
                roll: this.sensorFusion.getRoll(),
                hfov: 75,
                resolution: { width: canvas.width, height: canvas.height },
                confidence: 1.0,
                angularVelocity: this.sensorFusion.getAngularSpeed()
            };

            const record = captureService.addFrame(frameMetadata, blob);

            const thumbUrl = URL.createObjectURL(blob);
            this.setState({
                capturedFrames: [...this.state.capturedFrames, {
                    ...record,
                    pointId: target.id,
                    targetYaw: target.yaw,
                    targetPitch: target.pitch,
                    thumbnail: thumbUrl,
                    actualYaw: frameMetadata.yaw,
                    actualPitch: frameMetadata.pitch
                }],
                isProcessing: false,
                currentTargetIndex: this.state.currentTargetIndex + 1
            });

            this.stateMachine.complete();
            setTimeout(() => this.stateMachine.reset(), 500);
            this.autoCaptureTimer = null;
        }, 'image/jpeg', 0.92);
    }

    handleManualCapture = () => {
        const currentTarget = this.getCurrentTarget();
        if (!currentTarget) {
            alert('All capture points completed!');
            return;
        }

        // Allow capture at ANY angle - just record the actual position
        if (this.state.isProcessing) return;

        this.captureFrame(currentTarget);
    }

    handleFinished = () => {
        if (this.state.capturedFrames.length < 3) {
            alert('Please capture at least 3 images');
            return;
        }

        const validation = captureService.validateCoverage();
        if (!validation.valid) {
            if (!window.confirm(`${validation.message}. Continue anyway?`)) return;
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
        const { needsSensorClick, hasPermission, error, showPreview, isProcessing, captureState, stabilityProgress } = this.state;

        if (showPreview) {
            return (
                <div className="panorama-capture-container">
                    <PanoramaPreview frames={this.state.capturedFrames} />
                    <div className="teleport-controls fixed-bottom">
                        <button className="btn-secondary" onClick={() => this.setState({ showPreview: false })}>RE-CAPTURE</button>
                        <button className="btn-primary" onClick={this.handleConfirmStitch}>CONFIRM & UPLOAD</button>
                    </div>
                </div>
            );
        }

        const currentTarget = this.getCurrentTarget();
        const targetPos = currentTarget ? this.projectDotToScreen(currentTarget) : null;
        const visualState = this.stateMachine.getVisualState();

        return (
            <div className="panorama-capture-container">
                <video ref={this.videoRef} playsInline muted className="camera-preview" />
                <canvas ref={this.canvasRef} style={{ display: 'none' }} />

                {hasPermission && (
                    <div className="guides-overlay">
                        {/* Top Bar */}
                        <div className="teleport-top-btns">
                            <button className="teleport-nav-btn" onClick={() => this.sensorFusion.calibrate()}>↺</button>
                            <div className="points-indicator">{this.state.capturedFrames.length} / {this.capturePoints.length}</div>
                            <button
                                className="teleport-nav-btn"
                                onClick={this.switchCamera}
                                style={{
                                    background: 'rgba(255, 165, 0, 0.8)',
                                    fontSize: '20px'
                                }}
                                title="Flip Camera"
                            >
                                🔄
                            </button>
                            <button className="teleport-nav-btn close-red" onClick={this.props.onCancel}>✕</button>
                        </div>

                        {/* CENTER CROSSHAIR - This is YOUR aiming point */}
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            pointerEvents: 'none'
                        }}>
                            <div style={{
                                width: '40px',
                                height: '40px',
                                border: '2px solid rgba(255, 255, 255, 0.8)',
                                borderRadius: '50%',
                                position: 'relative'
                            }}>
                                {/* Crosshair lines */}
                                <div style={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '0',
                                    right: '0',
                                    height: '2px',
                                    background: 'rgba(255, 255, 255, 0.8)',
                                    transform: 'translateY(-50%)'
                                }} />
                                <div style={{
                                    position: 'absolute',
                                    left: '50%',
                                    top: '0',
                                    bottom: '0',
                                    width: '2px',
                                    background: 'rgba(255, 255, 255, 0.8)',
                                    transform: 'translateX(-50%)'
                                }} />
                            </div>
                        </div>

                        {/* Target Dot - FIXED IN WORLD, MOVES ACROSS SCREEN */}
                        {targetPos && targetPos.isVisible && (
                            <div
                                className="guide-dot-container"
                                style={{
                                    left: targetPos.x,
                                    top: targetPos.y,
                                    position: 'absolute',
                                    transform: 'translate(-50%, -50%)'
                                }}
                            >
                                <div
                                    className="guide-dot"
                                    style={{
                                        width: '60px',
                                        height: '60px',
                                        borderRadius: '50%',
                                        border: `4px solid ${visualState.color}`,
                                        background: captureState === CaptureState.CAPTURE_READY ? visualState.color : 'transparent',
                                        transition: 'all 0.2s ease',
                                        boxShadow: captureState === CaptureState.CAPTURE_READY ? `0 0 20px ${visualState.color}` : 'none',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '24px'
                                    }}
                                >
                                    🎯
                                </div>
                                {captureState === CaptureState.STABLE && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '50%',
                                        left: '50%',
                                        transform: 'translate(-50%, -50%)',
                                        width: '50px',
                                        height: '50px',
                                        borderRadius: '50%',
                                        border: '3px solid #fff',
                                        borderTopColor: 'transparent',
                                        animation: 'spin 1s linear infinite',
                                        clipPath: `polygon(0 0, 100% 0, 100% ${stabilityProgress * 100}%, 0 ${stabilityProgress * 100}%)`
                                    }} />
                                )}
                            </div>
                        )}

                        {/* DIRECTIONAL ARROWS - Show which way to turn */}
                        {targetPos && !targetPos.isVisible && (
                            <div style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                fontSize: '48px',
                                color: '#FFD700',
                                textShadow: '0 0 10px rgba(0,0,0,0.8)',
                                pointerEvents: 'none'
                            }}>
                                {/* Calculate direction based on where dot is relative to camera */}
                                {targetPos.x < window.innerWidth / 2 ? '←' : '→'}
                            </div>
                        )}

                        {/* INSTRUCTION TEXT */}
                        <div style={{
                            position: 'absolute',
                            top: '120px',
                            left: '0',
                            right: '0',
                            textAlign: 'center',
                            background: 'rgba(0,0,0,0.7)',
                            padding: '15px',
                            color: '#fff',
                            fontSize: '16px',
                            fontWeight: 'bold',
                            pointerEvents: 'none'
                        }}>
                            {targetPos && !targetPos.isVisible ? (
                                <div>
                                    <div style={{ fontSize: '20px', marginBottom: '5px' }}>🔄 TURN YOUR PHONE</div>
                                    <div style={{ fontSize: '14px', opacity: 0.9 }}>Follow the arrow to find the target</div>
                                </div>
                            ) : (
                                <div>
                                    <div style={{ fontSize: '18px', color: visualState.color }}>{visualState.message}</div>
                                    {captureState === CaptureState.APPROACHING && (
                                        <div style={{ fontSize: '14px', marginTop: '5px', opacity: 0.9 }}>
                                            Rotate phone to bring 🎯 to center ⊕
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Status Message */}
                        <div className="capture-info-text" style={{ bottom: '180px', fontSize: '18px', fontWeight: 'bold' }}>
                            {this.state.capturedFrames.length === 0 && (
                                <div style={{ background: 'rgba(0,0,0,0.8)', padding: '10px', borderRadius: '10px' }}>
                                    📍 Dots are FIXED in space<br />
                                    🔄 ROTATE phone to align<br />
                                    ⊕ Bring 🎯 to center
                                </div>
                            )}
                        </div>

                        {/* Manual Capture Button - ALWAYS ENABLED */}
                        <div style={{ position: 'absolute', bottom: '100px', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'auto' }}>
                            <button
                                className="btn-primary"
                                onClick={this.handleManualCapture}
                                disabled={this.state.isProcessing}
                                style={{
                                    width: '80px',
                                    height: '80px',
                                    borderRadius: '50%',
                                    fontSize: '32px',
                                    padding: 0,
                                    background: this.state.isProcessing ? '#666' : '#00FF00',
                                    border: '4px solid #fff',
                                    boxShadow: this.state.isProcessing ? 'none' : '0 0 30px #00FF00',
                                    cursor: this.state.isProcessing ? 'not-allowed' : 'pointer'
                                }}
                            >
                                📷
                            </button>
                            <div style={{
                                position: 'absolute',
                                bottom: '-30px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                color: '#fff',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                textShadow: '0 0 5px #000',
                                whiteSpace: 'nowrap'
                            }}>
                                TAP TO CAPTURE
                            </div>
                        </div>

                        {/* Finish Button */}
                        {this.state.capturedFrames.length >= 3 && (
                            <button className="btn-primary finish-fab" onClick={this.handleFinished}>FINISH</button>
                        )}
                    </div>
                )}

                {isProcessing && <div className="spinner-overlay"><div className="spinner-360" /></div>}

                {needsSensorClick && (
                    <div className="overlay-full">
                        <h1>SENSORS INACTIVE</h1>
                        <p>Allow Motion & Orientation</p>
                        <button className="btn-primary" onClick={() => this.handleStart(false)}>ENABLE SENSORS</button>
                    </div>
                )}

                {error && <div className="overlay-full error"><h3>{error}</h3><button onClick={() => window.location.reload()}>RETRY</button></div>}
            </div>
        );
    }
}

export default PanoramaCapture;
