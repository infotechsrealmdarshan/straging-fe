import React, { Component } from 'react';
import './PanoramaViewer.css';

/**
 * PanoramaViewer.js
 * Professional 360° panoramic image viewer
 * Supports VR-style navigation, zoom, and interactive controls
 * Displays equirectangular panoramic images as true 360° sphere
 */
class PanoramaViewer extends Component {
    constructor(props) {
        super(props);
        this.state = {
            isLoading: false,
            error: null,
            zoom: 1.0,
            pitch: 0,
            yaw: 0,
            isFullscreen: false,
            isDragging: false,
            dragStart: { x: 0, y: 0 },
            currentPosition: { x: 0, y: 0 },
            fov: 75,
            projection: 'equirectangular',
            autoRotate: true,
            showControls: true,
            showInfo: true
        };

        this.canvasRef = React.createRef();
        this.containerRef = React.createRef();
        this.imageRef = React.createRef();

        // Bind methods
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleWheel = this.handleWheel.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);

        // Animation frame for smooth navigation
        this.animationFrameId = null;
        this.targetZoom = 1.0;
        this.targetPitch = 0;
        this.targetYaw = 0;
    }

    componentDidMount() {
        this.loadPanorama(this.props.imageSrc);
        this.setupEventListeners();
        this.startAutoRotate();
    }

    componentWillUnmount() {
        this.cleanupEventListeners();
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
    }

    /**
     * Load and display panoramic image
     */
    loadPanorama(imageSrc) {
        this.setState({ isLoading: true, error: null });

        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            this.setState({ isLoading: false });
            this.renderPanorama(img);
        };

        img.onerror = () => {
            this.setState({
                error: 'Failed to load panoramic image',
                isLoading: false
            });
        };

        img.src = imageSrc;
    }

    /**
     * Render panoramic image with proper equirectangular projection
     */
    renderPanorama(img) {
        const canvas = this.canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (!canvas || !ctx) return;

        // Set canvas size to match container
        const container = this.containerRef.current;
        if (container) {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
        }

        // Store image reference for spherical projection
        this.panoramaImage = img;
        this.imageWidth = img.width;
        this.imageHeight = img.height;

        // Start rendering loop for smooth navigation
        this.startRendering();
    }

    /**
     * Start continuous rendering loop for smooth panorama navigation
     */
    startRendering() {
        const render = () => {
            this.renderSphericalPanorama();
            this.animationFrameId = requestAnimationFrame(render);
        };
        render();
    }

    /**
     * Render equirectangular panorama with spherical projection
     */
    renderSphericalPanorama() {
        const canvas = this.canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (!canvas || !ctx || !this.panoramaImage) return;

        const { width, height } = canvas;
        const { zoom, pitch, yaw, fov } = this.state;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Calculate field of view in radians
        const fovRad = (fov * Math.PI) / 180;
        const aspectRatio = width / height;

        // Create spherical projection
        const imageData = ctx.createImageData(width, height);
        const data = imageData.data;

        // For each pixel in the output canvas
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                // Convert screen coordinates to normalized device coordinates
                const u = (x / width) * 2 - 1;
                const v = (y / height) * 2 - 1;

                // Apply zoom
                const scaledU = u / zoom;
                const scaledV = v / zoom;

                // Convert to spherical coordinates
                const theta = Math.atan2(scaledU * aspectRatio * Math.tan(fovRad / 2), 1) + (yaw * Math.PI) / 180;
                const phi = Math.asin(Math.min(1, Math.max(-1, scaledV * Math.tan(fovRad / 2)))) - (pitch * Math.PI) / 180;

                // Convert to equirectangular coordinates
                let px = (theta / (2 * Math.PI)) * this.imageWidth;
                let py = ((phi + Math.PI / 2) / Math.PI) * this.imageHeight;

                // Handle wrapping for x coordinate
                px = ((px % this.imageWidth) + this.imageWidth) % this.imageWidth;

                // Clamp y coordinate
                py = Math.max(0, Math.min(this.imageHeight - 1, py));

                // Sample from source image
                const sourceX = Math.floor(px);
                const sourceY = Math.floor(py);

                // Get pixel from source image
                ctx.drawImage(this.panoramaImage, 0, 0, this.imageWidth, this.imageHeight);
                const sourceData = ctx.getImageData(sourceX, sourceY, 1, 1).data;

                // Set pixel in output
                const outputIndex = (y * width + x) * 4;
                data[outputIndex] = sourceData[0];     // R
                data[outputIndex + 1] = sourceData[1]; // G
                data[outputIndex + 2] = sourceData[2]; // B
                data[outputIndex + 3] = sourceData[3]; // A
            }
        }

        // Put the rendered image data
        ctx.putImageData(imageData, 0, 0);
    }

    /**
     * Setup event listeners for navigation
     */
    setupEventListeners() {
        const container = this.containerRef.current;
        if (!container) return;

        // Mouse events
        container.addEventListener('mousedown', this.handleMouseDown);
        container.addEventListener('mousemove', this.handleMouseMove);
        container.addEventListener('mouseup', this.handleMouseUp);
        container.addEventListener('wheel', this.handleWheel);

        // Touch events
        container.addEventListener('touchstart', this.handleTouchStart);
        container.addEventListener('touchmove', this.handleTouchMove);
        container.addEventListener('touchend', this.handleTouchEnd);

        // Keyboard events
        document.addEventListener('keydown', this.handleKeyDown);

        // Window resize
        window.addEventListener('resize', this.handleResize);
    }

    /**
     * Cleanup event listeners
     */
    cleanupEventListeners() {
        const container = this.containerRef.current;
        if (!container) return;

        container.removeEventListener('mousedown', this.handleMouseDown);
        container.removeEventListener('mousemove', this.handleMouseMove);
        container.removeEventListener('mouseup', this.handleMouseUp);
        container.removeEventListener('wheel', this.handleWheel);
        container.removeEventListener('touchstart', this.handleTouchStart);
        container.removeEventListener('touchmove', this.handleTouchMove);
        container.removeEventListener('touchend', this.handleTouchEnd);
        document.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('resize', this.handleResize);
    }

    /**
     * Handle mouse down for drag navigation
     */
    handleMouseDown(e) {
        this.setState({
            isDragging: true,
            dragStart: { x: e.clientX, y: e.clientY }
        });
        e.preventDefault();
    }

    /**
     * Handle mouse move for drag navigation
     */
    handleMouseMove(e) {
        if (!this.state.isDragging) return;

        const deltaX = e.clientX - this.state.dragStart.x;
        const deltaY = e.clientY - this.state.dragStart.y;

        // Update yaw and pitch based on drag
        const newYaw = this.state.yaw - (deltaX / this.state.fov) * 2;
        const newPitch = Math.max(-90, Math.min(90, this.state.pitch + (deltaY / this.state.fov) * 2));

        this.setState({
            yaw: newYaw,
            pitch: newPitch
        });

        this.updatePanorama();
    }

    /**
     * Handle mouse up to stop dragging
     */
    handleMouseUp(e) {
        this.setState({ isDragging: false });
    }

    /**
     * Handle wheel for zoom
     */
    handleWheel(e) {
        e.preventDefault();

        const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.5, Math.min(5.0, this.state.zoom * zoomDelta));

        this.setState({ zoom: newZoom });
        this.updatePanorama();
    }

    /**
     * Handle touch events for mobile
     */
    handleTouchStart(e) {
        if (e.touches.length === 1) {
            this.setState({
                isDragging: true,
                dragStart: { x: e.touches[0].clientX, y: e.touches[0].clientY }
            });
        }
        e.preventDefault();
    }

    handleTouchMove(e) {
        if (!this.state.isDragging || e.touches.length !== 1) return;

        const deltaX = e.touches[0].clientX - this.state.dragStart.x;
        const deltaY = e.touches[0].clientY - this.state.dragStart.y;

        const newYaw = this.state.yaw - (deltaX / this.state.fov) * 2;
        const newPitch = Math.max(-90, Math.min(90, this.state.pitch + (deltaY / this.state.fov) * 2));

        this.setState({
            yaw: newYaw,
            pitch: newPitch
        });

        this.updatePanorama();
    }

    handleTouchEnd(e) {
        this.setState({ isDragging: false });
    }

    /**
     * Handle keyboard navigation
     */
    handleKeyDown(e) {
        switch (e.key) {
            case 'ArrowUp':
                this.setState({ pitch: Math.min(90, this.state.pitch + 5) });
                break;
            case 'ArrowDown':
                this.setState({ pitch: Math.max(-90, this.state.pitch - 5) });
                break;
            case 'ArrowLeft':
                this.setState({ yaw: this.state.yaw - 5 });
                break;
            case 'ArrowRight':
                this.setState({ yaw: this.state.yaw + 5 });
                break;
            case '+':
                this.setState({ zoom: Math.min(5.0, this.state.zoom * 1.2) });
                break;
            case '-':
                this.setState({ zoom: Math.max(0.5, this.state.zoom / 1.2) });
                break;
            case 'f':
                this.setState({ showControls: !this.state.showControls });
                break;
            case 'F':
                this.setState({ showControls: !this.state.showControls });
                break;
            case ' ':
                this.setState({ showInfo: !this.state.showInfo });
                break;
            case 'Escape':
                this.resetView();
                break;
            case 'Enter':
                this.toggleFullscreen();
                break;
        }
    }

    /**
     * Handle window resize
     */
    handleResize() {
        if (this.containerRef.current) {
            const canvas = this.canvasRef.current;
            if (canvas) {
                canvas.width = this.containerRef.current.clientWidth;
                canvas.height = this.containerRef.current.clientHeight;
                this.updatePanorama();
            }
        }
    }

    /**
     * Update panorama rendering with current view parameters
     */
    updatePanorama() {
        // The spherical rendering is handled by the continuous render loop
        // This method is kept for compatibility but the actual rendering
        // happens in renderSphericalPanorama()
        if (this.panoramaImage) {
            this.renderSphericalPanorama();
        }
    }

    /**
     * Start auto-rotation
     */
    startAutoRotate() {
        if (this.state.autoRotate && !this.state.isDragging) {
            this.animate();
        }
    }

    /**
     * Animation loop for smooth auto-rotation
     */
    animate() {
        if (!this.state.autoRotate) return;

        const rotationSpeed = 0.5; // degrees per frame

        // Smoothly move towards target
        const yawDiff = this.targetYaw - this.state.yaw;
        const pitchDiff = this.targetPitch - this.state.pitch;

        if (Math.abs(yawDiff) > 0.1) {
            this.setState({
                yaw: this.state.yaw + yawDiff * 0.05,
                pitch: this.state.pitch
            });
        }

        if (Math.abs(pitchDiff) > 0.1) {
            this.setState({
                yaw: this.state.yaw,
                pitch: this.state.pitch + pitchDiff * 0.05
            });
        }

        this.animationFrameId = requestAnimationFrame(() => this.animate());
    }

    /**
     * Reset view to initial position
     */
    resetView() {
        this.setState({
            zoom: 1.0,
            pitch: 0,
            yaw: 0,
            targetYaw: 0,
            targetPitch: 0
        });
    }

    /**
     * Toggle fullscreen mode
     */
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            const container = this.containerRef.current;
            if (container.requestFullscreen) {
                container.requestFullscreen();
            } else if (container.webkitRequestFullscreen) {
                container.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
            }
        } else if (document.msRequestFullscreen) {
            container.msRequestFullscreen();
        }

        this.setState({ isFullscreen: !!document.fullscreenElement });
    }

    /**
     * Render UI controls
     */
    renderControls() {
        const { zoom, showControls, showInfo, isFullscreen } = this.state;

        return (
            <div className="panorama-controls">
                {/* Zoom controls */}
                <div className="control-group">
                    <button
                        className="control-btn"
                        onClick={() => this.setState({ zoom: Math.max(0.5, zoom - 0.1) })}
                        disabled={zoom <= 0.5}
                    >
                        -
                    </button>
                    <span className="zoom-level">{zoom.toFixed(1)}x</span>
                    <button
                        className="control-btn"
                        onClick={() => this.setState({ zoom: Math.min(5.0, zoom + 0.1) })}
                        disabled={zoom >= 5.0}
                    >
                        +
                    </button>
                </div>

                {/* Navigation controls */}
                <div className="control-group">
                    <button
                        className="control-btn"
                        onClick={() => this.setState({ autoRotate: !this.state.autoRotate })}
                    >
                        {this.state.autoRotate ? '⏸' : '▶'}
                    </button>
                    <button
                        className="control-btn"
                        onClick={() => this.resetView()}
                    >
                        ⟲
                    </button>
                </div>

                {/* Info display */}
                {showInfo && (
                    <div className="info-panel">
                        <div>Position: Yaw: {this.state.yaw.toFixed(1)}°, Pitch: {this.state.pitch.toFixed(1)}°</div>
                        <div>Zoom: {this.state.zoom.toFixed(1)}x</div>
                        <div>FOV: {this.state.fov.toFixed(1)}°</div>
                        <div>Auto-rotate: {this.state.autoRotate ? 'On' : 'Off'}</div>
                    </div>
                )}

                {/* Fullscreen control */}
                <button
                    className="control-btn fullscreen-btn"
                    onClick={this.toggleFullscreen}
                >
                    {isFullscreen ? '⛶' : '⛶'}
                </button>
            </div>
        );
    }

    render() {
        const { isLoading, error, isFullscreen } = this.state;

        return (
            <div className={`panorama-viewer ${isFullscreen ? 'fullscreen' : ''}`}>
                {isLoading && (
                    <div className="loading-overlay">
                        <div className="loading-spinner"></div>
                        <div>Loading panoramic image...</div>
                    </div>
                )}

                {error && (
                    <div className="error-overlay">
                        <div className="error-message">
                            <h3>Error</h3>
                            <p>{error}</p>
                            <button onClick={() => this.setState({ error: null })}>Retry</button>
                        </div>
                    </div>
                )}

                <div
                    ref={this.containerRef}
                    className="panorama-container"
                >
                    <canvas
                        ref={this.canvasRef}
                        className="panorama-canvas"
                    />

                    {this.renderControls()}
                </div>
            </div>
        );
    }
}

export default PanoramaViewer;
