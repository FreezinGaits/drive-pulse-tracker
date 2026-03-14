/* ============================================
   DrivePulse – TileManager
   Handles tile caching and offline support
   via the Service Worker cache API.
   ============================================ */
const TileManager = {
    /**
     * Pre-fetch map tiles for a given region so they are available offline.
     * This creates invisible image requests for tiles around the center point,
     * which the Service Worker will intercept and cache automatically.
     */
    async prefetchTiles(centerLng, centerLat, radiusKm, currentZoom) {
        const toast = document.getElementById('toast');
        const msg = document.getElementById('toast-message');

        if (toast && msg) {
            msg.textContent = '📥 Caching map region for offline...';
            toast.classList.add('show');
        }

        const zoomLevels = [
            Math.max(1, Math.floor(currentZoom) - 2),
            Math.floor(currentZoom),
            Math.min(19, Math.floor(currentZoom) + 1)
        ];

        let fetched = 0;
        const theme = MapEngine.themes[MapEngine.currentTheme];
        const sourceKey = Object.keys(theme.sources)[0];
        const tileTemplate = theme.sources[sourceKey].tiles[0];

        for (const z of zoomLevels) {
            const n = Math.pow(2, z);
            const centerTileX = Math.floor((centerLng + 180) / 360 * n);
            const centerTileY = Math.floor((1 - Math.log(Math.tan(centerLat * Math.PI / 180) + 1 / Math.cos(centerLat * Math.PI / 180)) / Math.PI) / 2 * n);

            const range = z <= 5 ? 1 : (z <= 10 ? 2 : 3);

            for (let dx = -range; dx <= range; dx++) {
                for (let dy = -range; dy <= range; dy++) {
                    const x = centerTileX + dx;
                    const y = centerTileY + dy;
                    if (x < 0 || y < 0 || x >= n || y >= n) continue;

                    const url = tileTemplate.replace('{z}', z).replace('{x}', x).replace('{y}', y).replace('{r}', '').replace('@2x', '');
                    try {
                        await fetch(url, { mode: 'cors' });
                        fetched++;
                    } catch(e) {}
                }
            }
        }

        if (toast && msg) {
            msg.textContent = `✅ Cached ${fetched} tiles for offline use!`;
            setTimeout(() => toast.classList.remove('show'), 3000);
        }
    }
};
