/* ============================================
   DrivePulse – MapControls
   Floating glassmorphism control panel for
   theme switching, mode, pitch, offline, GPS.
   ============================================ */
const MapControls = {
    _attached: false,

    attach(map, containerId) {
        const parent = document.getElementById(containerId).parentElement;

        // Remove old controls if re-attaching
        const old = parent.querySelector('#dp-map-controls');
        if (old) old.remove();

        // ── Build controls HTML ──
        const wrap = document.createElement('div');
        wrap.id = 'dp-map-controls';
        wrap.innerHTML = `
            <!-- Theme picker -->
            <div id="dp-theme-menu" class="dp-theme-menu">
                <div class="dp-theme-opt" data-theme="dark"><i class="fas fa-moon"></i> Dark</div>
                <div class="dp-theme-opt" data-theme="standard"><i class="fas fa-map"></i> Standard</div>
                <div class="dp-theme-opt" data-theme="satellite"><i class="fas fa-satellite"></i> Satellite</div>
                <div class="dp-theme-opt" data-theme="terrain"><i class="fas fa-mountain"></i> Terrain</div>
                <div class="dp-theme-opt" data-theme="minimal"><i class="fas fa-compress"></i> Minimal</div>
            </div>

            <!-- Layer toggles -->
            <div id="dp-layer-menu" class="dp-theme-menu">
                <div class="dp-layer-toggle" data-layer="heatmap"><i class="fas fa-fire"></i> Heatmap</div>
                <div class="dp-layer-toggle" data-layer="markers"><i class="fas fa-map-pin"></i> Markers</div>
                <div class="dp-layer-toggle" data-layer="route"><i class="fas fa-route"></i> Route</div>
            </div>

            <!-- Buttons -->
            <button id="dp-btn-theme"  class="dp-ctrl-btn" title="Map Themes"><i class="fas fa-layer-group"></i></button>
            <button id="dp-btn-layers" class="dp-ctrl-btn" title="Data Layers"><i class="fas fa-database"></i></button>
            <button id="dp-btn-pitch"  class="dp-ctrl-btn" title="2D / 3D"><i class="fas fa-cube"></i></button>
            <button id="dp-btn-mode"   class="dp-ctrl-btn" title="Driving / Explore"><i class="fas fa-car-side"></i></button>
            <button id="dp-btn-compass" class="dp-ctrl-btn" title="Reset North"><i class="fas fa-compass"></i></button>
            <button id="dp-btn-zoomin" class="dp-ctrl-btn" title="Zoom In"><i class="fas fa-plus"></i></button>
            <button id="dp-btn-zoomout" class="dp-ctrl-btn" title="Zoom Out"><i class="fas fa-minus"></i></button>
            <button id="dp-btn-offline" class="dp-ctrl-btn dp-accent" title="Cache Region"><i class="fas fa-download"></i></button>
            <button id="dp-btn-gps"    class="dp-ctrl-btn dp-gps" title="Recenter GPS"><i class="fas fa-location-crosshairs"></i></button>
        `;

        parent.appendChild(wrap);

        // ── Wiring ──
        const $ = (sel) => wrap.querySelector(sel);
        const themeMenu  = $('#dp-theme-menu');
        const layerMenu  = $('#dp-layer-menu');

        // Theme button
        $('#dp-btn-theme').addEventListener('click', () => {
            themeMenu.classList.toggle('open');
            layerMenu.classList.remove('open');
        });

        // Theme options
        wrap.querySelectorAll('.dp-theme-opt').forEach(opt => {
            opt.addEventListener('click', () => {
                MapEngine.setTheme(opt.dataset.theme);
                themeMenu.classList.remove('open');
                // Highlight
                wrap.querySelectorAll('.dp-theme-opt').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
            });
        });

        // Layer button
        $('#dp-btn-layers').addEventListener('click', () => {
            layerMenu.classList.toggle('open');
            themeMenu.classList.remove('open');
        });

        // Layer toggles
        wrap.querySelectorAll('.dp-layer-toggle').forEach(tog => {
            tog.addEventListener('click', () => {
                tog.classList.toggle('active');
                const layer = tog.dataset.layer;
                if (layer === 'heatmap') MapLayers.toggleLayer('citypulse-heatmap');
                if (layer === 'markers') {
                    MapLayers.toggleLayer('clusters');
                    MapLayers.toggleLayer('unclustered-point');
                }
                if (layer === 'route') {
                    MapLayers.toggleLayer('live-route-glow');
                    MapLayers.toggleLayer('live-route-line');
                }
            });
        });

        // Pitch (2D / 3D)
        $('#dp-btn-pitch').addEventListener('click', () => {
            const p = map.getPitch();
            map.easeTo({ pitch: p > 20 ? 0 : 60, duration: 500 });
        });

        // Mode (Driving / Exploration)
        $('#dp-btn-mode').addEventListener('click', () => {
            MapEngine.drivingMode = !MapEngine.drivingMode;
            MapEngine.following = true;
            if (!MapEngine.drivingMode) {
                map.easeTo({ bearing: 0, pitch: 0, duration: 500 });
                MapEngine.currentMode = 'exploration';
            } else {
                map.easeTo({ pitch: 45, duration: 500 });
                MapEngine.currentMode = 'driving';
            }
            $('#dp-btn-mode').classList.toggle('dp-active', MapEngine.drivingMode);
        });

        // Compass reset
        $('#dp-btn-compass').addEventListener('click', () => {
            map.easeTo({ bearing: 0, pitch: 0, duration: 500 });
        });

        // Zoom
        $('#dp-btn-zoomin').addEventListener('click', () => map.zoomIn());
        $('#dp-btn-zoomout').addEventListener('click', () => map.zoomOut());

        // Offline cache
        $('#dp-btn-offline').addEventListener('click', () => {
            const c = map.getCenter();
            TileManager.prefetchTiles(c.lng, c.lat, 10, map.getZoom());
        });

        // GPS recenter
        $('#dp-btn-gps').addEventListener('click', () => MapEngine.recenter());

        // Stop following on manual drag
        map.on('dragstart', () => { MapEngine.following = false; });

        // Close menus on outside click
        document.addEventListener('click', (e) => {
            if (!wrap.contains(e.target)) {
                themeMenu.classList.remove('open');
                layerMenu.classList.remove('open');
            }
        });

        this._attached = true;
    }
};
