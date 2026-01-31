import React, { Component } from 'react';
import PanoramaViewer from './PanoramaViewer';
import PanoramaConverter from '../utils/panoramaConverter';

/**
 * PanoramaDemo.js
 * Demo component to showcase converted panoramic images
 */
class PanoramaDemo extends Component {
    constructor(props) {
        super(props);
        this.state = {
            convertedPanoramaUrl: null,
            isConverting: false,
            error: null
        };
    }

    componentDidMount() {
        this.convertPanorama();
    }

    convertPanorama = async () => {
        this.setState({ isConverting: true, error: null });
        
        try {
            const equirectangularBlob = await PanoramaConverter.convertAlmaPanorama();
            const url = URL.createObjectURL(equirectangularBlob);
            this.setState({ 
                convertedPanoramaUrl: url, 
                isConverting: false 
            });
        } catch (error) {
            console.error('Panorama conversion failed:', error);
            this.setState({ 
                error: 'Failed to convert panorama. Using original image.',
                isConverting: false 
            });
        }
    };

    render() {
        const { convertedPanoramaUrl, isConverting, error } = this.state;

        return (
            <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
                {isConverting && (
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center',
                        zIndex: 1000,
                        background: 'rgba(0,0,0,0.8)',
                        color: 'white',
                        padding: '20px',
                        borderRadius: '10px'
                    }}>
                        <h2>Converting to 360° Panorama...</h2>
                        <p>Applying spherical projection and seamless blending</p>
                    </div>
                )}

                {error && (
                    <div style={{
                        position: 'absolute',
                        top: '20px',
                        left: '20px',
                        background: 'rgba(255,0,0,0.8)',
                        color: 'white',
                        padding: '10px',
                        borderRadius: '5px',
                        zIndex: 1000
                    }}>
                        {error}
                    </div>
                )}

                <PanoramaViewer 
                    imageSrc={convertedPanoramaUrl || '/alma-correlator-facility.jpg'}
                    autoRotate={true}
                    showControls={true}
                />
            </div>
        );
    }
}

export default PanoramaDemo;
