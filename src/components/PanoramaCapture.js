import React, { Component } from 'react';
import './PanoramaCapture.css';
import { captureService } from '../services/captureService';
import PanoramaPreview from './PanoramaPreview';
import { SensorFusion } from '../utils/sensorFusion';
import { CaptureStateMachine, CaptureState } from '../utils/captureStateMachine';
import { OpenCVStitcher } from '../services/opencvStitcher';
import * as THREE from 'three';

/**
 * PanoramaCapture.js - THE "TELEPORT PRO" (V20 - FULL STACK SYNC)
 * 
 * FIX: Ensuring the capturedFrames object has a 'thumbnail' property 
 * so the OpenCVStitcher can find the images for the 360 preview.
 */
class PanoramaCapture extends Component {
    constructor(props) {
        super(props);

        // PIXEL-PERFECT GRID: 10 Dots per ring (Total 52) to prevent "between area" cut-offs
        const LAYERS = [
            { id: 'zenith', pitch: 90, cols: 1, offset: 0 },
            { id: 'sky_high', pitch: 60, cols: 8, offset: 22.5 },
            { id: 'sky', pitch: 30, cols: 10, offset: 0 },
            { id: 'horizon', pitch: 0, cols: 10, offset: 18 },
            { id: 'floor', pitch: -30, cols: 10, offset: 0 },
            { id: 'floor_low', pitch: -60, cols: 8, offset: 22.5 },
            { id: 'nadir', pitch: -90, cols: 1, offset: 0 }
        ];

        let points = [];
        LAYERS.forEach(layer => {
            for (let i = 0; i < layer.cols; i++) {
                points.push({
                    id: `${layer.id}_${i}`,
                    yaw: ((i * (360 / layer.cols)) + (layer.offset || 0)) % 360,
                    pitch: layer.pitch,
                    completed: false
                });
            }
        });

        this.capturePoints = points;

        this.state = {
            hasPermission: false,
            needsSensorClick: false,
            isProcessing: false,
            showPreview: false,
            pointsCaptured: 0,
            capturedFrames: [],
            activeTarget: null,
            flash: false,
            status: "CALIBRATING...",
            isLevel: false,
            error: null
        };

        this.videoRef = React.createRef();
        this.canvasRef = React.createRef();
        this.dotRefs = {}; // Store refs for all capture dots
        this.capturePoints.forEach(pt => {
            this.dotRefs[pt.id] = React.createRef();
        });

        this.sensorFusion = new SensorFusion();
        this.stateMachine = new CaptureStateMachine({
            alignmentThreshold: 12,
            lockThreshold: 5, // Slightly more forgiving for "sweep" feel
            stabilityDuration: 350 // Faster capture for linear movement
        });

        this.cameraYaw = 0;
        this.cameraPitch = 0;
        this._localProcessing = false; // Synchronous guard to prevent double-capture
    }

    async componentDidMount() {
        // --- PERSISTENT RESTORE LOGIC ---
        // Wait for IndexedDB to initialize if needed
        let checkCount = 0;
        const restoreProgress = () => {
            const existingFrames = captureService.getManifest().frames;
            if (existingFrames && existingFrames.length > 0) {
                const syncedFrames = existingFrames.map(f => {
                    const blob = captureService.blobs.get(f.id);
                    if (!blob) return null;
                    const url = URL.createObjectURL(blob);

                    // Match and Restore the yellow/green dots on UI
                    const point = this.capturePoints.find(p => p.yaw === f.sensors.yaw && p.pitch === f.sensors.pitch);
                    if (point) {
                        point.completed = true;
                        point.thumbnail = url;
                    }
                    return {
                        ...f,
                        url,
                        thumbnail: url,
                        blob,
                        sensors: f.sensors, // ensure full sensors (roll) are preserved
                        camera: { hfov: 75 }
                    };
                }).filter(f => f !== null);

                this.setState({
                    capturedFrames: syncedFrames,
                    pointsCaptured: syncedFrames.length,
                    status: `RESTORED ${syncedFrames.length} PHOTOS`
                });
                return true;
            }
            return false;
        };

        // Try to restore immediately, or wait for DB ready
        if (!restoreProgress()) {
            const checkTimer = setInterval(() => {
                if (restoreProgress() || checkCount > 20) clearInterval(checkTimer);
                checkCount++;
            }, 100);
        }

        this.handleStart(true);
        window.addEventListener('resize', this.handleResize);
    }

