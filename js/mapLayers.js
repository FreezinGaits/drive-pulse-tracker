const MapLayers = {
    vehicleMarker: null,

    initLiveLayers(map) {
        // Vehicle Marker
        if (!this.vehicleMarker) {
            const el = document.createElement('div');
            el.className = 'vehicle-marker';
            el.innerHTML = `
                <div style="position: relative; width: 24px; height: 24px;">
                    <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background: #00d4ff; opacity: 0.3; animation: livePulse 2s infinite;"></div>
                    <div style="position: absolute; width: 16px; height: 16px; top: 4px; left: 4px; border-radius: 50%; background: #00d4ff; border: 2px solid white; box-shadow: 0 0 10px #00d4ff;"></div>
                    <div style="position: absolute; width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 10px solid white; top: -8px; left: 6px;"></div>
                </div>
            `;
            this.vehicleMarker = new maplibregl.Marker({ element: el, rotationAlignment: 'map' })
                .setLngLat([0,0])
                .addTo(map);
        } else {
            this.vehicleMarker.addTo(map);
        }

        // Live Route
        if (!map.getSource('live-route')) {
            map.addSource('live-route', {
                type: 'geojson',
                data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } }
            });
            map.addLayer({
                id: 'live-route-glow',
                type: 'line',
                source: 'live-route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#00d4ff', 'line-width': 8, 'line-opacity': 0.3 }
            });
            map.addLayer({
                id: 'live-route-line',
                type: 'line',
                source: 'live-route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': '#00d4ff', 'line-width': 4 }
            });
        }

        // Infrastructure Data Clustered Source
        if (!map.getSource('citypulse-data')) {
            map.addSource('citypulse-data', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] },
                cluster: true,
                clusterMaxZoom: 14,
                clusterRadius: 50
            });

            // Heatmap layer
            map.addLayer({
                id: 'citypulse-heatmap',
                type: 'heatmap',
                source: 'citypulse-data',
                maxzoom: 15,
                paint: {
                    'heatmap-weight': ['get', 'severityScore'],
                    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 15, 3],
                    'heatmap-color': [
                        'interpolate', ['linear'], ['heatmap-density'],
                        0, 'rgba(0, 255, 0, 0)',
                        0.2, 'rgba(255, 255, 0, 0.5)',
                        1, 'rgba(255, 0, 0, 0.8)'
                    ],
                    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 15, 20],
                    'heatmap-opacity': 0.7
                }
            });

            // Clusters
            map.addLayer({
                id: 'clusters',
                type: 'circle',
                source: 'citypulse-data',
                filter: ['has', 'point_count'],
                paint: {
                    'circle-color': ['step', ['get', 'point_count'], 'rgba(0, 212, 255, 0.8)', 10, 'rgba(255, 152, 0, 0.8)', 50, 'rgba(244, 67, 54, 0.8)'],
                    'circle-radius': ['step', ['get', 'point_count'], 15, 10, 20, 50, 25],
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#fff'
                }
            });

            map.addLayer({
                id: 'cluster-count',
                type: 'symbol',
                source: 'citypulse-data',
                filter: ['has', 'point_count'],
                layout: {
                    'text-field': '{point_count_abbreviated}',
                    'text-font': ['Arial Unicode MS Bold'],
                    'text-size': 12
                },
                paint: { 'text-color': '#fff' }
            });

            // Individual Unclustered Points
            map.addLayer({
                id: 'unclustered-point',
                type: 'circle',
                source: 'citypulse-data',
                filter: ['!', ['has', 'point_count']],
                paint: {
                    'circle-color': [
                        'match', ['get', 'type'],
                        'pothole', '#ff9800',
                        'road_quality', '#f44336',
                        'noise', '#9c27b0',
                        'traffic', '#ffeb3b',
                        'dead_zone', '#607d8b',
                        '#ffffff'
                    ],
                    'circle-radius': 8,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#fff'
                }
            });

            // Popup interactions
            map.on('click', 'unclustered-point', (e) => {
                const coordinates = e.features[0].geometry.coordinates.slice();
                const props = e.features[0].properties;

                const popupHtml = `
                    <div style="font-family:'Inter',sans-serif;font-size:13px;padding:4px;color:#111;">
                        <strong style="font-size:14px;text-transform:capitalize;">${props.type.replace('_',' ')}</strong><br>
                        Severity: <b style="text-transform:capitalize;">${props.severity}</b><br>
                        <span style="color:#666;font-size:11px;">Validated by: ${props.confirmations}</span>
                    </div>
                `;

                new maplibregl.Popup({ className: 'glass-popup', closeButton: false })
                    .setLngLat(coordinates)
                    .setHTML(popupHtml)
                    .addTo(map);
            });

            map.on('mouseenter', 'unclustered-point', () => map.getCanvas().style.cursor = 'pointer');
            map.on('mouseleave', 'unclustered-point', () => map.getCanvas().style.cursor = '');
        }
    },

    updateVehiclePosition(lng, lat, heading) {
        if(this.vehicleMarker) {
            this.vehicleMarker.setLngLat([lng, lat]);
            this.vehicleMarker.setRotation(heading || 0);
        }
        
        if(MapEngine.maps.live && MapEngine.drivingMode) {
            MapEngine.maps.live.easeTo({ center: [lng, lat], bearing: heading || 0 });
        } else if (MapEngine.maps.live && MapEngine.following) {
            MapEngine.maps.live.easeTo({ center: [lng, lat] });
        }
    },

    updateRoute(coords) {
        if(MapEngine.maps.live) {
            const source = MapEngine.maps.live.getSource('live-route');
            if(source) source.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
        }
    },

    updateInfraData(events) {
        if(MapEngine.maps.live) {
            const source = MapEngine.maps.live.getSource('citypulse-data');
            if(source) {
                const features = events.map(e => ({
                    type: 'Feature',
                    properties: { ...e, severityScore: e.severity === 'high' ? 1 : (e.severity==='medium'?0.6:0.3) },
                    geometry: { type: 'Point', coordinates: [e.lng, e.lat] }
                }));
                source.setData({ type: 'FeatureCollection', features });
            }
        }
    }
};
