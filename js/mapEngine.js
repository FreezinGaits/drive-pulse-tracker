/* ============================================
   DrivePulse – MapEngine
   Core MapLibre GL JS initialization & state.
   ============================================ */
const MapEngine = {
    maps: {},
    currentTheme: 'dark',
    currentMode: 'driving',   // driving | exploration | satellite | traffic | infrastructure
    drivingMode: true,
    following: true,
    userCoords: null,          // { lng, lat }
    userHeading: 0,
    liveRouteCoords: [],

    // ── Theme definitions (raster + maxzoom for guaranteed rendering) ──
    themes: {
        dark: {
            version: 8,
            name: 'Dark Matter',
            sources: {
                'basemap': {
                    type: 'raster',
                    tiles: [
                        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
                    ],
                    tileSize: 256,
                    maxzoom: 20
                }
            },
            layers: [{ id: 'basemap-tiles', type: 'raster', source: 'basemap', minzoom: 0, maxzoom: 22 }]
        },
        standard: {
            version: 8,
            name: 'Standard',
            sources: {
                'basemap': {
                    type: 'raster',
                    tiles: [
                        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
                        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
                        'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png'
                    ],
                    tileSize: 256,
                    maxzoom: 20
                }
            },
            layers: [{ id: 'basemap-tiles', type: 'raster', source: 'basemap', minzoom: 0, maxzoom: 22 }]
        },
        satellite: {
            version: 8,
            name: 'Satellite',
            sources: {
                'basemap': {
                    type: 'raster',
                    tiles: [
                        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                    ],
                    tileSize: 256,
                    maxzoom: 19
                }
            },
            layers: [{ id: 'basemap-tiles', type: 'raster', source: 'basemap', minzoom: 0, maxzoom: 22 }]
        },
        terrain: {
            version: 8,
            name: 'Terrain',
            sources: {
                'basemap': {
                    type: 'raster',
                    tiles: [
                        'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
                        'https://b.tile.opentopomap.org/{z}/{x}/{y}.png'
                    ],
                    tileSize: 256,
                    maxzoom: 17
                }
            },
            layers: [{ id: 'basemap-tiles', type: 'raster', source: 'basemap', minzoom: 0, maxzoom: 22 }]
        },
        minimal: {
            version: 8,
            name: 'Minimal Nav',
            sources: {
                'basemap': {
                    type: 'raster',
                    tiles: [
                        'https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png',
                        'https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png'
                    ],
                    tileSize: 256,
                    maxzoom: 20
                }
            },
            layers: [{ id: 'basemap-tiles', type: 'raster', source: 'basemap', minzoom: 0, maxzoom: 22 }]
        }
    },

    // ── Get user location FIRST, then create map ──
    async initLiveMap(containerId) {
        if (this.maps.live) {
            try { this.maps.live.remove(); } catch(e) {}
            this.maps.live = null;
        }

        // Get user location before creating map
        let startCenter = [78.9629, 20.5937]; // Fallback: India center
        let startZoom = 5;

        try {
            const pos = await this._getPosition();
            startCenter = [pos.coords.longitude, pos.coords.latitude];
            this.userCoords = { lng: pos.coords.longitude, lat: pos.coords.latitude };
            startZoom = 16;
        } catch(e) {
            console.warn('MapEngine: Could not get GPS, using default center');
        }

        const map = new maplibregl.Map({
            container: containerId,
            style: this.themes[this.currentTheme],
            center: startCenter,
            zoom: startZoom,
            pitch: 45,
            bearing: 0,
            attributionControl: false,
            dragRotate: true,
            touchPitch: true
        });

        this.maps.live = map;

        map.on('load', () => {
            MapLayers.initAllLayers(map);
            // Load CityPulse data asynchronously
            if (typeof CityPulse !== 'undefined') {
                CityPulse.getAggregatedStats().then(stats => {
                    if (stats && stats.allEvents) MapLayers.updateInfraData(stats.allEvents);
                }).catch(() => {});
            }
        });

        // Attach floating controls
        MapControls.attach(map, containerId);

        // Start GPS tracking
        this._startTracking();

        return map;
    },

    // ── Watch position continuously ──
    _startTracking() {
        if (!navigator.geolocation) return;

        this._watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const lng = pos.coords.longitude;
                const lat = pos.coords.latitude;
                const heading = pos.coords.heading || this.userHeading;
                this.userCoords = { lng, lat };
                this.userHeading = heading;

                MapLayers.updateVehiclePosition(lng, lat, heading);

                // Add to live route if trip is active
                this.liveRouteCoords.push([lng, lat]);
                MapLayers.updateLiveRoute(this.liveRouteCoords);

                // Follow user
                if (this.following && this.maps.live) {
                    const opts = { center: [lng, lat], duration: 1000 };
                    if (this.drivingMode && heading !== null && !isNaN(heading)) {
                        opts.bearing = heading;
                    }
                    this.maps.live.easeTo(opts);
                }
            },
            (err) => console.warn('MapEngine GPS error:', err.message),
            { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
        );
    },

    // ── Promisified getCurrentPosition ──
    _getPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error('No geolocation'));
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true, timeout: 8000, maximumAge: 60000
            });
        });
    },

    // ── Switch theme (style swap) ──
    setTheme(themeName) {
        if (!this.themes[themeName]) return;
        this.currentTheme = themeName;
        if (this.maps.live) {
            const currentCenter = this.maps.live.getCenter();
            const currentZoom = this.maps.live.getZoom();
            const currentPitch = this.maps.live.getPitch();
            const currentBearing = this.maps.live.getBearing();

            this.maps.live.setStyle(this.themes[themeName]);
            this.maps.live.once('style.load', () => {
                MapLayers.initAllLayers(this.maps.live);
                // Restore position
                this.maps.live.jumpTo({ center: currentCenter, zoom: currentZoom, pitch: currentPitch, bearing: currentBearing });
                // Restore vehicle marker
                if (this.userCoords) {
                    MapLayers.updateVehiclePosition(this.userCoords.lng, this.userCoords.lat, this.userHeading);
                }
                // Restore live route
                if (this.liveRouteCoords.length > 0) {
                    MapLayers.updateLiveRoute(this.liveRouteCoords);
                }
                // Restore infra data
                if (typeof CityPulse !== 'undefined') {
                    CityPulse.getAggregatedStats().then(stats => {
                        if (stats && stats.allEvents) MapLayers.updateInfraData(stats.allEvents);
                    }).catch(() => {});
                }
            });
        }
    },

    // ── Switch mode ──
    setMode(mode) {
        this.currentMode = mode;
        switch(mode) {
            case 'driving':
                this.drivingMode = true;
                this.following = true;
                if (this.maps.live) this.maps.live.easeTo({ pitch: 45 });
                break;
            case 'exploration':
                this.drivingMode = false;
                this.following = true;
                if (this.maps.live) this.maps.live.easeTo({ bearing: 0, pitch: 0 });
                break;
            case 'satellite':
                this.setTheme('satellite');
                break;
            case 'traffic':
                MapLayers.toggleLayer('citypulse-heatmap', true);
                break;
            case 'infrastructure':
                MapLayers.toggleLayer('clusters', true);
                MapLayers.toggleLayer('unclustered-point', true);
                break;
        }
    },

    // ── Recenter on user ──
    recenter() {
        this.following = true;
        if (this.userCoords && this.maps.live) {
            this.maps.live.flyTo({
                center: [this.userCoords.lng, this.userCoords.lat],
                zoom: 16,
                pitch: this.drivingMode ? 45 : 0,
                bearing: this.drivingMode ? this.userHeading : 0,
                duration: 800
            });
        }
    },

    // ── Reset live route (when trip ends) ──
    resetLiveRoute() {
        this.liveRouteCoords = [];
        MapLayers.updateLiveRoute([]);
    }
};
