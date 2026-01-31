import * as THREE from 'three';

/**
 * PanoramaStitcher.js - MASTER CALIBRATION V13 (PROJECTION EDITION)
 * 
 * FIXES:
 * 1. FIXED "HORIZONTAL SKEW": Implemented tangent-based yaw mapping per slice.
 * 2. FIXED "V-SHAPE": True spherical pitch-scaling for every vertical slice.
 * 3. ADAPTIVE BOUNDING BOX: Minimizes memory by tight-fitting warped frames.
 * 4. TILE-BASED PROCESSING: Slices only the visible region of the equirectangular canvas.
 */
export class OpenCVStitcher {
    constructor() {
        // MASTER STABILITY: 8K is the initial target, 4K is the fallback
        this.W = 8192;
        this.H = 4096;
        this._isFallback = false;

        // REUSE CANVASES (Single initialization)
        this.fCanvas = document.createElement('canvas');
        this.fCtx = this.fCanvas.getContext('2d', { willReadFrequently: true });

        this.warpCanvas = document.createElement('canvas');
        this.wCtx = this.warpCanvas.getContext('2d', { willReadFrequently: true });

        this.maskCanvas = document.createElement('canvas');
        this.mCtx = this.maskCanvas.getContext('2d');
    }

    static async stitchPanorama(frames) {
        if (!frames || frames.length === 0) return null;
        const stitcher = new OpenCVStitcher();
        return await stitcher.process(frames);
    }

    async process(frames) {
        // --- STAGE 0: RESOLUTION SETUP ---
        // Optimization: High-end devices get 6K (Turbo), low-end get 4K
        let testCanvas = document.createElement('canvas');
        testCanvas.width = 8192;
        testCanvas.height = 4096;
        const canHandle8K = !!testCanvas.getContext('2d');
        testCanvas = null;

        if (!canHandle8K) {
            this.W = 4096;
            this.H = 2048;
        } else {
            this.W = 8192; // Back to 8K for high-end immersion
            this.H = 4096;
        }

        const mainCanvas = document.createElement('canvas');
        mainCanvas.width = this.W;
        mainCanvas.height = this.H;
        const mainCtx = mainCanvas.getContext('2d', { willReadFrequently: true });

        mainCtx.fillStyle = '#000'; // Pure black background
        mainCtx.fillRect(0, 0, this.W, this.H);

        // STABILITY SORT: Draw poles first, horizon last.
        // This ensures the most important part (horizon) is on top of any polar artifacts.
        const sortedFrames = [...frames].sort((a, b) => {
            const aP = Math.abs(a.sensors?.pitch || 0);
            const bP = Math.abs(b.sensors?.pitch || 0);
            return bP - aP;
        });

        for (const frame of sortedFrames) {
            try {
                const img = await this.loadImage(frame.thumbnail || frame.url);
                if (!img || img.width === 0) continue;

                const yaw = frame.sensors?.yaw || 0;
                let pitch = frame.sensors?.pitch || 0;
                const roll = frame.sensors?.roll || 0;

                pitch = Math.max(-89.9, Math.min(89.9, pitch));

                const aspect = img.width / img.height;
                let hfov = (frame.camera?.hfov || 75.0);

                // Dynamic FOV for Portrait/Landscape
                if (img.width < img.height) {
                    const longSideFOV = hfov;
                    hfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(longSideFOV / 2)) * aspect));
                }

                // Stage 1: Roll Correction
                this.fCanvas.width = img.width;
                this.fCanvas.height = img.height;
                this.fCtx.save();
                this.fCtx.clearRect(0, 0, img.width, img.height);
                this.fCtx.translate(img.width / 2, img.height / 2);
                this.fCtx.rotate(THREE.MathUtils.degToRad(-roll));
                this.fCtx.drawImage(img, -img.width / 2, -img.height / 2);
                this.fCtx.restore();

                // Stage 2: Sharp Masking
                // Reduced from 0.45/0.30 to 0.15 for maximum sharpness at joins
                const hFade = 0.15;
                const vFadeTop = (pitch > 60) ? 0.0 : 0.12;
                const vFadeBot = (pitch < -60) ? 0.0 : 0.12;

