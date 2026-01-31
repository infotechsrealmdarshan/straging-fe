import React, { Component } from "react";
import Pannellum from "../elements/Pannellum";
import iconBackpath from "../assets/arrow-left.png";
import iconlocationspath from "../assets/locations.png";
import iconHotspotpath from "../assets/gps.png";
import iconInfopath from "../assets/info.png";
import iconLayerspath from "../assets/prebiew.png";
import iconHospotpath from "../assets/hospot.png";
import binico from "../assets/bin.png";
import reloaderIconPath from "../assets/reloader.png";
import shareIconPath from "../assets/share.png";
import { stragingService } from "../services/straging";
import { authService } from "../services/auth";
import "./VirtualTourApp.css";

// 🔹 Pixel Perfect SVG Icons from Figma
const IconBack = () => <img src={iconBackpath} alt="Back" style={{ width: 20, height: 20 }} />;

const IconCompass = () => <img src={iconHotspotpath} alt="Hotspot" style={{ width: 20, height: 20 }} />;

const IconInfo = () => <img src={iconInfopath} alt="Info" style={{ width: 20, height: 20 }} />;

const IconLayers = () => <img src={iconLayerspath} alt="Layers" style={{ width: 20, height: 20 }} />;

const IconHotspot = () => <img src={iconlocationspath} alt="Compass" style={{ width: 20, height: 20 }} />;

const IconShare = () => <img src={shareIconPath} alt="Share" style={{ width: 18, height: 18 }} />;
import LoadingOverlay from '../elements/LoadingOverlay';

const SceneType = {
    EQUIRECTANGULAR: 'equirectangular',
    CUBEMAP: 'cubemap'
};

const PNG_OVERLAY_ACTIONS = {
    NONE: 'none',
    DRAGGING: 'dragging',
    RESIZING: 'resizing',
    ROTATING: 'rotating'
};

const RESIZE_HANDLES = {
    TOP_LEFT: 'top-left',
    TOP_RIGHT: 'top-right',
    BOTTOM_LEFT: 'bottom-left',
    BOTTOM_RIGHT: 'bottom-right'
};

const projectInfoCacheByStragingId = new Map();

class VirtualTourApp extends Component {
    constructor(props) {
        super(props);

        // 🔹 Add debouncing for refresh calls to prevent duplicates
        this.refreshTimeout = null;
        this.lastRefreshTime = 0;
        this.projectInfoTimeout = null;
        const REFRESH_DEBOUNCE_DELAY = 1000; // 1 second debounce

        // Initialize with project data if provided
        let initialScenes = props.projectData?.scenes || {};
        let initialAreas = props.projectData?.areas || [];
        let initialGlobalHotspots = props.projectData?.globalHotspots || [];

        // 🔹 Support Backend "images" structure (Per-Image Assets: Hotspots and Info)
        if (props.projectData?.images && props.projectData.images.length > 0) {
            props.projectData.images.forEach((img, index) => {
                const sceneId = img.id || img._id || `scene_${index}`;

                // Initialize scene if not exists
                if (!initialScenes[sceneId]) {
                    initialScenes[sceneId] = {
                        id: sceneId,
                        title: img.originalName || img.filename || `Location ${index + 1}`,
                        image: img.url,
                        hotspots: [],
                        pngOverlays: []
                    };
                    if (!initialAreas.find(a => a.id === sceneId)) {
                        initialAreas.push({ id: sceneId, name: initialScenes[sceneId].title });
                    }
                } else if (!initialScenes[sceneId].image) {
                    initialScenes[sceneId].image = img.url;
                }

                // 🔹 Map Hotspots from this image
                if (img.hotspots && Array.isArray(img.hotspots)) {
                    img.hotspots.forEach(hs => {
                        const pitch = 90 - (hs.y / 100) * 180;
                        const yaw = (hs.x / 100) * 360 - 180;

                        initialScenes[sceneId].hotspots.push({
                            id: hs.id || hs._id || `hs_${Date.now()}_${Math.random()}`,
                            pitch: pitch,
                            yaw: yaw,
                            type: 'navigation',
                            title: hs.locationName || 'Navigation',
                            image: hs.image, // Target image URL
                            // Try to find targetSceneId by image URL if possible
                            targetScene: props.projectData.images.find(i => i.url === hs.image)?._id || hs.targetSceneId
                        });
                    });
                }

                // 🔹 Map Info from this image
                if (img.info && Array.isArray(img.info)) {
                    img.info.forEach(inf => {
                        // 🔹 Fix coordinate conversion - x,y should map to yaw,pitch correctly
                        const pitch = 90 - (inf.y / 100) * 180;
                        const yaw = (inf.x / 100) * 360 - 180;

                        initialScenes[sceneId].hotspots.push({
                            id: inf.id || inf._id || `info_${Date.now()}_${Math.random()}`,
                            pitch: pitch,
                            yaw: yaw,
                            type: 'info',
                            title: 'Info',
                            description: inf.description
                        });
                    });
                }
            });
        }

        // 🔹 Handle Backend "areas" structure - Populate scenes with items, hotspots, and info
        if (props.projectData?.areas && props.projectData.areas.length > 0) {
            // Create areaId to _id mapping for hotspot navigation
            const areaIdMap = {};
            props.projectData.areas.forEach(area => {
                if (area.areaId && area._id) {
                    areaIdMap[area.areaId] = area._id;
                }
            });

            props.projectData.areas.forEach((area, index) => {
                const areaId = area.id || area._id || `area_${index}`;

                // Create scene for this area if it doesn't exist
                if (!initialScenes[areaId]) {
                    initialScenes[areaId] = {
                        id: areaId,
                        title: area.areaName || area.name || `Area ${index + 1}`,
                        image: area.imageUrl || "",
                        hotspots: [],
                        pngOverlays: []
                    };
                }

                // Ensure area exists in areas array
                if (!initialAreas.find(a => a.id === areaId)) {
                    initialAreas.push({
                        id: areaId,
                        name: area.areaName || area.name || `Area ${index + 1}`,
                        areaName: area.areaName || area.name || `Area ${index + 1}`
                    });
                }

                const currentScene = initialScenes[areaId];

                // 1. Map Items (PNG Overlays)
                if (area.items && Array.isArray(area.items)) {
                    area.items.forEach(item => {
                        const pitch = 90 - (item.y / 100) * 180;
                        const yaw = (item.x / 100) * 360 - 180;

                        // Check if item already exists to avoid duplicates
                        if (!currentScene.pngOverlays.find(p => p.id === (item.instanceId || item._id))) {
                            currentScene.pngOverlays.push({
                                id: item.instanceId || item._id,
                                image: item.imageUrl,
                                pitch: pitch,
                                yaw: yaw,
                                width: item.width || 200,
                                height: item.height || 200,
                                rotation: item.rotation || 0,
                                scale: 1,
                                flipX: item.flipX || false,
                                flipY: item.flipY || false,
                                mongoId: item.instanceId || item._id
                            });
                        }
                    });
                }

                // 2. Map Navigation Hotspots
                if (area.hotspots && Array.isArray(area.hotspots)) {
                    area.hotspots.forEach(hs => {
                        const pitch = 90 - (hs.y / 100) * 180;
                        const yaw = (hs.x / 100) * 360 - 180;

                        // Resolve childAreaId to MongoDB _id using areaIdMap
                        let targetSceneId = hs.childAreaId || hs.targetSceneId;
                        if (targetSceneId && areaIdMap[targetSceneId]) {
                            targetSceneId = areaIdMap[targetSceneId];
                        }

                        if (!currentScene.hotspots.find(h => h.id === (hs.hotspotId || hs._id))) {
                            currentScene.hotspots.push({
                                id: hs.hotspotId || hs._id,
                                pitch: pitch,
                                yaw: yaw,
                                type: 'navigation',
                                title: hs.title || 'Hotspot',
                                image: hs.imageUrl, // Destination image
                                targetScene: targetSceneId,
                                areaId: hs.childAreaId // Helper for navigation
                            });
                        }
                    });
                }

                // 3. Map Info Hotspots
                if (area.info && Array.isArray(area.info)) {
                    area.info.forEach(inf => {
                        const pitch = 90 - (inf.y / 100) * 180;
                        const yaw = (inf.x / 100) * 360 - 180;

                        if (!currentScene.hotspots.find(h => h.id === (inf._id || inf.id))) {
                            currentScene.hotspots.push({
                                id: inf._id || inf.id,
                                pitch: pitch,
                                yaw: yaw,
                                type: 'info',
                                title: 'Info',
                                description: inf.description
                            });
                        }
                    });
                }
            });
        }

        // 🔹 Backward compatibility for legacy structure (if any)
        if (props.projectData?.locations && props.projectData.locations.length > 0) {
            props.projectData.locations.forEach((loc, index) => {
                const sceneId = loc.id || loc._id || `scene_loc_${index}`;
                if (!initialScenes[sceneId]) {
                    initialScenes[sceneId] = {
                        id: sceneId,
                        title: loc.areaName || `Location ${index + 1}`,
                        image: (loc.images && loc.images.length > 0) ? loc.images[0].url : "",
                        hotspots: [],
                        pngOverlays: []
                    };
                    if (!initialAreas.find(a => a.id === sceneId)) {
                        initialAreas.push({ id: sceneId, name: initialScenes[sceneId].title });
                    }
                }
            });
        }

        // Determine initial current scene
        let currentScene = props.projectData?.currentScene;
        const sceneKeys = Object.keys(initialScenes);

        // If currentScene is not in initialScenes or is missing, pick the first valid one
        if (!currentScene || !initialScenes[currentScene]) {
            // Prefer a scene that actually has an image if possible
            currentScene = sceneKeys.find(key => initialScenes[key].image) || sceneKeys[0] || null;
        }

        // 🔹 Handle project-level info as a global hotspot if it has coordinates
        let projectInfoArray = [];
        if (props.projectData?.info) {
            if (Array.isArray(props.projectData.info)) {
                projectInfoArray = props.projectData.info;
            } else if (typeof props.projectData.info === 'object') {
                projectInfoArray = [props.projectData.info];
            }
        }

        // 🔹 Handle project-level hotspots (navigation hotspots)
        let projectHotspotsArray = [];
        if (props.projectData?.hotspots) {
            if (Array.isArray(props.projectData.hotspots)) {
                projectHotspotsArray = props.projectData.hotspots;
            } else if (typeof props.projectData.hotspots === 'object') {
                projectHotspotsArray = [props.projectData.hotspots];
            }
        }

        // 🔹 Add info hotspots to global hotspots
        projectInfoArray.forEach((infoEntry, index) => {
            if (infoEntry && infoEntry.x !== undefined && infoEntry.y !== undefined) {
                // 🔹 Fix coordinate conversion - x,y should map to yaw,pitch correctly
                const pitch = 90 - (infoEntry.y / 100) * 180;
                const yaw = (infoEntry.x / 100) * 360 - 180;

                initialGlobalHotspots.push({
                    id: infoEntry.id || infoEntry._id || `project_info_hotspot_${index}`,
                    pitch: pitch,
                    yaw: yaw,
                    type: 'info',
                    title: infoEntry.title || 'Project Info',
                    description: infoEntry.description
                });
            }
        });

        // 🔹 Add navigation hotspots to global hotspots
        projectHotspotsArray.forEach((hotspotEntry, index) => {
            if (hotspotEntry && hotspotEntry.x !== undefined && hotspotEntry.y !== undefined) {
                const pitch = 90 - (hotspotEntry.y / 100) * 180;
                const yaw = (hotspotEntry.x / 100) * 360 - 180;

                initialGlobalHotspots.push({
                    id: hotspotEntry._id || `project_hotspot_${index}`,
                    pitch: pitch,
                    yaw: yaw,
                    type: 'navigation',
                    title: hotspotEntry.title || 'Hotspot',
                    image: hotspotEntry.imageUrl,
                    targetScene: hotspotEntry.targetScene || hotspotEntry.areaId,
                    areaId: hotspotEntry.areaId || hotspotEntry.targetScene
                });
            }
        });

        this.state = {
            currentScene: currentScene,
            scenes: initialScenes,
            areas: initialAreas,
            showLocationDialog: false,
            showSelectAreaSlider: false,
            showHotspotOverlay: false,
            selectedHotspot: null,
            selectedArea: null,
            draggedImage: null,
            uploadedImage: null,
            selectedLocation: "",
            locationAreaName: "",
            showDeleteDialog: false,
            areaToDelete: null,
            showAddItemsDialog: false,
            newItemImage: null,
            showAddAreaDialog: false,
            newAreaName: "",
            newAreaImage: null,
            showPlacementModal: false,
            pendingHotspotPos: null,
            hotspotName: "",
            viewerYaw: 180,
            viewerPitch: 0,
            viewerHfov: 100,
            isAnimating: false,
            mouseX: 0,
            mouseY: 0,
            globalPngOverlays: props.projectData?.globalPngOverlays || [],
            globalHotspots: initialGlobalHotspots,
            ttsEnabled: true,
            hoveredInfoHotspotId: null,
            speakingHotspotId: null,
            itemLibrary: (() => {
                const pd = props.projectData;
                let rawItems = [];
                if (pd) {
                    if (pd.project && Array.isArray(pd.project.items)) {
                        rawItems = pd.project.items;
                    } else if (pd.items && Array.isArray(pd.items)) {
                        rawItems = pd.items;
                    }
                }
                return rawItems.map(item => ({
                    id: item.itemId || item._id,
                    image: item.imageUrl || item.image,
                    name: item.imageName || item.name || "Item",
                    itemId: item.itemId || item._id
                }));
            })(),

            // Missing initial states to prevent TypeError
            hotspotPlacementActive: false,
            infoHotspotPlacementActive: false,
            showInfoHotspotDialog: false,
            infoHotspotDescription: "",
            pendingInfoHotspotPos: null,

            // PNG Transformation State
            selectedPNGOverlay: null,
            pngOverlayAction: PNG_OVERLAY_ACTIONS.NONE,
            activeResizeHandle: null,
            pngTransformState: {
                originalPosition: null,
                originalSize: null,
                originalRotation: 0,
                startMousePos: { x: 0, y: 0 }
            },
            mouseDownTime: null,
            mouseDownPosition: null,
            isViewMode: props.isViewMode || false, // Flag for view-only mode
            currentTourId: null, // Store current tour ID for updates

            // Project Info State
            showProjectInfoDialog: false,
            projectInfoEntries: projectInfoArray,
            projectInfoTitle: (projectInfoArray[0]?.title) || props.projectData?.projectName || "",
            projectInfoDescription: (projectInfoArray[0]?.description) || "",

            isLoading: false,
            loadingMessage: "Processing...",
            showItemDeleteDialog: false,
            itemToDeleteId: null,
            showLibItemDeleteDialog: false,
            libItemToDeleteId: null
        };
        this.latestMousePos = { x: 0, y: 0 };
        this.viewerRef = React.createRef();
        this.containerRef = React.createRef();
        this.overlayCanvasRef = React.createRef();
        this.fileInputRef = React.createRef();
        this.itemFileInputRef = React.createRef();
        this.animationFrame = null;

        // Preload reloader icon for canvas
        this.reloaderImage = new Image();
        this.reloaderImage.src = reloaderIconPath;

        // 🔹 API Call Guards
        this.isFetchingProjectInfo = false;
        this.lastProjectInfoFetchTime = 0;
    }

    // 🔹 Start tracking viewer rotation and render loop
    startTrackingViewerRotation = () => {
        const updateLoop = () => {
            const viewer = this.viewerRef.current?.getViewer?.();
            if (viewer) {
                try {
                    const yaw = viewer.getYaw();
                    const pitch = viewer.getPitch();
                    const hfov = viewer.getHfov();

                    if (yaw !== undefined && pitch !== undefined && hfov !== undefined) {
                        const viewerData = { yaw, pitch, hfov };
                        this.latestViewerData = viewerData; // Synchronous source of truth

                        // Render immediately with fresh data
                        this.renderHotspotsCanvas(viewerData);
                        this.renderPNGOverlaysCanvas(viewerData);

                        // Update state lazily if needed - SKIP if animating to avoid fighting viewer
                        if (!this.state.isAnimating) {
                            if (
                                Math.abs(this.state.viewerYaw - yaw) > 0.01 ||
                                Math.abs(this.state.viewerPitch - pitch) > 0.01 ||
                                Math.abs(this.state.viewerHfov - hfov) > 0.01
                            ) {
                                this.setState({
                                    viewerYaw: yaw,
                                    viewerPitch: pitch,
                                    viewerHfov: hfov
                                });
                            }
                        }
                    }
                } catch (error) {
                    // Viewer might not be ready yet
                }
            }
            this.animationFrame = requestAnimationFrame(updateLoop);
        };
        updateLoop();
    };

    // 🔹 Project 360 coordinates to Screen coordinates
    projectToScreen = (yaw, pitch, viewerYaw, viewerPitch, hfov, width, height) => {
        const d2r = Math.PI / 180;
        let yawDiff = yaw - viewerYaw;
        while (yawDiff > 180) yawDiff -= 360;
        while (yawDiff < -180) yawDiff += 360;

        const lambda = yawDiff * d2r;
        const phi = pitch * d2r;
        const phi0 = viewerPitch * d2r;

        const cos_c = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(lambda);
        if (cos_c <= 0) return null;

        const x_proj = (Math.cos(phi) * Math.sin(lambda)) / cos_c;
        const y_proj = (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(lambda)) / cos_c;

        const f = (0.5 * width) / Math.tan(0.5 * hfov * d2r);

        return {
            x: x_proj * f + width / 2,
            y: height / 2 - y_proj * f,
            z: cos_c
        };
    };



