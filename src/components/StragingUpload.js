import React, { Component } from 'react';
import { stragingService } from '../services/straging';
import { authService } from '../services/auth';
import LoadingOverlay from '../elements/LoadingOverlay';
import PanoramaCapture from './PanoramaCapture';
import './StragingUpload.css';

class StragingUpload extends Component {
    constructor(props) {
        super(props);
        this.state = {
            formData: {
                projectName: '',
                streetAddress: '',
                aptLandmark: '',
                cityLocality: '',
                state: '',
                country: '',
                note: '',
                imageType: 'fromgallery'
            },
            imageFiles: [],
            imagePreviews: [],
            loading: false,
            error: '',
            isCapturing: false
        };
    }

    componentDidMount() {
        this.syncInitialImages();
    }

    componentDidUpdate(prevProps) {
        if (prevProps.initialImages !== this.props.initialImages) {
            this.syncInitialImages();
        }
    }

    syncInitialImages = () => {
        if (this.props.initialImages && this.props.initialImages.length > 0) {
            const files = Array.from(this.props.initialImages);
            // Cleanup old previews if they exist
            this.state.imagePreviews.forEach(url => URL.revokeObjectURL(url));

            const previews = files.map(file => URL.createObjectURL(file));
            this.setState({
                imageFiles: files,
                imagePreviews: previews
            });
        }
    }

    componentWillUnmount() {
        // Revoke the object URLs to avoid memory leaks
        this.state.imagePreviews.forEach(url => URL.revokeObjectURL(url));
    }

    handleChange = (e) => {
        this.setState({
            formData: {
                ...this.state.formData,
                [e.target.name]: e.target.value
            }
        });
    }

