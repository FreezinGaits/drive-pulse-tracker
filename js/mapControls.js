/* ============================================
   DrivePulse – MapControls
   Floating glassmorphism control panel for
   theme switching, modes, 3D, layers, GPS.
   ============================================ */
const MapControls = {
    _attached: false,

    attach(map, containerId) {
        const container = document.getElementById(containerId);

        // Remove old controls if re-attaching
        const old = container.querySelector('#dp-map-controls');
        if (old) old.remove();

        // ── Build controls HTML ──
        const wrap = document.createElement('div');
        wrap.id = 'dp-map-controls';
        wrap.innerHTML = `
            <!-- Theme picker -->
            <div id="dp-theme-menu" class="dp-dropdown-menu">
                <div class="dp-menu-title">Map Theme</div>
                <div class="dp-theme-opt active" data-theme="dark"><i class="fas fa-moon"></i> Dark Matter</div>
                <div class="dp-theme-opt" data-theme="standard"><i class="fas fa-map"></i> Standard</div>
                <div class="dp-theme-opt" data-theme="satellite"><i class="fas fa-satellite"></i> Satellite</div>
                <div class="dp-theme-opt" data-theme="terrain"><i class="fas fa-mountain"></i> Terrain</div>
                <div class="dp-theme-opt" data-theme="minimal"><i class="fas fa-compress"></i> Minimal</div>
            </div>

            <!-- Mode picker -->
            <div id="dp-mode-menu" class="dp-dropdown-menu">
                <div class="dp-menu-title">Map Mode</div>
                <div class="dp-mode-opt active" data-mode="driving"><i class="fas fa-car-side"></i> Driving Mode</div>
                <div class="dp-mode-opt" data-mode="exploration"><i class="fas fa-globe"></i> Exploration</div>
                <div class="dp-mode-opt" data-mode="satellite"><i class="fas fa-satellite-dish"></i> Satellite</div>
                <div class="dp-mode-opt" data-mode="traffic"><i class="fas fa-traffic-light"></i> Traffic Heatmap</div>
                <div class="dp-mode-opt" data-mode="infrastructure"><i class="fas fa-hard-hat"></i> Infrastructure</div>
            </div>

            <!-- Layer toggles -->
            <div id="dp-layer-menu" class="dp-dropdown-menu">
                <div class="dp-menu-title">Data Layers</div>
                <div class="dp-layer-toggle" data-layer="heatmap"><i class="fas fa-fire"></i> Heatmap</div>
                <div class="dp-layer-toggle" data-layer="markers"><i class="fas fa-map-pin"></i> Markers</div>
                <div class="dp-layer-toggle" data-layer="route"><i class="fas fa-route"></i> Route Trail</div>
            </div>

            <!-- Top Right Controls (Theme, Mode, Layers, 3D) -->
            <div class="dp-ctrl-group dp-top-right">
                <button id="dp-btn-theme"  class="dp-ctrl-btn" title="Map Themes"><i class="fas fa-layer-group"></i></button>
                <button id="dp-btn-mode"   class="dp-ctrl-btn" title="Map Modes"><i class="fas fa-sliders-h"></i></button>
                <button id="dp-btn-layers" class="dp-ctrl-btn" title="Data Layers"><i class="fas fa-database"></i></button>
                <button id="dp-btn-3d"     class="dp-ctrl-btn" title="3D Buildings"><i class="fas fa-cube"></i></button>
            </div>

            <!-- Bottom Left Report Button (Mobile Friendly) -->
        <div class="dp-ctrl-group dp-bottom-left" style="position:absolute; bottom:20px; left:20px; z-index:100;">
            <button id="dp-btn-report" class="dp-ctrl-btn" title="Report Hazard" style="background:var(--accent); color:#fff; width:48px; height:48px; border-radius:50%; box-shadow:0 4px 12px rgba(249,115,22,0.4); border:none;">
                <i class="fas fa-exclamation-triangle" style="font-size:18px;"></i>
            </button>
        </div>

        <!-- Bottom Right Controls (Zoom, Compass, Offline, GPS) -->
        <div class="dp-ctrl-group dp-bottom-right">
            <button id="dp-btn-compass" class="dp-ctrl-btn" title="Reset North"><i class="fas fa-compass"></i></button>
            <div style="display: flex; gap: 6px; flex-direction: row;">
                <button id="dp-btn-zoomin" class="dp-ctrl-btn" title="Zoom In"><i class="fas fa-plus"></i></button>
                    <button id="dp-btn-zoomout" class="dp-ctrl-btn" title="Zoom Out"><i class="fas fa-minus"></i></button>
                </div>
                <button id="dp-btn-offline" class="dp-ctrl-btn" title="Download Offline Map"><i class="fas fa-cloud-download-alt"></i></button>
                <button id="dp-btn-gps"     class="dp-ctrl-btn pulse" title="Center on GPS"><i class="fas fa-location-arrow"></i></button>
            </div>
        `;

        container.appendChild(wrap);

        // ── Helper ──
        const $ = (sel) => wrap.querySelector(sel);
        const closeAllMenus = () => {
            wrap.querySelectorAll('.dp-dropdown-menu').forEach(m => m.classList.remove('open'));
        };

        const toggleMenu = (menuId) => {
            const menu = wrap.querySelector(menuId);
            const wasOpen = menu.classList.contains('open');
            closeAllMenus();
            if (!wasOpen) menu.classList.add('open');
        };

        // ── Theme Button ──
        $('#dp-btn-theme').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMenu('#dp-theme-menu');
        });

        wrap.querySelectorAll('.dp-theme-opt').forEach(opt => {
            opt.addEventListener('click', () => {
                MapEngine.setTheme(opt.dataset.theme);
                closeAllMenus();
                wrap.querySelectorAll('.dp-theme-opt').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
            });
        });

        // ── Mode Button ──
        $('#dp-btn-mode').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMenu('#dp-mode-menu');
        });

        wrap.querySelectorAll('.dp-mode-opt').forEach(opt => {
            opt.addEventListener('click', () => {
                const mode = opt.dataset.mode;
                MapEngine.setMode(mode);
                closeAllMenus();
                wrap.querySelectorAll('.dp-mode-opt').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');

                // Visual feedback
                const toast = document.getElementById('toast');
                const msg = document.getElementById('toast-message');
                if (toast && msg) {
                    const labels = {
                        driving: '🚗 Driving Mode — Heading Up',
                        exploration: '🧭 Exploration Mode — North Up',
                        satellite: '🛰️ Satellite Mode',
                        traffic: '🚦 Traffic Heatmap Active',
                        infrastructure: '🏗️ Infrastructure Overlay Active'
                    };
                    msg.textContent = labels[mode] || mode;
                    toast.classList.add('show');
                    setTimeout(() => toast.classList.remove('show'), 2500);
                }
            });
        });

        // ── Layer Button ──
        $('#dp-btn-layers').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMenu('#dp-layer-menu');
        });

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
                if (layer === 'buildings') {
                    MapLayers.toggleLayer('building-3d');
                }
            });
        });

        // ── 3D Buildings Toggle ──
        let buildings3dOn = false;
        $('#dp-btn-3d').addEventListener('click', () => {
            buildings3dOn = !buildings3dOn;
            $('#dp-btn-3d').classList.toggle('dp-active', buildings3dOn);

            if (buildings3dOn) {
                // Buildings need zoom >= 14 to render, bump to 15 if too far out
                const currentZoom = map.getZoom();
                const opts = { pitch: 60, duration: 800 };
                if (currentZoom < 15) opts.zoom = 15;
                map.easeTo(opts);
                MapLayers.toggleLayer('building-3d', true);
            } else {
                map.easeTo({ pitch: 0, duration: 800 });
                MapLayers.toggleLayer('building-3d', false);
            }
        });

        // ── Compass reset ──
        $('#dp-btn-compass').addEventListener('click', () => {
            map.easeTo({ bearing: 0, pitch: 0, duration: 500 });
            buildings3dOn = false;
            $('#dp-btn-3d').classList.remove('dp-active');
        });

        // ── Zoom ──
        $('#dp-btn-zoomin').addEventListener('click', () => map.zoomIn());
        $('#dp-btn-zoomout').addEventListener('click', () => map.zoomOut());

        // ── Offline cache ──
        $('#dp-btn-offline').addEventListener('click', () => {
            const c = map.getCenter();
            TileManager.prefetchTiles(c.lng, c.lat, 10, map.getZoom());
        });

        // ── GPS recenter ──
        $('#dp-btn-gps').addEventListener('click', () => MapEngine.recenter());

        // ── Mobile Report Button ──
        $('#dp-btn-report').addEventListener('click', () => {
            if (typeof DrivePulse !== 'undefined' && DrivePulse.UI) {
                // Get current map center coordinates to use as the reported location
                const center = map.getCenter();
                DrivePulse.UI.openHazardModal({
                    lat: center.lat,
                    lng: center.lng
                });
            }
        });

        // ── Stop following on manual drag ──
        map.on('dragstart', () => { MapEngine.following = false; });

        // ── Close menus on outside click ──
        document.addEventListener('click', (e) => {
            if (!wrap.contains(e.target)) closeAllMenus();
        });

        this._attached = true;
    }
};