    // 🔹 Render Hotspots on Canvas (Sticky Behavior)
    renderHotspotsCanvas = (viewerOverride = null) => {
        const canvas = this.overlayCanvasRef.current;
        const container = this.containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        const { currentScene, scenes, viewerYaw, viewerPitch, viewerHfov } = this.state;
        const viewerData = viewerOverride || { yaw: viewerYaw, pitch: viewerPitch, hfov: viewerHfov || 100 };
        const activeScene = scenes[currentScene];

        const containerRect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        if (canvas.width !== containerRect.width * dpr || canvas.height !== containerRect.height * dpr) {
            canvas.width = containerRect.width * dpr;
            canvas.height = containerRect.height * dpr;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(dpr, dpr);

        const allHotspots = [...(activeScene?.hotspots || []), ...this.state.globalHotspots];

        if (allHotspots.length > 0) {
            // Use synchronous mouse position
            const currentMouseX = this.latestMousePos.x - containerRect.left;
            const currentMouseY = this.latestMousePos.y - containerRect.top;

            allHotspots.forEach(hotspot => {
                const projected = this.projectToScreen(
                    hotspot.yaw,
                    hotspot.pitch,
                    viewerData.yaw,
                    viewerData.pitch,
                    viewerData.hfov || 100,
                    containerRect.width,
                    containerRect.height
                );

                if (projected) {
                    const distance = Math.sqrt(Math.pow(currentMouseX - projected.x, 2) + Math.pow(currentMouseY - projected.y, 2));
                    const isHovered = distance < 25;

                    // Handle text-to-speech for info hotspots on hover
                    if (hotspot.type === 'info' && isHovered && hotspot.description) {
                        // If this hotspot is newly hovered and not already speaking, start speaking
                        if (this.state.hoveredInfoHotspotId !== hotspot.id && this.state.speakingHotspotId !== hotspot.id) {
                            this.setState({ hoveredInfoHotspotId: hotspot.id });
                            this.speakText(hotspot.description, hotspot.id);
                        }
                    } else if (hotspot.type === 'info' && !isHovered && this.state.hoveredInfoHotspotId === hotspot.id) {
                        // Mouse left this hotspot, stop speaking if it was this one
                        this.setState({ hoveredInfoHotspotId: null });
                        if (this.state.speakingHotspotId === hotspot.id) {
                            this.stopSpeaking();
                        }
                    }

                    // 🔹 Perspective Scaling: Scale icon based on zoom level (hfov)
                    // Reference hfov is 100. If we zoom in (hfov < 100), the icon should get larger.
                    const currentHfov = viewerData.hfov || 100;
                    const perspectiveScale = Math.max(0.5, Math.min(2.0, 100 / currentHfov));
                    const imgW = 20 * perspectiveScale;
                    const imgH = 20 * perspectiveScale;

                    // 🔹 Draw Hotspot Icon
                    ctx.save();
                    ctx.translate(projected.x, projected.y);

                    if (hotspot.type === 'info') {
                        // 🔹 Premium Info Hotspot: 12x12 icon, 10px padding, blurred black bg
                        const iconSize = 12 * perspectiveScale;
                        const padding = 10 * perspectiveScale;
                        const totalSize = iconSize + (padding * 2);

                        // Draw Circular Background (Black 50% with subtle blur/glow)
                        ctx.beginPath();
                        ctx.arc(0, 0, totalSize / 2, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';

                        // Simulate blur/depth with a shadow
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                        ctx.shadowBlur = 8 * perspectiveScale;
                        ctx.fill();

                        // Reset shadow for icon
                        ctx.shadowBlur = 0;

                        if (!this.infoIconMain) {
                            this.infoIconMain = new Image();
                            this.infoIconMain.src = iconInfopath;
                        }
                        const img = this.infoIconMain;
                        if (img.complete && img.naturalWidth > 0) {
                            // Draw 12x12 info icon centered
                            ctx.drawImage(img, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
                        }
                    }
                    else {
                        // For Navigation Hotspots: Use Pin (hospot.png) + Type Icon
                        if (!this.hotspotMainImg) {
                            this.hotspotMainImg = new Image();
                            this.hotspotMainImg.src = iconHospotpath;
                        }
                        if (this.hotspotMainImg.complete && this.hotspotMainImg.naturalWidth > 0) {
                            ctx.drawImage(this.hotspotMainImg, -imgW / 2, -imgH, imgW, imgH);
                        }

                        // Draw Inner Icon if not hovered
                        if (!isHovered) {
                            if (!this.previewIconImg) {
                                this.previewIconImg = new Image();
                                this.previewIconImg.src = iconLayerspath;
                            }
                            if (this.previewIconImg.complete && this.previewIconImg.naturalWidth > 0) {
                                ctx.drawImage(this.previewIconImg, -3, -16, 6, 6);
                            }
                        }
                    }

                    // 🔹 Figma Tooltip Card (Hover Preview)
                    if (isHovered) {
                        ctx.restore(); // Exit Pin translate
                        ctx.save();

                        if (hotspot.type === 'info') {
                            // Text-focused tooltip for info hotspots
                            const description = hotspot.description || "";
                            ctx.font = '500 14px Inter, sans-serif';
                            const textMetrics = ctx.measureText(description);
                            const padding = 15;
                            const cardWidth = Math.min(250, textMetrics.width + padding * 2);

                            // Wrap text if too long
                            const words = description.split(' ');
                            let line = '';
                            let lines = [];
                            for (let n = 0; n < words.length; n++) {
                                let testLine = line + words[n] + ' ';
                                let metrics = ctx.measureText(testLine);
                                let testWidth = metrics.width;
                                if (testWidth > cardWidth - padding * 2 && n > 0) {
                                    lines.push(line);
                                    line = words[n] + ' ';
                                } else {
                                    line = testLine;
                                }
                            }
                            lines.push(line);

                            const lineHeight = 20;
                            const cardHeight = lines.length * lineHeight + padding * 2;
                            const cardX = projected.x - cardWidth / 2;
                            const cardY = projected.y - cardHeight - 35;
                            const radius = 12;

                            // Draw background
                            ctx.beginPath();
                            ctx.roundRect(cardX, cardY, cardWidth, cardHeight, radius);
                            ctx.fillStyle = 'rgba(10, 10, 10, 0.85)';
                            ctx.fill();
                            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                            ctx.lineWidth = 1;
                            ctx.stroke();

                            // Draw text lines
                            ctx.fillStyle = 'white';
                            ctx.textAlign = 'left';
                            ctx.textBaseline = 'top';
                            lines.forEach((line, i) => {
                                ctx.fillText(line.trim(), cardX + padding, cardY + padding + i * lineHeight);
                            });

                        } else {
                            // Destination card for navigation hotspots
                            const cardWidth = 190;
                            const cardHeight = 140;
                            const cardX = projected.x - cardWidth / 2;
                            const cardY = projected.y - cardHeight - 40;
                            const radius = 16;

                            // Clip all contents to card rounded rect
                            ctx.save();
                            ctx.beginPath();
                            ctx.roundRect(cardX, cardY, cardWidth, cardHeight, radius);
                            ctx.clip();

                            // Draw Destination Image (Fills card)
                            if (hotspot.image) {
                                if (!hotspot.imgElement) {
                                    hotspot.imgElement = new Image();
                                    hotspot.imgElement.src = hotspot.image;
                                    hotspot.imgElement.onerror = () => { hotspot.imageBroken = true; };
                                }
                                if (hotspot.imgElement.complete && !hotspot.imageBroken && hotspot.imgElement.naturalWidth > 0) {
                                    ctx.drawImage(hotspot.imgElement, cardX, cardY, cardWidth, cardHeight);
                                }
                            } else {
                                ctx.fillStyle = '#111';
                                ctx.fillRect(cardX, cardY, cardWidth, cardHeight);
                            }

                            // Draw Dark Overlay for text (Bottom band)
                            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                            ctx.fillRect(cardX, cardY + cardHeight - 45, cardWidth, 45);

                            // Text Label
                            ctx.fillStyle = 'white';
                            ctx.font = '600 15px Inter, sans-serif';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(hotspot.title || "Next Room", projected.x, cardY + cardHeight - 22.5);

                            ctx.restore(); // Exit clip

                            // Draw subtle stroke
                            ctx.beginPath();
                            ctx.roundRect(cardX, cardY, cardWidth, cardHeight, radius);
                            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                            ctx.lineWidth = 1;
                            ctx.stroke();
                        }

                        ctx.restore();
                    } else {
                        ctx.restore();
                    }
                }
            });
        }

        // Render PNG overlays ONCE after (or before) hotspots
        this.renderPNGOverlaysCanvas(viewerData);

        ctx.restore();
    };

    // 🔹 Render PNG overlays on canvas
    renderPNGOverlaysCanvas = (viewerData = null) => {
        const canvas = this.overlayCanvasRef.current;
        const container = this.containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        const { currentScene, scenes, selectedPNGOverlay } = this.state;
        const activeScene = scenes[currentScene];
        const allPngOverlays = [...(activeScene?.pngOverlays || []), ...this.state.globalPngOverlays];

        const containerRect = container.getBoundingClientRect();

        // Remove clearRect because renderHotspotsCanvas already cleared it
        // ctx.clearRect(0, 0, canvas.width, canvas.height); 

        allPngOverlays.forEach(png => {
            if (!png.imageElement && png.image) {
                png.imageElement = new Image();
                png.imageElement.src = png.image;
                png.imageElement.onload = () => {
                    // Store original natural dimensions once
                    if (!png.naturalWidth) png.naturalWidth = png.imageElement.naturalWidth;
                    if (!png.naturalHeight) png.naturalHeight = png.imageElement.naturalHeight;

                    if (!png.width) png.width = png.naturalWidth / 2;
                    if (!png.height) png.height = png.naturalHeight / 2;
                };
            }

            if (!png.imageElement || !png.imageElement.complete) return;

            const projected = this.projectToScreen(
                png.yaw,
                png.pitch,
                viewerData?.yaw || this.state.viewerYaw,
                viewerData?.pitch || this.state.viewerPitch,
                viewerData?.hfov || this.state.viewerHfov,
                containerRect.width,
                containerRect.height
            );

            if (!projected) return;

            const d2r = Math.PI / 180;
            const fovFactor = 1 / Math.tan((viewerData?.hfov || this.state.viewerHfov) * 0.5 * d2r);
            const perspectiveScale = fovFactor * (1 / Math.max(0.01, projected.z));
            const scaleFactor = (png.scale || 1) * perspectiveScale;

            const displayWidth = (png.width || png.imageElement.naturalWidth || 100) * scaleFactor;
            const displayHeight = (png.height || png.imageElement.naturalHeight || 100) * scaleFactor;

            ctx.save();
            ctx.translate(projected.x, projected.y);
            ctx.rotate((png.rotation || 0) * Math.PI / 180);

            // Apply Flip
            ctx.scale(png.flipX ? -1 : 1, png.flipY ? -1 : 1);

            // Draw selection box if selected
            if (png.id === selectedPNGOverlay) {
                const padding = 25; // Consistent padding for item within box
                const borderRadius = 10; // Updated to 10px radius
                const rectX = -displayWidth / 2 - padding;
                const rectY = -displayHeight - padding;
                const rectW = displayWidth + padding * 2;
                const rectH = displayHeight + padding * 2;

                // 🔹 Premium Dotted/Dashed White Border (Thinned for Image 2 look)
                ctx.save();
                ctx.strokeStyle = 'rgba(255, 255, 255, 1.0)';
                ctx.lineWidth = 2.5; // Thinned to remove "heavy" look
                ctx.setLineDash([7, 7]);

                if (ctx.roundRect) {
                    ctx.beginPath();
                    ctx.roundRect(rectX, rectY, rectW, rectH, borderRadius);
                    ctx.stroke();
                } else {
                    ctx.beginPath();
                    ctx.moveTo(rectX + borderRadius, rectY);
                    ctx.lineTo(rectX + rectW - borderRadius, rectY);
                    ctx.quadraticCurveTo(rectX + rectW, rectY, rectX + rectW, rectY + borderRadius);
                    ctx.lineTo(rectX + rectW, rectY + rectH - borderRadius);
                    ctx.quadraticCurveTo(rectX + rectW, rectY + rectH, rectX + rectW - borderRadius, rectY + rectH);
                    ctx.lineTo(rectX + borderRadius, rectY + rectH);
                    ctx.quadraticCurveTo(rectX, rectY + rectH, rectX, rectY + rectH - borderRadius);
                    ctx.lineTo(rectX, rectY + borderRadius);
                    ctx.quadraticCurveTo(rectX, rectY, rectX + borderRadius, rectY);
                    ctx.stroke();
                }
                ctx.restore();

                // 🔹 Adjusted Rotation handle spacing (10px gap)
                const rotY = rectY - 22; // Icon center
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(0, rectY);
                ctx.lineTo(0, rectY - 10);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.lineWidth = 2.0;
                ctx.setLineDash([4, 3]);
                ctx.stroke();
                ctx.restore();

                // 🔹 Perfected Rotation Icon Size (Using reloader.png from Image 1)
                ctx.save();
                ctx.translate(0, rotY);

                const iconSize = 20; // Resized to 20x20 as requested
                if (this.reloaderImage && this.reloaderImage.complete) {
                    ctx.drawImage(
                        this.reloaderImage,
                        -iconSize / 2,
                        -iconSize / 2,
                        iconSize,
                        iconSize
                    );
                } else {
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(0, 0, 15, 0, Math.PI * 2);
                    ctx.stroke();
                }

                ctx.restore();

                // 🔹 Update handle positions for hit testing (with enlarged hit zones)
                const cos = Math.cos((png.rotation || 0) * Math.PI / 180);
                const sin = Math.sin((png.rotation || 0) * Math.PI / 180);

                const sX = png.flipX ? -1 : 1;
                const sY = png.flipY ? -1 : 1;

                png.resizeHandles = {
                    [RESIZE_HANDLES.TOP_LEFT]: {
                        x: projected.x + ((rectX * sX) * cos - (rectY * sY) * sin),
                        y: projected.y + ((rectX * sX) * sin + (rectY * sY) * cos)
                    },
                    [RESIZE_HANDLES.TOP_RIGHT]: {
                        x: projected.x + (((rectX + rectW) * sX) * cos - (rectY * sY) * sin),
                        y: projected.y + (((rectX + rectW) * sX) * sin + (rectY * sY) * cos)
                    },
                    [RESIZE_HANDLES.BOTTOM_LEFT]: {
                        x: projected.x + ((rectX * sX) * cos - ((rectY + rectH) * sY) * sin),
                        y: projected.y + ((rectX * sX) * sin + ((rectY + rectH) * sY) * cos)
                    },
                    [RESIZE_HANDLES.BOTTOM_RIGHT]: {
                        x: projected.x + (((rectX + rectW) * sX) * cos - ((rectY + rectH) * sY) * sin),
                        y: projected.y + (((rectX + rectW) * sX) * sin + ((rectY + rectH) * sY) * cos)
                    },
                    'rotating': {
                        x: projected.x + ((0 * sX) * cos - (rotY * sY) * sin),
                        y: projected.y + ((0 * sX) * sin + (rotY * sY) * cos),
                        radius: 35 // Generous hit area for the rotation handle
                    }
                };
            }

            ctx.drawImage(
                png.imageElement,
                -displayWidth / 2,
                -displayHeight, // Anchor to bottom-center
                displayWidth,
                displayHeight
            );

            ctx.restore();
        });
    };

    // 🔹 Text-to-Speech functionality for info hotspots
    speechSynthesis = window.speechSynthesis;
    currentUtterance = null;

    speakText = (text, hotspotId) => {
        // Only speak if TTS is enabled
        if (!this.state.ttsEnabled) {
            return;
        }

        // Check if speech synthesis is available
        if (!this.speechSynthesis) {
            console.warn('Speech synthesis not available in this browser');
            return;
        }

        // Stop any current speech
        this.stopSpeaking();

        if (typeof text !== 'string' || !text.trim()) {
            console.warn('Invalid text for speech synthesis:', text);
            return;
        }

        try {
            // Get voices - they might not be loaded yet
            const voices = this.speechSynthesis.getVoices();

            // If no voices available, try again after a short delay
            if (voices.length === 0) {
                console.warn('No voices available yet, speech synthesis skipped');
                return;
            }

            // Create speech utterance
            const utterance = new SpeechSynthesisUtterance(text.trim());

            // Set voice properties for better quality
            utterance.rate = 0.95; // Slightly slower for better comprehension
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            // Try to use a good voice (prefer English voices)
            const preferredVoice = voices.find(voice =>
                voice.lang.includes('en') && voice.localService
            ) || voices.find(voice => voice.lang.includes('en')) || voices[0];

            if (preferredVoice) {
                utterance.voice = preferredVoice;
            }

            // Handle speech events
            utterance.onend = () => {
                if (this.state.speakingHotspotId === hotspotId) {
                    this.setState({ speakingHotspotId: null });
                }
                this.currentUtterance = null;
            };

            utterance.onerror = (event) => {
                // Silently handle errors - TTS is a nice-to-have feature
                console.warn('Speech synthesis error (non-critical):', event.error);
                this.setState({ speakingHotspotId: null });
                this.currentUtterance = null;
            };

            // Store reference and start speaking
            this.currentUtterance = utterance;
            this.setState({ speakingHotspotId: hotspotId });
            this.speechSynthesis.speak(utterance);
        } catch (error) {
            console.warn('Error initializing speech synthesis:', error);
            this.setState({ speakingHotspotId: null });
        }
    };

    stopSpeaking = () => {
        if (this.speechSynthesis && this.speechSynthesis.speaking) {
            this.speechSynthesis.cancel();
        }
        this.currentUtterance = null;
        this.setState({ speakingHotspotId: null });
    };

    // Toggle TTS on/off
    toggleTTS = () => {
        const newTTSState = !this.state.ttsEnabled;
        this.setState({ ttsEnabled: newTTSState }, () => {
            if (!newTTSState) {
                // If disabling TTS, stop speaking
                this.stopSpeaking();
            }
        });
    };

    componentDidMount() {
        this.startTrackingViewerRotation();
        window.addEventListener("resize", this.handleResize);

        // Check if this is a shared view
        const urlParams = new URLSearchParams(window.location.search);
        const tourId = urlParams.get('tour');
        const viewData = urlParams.get('view');

        if (tourId) {
            // First try to load from local storage (legacy/preview)
            const loaded = this.loadTourById(tourId);

            if (loaded) {
                this.setState({ isViewMode: true, currentTourId: tourId });
            } else {
                // If not found locally, try fetching from public API
                console.log("Tour not found locally, fetching from public API:", tourId);
                this.fetchPublicTour(tourId);
            }
        } else if (viewData === 'latest') {
            // In view mode, always load the latest data from localStorage
            this.loadLatestTourData();
            this.setState({ isViewMode: true });
        } else if (viewData) {
            // Handle old format shared URLs (backward compatibility)
            try {
                const decodedData = JSON.parse(atob(viewData));
                this.setState({
                    currentScene: decodedData.currentScene,
                    scenes: decodedData.scenes,
                    areas: decodedData.areas,
                    globalHotspots: decodedData.globalHotspots,
                    globalPngOverlays: decodedData.globalPngOverlays,
                    isViewMode: true
                });
            } catch (error) {
                console.error('Error parsing view data:', error);
                // Fallback to loading latest data
                this.loadLatestTourData();
                this.setState({ isViewMode: true });
            }
        }

        // Pre-load voices for TTS
        if (this.speechSynthesis && this.speechSynthesis.getVoices().length === 0) {
            this.speechSynthesis.onvoiceschanged = () => {
                this.speechSynthesis.getVoices();
            };
        }
        // Add mouse event listeners for interactions (similar to demo.js)
        if (this.containerRef.current) {
            this.containerRef.current.addEventListener('mousedown', this.handleMouseDown, true);
            this.containerRef.current.addEventListener('mousemove', this.handleMouseMove);

            // CRITICAL: Document listeners must be attached for dragging to work correctly
            document.addEventListener('mousemove', this.handleDocumentMouseMove);
            document.addEventListener('mouseup', this.handleDocumentMouseUp);
        }

        this.fetchProjectInfo();
    }

    componentDidUpdate(prevProps) {
        const prevId = prevProps.projectData?._id;
        const currentId = this.props.projectData?._id;
        if (prevId !== currentId) {
            // 🔹 Debounce project info fetch to prevent duplicate API calls
            if (this.projectInfoTimeout) {
                clearTimeout(this.projectInfoTimeout);
            }

            this.projectInfoTimeout = setTimeout(() => {
                this.fetchProjectInfo();
            }, 500); // 500ms debounce
        }
    }

    fetchProjectInfo = async () => {
        if (this.state.isViewMode) return;

        const stragingId = this.props.projectData?.project?._id || this.props.projectData?._id;
        if (!stragingId) {
            console.log("No stragingId found in projectData:", this.props.projectData);
            return;
        }

        // 🔹 Prevention of duplicate/spam API calls
        if (this.isFetchingProjectInfo) {
            console.log("Project info fetch already in progress - skipping");
            return;
        }

        // Throttle: Allow only one call every 1 second
        const now = Date.now();
        if (now - this.lastProjectInfoFetchTime < 1000) {
            console.log("Throttling project info fetch - skipping");
            return;
        }

        this.isFetchingProjectInfo = true;
        this.lastProjectInfoFetchTime = now;

        this.setState({ isLoading: true, loadingMessage: "Updating project data..." });

        console.log("Fetching project info for stragingId:", stragingId);

        try {
            const { token } = authService.getAuthData();
            const response = await stragingService.getInfo(stragingId, token);

            console.log("API response:", response);

            if (response && response.data && response.data.areas) {
                const projectData = response.data;
                const areas = projectData.areas || [];

                console.log("Areas found:", areas);

                // 🔹 Update hotspots display and areas with new structure (Sync ALL scenes)
                this.syncScenesWithAreas(projectData);
            } else {
                console.log("Invalid response structure:", response);
            }
        } catch (error) {
            console.error("Error fetching project info:", error);
        } finally {
            this.setState({ isLoading: false });
            this.isFetchingProjectInfo = false;
        }
    };

    // 🔹 Sync scenes, areas, and hotspots with backend structure
    // Handles creating scenes AND areas for orphan hotspots (image but no linked area)
    syncScenesWithAreas = (projectData) => {
        const { scenes } = this.state;
        const updatedScenes = { ...scenes };
        const rawAreas = projectData.areas || [];

        // 1. Map Backend Areas for UI (Base List)
        const mappedAreas = rawAreas.map(area => ({
            id: area._id,
            areaId: area.areaId,
            name: area.areaName,
            title: area.areaName,
            image: area.imageUrl,
            hotspots: area.hotspots || [],
            info: area.info || []
        }));

        // 🔹 Helper Map: areaId -> _id
        // This is crucial because hotspots reference 'childAreaId' (which is the readable areaId),
        // but our scenes are keyed by the internal mongo '_id'.
        const areaIdMap = {};
        rawAreas.forEach(area => {
            if (area.areaId) {
                areaIdMap[area.areaId] = area._id;
            }
        });

        // 2. Ensure all backend areas have corresponding scenes in updatedScenes
        rawAreas.forEach(area => {
            const sceneId = area._id;
            if (!updatedScenes[sceneId]) {
                updatedScenes[sceneId] = {
                    id: sceneId,
                    title: area.areaName || "New Area",
                    image: area.imageUrl,
                    hotspots: [],
                    pngOverlays: []
                };
            } else {
                if (area.imageUrl) updatedScenes[sceneId].image = area.imageUrl;
                if (area.areaName) updatedScenes[sceneId].title = area.areaName;
                // CRITICAL: Clear pngOverlays to prevent duplicates when syncing
                updatedScenes[sceneId].pngOverlays = [];
            }
        });

        // 3. Map Hotspots for ALL areas and Find Orphans
        const virtualAreas = [];

        rawAreas.forEach(area => {
            const sceneId = area._id;
            if (updatedScenes[sceneId]) {
                const newHotspots = [];

                // Handle Info Hotspots
                (area.info || []).forEach((infoEntry, index) => {
                    if (infoEntry && infoEntry.x !== undefined && infoEntry.y !== undefined) {
                        const pitch = 90 - (infoEntry.y / 100) * 180;
                        const yaw = (infoEntry.x / 100) * 360 - 180;

                        const infoHotspot = {
                            id: infoEntry._id || `area_info_${sceneId}_${index}`,
                            pitch: pitch,
                            yaw: yaw,
                            type: 'info',
                            title: 'Info',
                            description: infoEntry.description,
                            areaId: area._id
                        };

                        console.log('Creating info hotspot:', infoHotspot);
                        newHotspots.push(infoHotspot);
                    }
                });

                // Handle Items (PNG Overlays)
                const libraryItems = projectData.project?.items || projectData.items || [];
                (area.items || []).forEach((itemInstance, index) => {
                    if (itemInstance && itemInstance.x !== undefined && itemInstance.y !== undefined) {
                        const pitch = 90 - (itemInstance.y / 100) * 180;
                        const yaw = (itemInstance.x / 100) * 360 - 180;

                        updatedScenes[sceneId].pngOverlays.push({
                            id: itemInstance.instanceId || itemInstance._id || `item_instance_${sceneId}_${index}`,
                            mongoId: itemInstance._id,
                            itemId: itemInstance.itemId,
                            image: itemInstance.imageUrl || (libraryItems.find(libItem => (libItem.itemId || libItem.id || libItem._id) === itemInstance.itemId)?.imageUrl || libraryItems.find(libItem => (libItem.itemId || libItem.id || libItem._id) === itemInstance.itemId)?.image),
                            yaw: yaw,
                            pitch: pitch,
                            rotation: itemInstance.rotation || 0,
                            width: itemInstance.width || 200,
                            height: itemInstance.height || 200,
                            scale: itemInstance.scale || 1,
                            flipX: itemInstance.flipX || false,
                            flipY: itemInstance.flipY || false
                        });
                    }
                });

                // Handle Navigation Hotspots
                (area.hotspots || []).forEach((hotspotEntry, index) => {
                    if (hotspotEntry && hotspotEntry.x !== undefined && hotspotEntry.y !== undefined) {
                        const pitch = 90 - (hotspotEntry.y / 100) * 180;
                        const yaw = (hotspotEntry.x / 100) * 360 - 180;

                        let targetId = hotspotEntry.childAreaId || hotspotEntry.areaId;
                        let targetTitle = hotspotEntry.title || 'Hotspot';

                        // 🔹 Resolve targetId to internal _id if possible
                        if (targetId && areaIdMap[targetId]) {
                            targetId = areaIdMap[targetId];
                        }

                        // 🔹 FIX: Handle Orphan Image Case (Hotspot matches an image but no Area created)
                        if (!targetId && hotspotEntry.imageUrl) {
                            const virtualSceneId = `virtual_scene_${hotspotEntry.hotspotId || hotspotEntry._id}`;
                            targetId = virtualSceneId;

                            // Create the virtual scene if it doesn't exist
                            if (!updatedScenes[virtualSceneId]) {
                                updatedScenes[virtualSceneId] = {
                                    id: virtualSceneId,
                                    title: hotspotEntry.title || "Linked Scene",
                                    image: hotspotEntry.imageUrl,
                                    hotspots: [],
                                    pngOverlays: []
                                };
                            }

                            // Add to virtual areas list if not already present
                            // Check if it exists in mappedAreas OR virtualAreas
                            const existsInMapped = mappedAreas.find(a => a.id === virtualSceneId);
                            const existsInVirtual = virtualAreas.find(a => a.id === virtualSceneId);

                            if (!existsInMapped && !existsInVirtual) {
                                virtualAreas.push({
                                    id: virtualSceneId,
                                    name: hotspotEntry.title || "Linked Scene",
                                    title: hotspotEntry.title || "Linked Scene",
                                    image: hotspotEntry.imageUrl,
                                    hotspots: [],
                                    info: []
                                });
                            }
                        }

                        newHotspots.push({
                            id: hotspotEntry._id || hotspotEntry.hotspotId || `area_nav_${sceneId}_${index}`,
                            pitch: pitch,
                            yaw: yaw,
                            type: 'navigation',
                            title: targetTitle,
                            image: hotspotEntry.imageUrl,
                            targetScene: targetId,
                            areaId: area._id,
                            parentAreaId: hotspotEntry.parentAreaId
                        });
                    }
                });

                // At this point, newHotspots contains both info and navigation hotspots for this area.
                // Assign them to the scene.
                updatedScenes[sceneId].hotspots = newHotspots;
            }
        });

        // 4. Update State with Combined Areas and Scenes
        const finalAreas = [...mappedAreas, ...virtualAreas];

        this.setState({
            scenes: updatedScenes,
            areas: finalAreas,
            projectInfoEntries: rawAreas.flatMap(area => area.info || []),
            itemLibrary: (projectData.project?.items || projectData.items || []).map(item => ({
                id: item._id || item.itemId,
                image: item.imageUrl || item.image,
                name: item.imageName || item.name || "Item",
                itemId: item.itemId // Keep the string ID for placement if needed
            }))
        });
    };

    componentWillUnmount() {
        if (this.animationFrame) {
        }

        // Clear auto-refresh interval
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }

        window.removeEventListener("resize", this.handleResize);

        // Remove document-level mouse listeners
        document.removeEventListener('mousemove', this.handleDocumentMouseMove);
        document.removeEventListener('mouseup', this.handleDocumentMouseUp);

        if (this.containerRef.current) {
            this.containerRef.current.removeEventListener('mousedown', this.handleMouseDown, true);
            this.containerRef.current.removeEventListener('mousemove', this.handleMouseMove);
        }
    }

    // 🔹 Handle mouse move for hover effects
    handleMouseMove = (event) => {
        const { clientX, clientY } = event;
        this.latestMousePos = { x: clientX, y: clientY };
        // No setState here! The 60fps loop will pick up this change.
    };

    // 🔹 Handle mouse down for hotspot interaction
    handleMouseDown = (event) => {
        const { clientX, clientY } = event;
        const container = this.containerRef.current;
        if (!container) return;

        const containerRect = container.getBoundingClientRect();
        const x = clientX - containerRect.left;
        const y = clientY - containerRect.top;

        const { currentScene, scenes, hotspotPlacementActive } = this.state;
        const activeScene = scenes[currentScene];

        // 🔹 Handle PNG/Item selection and transformation first
        this.handleViewerMouseDown(event);
        if (this.state.selectedPNGOverlay) {
            // If we selected or are transforming an item, don't trigger other things
            // event.stopPropagation(); // Might be needed
        }

        // 🔹 Handle Info Hotspot Placement Click
        if (this.state.infoHotspotPlacementActive) {
            const viewer = this.viewerRef.current?.getViewer?.();
            if (viewer) {
                const coords = viewer.mouseEventToCoords(event);
                if (coords) {
                    this.setState({
                        pendingInfoHotspotPos: {
                            pitch: coords[0],
                            yaw: coords[1]
                        },
                        showInfoHotspotDialog: true,
                        infoHotspotPlacementActive: false
                    });
                    event.stopPropagation();
                    return;
                }
            }
        }

        // 🔹 Handle Placement Click (Directly on Panorama)
        if (hotspotPlacementActive) {
            const viewer = this.viewerRef.current?.getViewer?.();
            if (viewer) {
                const coords = viewer.mouseEventToCoords(event);
                if (coords) {
                    this.setState({
                        pendingHotspotPos: {
                            pitch: coords[0],
                            yaw: coords[1]
                        },
                        showLocationDialog: true,
                        hotspotPlacementActive: false
                    });
                    event.stopPropagation();
                    return;
                }
            }
        }

        const currentViewerData = this.latestViewerData || {
            yaw: this.state.viewerYaw,
            pitch: this.state.viewerPitch,
            hfov: this.state.viewerHfov || 100
        };

        const allHotspots = [...(activeScene?.hotspots || []), ...this.state.globalHotspots];
        if (allHotspots.length > 0) {
            for (const hotspot of allHotspots) {
                const projected = this.projectToScreen(
                    hotspot.yaw,
                    hotspot.pitch,
                    currentViewerData.yaw,
                    currentViewerData.pitch,
                    currentViewerData.hfov,
                    containerRect.width,
                    containerRect.height
                );

                if (projected) {
                    const currentHfov = currentViewerData.hfov;
                    const perspectiveScale = Math.max(0.5, Math.min(2.0, 100 / currentHfov));
                    const visualX = projected.x;
                    const visualY = projected.y - (10 * perspectiveScale);

                    const distance = Math.sqrt(Math.pow(x - visualX, 2) + Math.pow(y - visualY, 2));

                    if (distance < 20 * perspectiveScale) {
                        event.stopPropagation();
                        event.preventDefault();
                        this.showHotspot(hotspot);
                        return;
                    }
                }
            }
        }
    };

    handleResize = () => {
        this.renderHotspotsCanvas();
    };

    // Handle back button
    handleBack = () => {
        console.log('Back button clicked!');
        console.log('onBackToHome prop:', this.props.onBackToHome);
        if (this.props.onBackToHome) {
            this.props.onBackToHome();
        } else {
            console.log('onBackToHome prop is missing!');
        }
    };

    // Handle save button
    handleSave = () => {
        console.log("Save button clicked");
        // Save tour data to localStorage for persistent storage
        this.saveTourToLocalStorage();
    };

    // Save tour data to localStorage with quota management
    saveTourToLocalStorage = () => {
        try {
            const tourData = {
                currentScene: this.state.currentScene,
                scenes: this.state.scenes,
                areas: this.state.areas,
                globalHotspots: this.state.globalHotspots,
                globalPngOverlays: this.state.globalPngOverlays,
                timestamp: Date.now()
            };

            // Try to save to localStorage with quota management
            this.saveWithQuotaManagement('virtualTourData', tourData);

            // Also update the shared tour data if we have a tour ID
            if (this.state.currentTourId) {
                this.saveWithQuotaManagement(`tour_${this.state.currentTourId}`, tourData, 'sessionStorage');
                console.log('Updated shared tour data for:', this.state.currentTourId);
            }

            console.log('Tour data saved to localStorage');
        } catch (error) {
            console.error('Failed to save tour data:', error);
            this.handleStorageError(error);
        }
    };

    // Save data with quota management
    saveWithQuotaManagement = (key, data, storageType = 'localStorage') => {
        const storage = storageType === 'sessionStorage' ? sessionStorage : localStorage;

        try {
            // Check available space first
            const dataSize = JSON.stringify(data).length;
            const availableSpace = this.getAvailableStorageSpace(storageType);

            if (dataSize > availableSpace) {
                console.warn(`Data size (${dataSize} bytes) exceeds available space (${availableSpace} bytes)`);
                throw new Error('QuotaExceededError');
            }

            // First, try to save the data directly
            storage.setItem(key, JSON.stringify(data));
        } catch (error) {
            if (error.name === 'QuotaExceededError' || error.message === 'QuotaExceededError') {
                console.warn('Storage quota exceeded, attempting to free up space...');

                // Try to free up space by removing old data
                this.freeUpStorageSpace(storageType);

                // Check space again after cleanup
                const availableSpaceAfterCleanup = this.getAvailableStorageSpace(storageType);
                const dataSize = JSON.stringify(data).length;

                if (dataSize > availableSpaceAfterCleanup) {
                    throw new Error('QuotaExceededError');
                }

                // Try again with compressed data
                const compressedData = this.compressTourData(data);
                storage.setItem(key, JSON.stringify(compressedData));

                console.log('Saved compressed tour data');
            } else {
                throw error;
            }
        }
    };

    // Get available storage space (approximation)
    getAvailableStorageSpace = (storageType = 'localStorage') => {
        const storage = storageType === 'sessionStorage' ? sessionStorage : localStorage;

        try {
            // Try to add a test string to estimate available space
            const testKey = '__storage_test__';
            const testData = 'x'.repeat(1024); // 1KB test data

            let totalSize = 0;
            let count = 0;

            // Keep adding until we hit the limit
            while (count < 1000) { // Safety limit
                try {
                    storage.setItem(testKey + count, testData);
                    totalSize += testData.length;
                    count++;
                } catch (e) {
                    break;
                }
            }

            // Clean up test data
            for (let i = 0; i < count; i++) {
                storage.removeItem(testKey + i);
            }

            // Return available space (subtract current usage)
            const currentUsage = this.getCurrentStorageUsage(storageType);
            return Math.max(0, totalSize - currentUsage);
        } catch (error) {
            console.warn('Could not estimate storage space:', error);
            return 0;
        }
    };

    // Get current storage usage
    getCurrentStorageUsage = (storageType = 'localStorage') => {
        const storage = storageType === 'sessionStorage' ? sessionStorage : localStorage;
        let totalSize = 0;

        for (let key in storage) {
            if (storage.hasOwnProperty(key)) {
                totalSize += storage[key].length + key.length;
            }
        }

        return totalSize;
    };

    // Compress tour data by reducing image quality and removing unnecessary data
    compressTourData = (tourData) => {
        const compressed = { ...tourData };

        // Compress scene images
        compressed.scenes = Object.keys(compressed.scenes).reduce((acc, sceneId) => {
            const scene = compressed.scenes[sceneId];
            acc[sceneId] = {
                ...scene,
                image: this.compressImageData(scene.image)
            };
            return acc;
        }, {});

        // Compress hotspot images
        compressed.scenes = Object.keys(compressed.scenes).reduce((acc, sceneId) => {
            const scene = acc[sceneId];
            scene.hotspots = scene.hotspots.map(hotspot => ({
                ...hotspot,
                image: hotspot.image ? this.compressImageData(hotspot.image) : null
            }));
            return acc;
        }, compressed.scenes);

        // Compress PNG overlay images
        compressed.scenes = Object.keys(compressed.scenes).reduce((acc, sceneId) => {
            const scene = acc[sceneId];
            scene.pngOverlays = scene.pngOverlays.map(overlay => ({
                ...overlay,
                image: this.compressImageData(overlay.image)
            }));
            return acc;
        }, compressed.scenes);

        return compressed;
    };

    // Compress image data by reducing quality (async version)
    compressImageData = (imageData) => {
        if (!imageData || !imageData.startsWith('data:image/')) {
            return imageData;
        }

        // For now, return the original image data
        // In a production environment, you might want to implement proper async compression
        // or use a service like TinyPNG API
        console.warn('Image compression skipped - returning original data');
        return imageData;
    };

    // Free up storage space by removing old tour data
    freeUpStorageSpace = (storageType = 'localStorage') => {
        const storage = storageType === 'sessionStorage' ? sessionStorage : localStorage;

        // Remove old tour data (keep only the most recent)
        const keysToRemove = [];
        for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (key && key.startsWith('tour_')) {
                try {
                    const data = JSON.parse(storage.getItem(key));
                    // Remove tours older than 7 days
                    if (data.timestamp && Date.now() - data.timestamp > 7 * 24 * 60 * 60 * 1000) {
                        keysToRemove.push(key);
                    }
                } catch (error) {
                    // Remove invalid data
                    keysToRemove.push(key);
                }
            }
        }

        keysToRemove.forEach(key => storage.removeItem(key));
        console.log(`Removed ${keysToRemove.length} old tour entries from ${storageType}`);
    };

    // Handle storage errors
    handleStorageError = (error) => {
        if (error.name === 'QuotaExceededError') {
            // Show user-friendly message
            alert('Storage quota exceeded. The tour contains too many images. Try removing some images or reducing their quality.');
        } else {
            console.error('Storage error:', error);
            alert('Failed to save tour data. Please try again.');
        }
    };

    // Load latest tour data from localStorage
    loadLatestTourData = () => {
        const savedData = localStorage.getItem('virtualTourData');
        if (savedData) {
            try {
                const tourData = JSON.parse(savedData);
                this.loadTour(tourData);
            } catch (error) {
                console.error('Error loading tour data:', error);
            }
        }
    };

    // Fetch public tour data
    fetchPublicTour = async (tourId) => {
        this.setState({ isLoading: true, loadingMessage: "Loading tour..." });
        try {
            // Try fetching with the tourId (which might be a project ID)
            const response = await stragingService.getPublicStragingById(tourId);
            console.log("Public tour fetched:", response);

            if (response && response.data) {
                const projectData = response.data;
                // Use the sync logic to populate scenes/areas/hotspots
                this.syncScenesWithAreas(projectData);
                this.setState({
                    isViewMode: true,
                    currentTourId: tourId,
                    // Determine initial scene (prefer first area or project default)
                    currentScene: projectData.areas?.[0]?._id || Object.keys(this.state.scenes)[0]
                });
            }
        } catch (error) {
            console.error("Error fetching public tour:", error);
            alert("Failed to load tour. It may be invalid or private.");
        } finally {
            this.setState({ isLoading: false });
        }
    };

    // Handle share button
    handleShare = async () => {
        // Use the backend Project ID if available (for global sharing)
        const projectId = this.props.projectData?._id || this.props.projectData?.project?._id;

        // If no backend ID, fall back to local generation (only works on same device)
        const tourId = projectId || this.generateTourId();

        // If local ID, save to localStorage (legacy behavior)
        if (!projectId) {
            this.saveTourToLocalStorage();
            const tourData = {
                id: tourId,
                currentScene: this.state.currentScene,
                scenes: this.state.scenes,
                areas: this.state.areas,
                globalHotspots: this.state.globalHotspots,
                globalPngOverlays: this.state.globalPngOverlays,
                timestamp: Date.now()
            };
            sessionStorage.setItem(`tour_${tourId}`, JSON.stringify(tourData));
            localStorage.setItem(`tour_${tourId}`, JSON.stringify(tourData));
        }

        // Create shareable URL
        const shareableLink = `${window.location.origin}${window.location.pathname}?tour=${tourId}`;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Virtual Tour',
                    text: 'Check out this virtual tour!',
                    url: shareableLink
                });
                console.log('Link shared successfully');
            } catch (error) {
                console.error('Error sharing link:', error);
                this.copyToClipboard(shareableLink);
            }
        } else {
            this.copyToClipboard(shareableLink);
        }
    };

    // Fallback sharing method using localStorage
    fallbackShare = async (tourId, tourData) => {
        // Store in sessionStorage as fallback
        sessionStorage.setItem(`tour_${tourId}`, JSON.stringify(tourData));
        localStorage.setItem(`tour_${tourId}`, JSON.stringify(tourData));

        // Create shareable URL with tour ID
        const shareableLink = `${window.location.origin}${window.location.pathname}?tour=${tourId}`;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Virtual Tour',
                    text: 'Check out this virtual tour!',
                    url: shareableLink
                });
                console.log('Link shared successfully (fallback mode)');
            } catch (error) {
                console.error('Error sharing link:', error);
                this.copyToClipboard(shareableLink);
            }
        } else {
            this.copyToClipboard(shareableLink);
        }
    };

    // Generate unique tour ID
    generateTourId = () => {
        // Create a simple unique ID based on timestamp and random string
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 5);
        return `tour_${timestamp}_${random}`;
    };

    // Load tour data by ID
    loadTourById = (tourId) => {
        try {
            // Try to get from sessionStorage first (for demo purposes)
            let tourData = sessionStorage.getItem(`tour_${tourId}`);

            // If not found in sessionStorage, try localStorage (fallback)
            if (!tourData) {
                tourData = localStorage.getItem(`tour_${tourId}`);
            }

            if (tourData) {
                const data = JSON.parse(tourData);
                this.setState({
                    currentScene: data.currentScene || null,
                    scenes: data.scenes || {},
                    areas: data.areas || [],
                    globalHotspots: data.globalHotspots || [],
                    globalPngOverlays: data.globalPngOverlays || []
                });
                console.log('Loaded tour data by ID:', tourId);
                return true;
            }
        } catch (error) {
            console.error('Error loading tour by ID:', error);
        }
        return false;
    };

    // Helper method to copy to clipboard
    copyToClipboard = (text) => {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                alert('Shareable link copied to clipboard!');
            }).catch(err => {
                console.error('Failed to copy link: ', err);
                // Final fallback: open in new tab
                window.open(text, '_blank');
            });
        } else {
            // Very old browser fallback
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                alert('Shareable link copied to clipboard!');
            } catch (err) {
                console.error('Failed to copy link: ', err);
                window.open(text, '_blank');
            }
            document.body.removeChild(textArea);
        }
    };

    // Start adding hotspot (Directly on panorama)
    openLocationDialog = () => {
        this.setState({ hotspotPlacementActive: true });
    };

    // Start adding info hotspot (Directly on panorama)
    openInfoHotspotPlacement = () => {
        this.setState({ infoHotspotPlacementActive: true });
    };

    // Save Information Hotspot
    saveInfoHotspot = async () => {
        const { infoHotspotDescription, pendingInfoHotspotPos, currentScene, scenes, areas } = this.state;
        const stragingId = this.props.projectData?.project?._id || this.props.projectData?._id;

        if (pendingInfoHotspotPos && infoHotspotDescription.trim()) {
            const description = infoHotspotDescription.trim().replace(/\s+/g, ' ');

            this.setState({ isLoading: true, loadingMessage: "Saving hotspot..." });
            try {
                if (stragingId) {
                    const { token } = authService.getAuthData();

                    // Convert pitch/yaw to x/y coordinates for API
                    const x = ((pendingInfoHotspotPos.yaw + 180) / 360) * 100;
                    const y = ((90 - pendingInfoHotspotPos.pitch) / 180) * 100;

                    // Find the current area ID (use MongoDB _id)
                    const currentArea = areas.find(area =>
                        area.id === currentScene || area.areaId === currentScene
                    );

                    if (currentArea) {
                        // Call the area-specific API
                        const response = await stragingService.addInfoToArea(stragingId, currentArea.id, {
                            description: description,
                            x: Math.round(x),
                            y: Math.round(y)
                        }, token);

                        console.log("Info hotspot saved:", response);
                    } else {
                        console.error("Current area not found");
                    }

                    // 🔹 Trigger refresh to sync with backend
                    await this.fetchProjectInfo();
                }
            } catch (error) {
                console.error("Error adding info:", error);
            } finally {
                this.setState({ isLoading: false });
            }

            // Reset dialog state - fetchProjectInfo will handle updating scenes
            this.setState({
                showInfoHotspotDialog: false,
                infoHotspotDescription: "",
                pendingInfoHotspotPos: null
            });
        }
    };

    openProjectInfoDialog = () => {
        this.setState({ showProjectInfoDialog: true });
    };

    closeProjectInfoDialog = () => {
        this.setState({ showProjectInfoDialog: false });
    };

    saveProjectInfo = async () => {
        const { projectInfoTitle, projectInfoDescription } = this.state;
        const stragingId = this.props.projectData?._id;

        console.log("Saving project info:", { stragingId, projectInfoDescription });

        this.setState({ isLoading: true, loadingMessage: "Saving project info..." });
        try {
            if (stragingId) {
                const { token } = authService.getAuthData();
                console.log("Calling addInfo API...");

                // Get current viewer position for project info coordinates
                const viewer = this.viewerRef.current?.getViewer();
                let x = 50, y = 50; // Default center position

                if (viewer) {
                    try {
                        const currentView = viewer.getView();
                        if (currentView) {
                            // Convert current view's pitch/yaw to x/y
                            x = ((currentView.yaw + 180) / 360) * 100;
                            y = ((90 - currentView.pitch) / 180) * 100;
                        }
                    } catch (error) {
                        console.warn("Could not get current view position:", error);
                    }
                }

                // Add info to the straging project with coordinates
                const response = await stragingService.addInfo(stragingId, {
                    description: projectInfoDescription.trim(),
                    x: Math.round(x),
                    y: Math.round(y)
                }, token);

                console.log("API response:", response);

                this.setState({ showProjectInfoDialog: false });

                // Refresh the project data to show the new info
                await this.fetchProjectInfo();
            }
        } catch (error) {
            console.error("Error updating project info:", error);
        } finally {
            this.setState({ isLoading: false });
        }
    };

    // Close Information Hotspot Dialog
    closeInfoHotspotDialog = () => {
        this.setState({
            showInfoHotspotDialog: false,
            infoHotspotDescription: "",
            pendingInfoHotspotPos: null,
            infoHotspotPlacementActive: false
        });
    };

    // Close everything related to location placement
    closeLocationDialog = () => {
        this.setState({
            showLocationDialog: false,
            hotspotPlacementActive: false,
            infoHotspotPlacementActive: false,
            hotspotName: "",
            pendingHotspotPos: null,
            uploadedImage: null,
            selectedLocation: ""
        });
    };

    // Handle file upload
    handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                this.setState({ uploadedImage: event.target.result });
            };
            reader.readAsDataURL(file);
        }
    };

    // Trigger file input
    triggerFileInput = () => {
        this.fileInputRef.current?.click();
    };

    // Handle drag over
    handleDragOver = (e) => {
        e.preventDefault();
        e.currentTarget.classList.add("dragging");
    };

    // Handle drag leave
    handleDragLeave = (e) => {
        e.currentTarget.classList.remove("dragging");
    };

    // Handle drop
    handleDrop = (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove("dragging");
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith("image/")) {
            const reader = new FileReader();
            reader.onload = (event) => {
                this.setState({ uploadedImage: event.target.result });
            };
            reader.readAsDataURL(file);
        }
    };

    // Remove uploaded image
    removeUploadedImage = () => {
        this.setState({ uploadedImage: null });
    };

    // Handle location area name change
    handleLocationAreaNameChange = (e) => {
        this.setState({ locationAreaName: e.target.value });
    };

    // Handle location dropdown change
    handleLocationChange = (e) => {
        this.setState({ selectedLocation: e.target.value });
    };

    // Save location dialog (Hotspot)
    saveLocationDialog = async () => {
        console.log("=== saveLocationDialog called ===");

        const { uploadedImage, selectedLocation, hotspotName, pendingHotspotPos, currentScene, scenes, areas } = this.state;
        const stragingId = this.props.projectData?.project?._id || this.props.projectData?._id;

        console.log("saveLocationDialog state:", {
            uploadedImage: !!uploadedImage,
            selectedLocation,
            hotspotName,
            pendingHotspotPos: !!pendingHotspotPos,
            currentScene,
            stragingId,
            areasCount: areas.length
        });

        if (pendingHotspotPos && (uploadedImage || selectedLocation || hotspotName)) {
            console.log("✓ Condition passed - proceeding with hotspot creation");

            let targetSceneId = selectedLocation;
            let finalAreaName = hotspotName;
            const updatedScenes = { ...scenes };
            const updatedAreas = [...areas];

            // If selecting existing location, use its name
            if (targetSceneId && !hotspotName) {
                const existingArea = areas.find(area => area.id === targetSceneId);
                if (existingArea) {
                    finalAreaName = existingArea.name || existingArea.areaName;
                    console.log("✓ Using existing area name:", finalAreaName);
                }
            }

            // If it's a new location (image or just name), we need to upload it via userUpdate
            if (!targetSceneId) {
                console.log("✓ Creating new area");
                try {
                    if (stragingId && uploadedImage) {
                        // For now, let's generate a temporary ID and warn that 
                        // permanent rooms should be added via the Upload/Edit project page
                        // since adding locations now requires image file uploads to Cloudinary via multipart
                        targetSceneId = `scene_${Date.now()}`;
                    } else {
                        targetSceneId = `scene_${Date.now()}`;
                    }
                } catch (error) {
                    console.error("Error adding location via hotspot:", error);
                    targetSceneId = `scene_${Date.now()}`;
                }

                // Initialize the new scene and area
                updatedScenes[targetSceneId] = {
                    id: targetSceneId,
                    title: finalAreaName || "New Area",
                    image: uploadedImage || scenes[currentScene].image, // Fallback to current if no image
                    hotspots: [],
                    pngOverlays: []
                };

                updatedAreas.push({
                    id: targetSceneId,
                    name: finalAreaName || "New Area"
                });
            } else {
                console.log("✓ Using existing area:", targetSceneId);
            }

            const newHotspot = {
                id: `hotspot_${Date.now()}`,
                pitch: pendingHotspotPos.pitch,
                yaw: pendingHotspotPos.yaw,
                title: finalAreaName,
                image: uploadedImage || (targetSceneId ? updatedScenes[targetSceneId].image : null),
                targetScene: targetSceneId,
                type: "navigation",
                locked: true
            };

            // 🔹 Persist navigation hotspot to backend using new addHotspotOnly API
            if (stragingId) {
                this.setState({ isLoading: true, loadingMessage: "Saving hotspot..." });
                console.log("✓ stragingId found, preparing API call");
                try {
                    const { token } = authService.getAuthData();
                    const x = ((pendingHotspotPos.yaw + 180) / 360) * 100;
                    const y = ((90 - pendingHotspotPos.pitch) / 180) * 100;

                    // Convert data URL to File if needed
                    let imageFile = null;
                    if (uploadedImage && uploadedImage.startsWith('data:')) {
                        const response = await fetch(uploadedImage);
                        const blob = await response.blob();
                        imageFile = new File([blob], 'hotspot-image.jpg', { type: 'image/jpeg' });
                    } else if (targetSceneId && updatedScenes[targetSceneId] && updatedScenes[targetSceneId].image) {
                        // For existing areas, convert the scene image to File
                        const sceneImageUrl = updatedScenes[targetSceneId].image;
                        if (sceneImageUrl && sceneImageUrl.startsWith('data:')) {
                            const response = await fetch(sceneImageUrl);
                            const blob = await response.blob();
                            imageFile = new File([blob], 'area-image.jpg', { type: 'image/jpeg' });
                        } else if (sceneImageUrl && sceneImageUrl.startsWith('http')) {
                            // For external URLs, fetch and convert
                            try {
                                const response = await fetch(sceneImageUrl);
                                const blob = await response.blob();
                                imageFile = new File([blob], 'area-image.jpg', { type: 'image/jpeg' });
                            } catch (e) {
                                console.warn("Could not fetch area image for hotspot:", e);
                            }
                        }
                    }

                    // If still no image, use a default or the current scene image
                    if (!imageFile && scenes[currentScene] && scenes[currentScene].image) {
                        const currentImageUrl = scenes[currentScene].image;
                        if (currentImageUrl.startsWith('data:')) {
                            const response = await fetch(currentImageUrl);
                            const blob = await response.blob();
                            imageFile = new File([blob], 'current-scene-image.jpg', { type: 'image/jpeg' });
                        }
                    }

                    const hotspotData = {
                        title: finalAreaName,
                        x: x,
                        y: y,
                        description: `Navigation hotspot to ${finalAreaName}`,
                        image: imageFile,
                        createArea: targetSceneId ? !areas.find(area => area.id === targetSceneId) : true
                    };

                    // Find the current area ID where we're placing the hotspot
                    const currentArea = areas.find(area =>
                        area.id === currentScene || area.areaId === currentScene
                    );

                    console.log("Hotspot data prepared:", hotspotData);
                    console.log("Looking for current area with ID:", currentScene, "Available areas:", areas.map(a => ({ id: a.id, name: a.name })));

                    if (currentArea) {
                        console.log("✓ Current area found, calling addHotspotToArea API...");
                        // Call the area-specific hotspot API
                        const hsResponse = await stragingService.addHotspotToArea(stragingId, currentArea.id, hotspotData, token);

                        console.log("API response from addHotspotToArea:", hsResponse);

                        if (hsResponse && (hsResponse.success || hsResponse.status === 1 || hsResponse.statusCode === 200)) {
                            console.log("✓ Hotspot saved successfully - triggering project info refresh");
                            // 🔹 Trigger refresh to sync with backend
                            // await this.fetchProjectInfo();
                        } else {
                            console.log("⚠️ API response indicates failure or unexpected format:", hsResponse);
                        }
                    } else {
                        console.error("❌ Current area not found for hotspot creation. Current Scene:", currentScene, "Areas:", areas);
                    }
                } catch (e) {
                    console.error("❌ Error saving navigation hotspot:", e);
                } finally {
                    this.setState({ isLoading: false });
                }
            } else {
                console.log("⚠️ No stragingId found");
            }

            updatedScenes[currentScene].hotspots.push(newHotspot);

            this.setState({
                scenes: updatedScenes,
                areas: updatedAreas,
                showLocationDialog: false,
                hotspotPlacementActive: false,
                pendingHotspotPos: null,
                hotspotName: "",
                uploadedImage: null,
                selectedLocation: ""
            });
        } else {
            console.log("⚠️ Conditions not met for hotspot creation:", {
                hasPendingPos: !!pendingHotspotPos,
                hasUploadedImage: !!uploadedImage,
                hasSelectedLocation: !!selectedLocation,
                hasHotspotName: !!hotspotName
            });
        }
    };

    // Map flat image click to Pannellum coordinates (Pitch/Yaw)
    handlePlacementClick = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left; // x position within the element.
        const y = e.clientY - rect.top;  // y position within the element.

        // Map X (0 to width) to Yaw (-180 to 180)
        // Map Y (0 to height) to Pitch (90 to -90)
        const yaw = ((x / rect.width) * 360) - 180;
        const pitch = 90 - ((y / rect.height) * 180);

        this.setState({
            pendingHotspotPos: {
                pitch: pitch,
                yaw: yaw
            },
            showLocationDialog: true,
            showPlacementModal: false
        });
    };

    // Update viewer state from Pannellum
    handleViewerState = () => {
        const viewer = this.viewerRef.current?.getViewer?.();
        if (viewer) {
            this.setState({
                viewerYaw: viewer.getYaw(),
                viewerPitch: viewer.getPitch(),
                viewerHfov: viewer.getHfov()
            });
        }
    };

    // Open select area slider
    openSelectAreaSlider = () => {
        this.setState({ showSelectAreaSlider: true });
    };

    // Close select area slider
    closeSelectAreaSlider = () => {
        this.setState({ showSelectAreaSlider: false });
    };

    // Select area and navigate to its scene
    selectArea = (areaId) => {
        const { scenes } = this.state;
        const targetScene = scenes[areaId];

        if (targetScene) {
            // If the area has a scene, navigate to it
            this.setState({
                selectedArea: areaId,
                currentScene: areaId,
                viewerYaw: 180,
                viewerPitch: 0,
                viewerHfov: 100,
                showSelectAreaSlider: false
            }, () => {
                // 🔹 Area Selection: Trigger TTS for area name AFTER scene loads
                if (this.state.ttsEnabled && targetScene.title) {
                    this.speakText(targetScene.title, areaId);
                }
            });
        } else {
            // Otherwise just mark as selected
            this.setState({
                selectedArea: areaId,
                showSelectAreaSlider: false
            });
        }
    };

    // Add new area - Open dialog
    openAddAreaDialog = () => {
        this.setState({ showAddAreaDialog: true });
    };

    // Close Add Area dialog
    closeAddAreaDialog = () => {
        this.setState({
            showAddAreaDialog: false,
            newAreaName: "",
            newAreaImage: null,
        });
    };

    // Handle area image upload
    handleAreaImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                this.setState({ newAreaImage: event.target.result });
            };
            reader.readAsDataURL(file);
        }
    };

    // Remove area image
    removeAreaImage = () => {
        this.setState({ newAreaImage: null });
    };

    // Handle area image drop
    handleAreaImageDrop = (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove("dragging");
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith("image/")) {
            const reader = new FileReader();
            reader.onload = (event) => {
                this.setState({ newAreaImage: event.target.result });
            };
            reader.readAsDataURL(file);
        }
    };

    // Handle area name input
    handleAreaNameChange = (e) => {
        this.setState({ newAreaName: e.target.value });
    };

    // Save new area
    saveNewArea = async () => {
        const { newAreaName, newAreaImage, areas } = this.state;
        const stragingId = this.props.projectData?.project?._id || this.props.projectData?._id;

        console.log("Saving new area with stragingId:", stragingId);

        if (newAreaName.trim()) {
            // Optimistic update prevention - wait for API if possible
            if (stragingId) {
                this.setState({ isLoading: true, loadingMessage: "Adding area..." });
                try {
                    // Use new addArea API to save area with image
                    const { token } = authService.getAuthData();

                    // Convert data URL to File if needed
                    let imageFile = null;
                    if (newAreaImage && newAreaImage.startsWith('data:')) {
                        const response = await fetch(newAreaImage);
                        const blob = await response.blob();
                        imageFile = new File([blob], 'area-image.jpg', { type: 'image/jpeg' });
                    }

                    const areaData = {
                        areaName: newAreaName.trim(),
                        image: imageFile
                    };

                    const areaResponse = await stragingService.addArea(stragingId, areaData, token);

                    // 🔹 FIX: Check for multiple success indicators (status: 1 is common in this backend)
                    if (areaResponse && (areaResponse.success || areaResponse.status === 1 || areaResponse.statusCode === 200)) {
                        console.log("Area saved successfully:", areaResponse);


                        // Extract new area data from response
                        const newBackendArea = areaResponse.data;

                        // Construct the new area object for local state (matching existing structure)
                        // Use the backend ID (_id) for the scene/area ID, or fallback to id/areaId
                        const newAreaId = newBackendArea._id || newBackendArea.id || newBackendArea.areaId;

                        const newArea = {
                            id: newAreaId,
                            areaId: newBackendArea.areaId,
                            name: newBackendArea.areaName,
                            title: newBackendArea.areaName,
                            image: newBackendArea.imageUrl || newAreaImage, // Fallback to local image if URL not yet back
                            hotspots: [],
                            info: []
                        };

                        // Create new scene entry
                        const newScene = {
                            id: newAreaId,
                            title: newBackendArea.areaName,
                            image: newBackendArea.imageUrl || newAreaImage,
                            hotspots: [],
                            pngOverlays: []
                        };

                        this.setState(prevState => ({
                            areas: [...prevState.areas, newArea],
                            scenes: { ...prevState.scenes, [newAreaId]: newScene },
                            showAddAreaDialog: false,
                            newAreaName: "",
                            newAreaImage: null
                        }), () => {
                            // 🔹 Trigger refresh to ensure full sync
                            console.log("New area saved - refreshing project info");
                            this.fetchProjectInfo();
                        });

                        return; // Exit early on success
                    }
                } catch (error) {
                    console.error("Error adding area:", error);
                    // Continue to fallback only if it's a critical error we want to fail-open for (or just show error)
                    // For now, let's allow it to fall through if online save fails so user sees SOMETHING
                } finally {
                    this.setState({ isLoading: false });
                }
            }

            // Fallback: Local-only mode (or API failed)
            const newAreaId = `area${Date.now()}`;
            const newArea = {
                id: newAreaId,
                name: newAreaName.trim(),
            };

            const newState = {
                areas: [...this.state.areas, newArea],
                showAddAreaDialog: false,
                newAreaName: "",
                newAreaImage: null,
            };

            if (newAreaImage) {
                const newScene = {
                    id: newAreaId,
                    title: newAreaName.trim(),
                    image: newAreaImage,
                    hotspots: [],
                    pngOverlays: [],
                };
                newState.scenes = { ...this.state.scenes, [newAreaId]: newScene };
            }

            this.setState(newState);
        }
    };

    // Show delete confirmation dialog
    showDeleteConfirmation = (areaId, e) => {
        e.stopPropagation();
        this.setState({
            showDeleteDialog: true,
            areaToDelete: areaId,
        });
    };

    // Close delete dialog
    closeDeleteDialog = () => {
        this.setState({
            showDeleteDialog: false,
            areaToDelete: null,
        });
    };

    // Confirm delete area
    confirmDeleteArea = async () => {
        const { areaToDelete, scenes } = this.state;
        const stragingId = this.props.projectData?._id;

        if (areaToDelete) {
            this.setState({ isLoading: true, loadingMessage: "Deleting area..." });
            try {
                if (stragingId) {
                    // Find the associated hotspot for this area
                    let associatedHotspotId = null;

                    // Check all scenes for hotspots that link to this area
                    Object.values(scenes).forEach(scene => {
                        if (scene.hotspots) {
                            scene.hotspots.forEach(hotspot => {
                                const targetSceneId = hotspot.targetScene || hotspot.areaId;
                                if (targetSceneId === areaToDelete) {
                                    associatedHotspotId = hotspot.id;
                                }
                            });
                        }
                    });

                    // Use new deleteAreaAndHotspot API
                    const { token } = authService.getAuthData();
                    const deleteData = {
                        areaId: areaToDelete,
                        hotspotId: associatedHotspotId
                    };

                    const deleteResponse = await stragingService.deleteAreaAndHotspot(stragingId, deleteData, token);

                    if (deleteResponse && deleteResponse.statusCode === 200) {
                        console.log("Area and hotspot deleted successfully:", deleteResponse);

                        // 🔹 Trigger refresh to sync with backend
                        console.log("Area/Hotspot deleted - refreshing project info");
                        await this.fetchProjectInfo();
                    } else {
                        console.error("Delete failed:", deleteResponse?.message || "Unknown error");
                    }
                } else {
                    // Fallback for local-only deletion
                    console.log("No stragingId - performing local deletion only");
                }
            } catch (error) {
                console.error("Error deleting area and hotspot:", error);
            } finally {
                this.setState({ isLoading: false });
            }

            // Always update local state for immediate UI feedback
            this.setState((prevState) => {
                const updatedScenes = { ...prevState.scenes };

                // Remove the scene associated with this area
                delete updatedScenes[areaToDelete];

                // Remove hotspots that link to this area from all scenes
                Object.keys(updatedScenes).forEach(sceneId => {
                    if (updatedScenes[sceneId].hotspots) {
                        updatedScenes[sceneId].hotspots = updatedScenes[sceneId].hotspots.filter(
                            hotspot => {
                                const targetSceneId = hotspot.targetScene || hotspot.areaId;
                                return targetSceneId !== areaToDelete;
                            }
                        );
                    }
                });

                return {
                    scenes: updatedScenes,
                    areas: prevState.areas.filter((area) => area.id !== areaToDelete),
                    selectedArea:
                        prevState.selectedArea === areaToDelete ? null : prevState.selectedArea,
                    showDeleteDialog: false,
                    areaToDelete: null,
                };
            });
        }
    };

    // Navigate to the linked location or show hotspot preview
    showHotspot = (hotspot) => {
        const { scenes } = this.state;
        const viewer = this.viewerRef.current?.getViewer?.();

        // Handle both targetScene (legacy) and areaId (new API structure)
        const targetSceneId = hotspot.targetScene || hotspot.areaId;

        if (targetSceneId && scenes[targetSceneId]) {
            const targetSceneData = scenes[targetSceneId];

            if (viewer && typeof viewer.lookAt === 'function') {
                // Set animating flag to prevent state updates from disrupting animation
                this.setState({ isAnimating: true });

                // Smoothly center on the hotspot and zoom in
                // Duration 1200ms for a premium transition feel
                viewer.lookAt(hotspot.pitch, hotspot.yaw, 50, 1200);

                // Wait for the animation to finish before switching scenes
                setTimeout(() => {
                    this.setState({
                        currentScene: targetSceneId,
                        // Set the entrance point for the new scene
                        viewerYaw: 180,
                        viewerPitch: 0,
                        viewerHfov: 100,
                        isAnimating: false
                    }, () => {
                        // 🔹 Navigation Hotspot: Trigger TTS for area name AFTER scene loads
                        if (this.state.ttsEnabled && targetSceneData.title) {
                            this.speakText(targetSceneData.title, hotspot.id);
                        }

                        // Ensure the next scene starts at the clean orientation
                        const newViewer = this.viewerRef.current?.getViewer?.();
                        if (newViewer) {
                            newViewer.setYaw(180);
                            newViewer.setPitch(0);
                            newViewer.setHfov(100);
                        }
                    });
                }, 1300); // Slightly longer than the lookAt duration
            } else {
                // Immediate fallback if viewer is unavailable
                this.setState({
                    currentScene: targetSceneId,
                    viewerYaw: 180,
                    viewerPitch: 0,
                    viewerHfov: 100
                }, () => {
                    // Trigger TTS in fallback as well
                    if (this.state.ttsEnabled && targetSceneData.title) {
                        this.speakText(targetSceneData.title, hotspot.id);
                    }
                });
            }
        } else {
            // It's an information hotspot (shouldn't reach here with new click handler)
            if (this.state.ttsEnabled && hotspot.description) {
                this.speakText(hotspot.description, hotspot.id);
            }
        }
    };

    // Open Add Items dialog
    openAddItemsDialog = () => {
        this.setState({ showAddItemsDialog: true });
    };

    // Close Add Items dialog
    closeAddItemsDialog = () => {
        this.setState({
            showAddItemsDialog: false,
            newItemImage: null,
            newItemFile: null
        });
    };

    // Handle item file upload
    handleItemFileUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                this.setState({
                    newItemImage: event.target.result,
                    newItemFile: file
                });
            };
            reader.readAsDataURL(file);
        }
    };

    // Trigger item file input
    triggerItemFileInput = () => {
        this.itemFileInputRef.current?.click();
    };

    // Handle item drag over
    handleItemDragOver = (e) => {
        e.preventDefault();
        e.currentTarget.classList.add("dragging");
    };

    // Handle item drag leave
    handleItemDragLeave = (e) => {
        e.currentTarget.classList.remove("dragging");
    };

    // Handle item drop
    handleItemDrop = (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove("dragging");
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith("image/")) {
            const reader = new FileReader();
            reader.onload = (event) => {
                this.setState({
                    newItemImage: event.target.result,
                    newItemFile: file
                });
            };
            reader.readAsDataURL(file);
        }
    };

    // Remove new item image
    removeNewItemImage = () => {
        this.setState({
            newItemImage: null,
            newItemFile: null
        });
    };

    // Save new item to library (not directly to screen)
    saveNewItem = async () => {
        const { newItemFile, currentTourId } = this.state;

        let stragingId = currentTourId;

        // Try to find ID in props
        if (this.props.projectData) {
            stragingId = stragingId ||
                this.props.projectData._id ||
                this.props.projectData.id ||
                this.props.projectData.project?._id ||
                this.props.projectData.project?.id;
        }

        console.log("saveNewItem attempt:", {
            foundId: stragingId,
            hasFile: !!newItemFile,
            projectDataKeys: this.props.projectData ? Object.keys(this.props.projectData) : 'null'
        });

        if (newItemFile && stragingId) {
            this.setState({ isLoading: true, loadingMessage: "Uploading item to library..." });
            try {
                const { token } = authService.getAuthData();
                const response = await stragingService.addItemToLibrary(stragingId, newItemFile, token);

                if (response && (response.success || response.status === 1)) {
                    console.log("Item added to library successfully:", response);

                    // Trigger refresh to sync items with project data
                    // Try to fetch project info, but handle if method doesn't exist or fails
                    if (this.fetchProjectInfo) {
                        try {
                            await this.fetchProjectInfo();
                        } catch (err) {
                            console.warn("Could not refresh project info:", err);
                        }
                    }

                    this.setState({
                        showAddItemsDialog: false,
                        newItemImage: null,
                        newItemFile: null
                    });
                } else {
                    console.error("Failed to add item to library:", response);
                    alert("Failed to save item. Please check the network tab or try again.");
                }
            } catch (error) {
                console.error("Error saving new item:", error);
                alert("Error saving item: " + (error.message || "Unknown error"));
            } finally {
                this.setState({ isLoading: false });
            }
        } else {
            console.error("Cannot save item: Missing file or Project ID", { stragingId, newItemFile });
            if (!stragingId) alert("Error: Project ID not found. Cannot save item.");
        }
    };

    // 🔹 Item Transformation Handlers

    // Check if point is inside PNG
    isPointInPNG = (mouseX, mouseY, png) => {
        if (!png || (!png.imageElement && !png.image)) return false;

        const container = this.containerRef.current;
        if (!container) return false;

        const containerRect = container.getBoundingClientRect();

        // Use LATEST viewer data for accurate hit testing during movement
        const viewerData = this.latestViewerData || {
            yaw: this.state.viewerYaw,
            pitch: this.state.viewerPitch,
            hfov: this.state.viewerHfov
        };

        const projected = this.projectToScreen(
            png.yaw,
            png.pitch,
            viewerData.yaw,
            viewerData.pitch,
            viewerData.hfov,
            containerRect.width,
            containerRect.height
        );

        if (!projected) return false;

        const d2r = Math.PI / 180;
        const fovFactor = 1 / Math.tan(viewerData.hfov * 0.5 * d2r);
        const perspectiveScale = fovFactor * (1 / Math.max(0.01, projected.z));
        const scaleFactor = (png.scale || 1) * perspectiveScale;

        const img = png.imageElement || { naturalWidth: 200, naturalHeight: 200 };
        const dWidth = png.width || png.naturalWidth || img.naturalWidth || 200;
        const dHeight = png.height || png.naturalHeight || img.naturalHeight || 200;

        const displayWidth = dWidth * scaleFactor;
        const displayHeight = dHeight * scaleFactor;

        // Hit test with rotation and flip
        const dx = mouseX - projected.x;
        const dy = mouseY - projected.y;

        const rotation = png.rotation || 0;
        const rad = -rotation * Math.PI / 180;
        const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ry = dx * Math.sin(rad) + dy * Math.cos(rad);

        // Account for Flip: transform mouse local coords to base box frame
        const frx = png.flipX ? -rx : rx;
        const fry = png.flipY ? -ry : ry;

        // Match bottom-center anchorhit logic
        const padding = 30; // Use generous hit area for selection
        return (
            Math.abs(frx) <= (displayWidth / 2) + padding &&
            fry >= -displayHeight - padding && fry <= padding
        );
    };

    startDraggingPNG = (png, startX, startY) => {
        const viewerData = this.latestViewerData || {
            yaw: this.state.viewerYaw,
            pitch: this.state.viewerPitch,
            hfov: this.state.viewerHfov
        };

        this.setState({
            pngOverlayAction: PNG_OVERLAY_ACTIONS.DRAGGING,
            pngTransformState: {
                originalPosition: { pitch: png.pitch || 0, yaw: png.yaw || 0 },
                startMousePos: { x: startX, y: startY },
                originalViewerRotation: viewerData
            }
        });
    };

    startResizingPNG = (png, handleType, startX, startY) => {
        this.setState({
            pngOverlayAction: PNG_OVERLAY_ACTIONS.RESIZING,
            activeResizeHandle: handleType,
            pngTransformState: {
                originalSize: {
                    width: png.width || 200,
                    height: png.height || 200,
                    scale: png.scale || 1
                },
                startMousePos: { x: startX, y: startY },
                originalAspectRatio: (png.width || 200) / (png.height || 200)
            }
        });
    };

    startRotatingPNG = (png, startX, startY) => {
        const container = this.containerRef.current;
        if (!container) return;

        const containerRect = container.getBoundingClientRect();

        // Use latest viewer data for rotation calculation
        const viewerData = this.latestViewerData || {
            yaw: this.state.viewerYaw,
            pitch: this.state.viewerPitch,
            hfov: this.state.viewerHfov
        };

        const projected = this.projectToScreen(
            png.yaw, png.pitch,
            viewerData.yaw, viewerData.pitch, viewerData.hfov,
            containerRect.width, containerRect.height
        );

        if (!projected) return;

        const startAngle = Math.atan2(startY - projected.y, startX - projected.x);
        this.setState({
            pngOverlayAction: PNG_OVERLAY_ACTIONS.ROTATING,
            pngTransformState: {
                originalRotation: png.rotation || 0,
                startAngle: startAngle,
                centerPos: { x: projected.x, y: projected.y }
            }
        });
    };

    handlePNGDrag = (x, y, png) => {
        const { pngTransformState } = this.state;
        const { originalPosition, startMousePos, originalViewerRotation } = pngTransformState;

        const canvas = this.overlayCanvasRef.current;
        if (!canvas) return;

        // Use original viewer rotation for consistent movement mapping
        const viewerRotation = originalViewerRotation || this.latestViewerData || {
            yaw: this.state.viewerYaw,
            pitch: this.state.viewerPitch,
            hfov: this.state.viewerHfov
        };

        // Calculate mouse movement
        const deltaX = x - startMousePos.x;
        const deltaY = y - startMousePos.y;

        // Convert pixel movement to panorama coordinate movement
        const rect = canvas.getBoundingClientRect();
        const currentHfov = viewerRotation.hfov || 100;
        const degPerPixel = currentHfov / rect.width;

        const yawDelta = deltaX * degPerPixel;
        const pitchDelta = deltaY * degPerPixel;

        const yawMovement = Math.abs(yawDelta);
        const pitchMovement = Math.abs(pitchDelta);

        // Update Position
        // Standard free dragging for smoother experience
        let newYaw = originalPosition.yaw + yawDelta;
        let newPitch = originalPosition.pitch - pitchDelta;

        // Apply new position
        png.yaw = newYaw;
        png.pitch = newPitch;
    };

    handlePNGResize = (x, y, png) => {
        const { pngTransformState, activeResizeHandle } = this.state;
        const { originalSize, startMousePos, originalAspectRatio } = pngTransformState;

        const container = this.containerRef.current;
        if (!container) return;
        const containerRect = container.getBoundingClientRect();

        // Calculate current perspective scale for 1:1 resize tracking
        let currentPerspectiveScale = 1;
        const viewerData = this.latestViewerData || {
            yaw: this.state.viewerYaw,
            pitch: this.state.viewerPitch,
            hfov: this.state.viewerHfov
        };

        const projected = this.projectToScreen(
            png.yaw, png.pitch,
            viewerData.yaw, viewerData.pitch, viewerData.hfov,
            containerRect.width, containerRect.height
        );

        if (projected) {
            const d2r = Math.PI / 180;
            const fovFactor = 1 / Math.tan(viewerData.hfov * 0.5 * d2r);
            const perspectiveScale = fovFactor * (1 / Math.max(0.01, projected.z));
            currentPerspectiveScale = perspectiveScale;
        }

        const safeScale = Math.max(0.01, currentPerspectiveScale);
        const deltaX = (x - startMousePos.x) / safeScale;
        const deltaY = (y - startMousePos.y) / safeScale;

        let newWidth = originalSize.width;
        let newHeight = originalSize.height;

        if (activeResizeHandle === RESIZE_HANDLES.TOP_LEFT) {
            newWidth = originalSize.width - deltaX;
            newHeight = newWidth / originalAspectRatio;
        } else if (activeResizeHandle === RESIZE_HANDLES.TOP_RIGHT) {
            newWidth = originalSize.width + deltaX;
            newHeight = newWidth / originalAspectRatio;
        } else if (activeResizeHandle === RESIZE_HANDLES.BOTTOM_LEFT) {
            newWidth = originalSize.width - deltaX;
            newHeight = newWidth / originalAspectRatio;
        } else if (activeResizeHandle === RESIZE_HANDLES.BOTTOM_RIGHT) {
            newWidth = originalSize.width + deltaX;
            newHeight = newWidth / originalAspectRatio;
        }

        png.width = Math.max(20, newWidth);
        png.height = Math.max(20, newHeight);
    };

    handlePNGRotate = (x, y, png) => {
        const { pngTransformState } = this.state;
        const { originalRotation, startAngle, centerPos } = pngTransformState;

        const currentAngle = Math.atan2(y - centerPos.y, x - centerPos.x);
        const angleDiff = currentAngle - startAngle;

        png.rotation = originalRotation + (angleDiff * 180 / Math.PI);
    };

    handleDocumentMouseMove = (event) => {
        const { currentScene, scenes, globalPngOverlays, selectedPNGOverlay, pngOverlayAction, pngTransformState } = this.state;
        const allOverlays = [...(scenes[currentScene]?.pngOverlays || []), ...globalPngOverlays];
        const png = allOverlays.find(p => p.id === selectedPNGOverlay);
        if (!png) return;

        const containerRect = this.containerRef.current.getBoundingClientRect();
        const x = event.clientX - containerRect.left;
        const y = event.clientY - containerRect.top;

        // 🔹 Handle Drag Threshold: Only start dragging if we've moved more than 3 pixels
        if (pngOverlayAction === PNG_OVERLAY_ACTIONS.NONE && this.state.mouseDownPosition) {
            const dist = Math.sqrt(Math.pow(x - this.state.mouseDownPosition.x, 2) + Math.pow(y - this.state.mouseDownPosition.y, 2));
            if (dist > 3) {
                this.startDraggingPNG(png, this.state.mouseDownPosition.x, this.state.mouseDownPosition.y);
                return; // Let next move event handle the actual drag
            }
        }

        if (pngOverlayAction === PNG_OVERLAY_ACTIONS.DRAGGING) this.handlePNGDrag(x, y, png);
        else if (pngOverlayAction === PNG_OVERLAY_ACTIONS.RESIZING) this.handlePNGResize(x, y, png);
        else if (pngOverlayAction === PNG_OVERLAY_ACTIONS.ROTATING) this.handlePNGRotate(x, y, png);

        if (pngOverlayAction !== PNG_OVERLAY_ACTIONS.NONE) {
            this.setState({
                globalPngOverlays: [...globalPngOverlays],
                scenes: { ...scenes }
            });
        }
    };

    handleDocumentMouseUp = async () => {
        const { pngOverlayAction, currentScene, scenes, selectedPNGOverlay, mouseDownTime, mouseDownPosition, areas } = this.state;

        // 🔹 Reset state regardless of action to prevent 'ghost dragging' on next move
        this.setState({
            pngOverlayAction: PNG_OVERLAY_ACTIONS.NONE,
            activeResizeHandle: null,
            mouseDownPosition: null,
            mouseDownTime: 0
        });

        if (pngOverlayAction !== PNG_OVERLAY_ACTIONS.NONE) {
            const item = (scenes[currentScene]?.pngOverlays || []).find(p => p.id === selectedPNGOverlay);

            if (item) {
                this.persistItemUpdate(item);
            }
        }
    };

    // Handle clicks on the panorama container (for hotspot navigation)
    handleContainerClick = (event) => {
        const containerRect = this.containerRef.current.getBoundingClientRect();
        const x = event.clientX - containerRect.left;
        const y = event.clientY - containerRect.top;

        const { currentScene, scenes, hotspotPlacementActive, infoHotspotPlacementActive } = this.state;
        const activeScene = scenes[currentScene];

        // If in placement mode, handle placement
        if (hotspotPlacementActive || infoHotspotPlacementActive) {
            const viewer = this.viewerRef.current?.getViewer?.();
            if (!viewer) return;

            const pitch = viewer.mouseEventToCoords(event)[0];
            const yaw = viewer.mouseEventToCoords(event)[1];

            if (infoHotspotPlacementActive) {
                this.setState({
                    pendingInfoHotspotPos: { pitch, yaw },
                    showInfoHotspotDialog: true,
                    infoHotspotPlacementActive: false
                });
            } else {
                this.setState({
                    pendingHotspotPos: { pitch, yaw },
                    showLocationDialog: true,
                    hotspotPlacementActive: false
                });
            }
            return;
        }

        // Check if clicking on a hotspot
        const allHotspots = [...(activeScene?.hotspots || []), ...this.state.globalHotspots];
        const viewerData = this.latestViewerData || {
            yaw: this.state.viewerYaw,
            pitch: this.state.viewerPitch,
            hfov: this.state.viewerHfov
        };

        for (const hotspot of allHotspots) {
            const projected = this.projectToScreen(
                hotspot.yaw,
                hotspot.pitch,
                viewerData.yaw,
                viewerData.pitch,
                viewerData.hfov || 100,
                containerRect.width,
                containerRect.height
            );

            if (projected) {
                const distance = Math.sqrt(Math.pow(x - projected.x, 2) + Math.pow(y - projected.y, 2));
                const clickRadius = 25; // Same as hover radius

                if (distance < clickRadius) {
                    // Hotspot clicked!
                    if (hotspot.type === 'navigation') {
                        this.showHotspot(hotspot);
                    } else if (hotspot.type === 'info') {
                        // Info hotspots are handled by hover/TTS, just log for debugging
                        console.log('Info hotspot clicked - Full object:', JSON.stringify(hotspot, null, 2));
                        console.log('Info hotspot description:', hotspot.description);
                    }
                    return;
                }
            }
        }
    };

    handleViewerMouseDown = (event) => {
        if (this.state.isViewMode) return;
        const containerRect = this.containerRef.current.getBoundingClientRect();
        const x = event.clientX - containerRect.left;
        const y = event.clientY - containerRect.top;

        const { currentScene, scenes, globalPngOverlays, selectedPNGOverlay } = this.state;
        const allOverlays = [...(scenes[currentScene]?.pngOverlays || []), ...globalPngOverlays];

        // 1. Check if clicking on handles of selected item
        if (selectedPNGOverlay) {
            const png = allOverlays.find(p => p.id === selectedPNGOverlay);
            if (png && png.resizeHandles) {
                for (const [handleType, handle] of Object.entries(png.resizeHandles)) {
                    if (handleType === 'rotating') {
                        const dist = Math.sqrt(Math.pow(x - handle.x, 2) + Math.pow(y - handle.y, 2));
                        if (dist <= handle.radius) {
                            this.startRotatingPNG(png, x, y);
                            event.stopPropagation();
                            event.preventDefault();
                            return;
                        }
                    } else {
                        if (x >= handle.x - 25 && x <= handle.x + 25 && y >= handle.y - 25 && y <= handle.y + 25) {
                            this.startResizingPNG(png, handleType, x, y);
                            event.stopPropagation();
                            event.preventDefault();
                            return;
                        }
                    }
                }
            }
        }

        // 2. Check if clicking on any PNG
        let clickedPNG = null;
        for (const png of allOverlays) {
            if (this.isPointInPNG(x, y, png)) {
                clickedPNG = png;
                break;
            }
        }

        if (clickedPNG) {
            this.setState({
                selectedPNGOverlay: clickedPNG.id,
                mouseDownTime: Date.now(),
                mouseDownPosition: { x, y }
            });
            // 🔹 Don't startDraggingPNG immediately. Let MouseMove decide if it's a drag or a click.

            // STOP propagation so Pannellum doesn't pan
            event.stopPropagation();
            event.preventDefault();
        } else {
            this.setState({ selectedPNGOverlay: null, mouseDownPosition: null });
        }
    };

    handleViewerState = () => {
        const viewer = this.viewerRef.current?.getViewer?.();
        if (viewer) {
            this.setState({
                viewerYaw: viewer.getYaw(),
                viewerPitch: viewer.getPitch(),
                viewerHfov: viewer.getHfov()
            });
        }
    };

    getSelectedPNG = () => {
        const { currentScene, scenes, globalPngOverlays, selectedPNGOverlay } = this.state;
        const allOverlays = [...(scenes[currentScene]?.pngOverlays || []), ...globalPngOverlays];
        return allOverlays.find(p => p.id === selectedPNGOverlay);
    };

    updatePNGProperty = (prop, value) => {
        const { currentScene, scenes, globalPngOverlays, selectedPNGOverlay } = this.state;
        const png = this.getSelectedPNG();
        if (!png) return;

        png[prop] = value;
        this.setState({
            globalPngOverlays: [...globalPngOverlays],
            scenes: { ...scenes }
        });

        // 🔹 Persist changes to backend
        if (this.propUpdateTimeout) clearTimeout(this.propUpdateTimeout);
        this.propUpdateTimeout = setTimeout(() => {
            this.persistItemUpdate(png);
        }, 500); // 500ms debounce for property inputs
    };

    persistItemUpdate = async (item) => {
        if (!item) return;
        const { currentScene, areas } = this.state;

        const stragingId = this.props.projectData?.project?._id || this.props.projectData?._id;

        // 🔹 Resolve real Mongo ID for the area
        let areaId = currentScene;
        const area = areas.find(a => a.id === currentScene || a.areaId === currentScene);
        if (area && area.id && !area.id.startsWith('area_') && !area.id.startsWith('virtual_')) {
            areaId = area.id;
        } else if (area && area._id) {
            areaId = area._id;
        }

        const instanceId = item.mongoId || item.id;

        if (stragingId && areaId && instanceId && !instanceId.startsWith('item_instance_')) {
            // Convert back to backend coordinates
            const x = ((item.yaw + 180) / 360) * 100;
            const y = ((90 - item.pitch) / 180) * 100;

            const updateData = {
                x: Math.round(x * 100) / 100,
                y: Math.round(y * 100) / 100,
                rotation: Math.round(item.rotation || 0),
                width: Math.round(item.width || 200),
                height: Math.round(item.height || 200),
                flipX: !!item.flipX,
                flipY: !!item.flipY
            };

            try {
                const { token } = authService.getAuthData();
                console.log("Persisting property update to backend:", { areaId, instanceId, updateData });
                await stragingService.updateItemInstance(stragingId, areaId, instanceId, updateData, token);
            } catch (error) {
                console.error("Failed to persist property update:", error);
            }
        }
    };

    deletePNGOverlay = (id) => {
        this.setState({
            showItemDeleteDialog: true,
            itemToDeleteId: id
        });
    };

    closeItemDeleteDialog = () => {
        this.setState({
            showItemDeleteDialog: false,
            itemToDeleteId: null
        });
    };

    confirmDeleteItem = async () => {
        if (this.state.isLoading) return;
        const { currentScene, areas, itemToDeleteId } = this.state;
        const id = itemToDeleteId;
        if (!id) return;

        let stragingId = this.state.currentTourId;
        if (this.props.projectData) {
            stragingId = stragingId ||
                this.props.projectData._id ||
                this.props.projectData.id ||
                this.props.projectData.project?._id ||
                this.props.projectData.project?.id;
        }

        // Find the area to get its internal ID
        const currentArea = areas.find(a =>
            a.id === currentScene || a.areaId === currentScene
        );

        // 🔹 Try to find the real Mongo ID for this area from projectData
        let realAreaId = currentArea?.id;
        if (this.props.projectData) {
            const rawAreas = this.props.projectData.areas || this.props.projectData.project?.areas || [];
            const foundRawArea = rawAreas.find(a =>
                a.areaId === currentScene ||
                a.id === currentScene ||
                a._id === currentScene ||
                (currentArea && a.areaName === currentArea.name)
            );
            if (foundRawArea && foundRawArea._id) {
                realAreaId = foundRawArea._id;
            }
        }

        if (stragingId && realAreaId) {
            this.setState({ isLoading: true, loadingMessage: "Removing item...", showItemDeleteDialog: false });
            try {
                const { token } = authService.getAuthData();
                const response = await stragingService.deleteItemInstance(stragingId, realAreaId, id, token);

                if (response && (response.success || response.status === 1)) {
                    console.log("Item instance deleted successfully");
                    await this.fetchProjectInfo();
                } else {
                    console.error("Failed to delete item instance:", response);
                    alert("Failed to delete item. " + (response.message || ""));
                }
            } catch (error) {
                console.error("Error deleting item instance:", error);
            } finally {
                this.setState({ isLoading: false, itemToDeleteId: null, selectedPNGOverlay: null });
            }
        } else {
            this.setState({ showItemDeleteDialog: false, itemToDeleteId: null, selectedPNGOverlay: null });
        }
    };

    // Add item from library to the 360 view
    addItemToView = async (libItem, yaw = null, pitch = null) => {
        const { currentScene, areas } = this.state;

        let stragingId = this.state.currentTourId;
        if (this.props.projectData) {
            stragingId = stragingId ||
                this.props.projectData._id ||
                this.props.projectData.id ||
                this.props.projectData.project?._id ||
                this.props.projectData.project?.id;
        }

        const currentYaw = yaw !== null ? yaw : this.state.viewerYaw;
        const currentPitch = pitch !== null ? pitch : this.state.viewerPitch;

        // Convert coordinates to x/y percentages for the backend
        const x = ((currentYaw + 180) / 360) * 100;
        const y = ((90 - currentPitch) / 180) * 100;

        // Find the area to get its internal ID
        let currentArea = areas.find(a =>
            a.id === currentScene || a.areaId === currentScene
        );

        // 🔹 Try to find the real Mongo ID for this area from projectData
        let realAreaId = currentArea?.id;
        if (this.props.projectData) {
            const rawAreas = this.props.projectData.areas || this.props.projectData.project?.areas || [];
            const foundRawArea = rawAreas.find(a =>
                a.areaId === currentScene ||
                a.id === currentScene ||
                a._id === currentScene ||
                (currentArea && a.areaName === currentArea.name)
            );
            if (foundRawArea && foundRawArea._id) {
                realAreaId = foundRawArea._id;
            }
        }

        if (stragingId && realAreaId) {
            this.setState({ isLoading: true, loadingMessage: "Placing item..." });
            try {
                const { token } = authService.getAuthData();
                const placementData = {
                    itemId: libItem.id || libItem._id,
                    x: Math.round(x),
                    y: Math.round(y),
                    rotation: 0,
                    width: 200, // Default width
                    height: 200  // Default height
                };

                const response = await stragingService.placeItemInArea(stragingId, realAreaId, placementData, token);

                if (response && (response.success || response.status === 1)) {
                    console.log("Item placed in area successfully");

                    if (this.fetchProjectInfo) {
                        try { await this.fetchProjectInfo(); } catch (e) { }
                    }

                } else {
                    console.error("Failed to place item in area:", response);
                }
            } catch (error) {
                console.error("Error placing item in area:", error);
            } finally {
                this.setState({ isLoading: false });
            }
        }
    };

    // Global Delete item from Library
    deleteLibraryItem = (itemId, e) => {
        if (e) e.stopPropagation();
        this.setState({
            showLibItemDeleteDialog: true,
            libItemToDeleteId: itemId
        });
    };

    closeLibItemDeleteDialog = () => {
        this.setState({
            showLibItemDeleteDialog: false,
            libItemToDeleteId: null
        });
    };

    confirmDeleteLibraryItem = async () => {
        if (this.state.isLoading) return;
        const { libItemToDeleteId } = this.state;
        if (!libItemToDeleteId) return;

        let stragingId = this.state.currentTourId;
        if (this.props.projectData) {
            stragingId = stragingId ||
                this.props.projectData._id ||
                this.props.projectData.id ||
                this.props.projectData.project?._id ||
                this.props.projectData.project?.id;
        }

        if (!stragingId) {
            console.error("No project ID found for library deletion");
            return;
        }

        this.setState({ isLoading: true, loadingMessage: "Deleting from library...", showLibItemDeleteDialog: false });
        try {
            const { token } = authService.getAuthData();
            const response = await stragingService.deleteItemFromLibrary(stragingId, libItemToDeleteId, token);

            if (response && (response.success || response.status === 1)) {
                console.log("Item deleted from library successfully");
                await this.fetchProjectInfo();
            } else {
                console.error("Failed to delete item from library:", response);
            }
        } catch (error) {
            console.error("Error deleting library item:", error);
        } finally {
            this.setState({ isLoading: false, libItemToDeleteId: null });
        }
    };

    // 🔹 Drag and Drop Handlers for Library
    handleLibraryItemDragStart = (e, item) => {
        e.dataTransfer.setData("application/json", JSON.stringify(item));
        e.dataTransfer.effectAllowed = "copy";
        this.setState({ activeDropItem: item });
    };

    handleViewerDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        const viewer = this.viewerRef.current?.getViewer?.();
        if (viewer && this.state.activeDropItem) {
            const coords = viewer.mouseEventToCoords(e);

            // Calculate screen coordinates for the drop indicator
            const containerRect = this.containerRef.current.getBoundingClientRect();
            const x = e.clientX - containerRect.left;
            const y = e.clientY - containerRect.top;

            if (coords) {
                this.setState({
                    dropZonePosition: {
                        yaw: coords[1],
                        pitch: coords[0],
                        x: x,
                        y: y
                    }
                });
            }
        }
    };

    handleViewerDragLeave = () => {
        // Optional: clear position if needed, but might flicker
    };

    handleViewerDrop = (e) => {
        e.preventDefault();
        if (this.state.isViewMode) return;
        const data = e.dataTransfer.getData("application/json");
        this.setState({ activeDropItem: null, dropZonePosition: null });

        if (!data) return;

        try {
            const libItem = JSON.parse(data);
            const viewer = this.viewerRef.current?.getViewer?.();
            if (viewer) {
                // Convert mouse drop position to pitch/yaw
                const coords = viewer.mouseEventToCoords(e);
                if (coords) {
                    this.addItemToView(libItem, coords[1], coords[0]);
                }
            }
        } catch (error) {
            console.error("Drop error:", error);
        }
    };

    // Close hotspot overlay
    closeHotspotOverlay = () => {
        this.setState({
            showHotspotOverlay: false,
            selectedHotspot: null,
        });
    };


    // Handle Share Button Click
    handleShare = async () => {
        const stragingId = this.props.projectData?._id || this.props.projectData?.id || this.props.projectData?.project?._id;
        if (!stragingId) {
            alert("Cannot share: Project ID not found.");
            return;
        }

        const shareUrl = `${window.location.origin}?share=${stragingId}`;
        const shareData = {
            title: this.state.projectInfoTitle || 'Virtual Tour',
            text: 'Check out this 360° virtual tour!',
            url: shareUrl
        };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
                console.log('Content shared successfully');
            } catch (err) {
                console.error('Error sharing:', err);
            }
        } else {
            // Fallback to clipboard
            if (navigator.clipboard) {
                navigator.clipboard.writeText(shareUrl).then(() => {
                    alert("Share link copied to clipboard!\n" + shareUrl);
                }).catch(err => {
                    console.error('Could not copy text: ', err);
                    prompt("Copy this link to share:", shareUrl);
                });
            } else {
                prompt("Copy this link to share:", shareUrl);
            }
        }
    };

    render() {
        const {
            currentScene,
            scenes,
            areas,
            showLocationDialog,
            showSelectAreaSlider,
            showHotspotOverlay,
            showPlacementModal,
            selectedHotspot,
            selectedArea,
            showDeleteDialog,
            areaToDelete,
            showAddItemsDialog,
            newItemImage,
            showAddAreaDialog,
            newAreaName,
            newAreaImage,
            hotspotName,
            uploadedImage,
            selectedLocation,
            hotspotPlacementActive,
            infoHotspotPlacementActive,
            ttsEnabled,
            isLoading,
            loadingMessage
        } = this.state;

        const activeScene = currentScene ? scenes[currentScene] : null;

        return (
            <div className="virtual-tour-app">
                {/* Header */}
                <div className="app-header">
                    <div className="header-left">
                        <button className="back-button" onClick={(e) => {
                            console.log('Back button onClick triggered!');
                            e.preventDefault();
                            e.stopPropagation();
                            this.handleBack();
                        }}>
                            <IconBack />
                        </button>
                        <h1 className="project-title"
                            style={{ cursor: 'pointer' }}
                            onClick={this.openProjectInfoDialog}
                            title="Click to edit project info"
                        >
                            {this.state.projectInfoTitle || this.props.projectData?.projectName || "New Project"}
                        </h1>
                    </div>
                    <div className="header-right">
                        <div className="header-buttons">
                            <div style={{ display: 'flex', gap: '10px' }}>
                                {this.state.isViewMode ? (
                                    <div className="view-mode-indicator">
                                        <span>🔗 Shared View</span>
                                    </div>
                                ) : (
                                    <button className="save-button" onClick={this.handleSave}>
                                        SAVE
                                    </button>
                                )}
                                <button
                                    className="volume-toggle-button"
                                    onClick={this.toggleTTS}
                                    title={ttsEnabled ? "Turn off text-to-speech" : "Turn on text-to-speech"}
                                >
                                    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        {ttsEnabled ? (
                                            <path d="M11 5L6 9H2V15H6L11 19V5Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        ) : (
                                            <path d="M11 5L6 9H2V15H6L11 19V5ZM23 9L17 15M17 9L23 15" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        )}
                                        {ttsEnabled && (
                                            <path d="M15.54 8.46C16.4774 9.39764 17.004 10.6692 17.004 11.995C17.004 13.3208 16.4774 14.5924 15.54 15.53M19.07 4.93C20.9447 6.80528 21.9979 9.34836 21.9979 12C21.9979 14.6516 20.9447 17.1947 19.07 19.07" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        )}
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            {!this.state.isViewMode && (
                                <button
                                    className="volume-toggle-button"
                                    onClick={this.handleShare}
                                    title="Share tour"
                                    style={{ marginLeft: '10px' }}
                                >
                                    <IconShare />
                                </button>
                            )}
                            <div className="compass-icon">
                                <IconCompass />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Direct Placement Hint (Overlay on top of Panorama) */}
                {
                    (hotspotPlacementActive || infoHotspotPlacementActive) && (
                        <div className="placement-hint-overlay centered-fade-in">
                            <div className="placement-hint-card">
                                <span className="placement-hint-text">
                                    {infoHotspotPlacementActive ? "Click anywhere to place info hotspot" : "Click anywhere to place your hotspot"}
                                </span>
                                <button className="close-hint-button" onClick={this.closeLocationDialog}>×</button>
                            </div>
                        </div>
                    )
                }

                {/* Panorama Viewer Container */}
                <div
                    className="panorama-viewer"
                    ref={this.containerRef}
                    onDragOver={this.handleViewerDragOver}
                    onDrop={this.handleViewerDrop}
                    onClick={this.handleContainerClick}
                >
                    <Pannellum
                        ref={this.viewerRef}
                        width="100%"
                        height="100%"
                        image={activeScene?.image || ""}
                        pitch={this.state.viewerPitch}
                        yaw={this.state.viewerYaw}
                        hfov={this.state.viewerHfov || 100}
                        autoLoad
                        showZoomCtrl={false}
                        showFullscreenCtrl={false}
                        mouseZoom={!showLocationDialog && !showPlacementModal && !showAddAreaDialog && !showAddItemsDialog}
                        draggable={!showLocationDialog && !showPlacementModal && !showAddAreaDialog && !showAddItemsDialog}
                        onMousedown={this.handleViewerState}
                        onMouseup={this.handleViewerState}
                        onTouchend={this.handleViewerState}
                        onLoad={() => console.log('Panorama loaded successfully:', activeScene?.image)}
                        onError={(error) => console.error('Panorama loading error:', error, 'Image URL:', activeScene?.image)}
                        minPitch={-60}
                        maxPitch={60}
                    >
                        {/* 
                          Canvas overlay handles hotspots for better precision and 'sticky' behavior.
                          We keep the children empty or for non-interactive indicators.
                        */}
                    </Pannellum>
                    <canvas
                        ref={this.overlayCanvasRef}
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            pointerEvents: "none", // Let events pass to Pannellum
                            zIndex: 10
                        }}
                    />

                    {/* Visual Drop Zone Indicator */}
                    {this.state.activeDropItem && this.state.dropZonePosition && (
                        <div
                            className="drop-zone-indicator"
                            style={{
                                top: this.state.dropZonePosition.y,
                                left: this.state.dropZonePosition.x,
                                // Center the box on the mouse cursor
                                transform: 'translate(-50%, -50%)'
                            }}
                        >
                            <div className="drop-rotate-group" style={{ top: '-32px' }}>
                                <div className="drop-rotate-icon" style={{ background: 'transparent', border: 'none' }}>
                                    <img
                                        src={reloaderIconPath}
                                        alt="Rotate"
                                        style={{ width: '20px', height: '20px', objectFit: 'contain' }}
                                    />
                                </div>
                                <div className="drop-rotate-line" style={{ height: '10px' }}></div>
                            </div>

                            <img
                                src={this.state.activeDropItem.image}
                                alt="Drop preview"
                                className="drop-zone-preview-image"
                            />
                        </div>
                    )}
                </div>

                {/* Bottom Left - Add Items Button & Item Library */}
                {!this.state.isViewMode && (
                    <div className="add-items-container">
                        <div className="add-items-button" onClick={this.openAddItemsDialog}>
                            <span className="icon">+</span>
                            <span className="label">Add Items</span>
                        </div>

                        {/* Item Library Gallery */}
                        <div className="item-library-gallery">
                            {this.state.itemLibrary.map((item) => (
                                <div
                                    key={item.id}
                                    className="library-item"
                                    onClick={() => this.addItemToView(item)}
                                    draggable
                                    onDragStart={(e) => this.handleLibraryItemDragStart(e, item)}
                                    title="Drag to place or Click to add"
                                >
                                    <img src={item.image} alt={item.name} />
                                    <div className="add-overlay">+</div>
                                    <button
                                        className="delete-item-lib-btn"
                                        onClick={(e) => this.deleteLibraryItem(item.id || item._id, e)}
                                        title="Delete from library"
                                    >
                                        <img src={binico} alt="Delete" style={{ width: 12, height: 12 }} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Bottom Right - Control Icons */}
                {!this.state.isViewMode && (
                    <div className="control-icons">
                        <button
                            className="control-icon"
                            onClick={this.openSelectAreaSlider}
                            title="Locations"
                        >
                            <IconHotspot />
                        </button>
                        <button
                            className="control-icon"
                            title="Info"
                            onClick={this.openInfoHotspotPlacement}
                        >
                            <IconInfo />
                        </button>
                        <button
                            className="control-icon"
                            title="Layers"
                            onClick={this.openLocationDialog}
                        >
                            <IconLayers />
                        </button>
                    </div>
                )}


                {/* Select Area Slider */}
                {
                    showSelectAreaSlider && (
                        <div className="slider-overlay" onClick={this.closeSelectAreaSlider}>
                            <div className="select-area-slider slider-slide-up" onClick={(e) => e.stopPropagation()}>
                                <h3 className="slider-header">Select Area</h3>

                                <div className="area-list">
                                    {areas.map((area) => (
                                        <div
                                            key={area.id}
                                            className={`area-item ${currentScene === area.id ? "selected" : ""}`}
                                            onClick={() => this.selectArea(area.id)}
                                        >
                                            <div className="area-item-left">
                                                <div className="area-radio" />
                                                <span className="area-name">{area.areaName || area.name}</span>
                                            </div>
                                            {/* 🔹 Only show delete button if there are multiple areas */}
                                            {areas.length > 1 && (
                                                <button
                                                    className="delete-area-button"
                                                    onClick={(e) => this.showDeleteConfirmation(area.id, e)}
                                                >
                                                    <img src={binico} alt="Delete" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                <button className="close-slider-button" onClick={this.closeSelectAreaSlider}>×</button>
                            </div>
                        </div>
                    )
                }

                {/* Modals outside */}
                {/* Location Dialog (Hotspot Name only) */}
                {
                    showLocationDialog && (
                        <div className="location-dialog-overlay fade-in" onClick={this.closeLocationDialog}>
                            <div className="location-dialog" onClick={(e) => e.stopPropagation()}>
                                <h2 className="dialog-title" style={{ marginBottom: '25px', textAlign: 'center' }}>Add Hotspot</h2>

                                {/* Drag & Drop Area or Image Preview */}
                                {!uploadedImage ? (
                                    <div
                                        className="drag-drop-area"
                                        onDragOver={this.handleDragOver}
                                        onDragLeave={this.handleDragLeave}
                                        onDrop={this.handleDrop}
                                        onClick={this.triggerFileInput}
                                    >
                                        <div className="drag-drop-icon">+</div>
                                        <div className="drag-drop-text">Drop your files here</div>
                                        <div className="drag-drop-subtext">
                                            <span className="browse-link">Browse file</span> from your
                                            gallery
                                        </div>
                                    </div>
                                ) : (
                                    <div className="image-preview-container">
                                        <img
                                            src={uploadedImage}
                                            alt="Preview"
                                            className="image-preview"
                                        />
                                        <button
                                            className="remove-image-button"
                                            onClick={this.removeUploadedImage}
                                        >
                                            ×
                                        </button>
                                    </div>
                                )}

                                <input
                                    ref={this.fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={this.handleFileUpload}
                                    className="hidden-input"
                                />

                                {/* Link to Existing Location */}
                                <div className="link-section" style={{ marginTop: '20px' }}>
                                    <div className="link-header">
                                        <div className="link-title">
                                            Link to Existing Location
                                            <span className="link-icon">🔗</span>
                                        </div>
                                    </div>
                                    <select
                                        className="location-dropdown"
                                        value={selectedLocation}
                                        onChange={this.handleLocationChange}
                                    >
                                        <option value="">Select a Tour Location</option>
                                        {Object.values(scenes).map((scene) => (
                                            <option key={scene.id} value={scene.id}>
                                                {scene.title}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Hotspot Name Input - ONLY show if NO location is selected */}
                                {!selectedLocation && (
                                    <div className="area-input-container" style={{ marginTop: '20px' }}>
                                        <label className="area-input-label">Hotspot Name</label>
                                        <input
                                            type="text"
                                            className="area-name-input"
                                            placeholder="Enter hotspot name"
                                            value={this.state.hotspotName}
                                            onChange={(e) => this.setState({ hotspotName: e.target.value })}
                                            autoFocus
                                        />
                                    </div>
                                )}

                                {/* Dialog Actions */}
                                <div className="dialog-actions">
                                    <button
                                        className="dialog-button save-dialog-button"
                                        onClick={this.saveLocationDialog}
                                        disabled={((!selectedLocation && !this.state.hotspotName.trim()) && !uploadedImage) || this.state.isLoading}
                                    >
                                        Save
                                    </button>
                                    <button
                                        className="dialog-button cancel-dialog-button"
                                        onClick={this.closeLocationDialog}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Area Delete Confirmation Dialog */}
                {
                    showDeleteDialog && (
                        <div className="delete-dialog-overlay fade-in" onClick={this.closeDeleteDialog}>
                            <div className="delete-dialog" onClick={(e) => e.stopPropagation()}>
                                <div className="delete-icon">🗑️</div>
                                <h3 className="delete-title">Delete this Area?</h3>
                                <p className="delete-message">
                                    Turn any property into an immersive 360° experience.
                                </p>
                                <div className="delete-actions">
                                    <button
                                        className="delete-confirm-button"
                                        onClick={this.confirmDeleteArea}
                                    >
                                        Delete
                                    </button>
                                    <button
                                        className="delete-cancel-button"
                                        onClick={this.closeDeleteDialog}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Specific Item Delete Confirmation Dialog */}
                {
                    this.state.showItemDeleteDialog && (
                        <div className="delete-dialog-overlay fade-in" onClick={this.closeItemDeleteDialog}>
                            <div className="delete-dialog" onClick={(e) => e.stopPropagation()}>
                                <div className="delete-icon">🗑️</div>
                                <h3 className="delete-title">Remove Item?</h3>
                                <p className="delete-message">
                                    Are you sure you want to remove this item from this area?
                                </p>
                                <div className="delete-actions">
                                    <button
                                        className="delete-confirm-button"
                                        onClick={this.confirmDeleteItem}
                                    >
                                        Delete
                                    </button>
                                    <button
                                        className="delete-cancel-button"
                                        onClick={this.closeItemDeleteDialog}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Global Library Item Delete Confirmation Dialog */}
                {
                    this.state.showLibItemDeleteDialog && (
                        <div className="delete-dialog-overlay fade-in" onClick={this.closeLibItemDeleteDialog}>
                            <div className="delete-dialog" onClick={(e) => e.stopPropagation()}>
                                <div className="delete-icon">🗑️</div>
                                <h3 className="delete-title">Delete from Library?</h3>
                                <p className="delete-message">
                                    This will permanently remove the item from the library and ALL areas where it is placed.
                                </p>
                                <div className="delete-actions">
                                    <button
                                        className="delete-confirm-button"
                                        onClick={this.confirmDeleteLibraryItem}
                                    >
                                        Delete
                                    </button>
                                    <button
                                        className="delete-cancel-button"
                                        onClick={this.closeLibItemDeleteDialog}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Add Items Dialog */}
                {
                    showAddItemsDialog && (
                        <div className="location-dialog-overlay fade-in" onClick={this.closeAddItemsDialog}>
                            <div className="location-dialog" onClick={(e) => e.stopPropagation()}>
                                <h2 className="dialog-title">Add Item</h2>

                                {/* Drag & Drop Area or Image Preview */}
                                {!newItemImage ? (
                                    <div
                                        className="drag-drop-area"
                                        onDragOver={this.handleItemDragOver}
                                        onDragLeave={this.handleItemDragLeave}
                                        onDrop={this.handleItemDrop}
                                        onClick={this.triggerItemFileInput}
                                    >
                                        <div className="drag-drop-icon">+</div>
                                        <div className="drag-drop-text">Drop your files here</div>
                                        <div className="drag-drop-subtext">
                                            <span className="browse-link">Browse file</span> from your
                                            gallery
                                        </div>
                                    </div>
                                ) : (
                                    <div className="image-preview-container">
                                        <img
                                            src={newItemImage}
                                            alt="Preview"
                                            className="image-preview"
                                        />
                                        <button
                                            className="remove-image-button"
                                            onClick={this.removeNewItemImage}
                                        >
                                            ×
                                        </button>
                                    </div>
                                )}

                                <input
                                    ref={this.itemFileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={this.handleItemFileUpload}
                                    className="hidden-input"
                                />

                                {/* Dialog Actions */}
                                <div className="dialog-actions">
                                    <button
                                        className="dialog-button save-dialog-button"
                                        onClick={this.saveNewItem}
                                        disabled={!newItemImage || this.state.isLoading}
                                    >
                                        Save
                                    </button>
                                    <button
                                        className="dialog-button cancel-dialog-button"
                                        onClick={this.closeAddItemsDialog}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Add Area Dialog */}
                {
                    showAddAreaDialog && (
                        <div className="location-dialog-overlay fade-in" onClick={this.closeAddAreaDialog}>
                            <div className="location-dialog" onClick={(e) => e.stopPropagation()}>
                                {/* Drag & Drop Area or Image Preview (Pannellum Image) */}
                                {!newAreaImage ? (
                                    <div
                                        className="drag-drop-area"
                                        onDragOver={this.handleDragOver}
                                        onDragLeave={this.handleDragLeave}
                                        onDrop={this.handleAreaImageDrop}
                                        onClick={this.triggerFileInput}
                                    >
                                        <div className="drag-drop-icon">+</div>
                                        <div className="drag-drop-text">Drop your files here</div>
                                        <div className="drag-drop-subtext">
                                            <span className="browse-link">Browse file</span> from your
                                            gallery
                                        </div>
                                    </div>
                                ) : (
                                    <div className="image-preview-container">
                                        <img
                                            src={newAreaImage}
                                            alt="Area Preview"
                                            className="image-preview"
                                        />
                                        <button
                                            className="remove-image-button"
                                            onClick={this.removeAreaImage}
                                        >
                                            ×
                                        </button>
                                    </div>
                                )}

                                <input
                                    ref={this.fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={this.handleAreaImageUpload}
                                    className="hidden-input"
                                />

                                {/* Area Name Input */}
                                <div className="area-input-container">
                                    <label className="area-input-label">Area Name</label>
                                    <input
                                        type="text"
                                        className="area-name-input"
                                        placeholder="Enter area name"
                                        value={newAreaName}
                                        onChange={this.handleAreaNameChange}
                                        autoFocus
                                    />
                                </div>

                                {/* Dialog Actions */}
                                <div className="dialog-actions">
                                    <button
                                        className="dialog-button save-dialog-button"
                                        onClick={this.saveNewArea}
                                        disabled={!newAreaName.trim() || this.state.isLoading}
                                    >
                                        Save
                                    </button>
                                    <button
                                        className="dialog-button cancel-dialog-button"
                                        onClick={this.closeAddAreaDialog}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }
                {/* Project Info Dialog */}
                {
                    this.state.showProjectInfoDialog && (
                        <div className="location-dialog-overlay fade-in" onClick={this.closeProjectInfoDialog}>
                            <div className="location-dialog" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
                                <h3 className="dialog-title">Project Information</h3>
                                <div className="area-input-container">
                                    <label className="area-input-label">Project Title</label>
                                    <input
                                        type="text"
                                        className="area-name-input"
                                        placeholder="Enter project title"
                                        value={this.state.projectInfoTitle}
                                        onChange={(e) => this.setState({ projectInfoTitle: e.target.value })}
                                        autoFocus
                                    />
                                </div>
                                <div className="area-input-container">
                                    <label className="area-input-label">Project Description</label>
                                    <textarea
                                        className="area-name-input"
                                        style={{ minHeight: '120px', paddingTop: '12px' }}
                                        placeholder="Enter project description..."
                                        value={this.state.projectInfoDescription}
                                        onChange={(e) => this.setState({ projectInfoDescription: e.target.value })}
                                    />
                                </div>
                                <div className="dialog-actions">
                                    <button
                                        className="dialog-button save-dialog-button"
                                        onClick={this.saveProjectInfo}
                                        disabled={!this.state.projectInfoDescription.trim() || this.state.isLoading}
                                    >
                                        Update Info
                                    </button>
                                    <button
                                        className="dialog-button cancel-dialog-button"
                                        onClick={this.closeProjectInfoDialog}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Information Hotspot Dialog */}
                {
                    this.state.showInfoHotspotDialog && (
                        <div className="location-dialog-overlay fade-in">
                            <div className="location-dialog" style={{ maxWidth: '400px' }}>
                                <h3 className="dialog-title">Add Information</h3>
                                <div className="area-input-container">
                                    <label className="area-input-label">Description</label>
                                    <textarea
                                        className="area-name-input"
                                        style={{ minHeight: '120px', paddingTop: '12px' }}
                                        placeholder="Enter information description..."
                                        value={this.state.infoHotspotDescription}
                                        onChange={(e) => this.setState({ infoHotspotDescription: e.target.value })}
                                        autoFocus
                                    />
                                </div>
                                <div className="dialog-actions">
                                    <button
                                        className="dialog-button save-dialog-button"
                                        onClick={this.saveInfoHotspot}
                                        disabled={!this.state.infoHotspotDescription.trim() || this.state.isLoading}
                                    >
                                        Save
                                    </button>
                                    <button
                                        className="dialog-button cancel-dialog-button"
                                        onClick={this.closeInfoHotspotDialog}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }
                {/* PNG Properties Panel */}
                {
                    this.state.selectedPNGOverlay && (
                        <div className="png-properties-panel fade-in">
                            <div className="panel-header">
                                <span>Item Properties</span>
                                <button className="remove-item-btn" onClick={() => this.deletePNGOverlay(this.state.selectedPNGOverlay)}>
                                    <img src={binico} alt="Delete" style={{ width: 16 }} />
                                </button>
                            </div>
                            <div className="panel-body">
                                <div className="property-grid">
                                    <div className="property-row">
                                        <label className="section-title">Width</label>
                                        <input
                                            type="number"
                                            className="premium-input"
                                            value={Math.round(this.getSelectedPNG()?.width || 0)}
                                            onChange={(e) => this.updatePNGProperty('width', parseFloat(e.target.value))}
                                        />
                                    </div>
                                    <div className="property-row">
                                        <label className="section-title">Height</label>
                                        <input
                                            type="number"
                                            className="premium-input"
                                            value={Math.round(this.getSelectedPNG()?.height || 0)}
                                            onChange={(e) => this.updatePNGProperty('height', parseFloat(e.target.value))}
                                        />
                                    </div>
                                </div>

                                <div className="property-row">
                                    <div className="label-with-icon">
                                        <div className="icon-box">
                                            <img src={reloaderIconPath} alt="" className="label-icon" />
                                        </div>
                                        <label className="section-title">Rotation</label>
                                    </div>
                                    <div className="slider-container">
                                        <input
                                            type="range"
                                            min="0"
                                            max="360"
                                            step="1"
                                            className="premium-slider"
                                            value={Math.round(this.getSelectedPNG()?.rotation || 0)}
                                            style={{ '--val': `${(Math.round(this.getSelectedPNG()?.rotation || 0) / 360) * 100}%` }}
                                            onChange={(e) => this.updatePNGProperty('rotation', parseFloat(e.target.value))}
                                        />
                                        <span className="slider-value">
                                            {Math.round(this.getSelectedPNG()?.rotation || 0)}°
                                        </span>
                                    </div>
                                </div>

                                <div className="property-row centered-row">
                                    <label className="section-title">Flip</label>
                                    <div className="flip-group">
                                        <button
                                            className={`premium-flip-btn ${this.getSelectedPNG()?.flipX ? 'active' : ''}`}
                                            onClick={() => this.updatePNGProperty('flipX', !this.getSelectedPNG()?.flipX)}
                                        >
                                            Horizontal
                                        </button>
                                        <button
                                            className={`premium-flip-btn ${this.getSelectedPNG()?.flipY ? 'active' : ''}`}
                                            onClick={() => this.updatePNGProperty('flipY', !this.getSelectedPNG()?.flipY)}
                                        >
                                            Vertical
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                }
                {this.state.isLoading && (
                    <LoadingOverlay message={this.state.loadingMessage} />
                )}
            </div>
        );
    }
}

export default VirtualTourApp;
