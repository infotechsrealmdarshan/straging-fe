/**
 * captureService.js - PERSISTENT EDITION
 * Uses IndexedDB to ensure captured images survive page refreshes and crashes.
 * Only the "CLEAR" button will discard data.
 */
class CaptureService {
    constructor() {
        this.dbName = "Stager360_CaptureDB";
        this.storeName = "frames";
        this.manifestKey = "current_manifest";
        this.db = null;
        this._initDB();

        // Initial in-memory state
        this.manifest = {
            id: `tour_${Date.now()}`,
            frames: []
        };
        this.blobs = new Map();
    }

    async _initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                this.loadFromStorage().then(resolve);
            };
            request.onerror = (e) => reject(e);
        });
    }

    async saveToStorage() {
        if (!this.db) return;
        const tx = this.db.transaction(this.storeName, "readwrite");
        const store = tx.objectStore(this.storeName);

        // Save manifest
        store.put(this.manifest, this.manifestKey);

        // Save blobs
        this.blobs.forEach((blob, id) => {
            store.put(blob, id);
        });
    }

    async loadFromStorage() {
        if (!this.db) return;
        return new Promise((resolve) => {
            const tx = this.db.transaction(this.storeName, "readonly");
            const store = tx.objectStore(this.storeName);

            const manifestReq = store.get(this.manifestKey);
            manifestReq.onsuccess = () => {
                if (manifestReq.result) {
                    this.manifest = manifestReq.result;
                    // Load all frames from the manifest
                    let loaded = 0;
                    if (this.manifest.frames.length === 0) resolve();

                    this.manifest.frames.forEach(f => {
                        const blobReq = store.get(f.id);
                        blobReq.onsuccess = () => {
                            if (blobReq.result) {
                                this.blobs.set(f.id, blobReq.result);
                            }
                            loaded++;
                            if (loaded === this.manifest.frames.length) resolve();
                        };
                    });
                } else {
                    resolve();
                }
            };
        });
    }

    async reset() {
        this.manifest = { id: `tour_${Date.now()}`, frames: [] };
        this.blobs.clear();

        if (this.db) {
            const tx = this.db.transaction(this.storeName, "readwrite");
            tx.objectStore(this.storeName).clear();
        }
    }

    addFrame(frameData, blob) {
        const frameId = `frame_${this.manifest.frames.length}.jpg`;
        const frameRecord = {
            id: frameId,
            timestamp: Date.now(),
            sensors: {
                yaw: frameData.yaw,
                pitch: frameData.pitch,
                roll: frameData.roll || 0
            },
            camera: {
                hfov: frameData.hfov || 75
            }
        };

        this.manifest.frames.push(frameRecord);
        this.blobs.set(frameId, blob);

        this.saveToStorage(); // Background persistence
        return frameRecord;
    }

    getManifest() {
        return this.manifest;
    }
}

export const captureService = new CaptureService();
