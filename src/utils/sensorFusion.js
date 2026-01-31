import * as THREE from 'three';

/**
 * SensorFusion.js - ULTRA-STABLE EDITION
 * High-damping filters for rock-solid 360 world anchoring.
 */
export class SensorFusion {
    constructor() {
        this.alpha = 0.6; // Increased for minimum lag during capture orientation sensing

        this.data = {
            smoothed: { yaw: 0, pitch: 0, roll: 0 },
            previous: { yaw: 0, pitch: 0, roll: 0 },
            velocity: { yaw: 0, pitch: 0, roll: 0 },
            lastUpdate: Date.now(),
            refYaw: null,
            calibrated: false
        };

        this.euler = new THREE.Euler();
        this.q_device = new THREE.Quaternion();
        this.q_comp = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
    }

    update(event) {
        if (!event || event.beta === null) return this.data.smoothed;

        const now = Date.now();
        const dt = (now - this.data.lastUpdate) / 1000;
        this.data.lastUpdate = now;

        const alpha = event.alpha ? THREE.MathUtils.degToRad(event.alpha) : 0;
        const beta = event.beta ? THREE.MathUtils.degToRad(event.beta) : 0;
        const gamma = event.gamma ? THREE.MathUtils.degToRad(event.gamma) : 0;

        // Standard W3C -> Three.js mapping
        // We use 'ZXY' because alpha is around Z, then beta around X, then gamma around Y
        const euler = new THREE.Euler(beta, gamma, alpha, 'ZXY');
        this.q_device.setFromEuler(euler);

        // Adjust for portrait orientation:
        // By default, 0,0,0 is phone flat on the table facing North.
        // We want 0,0,0 to be phone held upright (90deg tilt) facing forward.
        this.q_device.premultiply(this.q_comp); // Apply -90 degree X rotation

        // Extract "World" Euler angles
        // In this world: 
        // Y = Vertical Axis (Rotation around this is Body Yaw)
        // X = Side Axis (Tilt up/down)
        // Z = Forward Axis (Side-to-side tilt / Roll)
        this.euler.setFromQuaternion(this.q_device, 'YXZ');

        // INVERSION FIX: Negating Yaw so physical movement matches virtual world direction
        let rawYaw = -THREE.MathUtils.radToDeg(this.euler.y);
        let rawPitch = THREE.MathUtils.radToDeg(this.euler.x);
        let rawRoll = THREE.MathUtils.radToDeg(this.euler.z);

        // Normalize Yaw 0-360
        rawYaw = (rawYaw + 360) % 360;

        if (!this.data.calibrated) {
            this.data.smoothed = { yaw: rawYaw, pitch: rawPitch, roll: rawRoll };
            this.data.previous = { ...this.data.smoothed };
            this.data.calibrated = true;
            return this.data.smoothed;
        }

        // EMA Filtering
        this.data.smoothed.yaw = this.emaCircular(this.data.smoothed.yaw, rawYaw, this.alpha);
        this.data.smoothed.pitch = this.emaLinear(this.data.smoothed.pitch, rawPitch, this.alpha);
        this.data.smoothed.roll = this.emaLinear(this.data.smoothed.roll, rawRoll, this.alpha);

        // Velocity tracking
        if (dt > 0) {
            this.data.velocity = {
                yaw: this.angleDiff(this.data.smoothed.yaw, this.data.previous.yaw) / dt,
                pitch: (this.data.smoothed.pitch - this.data.previous.pitch) / dt,
                roll: (this.data.smoothed.roll - this.data.previous.roll) / dt
            };
        }

        this.data.previous = { ...this.data.smoothed };
        return this.data.smoothed;
    }

    emaLinear(prev, curr, a) {
        return prev + a * (curr - prev);
    }

    emaCircular(prev, curr, a) {
        let diff = curr - prev;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        return (prev + a * diff + 360) % 360;
    }

    calibrate() {
        this.data.refYaw = this.data.smoothed.yaw;
    }

    getRelativeYaw() {
        if (this.data.refYaw === null) return 0;
        let diff = this.data.smoothed.yaw - this.data.refYaw;
        while (diff < 0) diff += 360;
        while (diff >= 360) diff -= 360;
        return diff;
    }

    getPitch() { return this.data.smoothed.pitch; }
    getRoll() { return this.data.smoothed.roll; }

    angleDiff(a, b) {
        let diff = a - b;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        return diff;
    }

    isStable(thresholds = { yaw: 4, pitch: 4 }) {
        return (
            Math.abs(this.data.velocity.yaw) < thresholds.yaw &&
            Math.abs(this.data.velocity.pitch) < thresholds.pitch
        );
    }

    getAngularSpeed() {
        return Math.sqrt(this.data.velocity.yaw ** 2 + this.data.velocity.pitch ** 2);
    }
}
