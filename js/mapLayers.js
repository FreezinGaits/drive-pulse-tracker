/* ============================================
   DrivePulse – MapLayers
   All map data layers: vehicle marker, route,
   heatmaps, clusters, infrastructure overlays.
   ============================================ */
const MapLayers = {
    vehicleMarker: null,
    _layersInitialized: false,

    // ── Initialize all layers on the map ──
    initAllLayers(map) {
        this._layersInitialized = false;
        this._initVehicleMarker(map);
        this._initLiveRouteLayer(map);
        this._initInfraLayers(map);
        this._layersInitialized = true;
    },

    // ── Vehicle Marker (custom animated) ──
    _initVehicleMarker(map) {
        if (this.vehicleMarker) {
            try { this.vehicleMarker.remove(); } catch(e) {}
        }

        const el = document.createElement('div');
        el.className = 'dp-vehicle-marker';
        el.innerHTML = `
            <div class="dp-vehicle-pulse"></div>
            <div class="dp-vehicle-dot">
                <div class="dp-vehicle-arrow"></div>
            </div>
        `;

        this.vehicleMarker = new maplibregl.Marker({
            element: el,
            rotationAlignment: 'map',
            pitchAlignment: 'map'
        }).setLngLat([0, 0]).addTo(map);
    },

    // ── Live Route Layer (animated polyline) ──
    _initLiveRouteLayer(map) {
        if (map.getSource('live-route')) return;

        map.addSource('live-route', {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } }
        });

        // Glow
        map.addLayer({
            id: 'live-route-glow',
            type: 'line',
            source: 'live-route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#00d4ff', 'line-width': 10, 'line-opacity': 0.25, 'line-blur': 4 }
        });

        // Core line
        map.addLayer({
            id: 'live-route-line',
            type: 'line',
            source: 'live-route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#00d4ff', 'line-width': 4, 'line-opacity': 0.9 }
        });
    },

    // ── Infrastructure / CityPulse data layers ──
    _initInfraLayers(map) {
        if (map.getSource('citypulse-data')) return;

        map.addSource('citypulse-data', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 50
        });

        // Heatmap layer (hidden by default, toggled via mode)
        map.addLayer({
            id: 'citypulse-heatmap',
            type: 'heatmap',
            source: 'citypulse-data',
            maxzoom: 16,
            layout: { visibility: 'none' },
            paint: {
                'heatmap-weight': ['get', 'severityScore'],
                'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.5, 15, 3],
                'heatmap-color': [
                    'interpolate', ['linear'], ['heatmap-density'],
                    0,   'rgba(0, 255, 0, 0)',
                    0.2, 'rgba(50, 205, 50, 0.4)',
                    0.5, 'rgba(255, 255, 0, 0.6)',
                    0.8, 'rgba(255, 140, 0, 0.8)',
                    1,   'rgba(255, 0, 0, 0.9)'
                ],
                'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 4, 15, 25],
                'heatmap-opacity': 0.75
            }
        });

        // Cluster circles
        map.addLayer({
            id: 'clusters',
            type: 'circle',
            source: 'citypulse-data',
            filter: ['has', 'point_count'],
            layout: { visibility: 'none' },
            paint: {
                'circle-color': [
                    'step', ['get', 'point_count'],
                    'rgba(0, 212, 255, 0.85)',   // < 10
                    10, 'rgba(255, 152, 0, 0.85)', // 10-50
                    50, 'rgba(244, 67, 54, 0.85)'  // > 50
                ],
                'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 50, 32],
                'circle-stroke-width': 2,
                'circle-stroke-color': 'rgba(255,255,255,0.7)'
            }
        });

        // Cluster count labels
        map.addLayer({
            id: 'cluster-count',
            type: 'symbol',
            source: 'citypulse-data',
            filter: ['has', 'point_count'],
            layout: {
                visibility: 'none',
                'text-field': '{point_count_abbreviated}',
                'text-font': ['Open Sans Bold'],
                'text-size': 13
            },
            paint: { 'text-color': '#fff' }
        });

        // Individual unclustered points
        map.addLayer({
            id: 'unclustered-point',
            type: 'circle',
            source: 'citypulse-data',
            filter: ['!', ['has', 'point_count']],
            layout: { visibility: 'none' },
            paint: {
                'circle-color': [
                    'match', ['get', 'type'],
                    'pothole',      '#ff9800',
                    'road_quality', '#f44336',
                    'noise',        '#e91e9c',
                    'traffic',      '#ffeb3b',
                    'dead_zone',    '#607d8b',
                    '#ffffff'
                ],
                'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 16, 10],
                'circle-stroke-width': 2,
                'circle-stroke-color': '#fff',
                'circle-opacity': 0.9
            }
        });

        // Interactive popup on unclustered points
        map.on('click', 'unclustered-point', (e) => {
            if (!e.features || !e.features.length) return;
            const coords = e.features[0].geometry.coordinates.slice();
            const p = e.features[0].properties;

            const typeIcons = { pothole: '⚠️', road_quality: '🛣️', noise: '🔊', traffic: '🚦', dead_zone: '📵' };
            const typeLabels = { pothole: 'Pothole', road_quality: 'Road Quality', noise: 'Noise Zone', traffic: 'Traffic', dead_zone: 'Dead Zone' };

            new maplibregl.Popup({ closeButton: true, className: 'dp-popup' })
                .setLngLat(coords)
                .setHTML(`
                    <div style="font-family:'Inter',sans-serif;font-size:13px;padding:6px;">
                        <strong style="font-size:15px;">${typeIcons[p.type]||'📍'} ${typeLabels[p.type]||p.type}</strong><br>
                        <span style="color:#999;">Severity:</span> <b style="text-transform:capitalize;">${p.severity}</b><br>
                        ${p.value ? `<span style="color:#999;">Value:</span> ${p.value}<br>` : ''}
                        <span style="color:#999;">Confirmed:</span> ${p.confirmations||1} trip(s)
                    </div>
                `).addTo(map);
        });

        // Click-to-expand cluster
        map.on('click', 'clusters', (e) => {
            const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
            const clusterId = features[0].properties.cluster_id;
            map.getSource('citypulse-data').getClusterExpansionZoom(clusterId, (err, zoom) => {
                if (err) return;
                map.easeTo({ center: features[0].geometry.coordinates, zoom: zoom });
            });
        });

        map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = ''; });
        map.on('mouseenter', 'unclustered-point', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'unclustered-point', () => { map.getCanvas().style.cursor = ''; });
    },

    // ── Update vehicle position + heading rotation ──
    updateVehiclePosition(lng, lat, heading) {
        if (this.vehicleMarker) {
            this.vehicleMarker.setLngLat([lng, lat]);
            if (heading !== null && heading !== undefined && !isNaN(heading)) {
                this.vehicleMarker.setRotation(heading);
            }
        }
    },

    // ── Update live route coordinates ──
    updateLiveRoute(coords) {
        const map = MapEngine.maps.live;
        if (!map) return;
        const src = map.getSource('live-route');
        if (src) {
            src.setData({
                type: 'Feature', properties: {},
                geometry: { type: 'LineString', coordinates: coords }
            });
        }
    },

    // ── Feed CityPulse events into the GeoJSON source ──
    updateInfraData(events) {
        const map = MapEngine.maps.live;
        if (!map) return;
        const src = map.getSource('citypulse-data');
        if (!src) return;

        const features = events
            .filter(e => e.lat && e.lng && e.lat !== 0 && e.lng !== 0)
            .map(e => ({
                type: 'Feature',
                properties: {
                    type: e.type,
                    severity: e.severity,
                    value: e.value || '',
                    confirmations: e.confirmations || 1,
                    severityScore: e.severity === 'high' ? 1.0 : (e.severity === 'medium' ? 0.6 : 0.3)
                },
                geometry: { type: 'Point', coordinates: [e.lng, e.lat] }
            }));

        src.setData({ type: 'FeatureCollection', features });
    },

    // ── Toggle a layer's visibility ──
    toggleLayer(layerId, forceVisible) {
        const map = MapEngine.maps.live;
        if (!map) return;
        try {
            const currentVis = map.getLayoutProperty(layerId, 'visibility');
            const newVis = forceVisible !== undefined ? (forceVisible ? 'visible' : 'none') : (currentVis === 'visible' ? 'none' : 'visible');
            map.setLayoutProperty(layerId, 'visibility', newVis);

            // If showing clusters, also show their labels
            if (layerId === 'clusters') {
                map.setLayoutProperty('cluster-count', 'visibility', newVis);
            }
        } catch(e) {}
    }
};
