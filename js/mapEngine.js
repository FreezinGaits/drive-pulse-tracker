const MapEngine = {
    maps: {},
    currentTheme: 'dark',
    drivingMode: true,
    themes: {
        dark: {
            version: 8,
            sources: {
                'carto-dark': {
                    type: 'raster',
                    tiles: [
                        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
                    ],
                    tileSize: 256
                }
            },
            layers: [{ id: 'carto-dark-layer', type: 'raster', source: 'carto-dark', minzoom: 0, maxzoom: 22 }]
        },
        standard: {
            version: 8,
            sources: {
                'carto-light': {
                    type: 'raster',
                    tiles: [
                        'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
                        'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
                    ],
                    tileSize: 256
                }
            },
            layers: [{ id: 'carto-light-layer', type: 'raster', source: 'carto-light', minzoom: 0, maxzoom: 22 }]
        },
        satellite: {
            version: 8,
            sources: {
                'esri-satellite': {
                    type: 'raster',
                    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
                    tileSize: 256,
                    attribution: 'Tiles &copy; Esri'
                }
            },
            layers: [{ id: 'satellite-layer', type: 'raster', source: 'esri-satellite', minzoom: 0, maxzoom: 22 }]
        }
    },

    initLiveMap(containerId) {
        if(this.maps.live) {
            this.maps.live.remove();
        }

        const map = new maplibregl.Map({
            container: containerId,
            style: this.themes[this.currentTheme],
            center: [0, 0],
            zoom: 15,
            pitch: 45,
            bearing: 0,
            attributionControl: false,
            dragPan: true,
            dragRotate: true
        });

        this.maps.live = map;

        map.on('load', () => {
            MapLayers.initLiveLayers(map);
        });

        MapControls.attach(map, containerId);

        return map;
    },

    setTheme(themeName) {
        if(this.themes[themeName]) {
            this.currentTheme = themeName;
            if(this.maps.live) {
                this.maps.live.setStyle(this.themes[themeName]);
                this.maps.live.once('styledata', () => {
                    MapLayers.initLiveLayers(this.maps.live);
                });
            }
        }
    }
};
