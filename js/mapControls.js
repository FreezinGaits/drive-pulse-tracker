const MapControls = {
    attach(map, containerId) {
        const container = document.getElementById(containerId).parentElement;
        
        const controlsHTML = `
            <div id="map-controls-panel" style="position: absolute; bottom: 16px; right: 16px; z-index: 10; display: flex; flex-direction: column; gap: 10px;">
                <div class="map-themes-menu glass-card" id="map-themes-menu" style="display:none; position: absolute; right: 54px; bottom: 160px; flex-direction: column; gap: 5px; padding: 10px; min-width: 120px; white-space: nowrap;">
                    <div class="theme-option" data-theme="dark" style="cursor: pointer; padding: 8px; border-radius: 6px; color: white;">Dark Matter</div>
                    <div class="theme-option" data-theme="standard" style="cursor: pointer; padding: 8px; border-radius: 6px; color: white;">Standard</div>
                    <div class="theme-option" data-theme="satellite" style="cursor: pointer; padding: 8px; border-radius: 6px; color: white;">Satellite</div>
                </div>
                
                <button id="map-theme-btn" style="width: 44px; height: 44px; border-radius: 50%; background: rgba(10, 14, 26, 0.9); border: 1px solid rgba(255,255,255,0.1); color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(10px); box-shadow: 0 4px 12px rgba(0,0,0,0.5); font-size: 1.1rem; transition: transform 0.2s;"><i class="fas fa-layer-group"></i></button>
                <button id="map-pitch-btn" style="width: 44px; height: 44px; border-radius: 50%; background: rgba(10, 14, 26, 0.9); border: 1px solid rgba(255,255,255,0.1); color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(10px); box-shadow: 0 4px 12px rgba(0,0,0,0.5); font-size: 1.1rem; transition: transform 0.2s;"><i class="fas fa-cube"></i></button>
                <button id="map-mode-btn" style="width: 44px; height: 44px; border-radius: 50%; background: rgba(10, 14, 26, 0.9); border: 1px solid rgba(255,255,255,0.1); color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(10px); box-shadow: 0 4px 12px rgba(0,0,0,0.5); font-size: 1.1rem; transition: transform 0.2s;"><i class="fas fa-car-side"></i></button>
                <button id="map-offline-btn" style="width: 44px; height: 44px; border-radius: 50%; background: rgba(10, 14, 26, 0.9); border: 1px solid rgba(255,255,255,0.1); color: #00d4ff; cursor: pointer; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(10px); box-shadow: 0 4px 12px rgba(0,0,0,0.5); font-size: 1.1rem; transition: transform 0.2s;"><i class="fas fa-download"></i></button>
                <button id="map-recenter-btn" style="width: 44px; height: 44px; border-radius: 50%; background: var(--accent-cyan); border: none; color: #0a0e1a; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(0,212,255,0.4); margin-top: 8px; font-size: 1.2rem; transition: transform 0.2s;"><i class="fas fa-location-crosshairs"></i></button>
            </div>
            
            <style>
                .theme-option:hover { background: rgba(255,255,255,0.1); }
            </style>
        `;
        
        // Remove old controls if exist
        const oldPanel = container.querySelector('#map-controls-panel');
        if(oldPanel) oldPanel.remove();
            
        container.insertAdjacentHTML('beforeend', controlsHTML);
        
        container.querySelector('#map-theme-btn').addEventListener('click', () => {
            const menu = container.querySelector('#map-themes-menu');
            menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
        });
        
        container.querySelectorAll('.theme-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                const newTheme = e.target.dataset.theme;
                MapEngine.setTheme(newTheme);
                container.querySelectorAll('.theme-option').forEach(o => o.style.color = 'white');
                e.target.style.color = '#00d4ff'; // Highlight selected
                container.querySelector('#map-themes-menu').style.display = 'none';
                
                const toast = document.getElementById('toast');
                if(toast) {
                    toast.classList.add('show');
                    document.getElementById('toast-message').textContent = 'Map Theme Updated';
                    setTimeout(() => toast.classList.remove('show'), 2000);
                }
            });
        });
        
        container.querySelector('#map-pitch-btn').addEventListener('click', () => {
            const currentPitch = map.getPitch();
            const newPitch = currentPitch > 30 ? 0 : 60;
            map.easeTo({ pitch: newPitch });
            container.querySelector('#map-pitch-btn').style.color = newPitch > 0 ? '#00d4ff' : 'white';
        });
        
        container.querySelector('#map-mode-btn').addEventListener('click', () => {
             MapEngine.drivingMode = !MapEngine.drivingMode;
             MapEngine.following = MapEngine.drivingMode; 
             
             container.querySelector('#map-mode-btn').style.color = MapEngine.drivingMode ? '#00d4ff' : 'white';
             
             const toast = document.getElementById('toast');
             if(toast) {
                 toast.classList.add('show');
                 document.getElementById('toast-message').textContent = MapEngine.drivingMode ? 'Driving Mode (Heading Up)' : 'Exploration Mode (North Up)';
                 setTimeout(() => toast.classList.remove('show'), 2000);
             }
             
             if(!MapEngine.drivingMode) {
                 map.easeTo({ bearing: 0, pitch: 0 });
                 container.querySelector('#map-pitch-btn').style.color = 'white';
             } else {
                 if(MapLayers.vehicleMarker) {
                     map.easeTo({ 
                         center: MapLayers.vehicleMarker.getLngLat(), 
                         bearing: MapLayers.vehicleMarker.getRotation(),
                         pitch: 45
                     });
                     container.querySelector('#map-pitch-btn').style.color = '#00d4ff';
                 }
             }
        });
        
        container.querySelector('#map-offline-btn').addEventListener('click', () => {
             const center = map.getCenter();
             const zoom = map.getZoom();
             TileManager.prefetchTiles(center.lng, center.lat, 10, zoom);
        });

        container.querySelector('#map-recenter-btn').addEventListener('click', () => {
             MapEngine.following = true;
             
             if(MapLayers.vehicleMarker) {
                 map.easeTo({ 
                     center: MapLayers.vehicleMarker.getLngLat(), 
                     bearing: MapEngine.drivingMode ? MapLayers.vehicleMarker.getRotation() : 0,
                     zoom: 16
                 });
             }
        });

        map.on('dragstart', () => {
            MapEngine.following = false;
        });
    }
};
