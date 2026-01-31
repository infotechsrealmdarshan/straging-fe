import React, { Component } from 'react';
import './ImageEditor.css';

class ImageEditor extends Component {
    constructor(props) {
        super(props);
        this.state = {
            image: props.image,
            crop: {
                x: 0,
                y: 0,
                width: 100,
                height: 100
            },
            isDragging: false,
            dragStart: { x: 0, y: 0 },
            rotation: 0,
            brightness: 100,
            contrast: 100
        };
        this.canvasRef = React.createRef();
        this.imageRef = React.createRef();
    }

    componentDidMount() {
        this.loadImage();
    }

    loadImage = () => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            this.imageRef.current = img;
            this.drawCanvas();
        };
        img.src = this.state.image;
    };

    drawCanvas = () => {
        const canvas = this.canvasRef.current;
        const img = this.imageRef.current;
        if (!canvas || !img) return;

        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;

        // Apply filters
        ctx.filter = `brightness(${this.state.brightness}%) contrast(${this.state.contrast}%)`;

        // Apply rotation
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((this.state.rotation * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        ctx.restore();
    };

    handleBrightnessChange = (e) => {
        this.setState({ brightness: e.target.value }, this.drawCanvas);
    };

    handleContrastChange = (e) => {
        this.setState({ contrast: e.target.value }, this.drawCanvas);
    };

    handleRotate = (degrees) => {
        this.setState(
            (prevState) => ({ rotation: (prevState.rotation + degrees) % 360 }),
            this.drawCanvas
        );
    };

    handleSave = () => {
        const canvas = this.canvasRef.current;
        if (!canvas) return;

        canvas.toBlob((blob) => {
            const file = new File([blob], 'edited-image.jpg', { type: 'image/jpeg' });
            this.props.onSave(file, canvas.toDataURL('image/jpeg', 0.9));
        }, 'image/jpeg', 0.9);
    };

    handleCancel = () => {
        this.props.onCancel();
    };

    render() {
        const { brightness, contrast, rotation } = this.state;

        return (
            <div className="image-editor-overlay">
                <div className="image-editor-container">
                    <div className="image-editor-header">
                        <h2>Edit Image</h2>
                        <button className="close-btn" onClick={this.handleCancel}>×</button>
                    </div>

                    <div className="image-editor-content">
                        <div className="canvas-container">
                            <canvas ref={this.canvasRef} className="edit-canvas" />
                        </div>

                        <div className="editor-controls">
                            <div className="control-group">
                                <label>Brightness</label>
                                <input
                                    type="range"
                                    min="0"
                                    max="200"
                                    value={brightness}
                                    onChange={this.handleBrightnessChange}
                                />
                                <span>{brightness}%</span>
                            </div>

                            <div className="control-group">
                                <label>Contrast</label>
                                <input
                                    type="range"
                                    min="0"
                                    max="200"
                                    value={contrast}
                                    onChange={this.handleContrastChange}
                                />
                                <span>{contrast}%</span>
                            </div>

                            <div className="control-group">
                                <label>Rotation</label>
                                <div className="rotation-buttons">
                                    <button onClick={() => this.handleRotate(-90)}>↶ 90°</button>
                                    <button onClick={() => this.handleRotate(90)}>↷ 90°</button>
                                    <span>{rotation}°</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="image-editor-footer">
                        <button className="btn-cancel" onClick={this.handleCancel}>
                            Cancel
                        </button>
                        <button className="btn-save" onClick={this.handleSave}>
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}

export default ImageEditor;
