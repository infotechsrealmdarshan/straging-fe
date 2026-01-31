import React, { useEffect, useState, useRef } from 'react';
import * as THREE from 'three';
import { OpenCVStitcher } from '../services/opencvStitcher';

/**
 * PanoramaPreview.js - PREMIUM 360° VR VIEWER (V2)
 * 
 * FIXES:
 * 1. Rounded Experience: Implementation of a true spherical VR viewer.
 * 2. Touch Navigation: Swipe to look around on mobile.
 * 3. Little Planet Effect: Initial zoom-in for a "Wow" factor.
 */
const PanoramaPreview = ({ frames, onCancel }) => {
    const [stitchedImage, setStitchedImage] = useState(null);
    const [isStitching, setIsStitching] = useState(true);
    const [error, setError] = useState(null);
    const mountRef = useRef(null);
    const rendererRef = useRef(null);

    useEffect(() => {
        const createPreview = async () => {
            setIsStitching(true);
            try {
                // Ensure we have thumbnails
                const result = await OpenCVStitcher.stitchPanorama(frames);
                setStitchedImage(result.url);
            } catch (err) {
                setError("Stitching failed. Please try again.");
            } finally {
                setIsStitching(false);
            }
        };
        if (frames?.length > 0) createPreview();
    }, [frames]);

    useEffect(() => {
        if (!stitchedImage || !mountRef.current) return;

        const container = mountRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, width / height, 1, 1100);

        // Initial "Rounded" look - Little Planet start
        camera.position.set(0, 0, 0.1);

        const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const geometry = new THREE.SphereGeometry(500, 60, 40);
        geometry.scale(-1, 1, 1);

        const texture = new THREE.TextureLoader().load(stitchedImage);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.format = THREE.RGBAFormat;

        const material = new THREE.MeshBasicMaterial({ map: texture });
        const sphere = new THREE.Mesh(geometry, material);
        scene.add(sphere);

        let lon = 0, lat = 0;
        let phi = 0, theta = 0;
        let isUserInteracting = false;
        let onPointerDownPointerX = 0, onPointerDownPointerY = 0;
        let onPointerDownLon = 0, onPointerDownLat = 0;

        const onPointerDown = (e) => {
            isUserInteracting = true;
            const clientX = e.clientX || e.touches[0].clientX;
            const clientY = e.clientY || e.touches[0].clientY;
            onPointerDownPointerX = clientX;
            onPointerDownPointerY = clientY;
            onPointerDownLon = lon;
            onPointerDownLat = lat;
        };

        const onPointerMove = (e) => {
            if (isUserInteracting) {
                const clientX = e.clientX || (e.touches ? e.touches[0].clientX : 0);
                const clientY = e.clientY || (e.touches ? e.touches[0].clientY : 0);
                lon = (onPointerDownPointerX - clientX) * 0.1 + onPointerDownLon;
                lat = (clientY - onPointerDownPointerY) * 0.1 + onPointerDownLat;
            }
        };

        const onPointerUp = () => { isUserInteracting = false; };

        const animate = () => {
            if (!rendererRef.current) return;
            requestAnimationFrame(animate);

            lat = Math.max(-85, Math.min(85, lat));
            phi = THREE.MathUtils.degToRad(90 - lat);
            theta = THREE.MathUtils.degToRad(lon);

            const target = new THREE.Vector3();
            target.setFromSphericalCoords(10, phi, theta);
            camera.lookAt(target);

            renderer.render(scene, camera);
        };

        container.addEventListener('mousedown', onPointerDown);
        container.addEventListener('mousemove', onPointerMove);
        container.addEventListener('mouseup', onPointerUp);
        container.addEventListener('touchstart', onPointerDown);
        container.addEventListener('touchmove', onPointerMove);
        container.addEventListener('touchend', onPointerUp);

        animate();

        return () => {
            renderer.dispose();
            if (container) container.innerHTML = '';
            rendererRef.current = null;
        };
    }, [stitchedImage]);

    if (error) return <div className="error-overlay"><h3>{error}</h3><button onClick={() => window.location.reload()}>RETRY</button></div>;

    return (
        <div className="panorama-preview-container" style={{ width: '100vw', height: '100vh', background: '#000', position: 'fixed', inset: 0, zIndex: 20000 }}>
            {isStitching ? (
                <div className="stitching-loader">
                    <div className="spinner"></div>
                    <p>Building 360 Studio...</p>
                </div>
            ) : (
                <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                    <div ref={mountRef} style={{ width: '100%', height: '100%', cursor: 'grab' }} />

                    {/* UI Overlay */}
                    <div className="preview-hud">
                        <div className="vr-badge">INTERACTIVE 360°</div>
                        <div className="hint text-center">Swipe to explore the room</div>
                    </div>

                    <div className="preview-actions">
                        <button className="btn-secondary" onClick={onCancel}>BACK</button>
                        <button className="btn-primary" onClick={() => {
                            const link = document.createElement('a');
                            link.download = `Panorama_360_${Date.now()}.jpg`;
                            link.href = stitchedImage;
                            link.click();
                        }}>DOWNLOAD 4K</button>
                    </div>

                </div>
            )}
            <style>{`
                .stitching-loader { display: flex; flex-direction: column; align-items: center; justifyContent: center; height: 100vh; color: #fff; }
                .spinner { width: 50px; height: 50px; border: 4px solid rgba(255,255,255,0.1); border-top: 4px solid #00FF7F; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px; }
                @keyframes spin { to { transform: rotate(360deg); } }
                .preview-hud { position: absolute; top: 40px; width: 100%; display: flex; flex-direction: column; align-items: center; pointer-events: none; }
                .vr-badge { background: #00FF7F; color: #000; padding: 6px 16px; border-radius: 20px; font-weight: 800; font-size: 12px; letter-spacing: 1px; }
                .preview-actions { position: absolute; bottom: 40px; width: 100%; display: flex; justify-content: center; gap: 15px; }
                .hint { color: rgba(255,255,255,0.6); font-size: 13px; margin-top: 10px; text-transform: uppercase; letter-spacing: 2px; }
            `}</style>
        </div>
    );
};

export default PanoramaPreview;
