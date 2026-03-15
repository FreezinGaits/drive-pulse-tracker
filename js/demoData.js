/* ============================================
   CityPulse – Demo Data Generator
   Populates the infrastructure dashboard with
   realistic sample data for investor demos.
   
   TO REMOVE FOR PRODUCTION:
   1. Delete this file (js/demoData.js)
   2. Remove the <script> tag from index.html
   3. Remove the "Load Demo Data" button from Settings
   That's it! All real data collection still works.
   ============================================ */

window.DrivePulse = window.DrivePulse || {};

DrivePulse.DemoData = (function () {
    'use strict';

    const DB = DrivePulse.DB;

    // Ludhiana, Punjab area coordinates (user's area)
    const CENTER_LAT = 30.9010;
    const CENTER_LNG = 75.8573;
    const SPREAD = 0.035; // ~3.5 km radius

    function randomInRange(min, max) {
        return min + Math.random() * (max - min);
    }

    function randomLat() {
        return CENTER_LAT + (Math.random() - 0.5) * 2 * SPREAD;
    }

    function randomLng() {
        return CENTER_LNG + (Math.random() - 0.5) * 2 * SPREAD;
    }

    function randomPick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // Generate realistic pothole events
    function generatePotholes(count = 28) {
        const events = [];
        const now = Date.now();

        // Cluster potholes along "road corridors"
        const corridors = [
            { lat: 30.9050, lng: 75.8500, dLat: 0.008, dLng: 0.015 },  // Main road
            { lat: 30.8950, lng: 75.8600, dLat: 0.012, dLng: 0.005 },  // Side road
            { lat: 30.9100, lng: 75.8450, dLat: 0.003, dLng: 0.020 },  // Highway
            { lat: 30.8980, lng: 75.8700, dLat: 0.010, dLng: 0.008 },  // Inner road
        ];

        for (let i = 0; i < count; i++) {
            const corridor = randomPick(corridors);
            const progress = Math.random();
            events.push({
                type: 'pothole',
                lat: corridor.lat + progress * corridor.dLat + (Math.random() - 0.5) * 0.001,
                lng: corridor.lng + progress * corridor.dLng + (Math.random() - 0.5) * 0.001,
                severity: randomPick(['low', 'low', 'low', 'medium', 'medium', 'high']),
                value: parseFloat(randomInRange(1.5, 4.5).toFixed(2)),
                speed: Math.round(randomInRange(25, 60)),
                tripId: Math.floor(randomInRange(1, 8)),
                timestamp: now - Math.floor(randomInRange(3600000, 7 * 86400000)), // 1hr - 7 days ago
                confirmations: Math.floor(randomInRange(1, 7)),
            });
        }
        return events;
    }

    // Generate road quality events
    function generateRoadQuality(count = 12) {
        const events = [];
        const now = Date.now();

        for (let i = 0; i < count; i++) {
            events.push({
                type: 'road_quality',
                lat: randomLat(),
                lng: randomLng(),
                severity: randomPick(['medium', 'high', 'high']),
                value: Math.round(randomInRange(15, 45)),
                tripId: Math.floor(randomInRange(1, 8)),
                timestamp: now - Math.floor(randomInRange(3600000, 5 * 86400000)),
            });
        }
        return events;
    }

    // Generate noise pollution events
    function generateNoise(count = 15) {
        const events = [];
        const now = Date.now();

        // Noise clusters near intersections / markets
        const hotspots = [
            { lat: 30.9020, lng: 75.8560 },  // Market area
            { lat: 30.9080, lng: 75.8510 },  // Intersection
            { lat: 30.8960, lng: 75.8650 },  // School zone
        ];

        for (let i = 0; i < count; i++) {
            const spot = randomPick(hotspots);
            const dB = Math.round(randomInRange(86, 110));
            events.push({
                type: 'noise',
                lat: spot.lat + (Math.random() - 0.5) * 0.003,
                lng: spot.lng + (Math.random() - 0.5) * 0.003,
                severity: dB >= 100 ? 'high' : 'medium',
                value: dB,
                tripId: Math.floor(randomInRange(1, 8)),
                timestamp: now - Math.floor(randomInRange(3600000, 4 * 86400000)),
            });
        }
        return events;
    }

    // Generate traffic congestion events
    function generateTraffic(count = 10) {
        const events = [];
        const now = Date.now();

        const congestionPoints = [
            { lat: 30.9035, lng: 75.8540 },
            { lat: 30.9000, lng: 75.8590 },
            { lat: 30.9070, lng: 75.8480 },
        ];

        for (let i = 0; i < count; i++) {
            const spot = randomPick(congestionPoints);
            const speed = Math.round(randomInRange(3, 14));
            events.push({
                type: 'traffic',
                lat: spot.lat + (Math.random() - 0.5) * 0.004,
                lng: spot.lng + (Math.random() - 0.5) * 0.004,
                severity: speed < 5 ? 'high' : 'medium',
                value: speed,
                tripId: Math.floor(randomInRange(1, 8)),
                timestamp: now - Math.floor(randomInRange(3600000, 3 * 86400000)),
            });
        }
        return events;
    }

    // Generate dead zone events
    function generateDeadZones(count = 6) {
        const events = [];
        const now = Date.now();

        for (let i = 0; i < count; i++) {
            events.push({
                type: 'dead_zone',
                lat: randomLat(),
                lng: randomLng(),
                severity: randomPick(['medium', 'high']),
                value: randomPick(['slow-2g', '2g', 'slow-2g']),
                tripId: Math.floor(randomInRange(1, 8)),
                timestamp: now - Math.floor(randomInRange(7200000, 6 * 86400000)),
            });
        }
        return events;
    }

    // Generate road segments for quality scoring
    function generateRoadSegments(count = 45) {
        const segments = [];
        const now = Date.now();

        for (let i = 0; i < count; i++) {
            const startLat = randomLat();
            const startLng = randomLng();
            const quality = randomPick(['smooth', 'smooth', 'smooth', 'rough', 'rough', 'damaged']);
            let score;
            if (quality === 'smooth') score = Math.round(randomInRange(75, 100));
            else if (quality === 'rough') score = Math.round(randomInRange(40, 70));
            else score = Math.round(randomInRange(10, 35));

            segments.push({
                startLat,
                startLng,
                endLat: startLat + (Math.random() - 0.5) * 0.002,
                endLng: startLng + (Math.random() - 0.5) * 0.002,
                quality,
                score,
                variance: parseFloat(randomInRange(0.05, 1.2).toFixed(4)),
                sampleCount: Math.round(randomInRange(10, 60)),
                distance: parseFloat(randomInRange(0.08, 0.15).toFixed(3)),
                tripId: Math.floor(randomInRange(1, 8)),
                timestamp: now - Math.floor(randomInRange(3600000, 7 * 86400000)),
            });
        }
        return segments;
    }

    // ===== LOAD ALL DEMO DATA =====
    async function loadDemoData() {
        console.log('🧪 CityPulse: Loading demo data...');

        const allEvents = [
            ...generatePotholes(28),
            ...generateRoadQuality(12),
            ...generateNoise(15),
            ...generateTraffic(10),
            ...generateDeadZones(6),
        ];

        // Save all events
        for (const event of allEvents) {
            await DB.saveInfraEvent(event);
        }

        // Save road segments
        const segments = generateRoadSegments(45);
        for (const seg of segments) {
            await DB.saveRoadSegment(seg);
        }

        console.log(`✅ CityPulse Demo: Loaded ${allEvents.length} events + ${segments.length} road segments`);
        return { events: allEvents.length, segments: segments.length };
    }

    // ===== CLEAR ALL DEMO DATA =====
    async function clearDemoData() {
        await DB.clearInfraEvents();
        await DB.clearRoadSegments();
        console.log('🧹 CityPulse: All infrastructure data cleared');
    }

    return {
        loadDemoData,
        clearDemoData,
        isAvailable: true,
    };
})();