    handleImageChange = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            const newPreviews = files.map(file => URL.createObjectURL(file));
            this.setState({
                imageFiles: [...this.state.imageFiles, ...files].slice(0, 10), // Limit to 10 images
                imagePreviews: [...this.state.imagePreviews, ...newPreviews].slice(0, 10)
            });
        }
    }

    removeImage = (index) => {
        const newFiles = [...this.state.imageFiles];
        const newPreviews = [...this.state.imagePreviews];
        newFiles.splice(index, 1);
        newPreviews.splice(index, 1);
        this.setState({
            imageFiles: newFiles,
            imagePreviews: newPreviews
        });
    }

    handleSubmit = async (e) => {
        e.preventDefault();
        this.setState({ loading: true, error: '' });

        try {
            const { token } = authService.getAuthData();
            if (!token) {
                this.setState({ error: 'You must be logged in to upload straging' });
                return;
            }

            if (this.state.imageFiles.length === 0) {
                this.setState({ error: 'Please select at least one image' });
                return;
            }

            const formDataObj = new FormData();

            // Add form fields
            Object.keys(this.state.formData).forEach(key => {
                formDataObj.append(key, this.state.formData[key]);
            });

            // Add image files
            this.state.imageFiles.forEach(file => {
                formDataObj.append('images', file);
            });

            const response = await stragingService.uploadStraging(formDataObj, token);

            if (response && (response.data || response.projectName)) {
                // Reset form
                this.setState({
                    formData: {
                        projectName: '',
                        streetAddress: '',
                        aptLandmark: '',
                        cityLocality: '',
                        state: '',
                        country: '',
                        note: '',
                        imageType: 'fromgallery'
                    },
                    imageFiles: [],
                    imagePreviews: []
                });

                // Notify parent component
                if (this.props.onUploadSuccess) {
                    this.props.onUploadSuccess(response.data || response);
                }
            } else {
                this.setState({ error: response.message || 'Upload failed' });
            }
        } catch (err) {
            const errorMessage = err.response?.data?.message || 'Upload failed';
            this.setState({ error: errorMessage });
        } finally {
            this.setState({ loading: false });
        }
    }


    handleCaptureComplete = (files) => {
        console.log('📥 Received files from panorama capture:', files);

        if (!files || files.length === 0) {
            console.warn('⚠️ No files received, closing capture mode');
            this.setState({ isCapturing: false });
            return;
        }

        const newFiles = Array.from(files);
        console.log(`✅ Processing ${newFiles.length} file(s):`, newFiles.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(2)} MB)`));

        // Only generate previews for image files
        const imageFiles = newFiles.filter(f => f.type.startsWith('image/'));
        const newPreviews = imageFiles.map(file => URL.createObjectURL(file));

        this.setState({
            imageFiles: [...this.state.imageFiles, ...newFiles],
            imagePreviews: [...this.state.imagePreviews, ...newPreviews],
            isCapturing: false
        }, () => {
            console.log(`📊 Updated state: ${this.state.imageFiles.length} total files, returning to upload form`);
        });
    }

    render() {
        const { formData, imageFiles, imagePreviews, loading, error, isCapturing } = this.state;

        if (isCapturing) {
            return (
                <PanoramaCapture
                    onComplete={this.handleCaptureComplete}
                    onCancel={() => this.setState({ isCapturing: false })}
                />
            );
        }

        return (
            <div className="straging-upload">
                <div className="upload-header">
                    <button className="back-btn" onClick={this.props.onCancel}>
                        <span className="back-icon">←</span> Back
                    </button>
                    <h2>Create New Straging</h2>
                </div>

                {error && <div className="error-message">{error}</div>}

                <form onSubmit={this.handleSubmit} className="straging-form">
                    <div className="form-group">
                        <label htmlFor="projectName">Project Name *</label>
                        <input
                            type="text"
                            id="projectName"
                            name="projectName"
                            value={formData.projectName}
                            onChange={this.handleChange}
                            required
                            placeholder="Enter project name"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="streetAddress">Street Address *</label>
                        <input
                            type="text"
                            id="streetAddress"
                            name="streetAddress"
                            value={formData.streetAddress}
                            onChange={this.handleChange}
                            required
                            placeholder="Enter street address"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="aptLandmark">Apartment/Landmark</label>
                        <input
                            type="text"
                            id="aptLandmark"
                            name="aptLandmark"
                            value={formData.aptLandmark}
                            onChange={this.handleChange}
                            placeholder="Apartment number or landmark"
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="cityLocality">City/Locality *</label>
                            <input
                                type="text"
                                id="cityLocality"
                                name="cityLocality"
                                value={formData.cityLocality}
                                onChange={this.handleChange}
                                required
                                placeholder="City or locality"
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="state">State *</label>
                            <input
                                type="text"
                                id="state"
                                name="state"
                                value={formData.state}
                                onChange={this.handleChange}
                                required
                                placeholder="State or province"
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="country">Country *</label>
                        <input
                            type="text"
                            id="country"
                            name="country"
                            value={formData.country}
                            onChange={this.handleChange}
                            required
                            placeholder="Country"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="note">Notes</label>
                        <textarea
                            id="note"
                            name="note"
                            value={formData.note}
                            onChange={this.handleChange}
                            rows="3"
                            placeholder="Additional notes about the project"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="imageFiles">Project Images (Up to 10) *</label>
                        <input
                            type="file"
                            id="imageFiles"
                            accept="image/*"
                            multiple
                            onChange={this.handleImageChange}
                            required={imageFiles.length === 0}
                            className="file-input"
                            style={{ display: 'none' }}
                            ref={el => this.fileInputRef = el}
                        />

                        <div className="upload-options-row" style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                            <button
                                type="button"
                                className="upload-option-btn"
                                onClick={() => this.fileInputRef.click()}
                            >
                                📁 Select Photos from Gallery
                            </button>
                            <button
                                type="button"
                                className="upload-option-btn capture-btn"
                                onClick={() => this.setState({ isCapturing: true })}
                                style={{ background: '#00FF00', color: '#000', border: 'none', fontWeight: 'bold' }}
                            >
                                📷 Capture 360 Panorama
                            </button>
                        </div>
                        {imagePreviews.length > 0 && (
                            <div className="image-previews-container">
                                {imagePreviews.map((preview, index) => (
                                    <div key={index} className="image-preview">
                                        <img src={preview} alt={`Preview ${index}`} />
                                        <div className="preview-info">
                                            <p>{imageFiles[index]?.name}</p>
                                            <button
                                                type="button"
                                                className="remove-img-btn"
                                                onClick={() => this.removeImage(index)}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        className="submit-btn"
                        disabled={loading}
                    >
                        {loading ? 'Creating...' : 'Create Straging'}
                    </button>
                </form>

                {loading && <LoadingOverlay message="Creating project and uploading assets..." />}
            </div>
        );
    }
}

export default StragingUpload;
