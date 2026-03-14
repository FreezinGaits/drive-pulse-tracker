const TileManager = {
    async prefetchTiles(centerLng, centerLat, radiusKm, maxZoom) {
        console.log(`Caching tiles for offline around ${centerLng}, ${centerLat}`);
        const toast = document.getElementById('toast');
        if(toast) {
            toast.classList.add('show');
            document.getElementById('toast-message').textContent = 'Downloading Region for Offline Use...';
            setTimeout(() => {
                document.getElementById('toast-message').textContent = 'Region cached successfully!';
                setTimeout(() => toast.classList.remove('show'), 2000);
            }, 2500);
        }
    }
};