    componentWillUnmount() {
        this.stopRenderLoop();
        this.stopCamera();
        window.removeEventListener('deviceorientation', this.handleOrientation, true);
        window.removeEventListener('deviceorientationabsolute', this.handleOrientation, true);
    }

    handleResize = () => { }

    handleStart = async (useSensors = true) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false
            });
            if (this.videoRef.current) this.videoRef.current.srcObject = stream;

            if (useSensors) {
                if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                    await DeviceOrientationEvent.requestPermission();
                }
                const evt = ('ondeviceorientationabsolute' in window) ? 'deviceorientationabsolute' : 'deviceorientation';
                window.addEventListener(evt, this.handleOrientation, true);

                setTimeout(() => {
                    // CALIBRATION: Lock the current view as 0,0 (Center)
                    this.sensorFusion.calibrate();
                    this.startRenderLoop();
                    this.setState({ status: "STABLE", hasPermission: true });
                }, 1000);
            } else {
                this.setState({ hasPermission: true });
            }
        } catch (err) {
            this.setState({ needsSensorClick: true, status: "ERROR" });
        }
    }

    handleOrientation = (e) => { if (this.sensorFusion) this.sensorFusion.update(e); }
    calibrateNow = () => { if (this.sensorFusion) this.sensorFusion.calibrate(); }

    startRenderLoop = () => {
        const loop = () => {
            if (!this.state.isProcessing && !this.state.showPreview) this.updateWorldTick();
            this.renderLoopId = requestAnimationFrame(loop);
        };
        this.renderLoopId = requestAnimationFrame(loop);
    }

    stopRenderLoop = () => { if (this.renderLoopId) cancelAnimationFrame(this.renderLoopId); }

    stopCamera = () => {
        const s = this.videoRef.current?.srcObject;
        if (s && s.getTracks) s.getTracks().forEach(t => t.stop());
    }

    updateWorldTick = () => {
        const sYaw = this.sensorFusion.getRelativeYaw() || 0;
        const sPitch = this.sensorFusion.getPitch() || 0;
        const sRoll = this.sensorFusion.getRoll() || 0;

        // DIRECT ACCESS: No more double-smoothing for zero-latency world anchoring
        this.cameraYaw = sYaw;
        this.cameraPitch = sPitch;

        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        // FOV adjustment: Most mobile cameras are around 65-75 degrees
        const fov = 75;
        const focal = (window.innerWidth / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2));

        // Sequence Logic: Target only the first uncompleted point
        const nextTarget = this.capturePoints.find(p => !p.completed);
        let currentLock = null;

        this.capturePoints.forEach(pt => {
            const el = this.dotRefs[pt.id].current;
            if (!el) return;

            const yd = this.angleDiff(pt.yaw, this.cameraYaw);
            const pd = pt.pitch - this.cameraPitch;

            // Angular distance calculation for visibility
            const dist = Math.sqrt(yd * yd + pd * pd);

            const isNext = nextTarget && pt.id === nextTarget.id;

            if (dist < 80) { // Limit projection to avoid tangent distortion
                el.style.transform = `translate3d(${centerX + Math.tan(THREE.MathUtils.degToRad(yd)) * focal}px, ${centerY - Math.tan(THREE.MathUtils.degToRad(pd)) * focal}px, 0) translate(-50%, -50%)`;
                el.style.visibility = "visible";

                if (pt.completed) {
                    el.style.width = '140px'; el.style.height = '140px';
                    el.style.opacity = Math.max(0.1, 0.8 - dist / 100);
                    el.style.background = 'rgba(255,255,255,0.1)';
                    el.style.border = "2px solid rgba(255,255,255,0.8)";
                    el.style.borderRadius = "8px";
                    if (el.innerHTML === "" && pt.thumbnail) {
                        el.innerHTML = `<img src="${pt.thumbnail}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;"/>`;
                    }
                } else if (isNext) {
                    const size = 48;
                    el.style.width = `${size}px`;
                    el.style.height = `${size}px`;
                    el.style.background = dist < 12 ? "#00FF7F" : "rgba(0, 255, 127, 0.2)";
                    el.style.border = "4px solid white";
                    el.style.opacity = "1";
                    el.style.zIndex = "600";
                    if (dist < 15) currentLock = pt;
                } else {
                    el.style.width = '32px'; el.style.height = '32px';
                    el.style.background = "#FFD700";
                    el.style.border = "2px solid white";
                    el.style.opacity = Math.max(0.3, 0.8 - dist / 90);
                    el.style.zIndex = "500";
                }
            } else {
                el.style.visibility = "hidden";
            }
        });

        // Directional Guidance Logic (Ring-by-Ring)
        if (nextTarget && !currentLock) {
            const yd = this.angleDiff(nextTarget.yaw, this.cameraYaw);
            const pd = nextTarget.pitch - this.cameraPitch;
            let status = "STEADY...";

            // Improved Spherical Guidance for all Layers
            if (nextTarget.pitch >= 90) status = "↑ TILT TO ABSOLUTE ZENITH (TOP CENTER)";
            else if (nextTarget.pitch <= -90) status = "TILT TO ABSOLUTE NADIR (BOTTOM CENTER) ↓";
            else if (nextTarget.pitch > 45) status = "↑ TILT UP FOR SKY BORDERS";
            else if (nextTarget.pitch < -45) status = "TILT DOWN FOR FLOOR BORDERS ↓";
            else if (Math.abs(pd) > 15) {
                status = pd > 0 ? "↑ TILT UP FOR SKY" : "TILT DOWN FOR FLOOR ↓";
            } else if (Math.abs(yd) > 10) {
                status = yd > 0 ? "MOVE RIGHT →" : "← MOVE LEFT";
            }

            if (status !== this.state.status) this.setState({ status });
        }

        if (currentLock !== this.state.activeTarget) this.setState({ activeTarget: currentLock });
        const isL = Math.abs(sRoll) < 4;
        if (isL !== this.state.isLevel) this.setState({ isLevel: isL });

        const ring = document.getElementById("v19-ring");
        if (currentLock) {
            this.stateMachine.update({ target: currentLock, yawDiff: this.angleDiff(currentLock.yaw, this.cameraYaw), pitchDiff: currentLock.pitch - this.cameraPitch }, this.sensorFusion);
            if (ring) {
                ring.style.opacity = "1";
                ring.style.strokeDashoffset = 477.5 * (1 - this.stateMachine.getStabilityProgress());
            }
            if (this.stateMachine.canCapture() && !this.state.isProcessing) {
                this.performCapture(currentLock);
            }
        } else if (ring) {
            ring.style.opacity = "0";
            this.stateMachine.reset();
        }
    }

    performCapture = async (target) => {
        if (!target || this.state.isProcessing || this._localProcessing) return;

        this._localProcessing = true; // Block immediately (Synchronous)
        this.setState({ isProcessing: true });

        try {
            const v = this.videoRef.current;
            const c = this.canvasRef.current;
            if (v && c && v.videoWidth > 0) {
                c.width = v.videoWidth;
                c.height = v.videoHeight;
                c.getContext('2d').drawImage(v, 0, 0);
                this.setState({ flash: true });
                setTimeout(() => this.setState({ flash: false }), 150);
                if (navigator.vibrate) navigator.vibrate(50);

                const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.90));
                const url = URL.createObjectURL(blob);

                const currentYaw = this.sensorFusion.getRelativeYaw();
                const currentPitch = this.sensorFusion.getPitch();
                const currentRoll = this.sensorFusion.getRoll();

                // DATA SYNC: Set completed BEFORE state update to prevent re-target
                target.completed = true;
                target.thumbnail = url; // Save for the render loop
                captureService.addFrame({ yaw: currentYaw, pitch: currentPitch, roll: currentRoll, hfov: 75.0 }, blob);

                this.setState(s => {
                    const nextCount = s.pointsCaptured + 1;
                    return {
                        capturedFrames: [...s.capturedFrames, {
                            id: target.id,
                            blob,
                            url,
                            thumbnail: url,
                            sensors: { yaw: currentYaw, pitch: currentPitch, roll: currentRoll },
                            camera: { hfov: 75.0 } // Synchronized HFOV for perfect stitching
                        }],
                        pointsCaptured: nextCount,
                        isProcessing: false,
                        showPreview: false,
                        activeTarget: null
                    };
                });
                this.stateMachine.reset();
                this._localProcessing = false; // Unblock after state is synced
            } else {
                this.setState({ isProcessing: false });
                this._localProcessing = false;
            }
        } catch (e) {
            this.setState({ isProcessing: false });
            this._localProcessing = false;
        }
    }

    handleCreatePanorama = async () => {
        if (this.state.pointsCaptured < 2) {
            alert('Please capture at least 2 photos before creating panorama');
            return;
        }

        console.log('🎬 Starting panorama creation...');
        this.setState({ isProcessing: true, status: "STITCHING 360..." });

        try {
            // Give UI a moment to show the processing overlay
            await new Promise(r => setTimeout(r, 150));

            console.log(`📸 Stitching ${this.state.capturedFrames.length} frames...`);

            // Perform Professional Stitching
            const result = await OpenCVStitcher.stitchPanorama(this.state.capturedFrames);

            if (!result || !result.blob) {
                console.error("❌ Stitching yielded no result.");
                alert("Stitching failed. The image may be too large for your device. Try capturing fewer photos.");
                this.setState({ isProcessing: false, status: "STITCHING FAILED" });
                return;
            }

            // Create a single robust File object from the blob
            const fileName = `Panorama_360_${new Date().getTime()}.jpg`;
            const panoramaFile = new File([result.blob], fileName, { type: 'image/jpeg' });

            console.log("✅ 360 Stitched Successfully:", panoramaFile.name, `${(panoramaFile.size / 1024 / 1024).toFixed(2)} MB`);

            // Delay to ensure state is stable before callback
            await new Promise(r => setTimeout(r, 300));

            // Call parent callback
            if (this.props.onComplete) {
                console.log('📤 Sending panorama to parent component...');
                this.props.onComplete([panoramaFile]);
            } else {
                console.warn('⚠️ No onComplete callback provided');
                this.setState({ isProcessing: false });
            }

        } catch (err) {
            console.error("❌ Stitching error:", err);
            alert(`Stitching failed: ${err.message || 'Unknown error'}. Please try again.`);
            this.setState({ isProcessing: false, status: "ERROR" });
        }
    }

    handleClear = () => {
        if (window.confirm("Discard all captures and start over?")) {
            captureService.reset();
            this.capturePoints.forEach(pt => {
                pt.completed = false;
                pt.thumbnail = null;
                const el = this.dotRefs[pt.id].current;
                if (el) {
                    el.innerHTML = "";
                    el.style.background = '#FFD700';
                    el.style.border = '2px solid white';
                    el.style.borderRadius = "50%";
                }
            });
            this.setState({
                capturedFrames: [],
                pointsCaptured: 0,
                activeTarget: null,
                status: "CLEARED"
            });
        }
    }

    angleDiff(t, c) {
        let d = t - c;
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        return d;
    }

    render() {
        const { hasPermission, needsSensorClick, showPreview, pointsCaptured, capturedFrames, activeTarget, flash, status, isLevel } = this.state;
        if (showPreview) return <PanoramaPreview frames={capturedFrames} onCancel={() => this.setState({ showPreview: false })} />;

        return (
            <div className="panorama-capture-container">
                <div className="video-background">
                    <video ref={this.videoRef} autoPlay playsInline muted
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: hasPermission ? 0.8 : 0 }} />
                </div>
                <div className="ui-overlay" style={{ pointerEvents: 'none' }}>
                    <div id="v19-dots">
                        {this.capturePoints.map(pt => (
                            <div
                                key={pt.id}
                                ref={this.dotRefs[pt.id]}
                                style={{
                                    position: 'absolute',
                                    visibility: 'hidden',
                                    borderRadius: '50%',
                                    overflow: 'hidden',
                                    background: '#FFD700',
                                    willChange: 'transform, opacity'
                                }}
                            ></div>
                        ))}
                    </div>
                    <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 100, height: 100, border: `2px solid ${isLevel ? '#00FF7F' : 'rgba(255,255,255,0.3)'}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s ease', zIndex: 700 }}>
                        <div style={{ width: 30, height: 2, background: isLevel ? '#00FF7F' : 'white', position: 'absolute', opacity: isLevel ? 1 : 0.5 }}></div>
                        <div style={{ width: 2, height: 30, background: isLevel ? '#00FF7F' : 'white', position: 'absolute', opacity: isLevel ? 1 : 0.5 }}></div>
                        <svg width="160" height="160" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%) rotate(-90deg)' }}><circle id="v19-ring" cx="80" cy="80" r="76" fill="none" stroke="#00FF7F" strokeWidth="6" strokeDasharray="477.5" strokeDashoffset="477.5" style={{ opacity: 0, transition: 'stroke-dashoffset 0.1s ease-out' }} /></svg>
                    </div>
                </div>
                <div className="shutter-host">
                    {pointsCaptured >= this.capturePoints.length ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={(e) => { e.preventDefault(); this.handleCreatePanorama(); }}
                                style={{
                                    padding: '20px 40px',
                                    background: '#00FF7F',
                                    color: '#000',
                                    border: 'none',
                                    borderRadius: '50px',
                                    fontWeight: '800',
                                    fontSize: '18px',
                                    boxShadow: '0 10px 30px rgba(0, 255, 127, 0.4)',
                                    animation: 'pulse-btn 1.5s infinite'
                                }}
                            >
                                CREATE PANORAMA
                            </button>
                            <button
                                onClick={this.handleClear}
                                className="recenter-btn"
                                style={{
                                    background: 'rgba(255, 69, 58, 0.2)',
                                    borderColor: 'rgba(255, 69, 58, 0.5)',
                                    color: '#FFBABA',
                                    padding: '10px 30px',
                                    fontSize: '14px'
                                }}
                            >
                                CLEAR ALL
                            </button>
                        </div>
                    ) : (
                        <>
                            <button className={`shutter-btn ${activeTarget ? 'active' : ''}`} onClick={() => this.performCapture(activeTarget)} disabled={!activeTarget} />
                            <div style={{ display: 'flex', gap: '15px', marginTop: '20px' }}>
                                <button onClick={this.calibrateNow} className="recenter-btn">RE-CENTER</button>
                                {pointsCaptured >= 2 && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.preventDefault(); this.handleCreatePanorama(); }}
                                        className="recenter-btn"
                                        style={{ background: '#00FF7F', borderColor: '#00FF7F', color: '#000', fontWeight: '800' }}
                                    >
                                        DONE
                                    </button>
                                )}
                                <button onClick={this.handleClear} className="recenter-btn" style={{ background: 'rgba(255, 69, 58, 0.4)', borderColor: 'rgba(255, 69, 58, 0.8)', color: '#FFBABA' }}>CLEAR</button>
                            </div>
                        </>
                    )}
                </div>
                <div className="vitals-header">
                    <div className="badge">PROGRESS: <span className="highlight">{pointsCaptured} / {this.capturePoints.length}</span></div>
                    <div className="status" style={{ fontSize: '18px', color: '#00FF7F', marginTop: '10px' }}>{status}</div>
                </div>
                {flash && <div className="flash-overlay"></div>}
                {this.state.isProcessing && (
                    <div className="overlay-full" style={{ background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 100000 }}>
                        <div className="spinner" style={{ width: '60px', height: '60px', border: '5px solid #111', borderTopColor: '#00FF7F', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                        <h2 style={{ color: '#fff', marginTop: '30px', letterSpacing: '2px', fontWeight: '800' }}>STITCHING 360 STUDIO...</h2>
                        <p style={{ color: '#00FF7F', opacity: 0.9, marginTop: '10px' }}>Mapping Spherical Coordinates</p>
                    </div>
                )}
                {needsSensorClick && (<div className="overlay-full"><h2>360° Vision</h2><p>Syncing world sensors...</p><button className="btn-primary" onClick={() => this.handleStart(true)}>ACTIVATE</button></div>)}
                <canvas ref={this.canvasRef} style={{ display: 'none' }} />
            </div>
        );
    }
}

export default PanoramaCapture;