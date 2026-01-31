import * as THREE from 'three';

/**
 * PanoramaStitcher.js - MASTER CALIBRATION V20 (PROPER ALIGNMENT → alma-correlator-facility.jpg style)
 *
 * TARGET RESULT: Seamless 360 equirectangular like public/alma-correlator-facility.jpg
 * (no visible seams, consistent lighting, smooth geometry, no ghosting/artifacts).
 *
 * FIXES:
 * 1. FIXED "HORIZONTAL SKEW": Tangent-based yaw mapping per slice.
 * 2. FIXED "V-SHAPE": True spherical pitch-scaling for every vertical slice.
 * 3. FIXED VERTICAL STREAKS: Pole fill samples from adjacent columns/rows (no flat gray).
 * 4. STITCH + ALIGNMENT: Very wide horizontal fade (0.40); vertical fade 0.26 for horizontal seams.
 * 5. PER-FRAME EXPOSURE: Normalize each frame mean to 128 to reduce bright/dark bands at seams.
 * 6. POLE BLUR: 25% top/bottom, radius 16 for softer transition (no visible horizontal line).
 * 7. REMOVE SEAM LINES: 3x3 mean + 3x3 median (reduces ghosting) + 5px H blur + 5px V blur.
 * 8. REMOVE WHITE SPOTS: Hot-spot reduction on first pass (blend down >22% brighter than local avg).
 * 9. FINAL POLISH: Light 3x3 weighted smooth (center 4, neighbors 1) + full-image exposure to 128.
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

                // Stage 2: Seam Blending - very wide fade so vertical/horizontal seams and ghosting blend
                const hFade = 0.40;
                const vFadeTop = (pitch > 60) ? 0.0 : 0.26;
                const vFadeBot = (pitch < -60) ? 0.0 : 0.26;

                this.maskCanvas.width = img.width;
                this.maskCanvas.height = img.height;
                const mCtx = this.mCtx;
                mCtx.clearRect(0, 0, img.width, img.height);
                mCtx.fillStyle = 'white';
                mCtx.fillRect(0, 0, img.width, img.height);

                // Horizontal gradient with smooth (softer) falloff to hide seam "cuts"
                mCtx.globalCompositeOperation = 'destination-in';
                const hGrad = mCtx.createLinearGradient(0, 0, img.width, 0);
                hGrad.addColorStop(0, 'rgba(255,255,255,0)');
                hGrad.addColorStop(0.08, 'rgba(255,255,255,0.4)');
                hGrad.addColorStop(hFade, 'white');
                hGrad.addColorStop(1 - hFade, 'white');
                hGrad.addColorStop(0.92, 'rgba(255,255,255,0.4)');
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

                // Stage 2b: Per-frame exposure normalization (reduces bright/dark bands at seams)
                const fImg = this.fCtx.getImageData(0, 0, this.fCanvas.width, this.fCanvas.height);
                const fData = fImg.data;
                let rSum = 0, gSum = 0, bSum = 0, count = 0;
                const fStep = Math.max(1, Math.floor((this.fCanvas.width * this.fCanvas.height) / 4000));
                for (let i = 0; i < fData.length; i += 4 * fStep) {
                    if (fData[i + 3] > 20) {
                        rSum += fData[i]; gSum += fData[i + 1]; bSum += fData[i + 2];
                        count++;
                    }
                }
                if (count > 0) {
                    const meanR = rSum / count, meanG = gSum / count, meanB = bSum / count;
                    const target = 128;
                    const scaleR = meanR > 5 ? target / meanR : 1;
                    const scaleG = meanG > 5 ? target / meanG : 1;
                    const scaleB = meanB > 5 ? target / meanB : 1;
                    for (let i = 0; i < fData.length; i += 4) {
                        if (fData[i + 3] > 20) {
                            fData[i] = Math.min(255, Math.round(fData[i] * scaleR));
                            fData[i + 1] = Math.min(255, Math.round(fData[i + 1] * scaleG));
                            fData[i + 2] = Math.min(255, Math.round(fData[i + 2] * scaleB));
                        }
                    }
                    this.fCtx.putImageData(fImg, 0, 0);
                }

                // Stage 3: Spherical Projection
                const pitchRad = THREE.MathUtils.degToRad(pitch);
                const hfovRad = THREE.MathUtils.degToRad(hfov);
                const vfovRad = hfovRad / aspect;

                const cosPitch = Math.cos(pitchRad);
                const sinPitch = Math.sin(pitchRad);

                // Sizing warp canvas - slight oversize to avoid cut-off at frame edges
                const projectionWidth = Math.ceil(((hfov * 1.6) / 360) * this.W);
                const projectionHeight = Math.ceil(((Math.min(90, (hfov / aspect) * 1.15) * 2) / 180) * this.H);

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
                    const destW = (this.W / 360) * (hfov / sliceCount) * 1.75; // Overlap to hide seam misalignment

                    const getProjPitch = (v) => {
                        const denom = Math.sqrt(u * u + v * v + 1);
                        return Math.asin((v * cosPitch + sinPitch) / denom);
                    };

                    const pMid = getProjPitch(0);
                    const pTop = getProjPitch(tanVfov2);
                    const pBot = getProjPitch(-tanVfov2);

                    const dy_px = (pitchRad - pMid) * (this.H / Math.PI);
                    const sliceH_px = (pTop - pBot) * (this.H / Math.PI);
                    // Slight vertical overdraw (3%) to avoid thin "cut" gaps between slices
                    const sliceH_draw = Math.max(sliceH_px, sliceH_px * 1.03);

                    this.wCtx.drawImage(
                        this.fCanvas,
                        Math.floor(i * srcSliceW), 0, Math.ceil(srcSliceW), img.height,
                        destX, (projectionHeight / 2 - sliceH_draw / 2) + dy_px,
                        destW, sliceH_draw
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

        // Stage 5: AGGRESSIVE Pole Filling - Column-by-Column Adaptive Fill
        const poleHeightLimit = Math.floor(this.H * 0.25); // 25% for reliable coverage
        const tempBuf = mainCtx.getImageData(0, 0, this.W, this.H);
        const data = tempBuf.data;

        // Helper: Get pixel data safely
        const getIdx = (x, y) => {
            const wx = (x + this.W) % this.W;
            return (y * this.W + wx) * 4;
        };

        const isPixelValid = (x, y) => {
            const idx = getIdx(x, y);
            return data[idx + 3] > 200 && (data[idx] > 15 || data[idx + 1] > 15 || data[idx + 2] > 15);
        };

        // Sample color from column x at first valid y, or from adjacent columns to avoid streaks
        const sampleTopColor = (x, firstValidY) => {
            let rSum = 0, gSum = 0, bSum = 0, count = 0;
            const sampleY = firstValidY;
            for (let dx = -2; dx <= 2; dx++) {
                const nx = (x + dx + this.W) % this.W;
                const idx = getIdx(nx, sampleY);
                if (data[idx + 3] > 200) {
                    rSum += data[idx]; gSum += data[idx + 1]; bSum += data[idx + 2];
                    count++;
                }
            }
            if (count === 0) return null;
            return [Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count)];
        };
        const sampleBottomColor = (x, lastValidY) => {
            let rSum = 0, gSum = 0, bSum = 0, count = 0;
            for (let dx = -2; dx <= 2; dx++) {
                const nx = (x + dx + this.W) % this.W;
                const idx = getIdx(nx, lastValidY);
                if (data[idx + 3] > 200) {
                    rSum += data[idx]; gSum += data[idx + 1]; bSum += data[idx + 2];
                    count++;
                }
            }
            if (count === 0) return null;
            return [Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count)];
        };

        console.log('🔧 Starting adaptive pole filling...');

        // Top Pole Adaptive Fill (softer: neighbor sampling to avoid vertical streaks)
        for (let x = 0; x < this.W; x++) {
            let firstValidY = -1;
            for (let y = 0; y < poleHeightLimit; y++) {
                if (isPixelValid(x, y)) {
                    firstValidY = y;
                    break;
                }
            }

            if (firstValidY !== -1) {
                const rgb = sampleTopColor(x, firstValidY);
                if (rgb) {
                    const [r, g, b] = rgb;
                    for (let y = 0; y < firstValidY; y++) {
                        const fillIdx = getIdx(x, y);
                        data[fillIdx] = r;
                        data[fillIdx + 1] = g;
                        data[fillIdx + 2] = b;
                        data[fillIdx + 3] = 255;
                    }
                }
            } else {
                // No valid pixel in this column: sample from adjacent columns to avoid gray streaks
                let rSum = 0, gSum = 0, bSum = 0, count = 0;
                for (let dx = -3; dx <= 3; dx++) {
                    const nx = (x + dx + this.W) % this.W;
                    for (let y = poleHeightLimit; y < Math.min(poleHeightLimit + 50, this.H); y++) {
                        if (isPixelValid(nx, y)) {
                            const idx = getIdx(nx, y);
                            rSum += data[idx]; gSum += data[idx + 1]; bSum += data[idx + 2];
                            count++;
                            break;
                        }
                    }
                }
                const r = count > 0 ? Math.round(rSum / count) : 128;
                const g = count > 0 ? Math.round(gSum / count) : 128;
                const b = count > 0 ? Math.round(bSum / count) : 128;
                for (let y = 0; y < poleHeightLimit; y++) {
                    const fillIdx = getIdx(x, y);
                    data[fillIdx] = r;
                    data[fillIdx + 1] = g;
                    data[fillIdx + 2] = b;
                    data[fillIdx + 3] = 255;
                }
            }
        }

        // Bottom Pole Adaptive Fill
        for (let x = 0; x < this.W; x++) {
            let lastValidY = -1;
            for (let y = this.H - 1; y > this.H - poleHeightLimit; y--) {
                if (isPixelValid(x, y)) {
                    lastValidY = y;
                    break;
                }
            }

            if (lastValidY !== -1) {
                const rgb = sampleBottomColor(x, lastValidY);
                if (rgb) {
                    const [r, g, b] = rgb;
                    for (let y = lastValidY + 1; y < this.H; y++) {
                        const fillIdx = getIdx(x, y);
                        data[fillIdx] = r;
                        data[fillIdx + 1] = g;
                        data[fillIdx + 2] = b;
                        data[fillIdx + 3] = 255;
                    }
                }
            } else {
                let rSum = 0, gSum = 0, bSum = 0, count = 0;
                for (let dx = -3; dx <= 3; dx++) {
                    const nx = (x + dx + this.W) % this.W;
                    for (let y = this.H - poleHeightLimit - 50; y < this.H - poleHeightLimit; y++) {
                        if (y >= 0 && isPixelValid(nx, y)) {
                            const idx = getIdx(nx, y);
                            rSum += data[idx]; gSum += data[idx + 1]; bSum += data[idx + 2];
                            count++;
                            break;
                        }
                    }
                }
                const r = count > 0 ? Math.round(rSum / count) : 80;
                const g = count > 0 ? Math.round(gSum / count) : 80;
                const b = count > 0 ? Math.round(bSum / count) : 80;
                for (let y = this.H - poleHeightLimit; y < this.H; y++) {
                    const fillIdx = getIdx(x, y);
                    data[fillIdx] = r;
                    data[fillIdx + 1] = g;
                    data[fillIdx + 2] = b;
                    data[fillIdx + 3] = 255;
                }
            }
        }

        // Stage 6: Wider blur transition for poles - reduces visible seams and cut-off
        console.log('🔧 Smoothing pole transitions...');
        const blurPoles = (startY, endY, radius = 14) => {
            const tempData = new Uint8ClampedArray(data);
            for (let y = startY; y < endY; y++) {
                for (let x = 0; x < this.W; x++) {
                    let rSum = 0, gSum = 0, bSum = 0, count = 0;
                    for (let dx = -radius; dx <= radius; dx++) {
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
                }
            }
        };

        // Wider pole blur zones (25% top/bottom) with softer transition to avoid visible horizontal line
        blurPoles(0, Math.floor(this.H * 0.25), 16);
        blurPoles(Math.floor(this.H * 0.75), this.H, 16);

        mainCtx.putImageData(tempBuf, 0, 0);

        // Stage 7: Remove line artifacts and improve alignment appearance (3x3 box, two passes + white-spot)
        console.log('🔧 Removing seam lines and improving stitch alignment...');
        const w = this.W, h = this.H;
        const getI = (src, x, y) => ((y * w + (x + w) % w) * 4);
        const runSmoothPass = (src, dest, applyWhiteSpot) => {
            for (let y = 1; y < h - 1; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = (y * w + x) * 4;
                    let rv = 0, gv = 0, bv = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const i = getI(src, x + dx, y + dy);
                            rv += src[i]; gv += src[i + 1]; bv += src[i + 2];
                        }
                    }
                    rv /= 9; gv /= 9; bv /= 9;
                    if (applyWhiteSpot) {
                        const avgLum = (rv + gv + bv) / 3;
                        const centerLum = (src[idx] + src[idx + 1] + src[idx + 2]) / 3;
                        if (centerLum > avgLum * 1.22) {
                            const blend = 0.75;
                            rv = src[idx] * blend + rv * (1 - blend);
                            gv = src[idx + 1] * blend + gv * (1 - blend);
                            bv = src[idx + 2] * blend + bv * (1 - blend);
                        }
                    }
                    dest[idx] = Math.round(rv);
                    dest[idx + 1] = Math.round(gv);
                    dest[idx + 2] = Math.round(bv);
                }
            }
        };
        const copy = new Uint8ClampedArray(data);
        runSmoothPass(copy, data, true);
        copy.set(data);
        // Second pass: 3x3 median to reduce ghosting (double-image at misaligned seams)
        const median = (arr) => {
            const a = arr.slice().sort((x, y) => x - y);
            return a[Math.floor(a.length / 2)];
        };
        for (let y = 1; y < h - 1; y++) {
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                const rArr = [], gArr = [], bArr = [];
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const i = getI(copy, x + dx, y + dy);
                        rArr.push(copy[i]); gArr.push(copy[i + 1]); bArr.push(copy[i + 2]);
                    }
                }
                data[idx] = median(rArr);
                data[idx + 1] = median(gArr);
                data[idx + 2] = median(bArr);
            }
        }
        copy.set(data);
        // Third pass: horizontal-only blur (5px) to remove vertical seam lines
        const hRadius = 2;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                let rv = 0, gv = 0, bv = 0, n = 0;
                for (let dx = -hRadius; dx <= hRadius; dx++) {
                    const i = getI(copy, x + dx, y);
                    rv += copy[i]; gv += copy[i + 1]; bv += copy[i + 2];
                    n++;
                }
                data[idx] = Math.round(rv / n);
                data[idx + 1] = Math.round(gv / n);
                data[idx + 2] = Math.round(bv / n);
            }
        }
        copy.set(data);
        // Fourth pass: vertical-only blur (5px) to remove horizontal/wavy seam lines
        const vRadius = 2;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                let rv = 0, gv = 0, bv = 0, n = 0;
                for (let dy = -vRadius; dy <= vRadius; dy++) {
                    const ny = Math.max(0, Math.min(h - 1, y + dy));
                    const i = (ny * w + x) * 4;
                    rv += copy[i]; gv += copy[i + 1]; bv += copy[i + 2];
                    n++;
                }
                data[idx] = Math.round(rv / n);
                data[idx + 1] = Math.round(gv / n);
                data[idx + 2] = Math.round(bv / n);
            }
        }
        mainCtx.putImageData(tempBuf, 0, 0);

        // Stage 8: Final polish + full-image exposure (reference: alma-correlator-facility.jpg style)
        console.log('🔧 Final polish for proper alignment look...');
        const dataAfterBlur = mainCtx.getImageData(0, 0, this.W, this.H).data;
        copy.set(dataAfterBlur);
        const centerW = 4, neighborW = 1, totalW = centerW + 8 * neighborW;
        const polishBuf = mainCtx.getImageData(0, 0, this.W, this.H);
        const polishData = polishBuf.data;
        for (let y = 1; y < h - 1; y++) {
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                let rv = copy[idx] * centerW, gv = copy[idx + 1] * centerW, bv = copy[idx + 2] * centerW;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const i = getI(copy, x + dx, y + dy);
                        rv += copy[i] * neighborW;
                        gv += copy[i + 1] * neighborW;
                        bv += copy[i + 2] * neighborW;
                    }
                }
                polishData[idx] = Math.round(rv / totalW);
                polishData[idx + 1] = Math.round(gv / totalW);
                polishData[idx + 2] = Math.round(bv / totalW);
            }
        }
        mainCtx.putImageData(polishBuf, 0, 0);
        const expBuf = mainCtx.getImageData(0, 0, this.W, this.H);
        const d2 = expBuf.data;
        let rSum = 0, gSum = 0, bSum = 0, cnt = 0;
        const sampleStep = Math.max(1, (w * h) / 50000);
        for (let i = 0; i < d2.length; i += 4 * sampleStep) {
            if (d2[i + 3] > 10) {
                rSum += d2[i]; gSum += d2[i + 1]; bSum += d2[i + 2];
                cnt++;
            }
        }
        if (cnt > 0) {
            const target = 128;
            const sR = target / (rSum / cnt), sG = target / (gSum / cnt), sB = target / (bSum / cnt);
            const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
            for (let i = 0; i < d2.length; i += 4) {
                if (d2[i + 3] > 10) {
                    d2[i] = clamp(d2[i] * sR);
                    d2[i + 1] = clamp(d2[i + 1] * sG);
                    d2[i + 2] = clamp(d2[i + 2] * sB);
                }
            }
            mainCtx.putImageData(expBuf, 0, 0);
        }
        console.log('✅ Proper alignment style complete (reference: alma-correlator-facility.jpg)');

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