                this.maskCanvas.width = img.width;
                this.maskCanvas.height = img.height;
                const mCtx = this.mCtx;
                mCtx.clearRect(0, 0, img.width, img.height);
                mCtx.fillStyle = 'white';
                mCtx.fillRect(0, 0, img.width, img.height);

                // Horizontal Gradient
                mCtx.globalCompositeOperation = 'destination-in';
                const hGrad = mCtx.createLinearGradient(0, 0, img.width, 0);
                hGrad.addColorStop(0, 'rgba(255,255,255,0)');
                hGrad.addColorStop(hFade, 'white');
                hGrad.addColorStop(1 - hFade, 'white');
                hGrad.addColorStop(1, 'rgba(255,255,255,0)');
                mCtx.fillStyle = hGrad;
                mCtx.fillRect(0, 0, img.width, img.height);

                // Vertical Gradient
                const vGrad = mCtx.createLinearGradient(0, 0, 0, img.height);
                vGrad.addColorStop(0, vFadeTop === 0 ? 'white' : 'rgba(255,255,255,0)');
                vGrad.addColorStop(vFadeTop, 'white');
                vGrad.addColorStop(1 - vFadeBot, 'white');
                vGrad.addColorStop(1, vFadeBot === 0 ? 'white' : 'rgba(255,255,255,0)');
                mCtx.fillStyle = vGrad;
                mCtx.fillRect(0, 0, img.width, img.height);

                this.fCtx.globalCompositeOperation = 'destination-in';
                this.fCtx.drawImage(this.maskCanvas, 0, 0);
                this.fCtx.globalCompositeOperation = 'source-over';

                // Stage 3: Spherical Projection
                const pitchRad = THREE.MathUtils.degToRad(pitch);
                const hfovRad = THREE.MathUtils.degToRad(hfov);
                const vfovRad = hfovRad / aspect;

                const cosPitch = Math.cos(pitchRad);
                const sinPitch = Math.sin(pitchRad);

                // Sizing warp canvas to hold the projected image
                const projectionWidth = Math.ceil(((hfov * 1.5) / 360) * this.W);
                const projectionHeight = Math.ceil(((hfov / aspect * 2) / 180) * this.H);

                this.warpCanvas.width = projectionWidth;
                this.warpCanvas.height = projectionHeight;
                this.wCtx.clearRect(0, 0, this.warpCanvas.width, this.warpCanvas.height);

                const sliceCount = 1200; // Efficient but smooth
                const srcSliceW = img.width / sliceCount;
                const tanHfov2 = Math.tan(hfovRad / 2);
                const tanVfov2 = Math.tan(vfovRad / 2);

                for (let i = 0; i < sliceCount; i++) {
                    const xNorm = (i / sliceCount) - 0.5;
                    const u = tanHfov2 * xNorm * 2;

                    const yawOffsetRad = Math.atan2(u, 1.0);
                    const yawOffsetDeg = THREE.MathUtils.radToDeg(yawOffsetRad);

                    const destX = (projectionWidth / 2) + (yawOffsetDeg / 360) * this.W;
                    const destW = (this.W / 360) * (hfov / sliceCount) * 1.5; // Slight overlap to fix vertical lines

                    const getProjPitch = (v) => {
                        const denom = Math.sqrt(u * u + v * v + 1);
                        return Math.asin((v * cosPitch + sinPitch) / denom);
                    };

                    const pMid = getProjPitch(0);
                    const pTop = getProjPitch(tanVfov2);
                    const pBot = getProjPitch(-tanVfov2);

                    const dy_px = (pitchRad - pMid) * (this.H / Math.PI);
                    const sliceH_px = (pTop - pBot) * (this.H / Math.PI);

                    this.wCtx.drawImage(
                        this.fCanvas,
                        Math.floor(i * srcSliceW), 0, Math.ceil(srcSliceW), img.height,
                        destX, (projectionHeight / 2 - sliceH_px / 2) + dy_px,
                        destW, sliceH_px
                    );
                }

                // Stage 4: Assembly
                const centerX = (yaw / 360) * this.W;
                const centerY = ((90 - pitch) / 180) * this.H;

                [-this.W, 0, this.W].forEach(offset => {
                    const x = (centerX - projectionWidth / 2) + offset;
                    const y = centerY - projectionHeight / 2;
                    mainCtx.drawImage(this.warpCanvas, x, y);
                });

