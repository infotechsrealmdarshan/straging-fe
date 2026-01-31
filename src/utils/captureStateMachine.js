/**
 * captureStateMachine.js
 * Strict state machine for capture flow with quality gating.
 */

export const CaptureState = {
    IDLE: 'IDLE',
    APPROACHING: 'APPROACHING',
    ALIGNING: 'ALIGNING',
    STABLE: 'STABLE',
    CAPTURE_READY: 'CAPTURE_READY',
    CAPTURING: 'CAPTURING',
    CAPTURED: 'CAPTURED'
};

export class CaptureStateMachine {
    constructor(config = {}) {
        this.state = CaptureState.IDLE;
        this.currentTarget = null;
        this.stableStartTime = null;
        this.lastStateChange = Date.now();

        // Configuration thresholds
        this.config = {
            alignmentThreshold: config.alignmentThreshold || 8, // degrees
            lockThreshold: config.lockThreshold || 3, // degrees for LOCKED state
            stabilityDuration: config.stabilityDuration || 600, // ms
            rollTolerance: config.rollTolerance || 5, // degrees
            minAngularSpeed: config.minAngularSpeed || 10, // deg/s
            ...config
        };
    }

    /**
     * Update state machine with current alignment data
     */
    update(alignmentData, sensorFusion) {
        const { target, yawDiff, pitchDiff } = alignmentData;

        if (!target) {
            this.setState(CaptureState.IDLE);
            return this.state;
        }

        this.currentTarget = target;

        const totalError = Math.sqrt(yawDiff ** 2 + pitchDiff ** 2);
        const roll = Math.abs(sensorFusion.getRoll());
        const isStable = sensorFusion.isStable();
        const angularSpeed = sensorFusion.getAngularSpeed();

        // State transitions
        switch (this.state) {
            case CaptureState.IDLE:
                if (totalError < this.config.alignmentThreshold) {
                    this.setState(CaptureState.APPROACHING);
                }
                break;

            case CaptureState.APPROACHING:
                if (totalError > this.config.alignmentThreshold * 1.5) {
                    this.setState(CaptureState.IDLE);
                } else if (totalError < this.config.lockThreshold && roll < this.config.rollTolerance) {
                    this.setState(CaptureState.ALIGNING);
                }
                break;

            case CaptureState.ALIGNING:
                if (totalError > this.config.lockThreshold * 1.5) {
                    this.setState(CaptureState.APPROACHING);
                } else if (isStable && angularSpeed < this.config.minAngularSpeed) {
                    this.setState(CaptureState.STABLE);
                    this.stableStartTime = Date.now();
                }
                break;

            case CaptureState.STABLE:
                // Check if stability broke
                if (!isStable || angularSpeed > this.config.minAngularSpeed * 1.5) {
                    this.setState(CaptureState.ALIGNING);
                    this.stableStartTime = null;
                } else if (totalError > this.config.lockThreshold * 1.5) {
                    this.setState(CaptureState.APPROACHING);
                    this.stableStartTime = null;
                } else {
                    // Check if stable duration met
                    const stableDuration = Date.now() - this.stableStartTime;
                    if (stableDuration >= this.config.stabilityDuration) {
                        this.setState(CaptureState.CAPTURE_READY);
                    }
                }
                break;

            case CaptureState.CAPTURE_READY:
                // Maintain lock or fall back
                if (!isStable || totalError > this.config.lockThreshold) {
                    this.setState(CaptureState.ALIGNING);
                    this.stableStartTime = null;
                }
                break;

            case CaptureState.CAPTURING:
                // Stay in capturing until external reset
                break;

            case CaptureState.CAPTURED:
                // Stay in captured until external reset
                break;
        }

        return this.state;
    }

    /**
     * Check if capture is allowed
     */
    canCapture() {
        return this.state === CaptureState.CAPTURE_READY;
    }

    /**
     * Get stability progress (0 to 1)
     */
    getStabilityProgress() {
        if (this.state === CaptureState.CAPTURE_READY) return 1;
        if (this.state !== CaptureState.STABLE || !this.stableStartTime) {
            return 0;
        }
        const elapsed = Date.now() - this.stableStartTime;
        return Math.min(1, elapsed / this.config.stabilityDuration);
    }

    /**
     * Trigger capture
     */
    capture() {
        if (this.canCapture()) {
            this.setState(CaptureState.CAPTURING);
            return true;
        }
        return false;
    }

    /**
     * Reset to next target
     */
    reset() {
        this.setState(CaptureState.IDLE);
        this.currentTarget = null;
        this.stableStartTime = null;
    }

    /**
     * Mark capture as complete
     */
    complete() {
        this.setState(CaptureState.CAPTURED);
    }

    /**
     * Internal state setter
     */
    setState(newState) {
        if (this.state !== newState) {
            this.state = newState;
            this.lastStateChange = Date.now();
        }
    }

    /**
     * Get visual feedback data
     */
    getVisualState() {
        return {
            state: this.state,
            progress: this.getStabilityProgress(),
            canCapture: this.canCapture(),
            color: this.getStateColor(),
            message: this.getStateMessage()
        };
    }

    getStateColor() {
        switch (this.state) {
            case CaptureState.IDLE: return '#666';
            case CaptureState.APPROACHING: return '#FFA500';
            case CaptureState.ALIGNING: return '#FFFF00';
            case CaptureState.STABLE: return '#90EE90';
            case CaptureState.CAPTURE_READY: return '#00FF00';
            case CaptureState.CAPTURING: return '#00FFFF';
            case CaptureState.CAPTURED: return '#0080FF';
            default: return '#666';
        }
    }

    getStateMessage() {
        switch (this.state) {
            case CaptureState.IDLE: return 'Find the dot';
            case CaptureState.APPROACHING: return 'Getting closer...';
            case CaptureState.ALIGNING: return 'Hold steady...';
            case CaptureState.STABLE: return 'Stabilizing...';
            case CaptureState.CAPTURE_READY: return 'READY! Hold or tap 📷';
            case CaptureState.CAPTURING: return 'Capturing...';
            case CaptureState.CAPTURED: return 'Captured!';
            default: return '';
        }
    }
}
