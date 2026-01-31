/**
 * Simple client-side panorama stitcher for preview purposes only.
 * This creates a basic cylindrical projection preview.
 * For production, use backend stitching (Hugin/OpenCV C++).
 */

export class SimpleStitcher {
    static async createPreviewPanorama(frames) {
        if (!frames || frames.length < 2) {
            return null;
        }

        // Sort frames by yaw angle
        const sortedFrames = [...frames].sort((a, b) => a.actualYaw - b.actualYaw);

        // Create canvas for the panorama
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Estimate panorama dimensions
        const frameWidth = 800;
        const frameHeight = 600;
        const totalYawCoverage = 360; // Full panorama
        const panoWidth = Math.max(3600, sortedFrames.length * frameWidth * 0.7);
        const panoHeight = frameHeight;

        canvas.width = panoWidth;
        canvas.height = panoHeight;

        // Fill with black background
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, panoWidth, panoHeight);

        // Load all images
        const imagePromises = sortedFrames.map(frame => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve({ img, frame });
                img.onerror = reject;
                img.src = frame.thumbnail;
            });
        });

        try {
            const loadedImages = await Promise.all(imagePromises);

            // Place images based on yaw position
            loadedImages.forEach(({ img, frame }, index) => {
                const yawNormalized = frame.actualYaw / 360; // 0 to 1
                const xPosition = yawNormalized * panoWidth;

                // Calculate overlap blend
                const blendWidth = frameWidth * 0.3;

                ctx.save();

                // Draw image
                ctx.drawImage(
                    img,
                    xPosition - frameWidth / 2,
                    (panoHeight - frameHeight) / 2,
                    frameWidth,
                    frameHeight
                );

                ctx.restore();
            });

            // Convert canvas to blob
            return new Promise((resolve) => {
                canvas.toBlob((blob) => {
                    resolve({
                        blob,
                        url: URL.createObjectURL(blob),
                        width: panoWidth,
                        height: panoHeight
                    });
                }, 'image/jpeg', 0.9);
            });

        } catch (error) {
            console.error('Stitching preview failed:', error);
            return null;
        }
    }
}
