/**
 * panoramaConverter.js
 * Utility to convert panoramic strips into proper equirectangular panoramas
 */

class PanoramaConverter {
    /**
     * Convert a panoramic strip image into equirectangular format
     * @param {HTMLImageElement} sourceImage - The source panoramic strip
     * @param {Object} options - Conversion options
     * @returns {Promise<Blob>} - Converted equirectangular panorama blob
     */
    static async convertToEquirectangular(sourceImage, options = {}) {
        const {
            targetWidth = 4096,
            targetHeight = 2048,
            stripCount = 8, // Number of vertical strips in the source
            blending = true
        } = options;

        return new Promise((resolve) => {
            // Create canvas for conversion
            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');

            // Calculate strip dimensions
            const stripWidth = sourceImage.width / stripCount;
            const stripHeight = sourceImage.height;

            // Create temporary canvas for each strip
            const stripCanvas = document.createElement('canvas');
            stripCanvas.width = stripWidth;
            stripCanvas.height = stripHeight;
            const stripCtx = stripCanvas.getContext('2d');

            // Process each strip and map to equirectangular coordinates
            for (let stripIndex = 0; stripIndex < stripCount; stripIndex++) {
                // Extract strip from source image
                stripCtx.clearRect(0, 0, stripWidth, stripHeight);
                stripCtx.drawImage(
                    sourceImage,
                    stripIndex * stripWidth, 0, stripWidth, stripHeight,
                    0, 0, stripWidth, stripHeight
                );

                // Calculate equirectangular mapping
                const startAngle = (stripIndex / stripCount) * 360;
                const endAngle = ((stripIndex + 1) / stripCount) * 360;
                const angleRange = endAngle - startAngle;

                // Map strip to equirectangular coordinates
                for (let x = 0; x < targetWidth / stripCount; x++) {
                    for (let y = 0; y < targetHeight; y++) {
                        // Calculate spherical coordinates
                        const longitude = startAngle + (x / (targetWidth / stripCount)) * angleRange;
                        const latitude = ((y / targetHeight) * 180) - 90;

                        // Convert to strip coordinates with perspective correction
                        const stripX = (x / (targetWidth / stripCount)) * stripWidth;
                        const stripY = ((latitude + 90) / 180) * stripHeight;

                        // Apply cylindrical projection correction
                        const correctedX = stripX;
                        const correctedY = stripY * Math.cos((latitude * Math.PI) / 180);

                        // Sample pixel from strip
                        if (correctedX >= 0 && correctedX < stripWidth &&
                            correctedY >= 0 && correctedY < stripHeight) {
                            const pixel = stripCtx.getImageData(
                                Math.floor(correctedX),
                                Math.floor(correctedY),
                                1, 1
                            ).data;

                            // Set pixel in equirectangular canvas
                            const equirectX = Math.floor((stripIndex * targetWidth / stripCount) + x);
                            const equirectY = Math.floor(y);

                            if (equirectX < targetWidth && equirectY < targetHeight) {
                                const imageData = ctx.createImageData(1, 1);
                                imageData.data[0] = pixel[0];
                                imageData.data[1] = pixel[1];
                                imageData.data[2] = pixel[2];
                                imageData.data[3] = pixel[3];
                                ctx.putImageData(imageData, equirectX, equirectY);
                            }
                        }
                    }
                }
            }

            // Apply blending between strips if enabled
            if (blending) {
                this.applyBlending(ctx, targetWidth, targetHeight, stripCount);
            }

            // Convert to blob
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/jpeg', 0.95);
        });
    }

    /**
     * Apply seamless blending between panoramic strips
     */
    static applyBlending(ctx, width, height, stripCount) {
        const stripWidth = width / stripCount;
        const blendWidth = Math.min(50, stripWidth / 4); // Blend zone width

        for (let stripIndex = 0; stripIndex < stripCount; stripIndex++) {
            const nextIndex = (stripIndex + 1) % stripCount;
            const stripStartX = stripIndex * stripWidth;
            const nextStripStartX = nextIndex * stripWidth;

            // Create blend zone
            for (let x = 0; x < blendWidth; x++) {
                const alpha = x / blendWidth; // 0 to 1
                const currentX = stripStartX + stripWidth - blendWidth + x;
                const nextX = nextStripStartX + x;

                for (let y = 0; y < height; y++) {
                    // Get pixels from current and next strip
                    const currentPixel = ctx.getImageData(currentX, y, 1, 1).data;
                    const nextPixel = ctx.getImageData(nextX, y, 1, 1).data;

                    // Blend pixels
                    const blendedPixel = ctx.createImageData(1, 1);
                    blendedPixel.data[0] = currentPixel[0] * (1 - alpha) + nextPixel[0] * alpha;
                    blendedPixel.data[1] = currentPixel[1] * (1 - alpha) + nextPixel[1] * alpha;
                    blendedPixel.data[2] = currentPixel[2] * (1 - alpha) + nextPixel[2] * alpha;
                    blendedPixel.data[3] = 255;

                    // Apply blended pixel
                    ctx.putImageData(blendedPixel, currentX, y);
                }
            }
        }
    }

    /**
     * Create a test equirectangular panorama from the alma image
     */
    static async convertAlmaPanorama() {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = async () => {
                try {
                    const equirectangularBlob = await this.convertToEquirectangular(img, {
                        targetWidth: 4096,
                        targetHeight: 2048,
                        stripCount: 8, // Adjust based on actual strip count
                        blending: true
                    });
                    resolve(equirectangularBlob);
                } catch (error) {
                    reject(error);
                }
            };

            img.onerror = () => reject(new Error('Failed to load alma image'));
            img.src = '/alma-correlator-facility.jpg';
        });
    }
}

export default PanoramaConverter;