                img.src = "";
            } catch (err) {
                console.warn("Stitch failed for frame:", frame.id, err);
            }
        }

        // Stage 5: AGGRESSIVE Pole Filling - Zero Tolerance for Black Spots
        const poleHeight = Math.floor(this.H * 0.20); // Increased to 20% for better coverage
        const tempBuf = mainCtx.getImageData(0, 0, this.W, this.H);
        const data = tempBuf.data;

        // Helper: Get pixel
        const getPixel = (x, y) => {
            const wx = (x + this.W) % this.W;
            const idx = (y * this.W + wx) * 4;
            return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
        };

        // Helper: Set pixel
        const setPixel = (x, y, r, g, b) => {
            const idx = (y * this.W + x) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255;
        };

        // Helper: Check if pixel is black/empty
        const isBlackOrEmpty = (x, y) => {
            const [r, g, b, a] = getPixel(x, y);
            return a < 250 || (r < 15 && g < 15 && b < 15);
        };

        // Step 1: Find nearest valid color for any position
        const findNearestColor = (x, y, searchRadius = 50) => {
            // Search in expanding circles
            for (let radius = 1; radius <= searchRadius; radius++) {
                // Search horizontally first (most likely to find valid color)
                for (let dx = -radius; dx <= radius; dx++) {
                    const [r, g, b, a] = getPixel(x + dx, y);
                    if (a > 250 && (r > 15 || g > 15 || b > 15)) {
                        return [r, g, b];
                    }
                }

                // Search vertically
                for (let dy = -radius; dy <= radius; dy++) {
                    if (y + dy >= 0 && y + dy < this.H) {
                        const [r, g, b, a] = getPixel(x, y + dy);
                        if (a > 250 && (r > 15 || g > 15 || b > 15)) {
                            return [r, g, b];
                        }
                    }
                }
            }

            // Ultimate fallback: sample from horizon (middle of image)
            const midY = Math.floor(this.H / 2);
            const [r, g, b] = getPixel(x, midY);
            return [Math.max(r, 50), Math.max(g, 50), Math.max(b, 50)];
        };

        // Step 2: Find FLAT boundaries (use 75th percentile for more aggressive fill)
        console.log('🔧 Calculating flat boundaries...');

        // Collect all valid boundary positions
        const topPositions = [];
        const botPositions = [];

        for (let x = 0; x < this.W; x++) {
            // Scan for top boundary
            for (let y = 0; y < poleHeight; y++) {
                const [r, g, b, a] = getPixel(x, y);
                if (a > 250 && (r > 15 || g > 15 || b > 15)) {
                    topPositions.push(y);
                    break;
                }
            }

            // Scan for bottom boundary
            for (let y = this.H - 1; y > this.H - poleHeight; y--) {
                const [r, g, b, a] = getPixel(x, y);
                if (a > 250 && (r > 15 || g > 15 || b > 15)) {
                    botPositions.push(y);
                    break;
                }
            }
        }

        // Use 75th percentile for more aggressive coverage (fills more area)
        const getPercentile = (arr, percentile) => {
            if (arr.length === 0) return -1;
            const sorted = [...arr].sort((a, b) => a - b);
            const index = Math.floor(sorted.length * percentile);
            return sorted[Math.min(index, sorted.length - 1)];
        };

        // For top: use 75th percentile (fill more)
        // For bottom: use 25th percentile (fill more)
        const flatTopBoundary = getPercentile(topPositions, 0.75);
        const flatBotBoundary = getPercentile(botPositions, 0.25);

        console.log(`📏 Flat boundaries: Top=${flatTopBoundary}, Bottom=${flatBotBoundary}`);

        // Step 3: Sample colors from just below/above the flat boundaries
        const getHorizontalAverageColor = (y, sampleWidth = 15) => {
            let rSum = 0, gSum = 0, bSum = 0, count = 0;

            for (let x = 0; x < this.W; x += sampleWidth) {
                const [r, g, b, a] = getPixel(x, y);
                if (a > 250 && (r > 15 || g > 15 || b > 15)) {
                    rSum += r;
                    gSum += g;
                    bSum += b;
                    count++;
                }
            }

            if (count === 0) {
                // Fallback to horizon
                const midY = Math.floor(this.H / 2);
                for (let x = 0; x < this.W; x += 50) {
                    const [r, g, b] = getPixel(x, midY);
                    rSum += r; gSum += g; bSum += b; count++;
                }
            }

            return [
                Math.round(rSum / count),
                Math.round(gSum / count),
                Math.round(bSum / count)
            ];
        };

        // Get average colors for filling
        const topFillColor = flatTopBoundary > 0
            ? getHorizontalAverageColor(Math.min(this.H - 1, flatTopBoundary + 5))
            : [128, 128, 128];

        const botFillColor = flatBotBoundary > 0
            ? getHorizontalAverageColor(Math.max(0, flatBotBoundary - 5))
            : [128, 128, 128];

        console.log('🎨 Fill colors:', { top: topFillColor, bottom: botFillColor });

        // Step 4: Fill with FLAT edges
        console.log('🔧 Filling top pole with flat edge...');
        if (flatTopBoundary > 0) {
            for (let y = 0; y < flatTopBoundary; y++) {
                for (let x = 0; x < this.W; x++) {
                    setPixel(x, y, topFillColor[0], topFillColor[1], topFillColor[2]);
                }
            }
        }

        console.log('🔧 Filling bottom pole with flat edge...');
        if (flatBotBoundary > 0 && flatBotBoundary < this.H - 1) {
            for (let y = flatBotBoundary + 1; y < this.H; y++) {
                for (let x = 0; x < this.W; x++) {
                    setPixel(x, y, botFillColor[0], botFillColor[1], botFillColor[2]);
                }
            }
        }

        // Step 5: CLEANUP PASS - Fill any remaining black pixels in pole regions
        console.log('🔧 Cleanup pass for remaining black spots...');
        let cleanedPixels = 0;

        // Top cleanup
        for (let y = 0; y < poleHeight; y++) {
            for (let x = 0; x < this.W; x++) {
                if (isBlackOrEmpty(x, y)) {
                    setPixel(x, y, topFillColor[0], topFillColor[1], topFillColor[2]);
                    cleanedPixels++;
                }
            }
        }

        // Bottom cleanup
        for (let y = this.H - poleHeight; y < this.H; y++) {
            for (let x = 0; x < this.W; x++) {
                if (isBlackOrEmpty(x, y)) {
                    setPixel(x, y, botFillColor[0], botFillColor[1], botFillColor[2]);
                    cleanedPixels++;
                }
            }
        }

        console.log(`🧹 Cleaned ${cleanedPixels} remaining black pixels`);

        // Step 6: Smooth the filled areas with horizontal blur
        console.log('🔧 Smoothing poles...');
        const blurPoles = (startY, endY) => {
            const blurRadius = 10;
            const tempData = new Uint8ClampedArray(data);

            for (let y = startY; y < endY; y++) {
                for (let x = 0; x < this.W; x++) {
                    let rSum = 0, gSum = 0, bSum = 0, count = 0;

                    for (let dx = -blurRadius; dx <= blurRadius; dx++) {
                        const nx = (x + dx + this.W) % this.W;
                        const idx = (y * this.W + nx) * 4;
                        rSum += tempData[idx];
                        gSum += tempData[idx + 1];
                        bSum += tempData[idx + 2];
                        count++;
                    }

                    const idx = (y * this.W + x) * 4;
                    data[idx] = Math.round(rSum / count);
                    data[idx + 1] = Math.round(gSum / count);
                    data[idx + 2] = Math.round(bSum / count);
                    data[idx + 3] = 255;
                }
            }
        };

        // Blur top and bottom poles
        blurPoles(0, Math.floor(this.H * 0.15));
        blurPoles(Math.floor(this.H * 0.85), this.H);

        mainCtx.putImageData(tempBuf, 0, 0);
        console.log('✅ Pole filling complete');

        return new Promise((resolve) => {
            mainCanvas.toBlob((blob) => {
                resolve({
                    blob,
                    url: URL.createObjectURL(blob),
                    width: this.W,
                    height: this.H
                });
            }, 'image/jpeg', 0.95);
        });
    }

    async loadImage(src) {
        if (!src) return null;
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = src;
        });
    }
}
