/* ============================================
   CityPulse – Infrastructure Intelligence Engine
   Detects potholes, road quality, noise pollution,
   traffic congestion, and network dead zones
   using smartphone sensors during DrivePulse trips.
   All data stored offline in IndexedDB.
   ============================================ */

window.DrivePulse = window.DrivePulse || {};

DrivePulse.CityPulse = (function () {
    'use strict';

    const DB = DrivePulse.DB;

    // ===== CONFIGURATION =====
    const config = {
        pothole: {
            zThreshold: 1.5,       // G-force on Z-axis to register pothole
            minSpeed: 20,          // km/h – ignore bumps while stationary
            cooldown: 2000,        // ms between pothole detections
            severityLow: 1.5,
            severityMed: 2.5,
            severityHigh: 3.5,
        },
        roadQuality: {
            segmentDistance: 0.1,   // km per road segment
            smoothThreshold: 0.3,  // G variance for smooth road
            roughThreshold: 0.8,   // G variance for rough road
        },
        noise: {
            threshold: 85,         // dB level for noise pollution
            sampleInterval: 3000,  // ms between noise samples
            maxSpeed: 50,          // km/h - above this, wind/tire noise pollutes the mic
        },
        traffic: {
            speedRatio: 0.5,       // ratio vs expected speed for congestion
            minExpectedSpeed: 30,  // km/h – minimum expected speed in city
            checkInterval: 10000,  // ms between traffic checks
            bufferDuration: 60000, // ms - 60 seconds rolling window
        },
        signal: {
            checkInterval: 5000,   // ms between signal checks
        },
        dataDecayDays: 30,         // days before an infra event expires (is considered resolved/stale)
    };

    // ===== STATE =====
    const state = {
        active: false,
        lastPotholeTime: 0,
        lastNoiseTime: 0,
        lastTrafficTime: 0,
        lastSignalTime: 0,
        currentTripId: null,

        // Road quality segment accumulator
        segmentAccel: [],
        segmentStartPos: null,
        segmentDistance: 0,
        lastFedPos: null,

        // Rolling Traffic Buffer
        trafficSpeedBuffer: [],

        // Noise
        audioContext: null,
        analyser: null,
        micStream: null,
        noiseLevel: 0,
        consecutiveLoudSamples: 0,

        // Polling intervals
        noiseInterval: null,
        signalInterval: null,

        // Stats counters
        stats: {
            potholes: 0,
            roughSegments: 0,
            noiseZones: 0,
            trafficSlowdowns: 0,
            deadZones: 0,
        },
        activePotholes: [],
    };

    // ===== CALLBACKS =====
    const callbacks = {
        onAlert: null,
        onInfraEvent: null,
    };

    // ===== INIT =====
    function init() {
        // CityPulse initializes silently. It starts collecting
        // when start() is called with a trip ID.
    }

    // ===== START / STOP =====
    function start(tripId) {
        state.active = true;
        state.currentTripId = tripId;
        state.segmentAccel = [];
        state.segmentStartPos = null;
        state.segmentDistance = 0;
        state.stats = { potholes: 0, roughSegments: 0, noiseZones: 0, trafficSlowdowns: 0, deadZones: 0 };
        state.activePotholes = [];
        state.trafficSpeedBuffer = [];

        // Load active potholes for auto-healing checks
        DB.getInfraEventsByType('pothole').then(events => {
            const now = Date.now();
            const decayMs = config.dataDecayDays * 24 * 60 * 60 * 1000;
            state.activePotholes = events.filter(e => (now - e.timestamp) < decayMs);
        }).catch(e => console.warn('CityPulse: Failed to load active potholes', e));

        // Start microphone for noise detection
        startNoiseSensor();

        // Start periodic noise measurement
        state.noiseInterval = setInterval(measureNoise, config.noise.sampleInterval);

        // Start periodic signal checks
        state.signalInterval = setInterval(checkSignalStrength, config.signal.checkInterval);
    }

    function stop() {
        state.active = false;
        state.currentTripId = null;

        // Stop microphone
        stopNoiseSensor();

        // Clear intervals
        if (state.noiseInterval) { clearInterval(state.noiseInterval); state.noiseInterval = null; }
        if (state.signalInterval) { clearInterval(state.signalInterval); state.signalInterval = null; }
    }

    // ===== FEED DATA FROM TRIP ENGINE =====
    // These are called directly by app.js from the existing sensor data flow

    function feedAcceleration(data) {
        if (!state.active) return;

        const Sensors = DrivePulse.Sensors;
        const now = Date.now();
        const speed = Sensors.getCurrentSpeed();
        const pos = Sensors.getCurrentPosition();

        // EDGE CASE 1: The "Dashboard Mount" (Orientation Agnostic Physics)
        // By calculating the 3D Vector Magnitude of the pure acceleration (gravity removed),
        // we find the true shockwave force regardless of phone orientation.
        const netForce = Math.sqrt(Math.pow(data.x/9.81, 2) + Math.pow(data.y/9.81, 2) + Math.pow(data.z/9.81, 2));

        // Drop guard: Extreme instantaneous massive spikes (e.g. > 4G) at slow speeds imply dropped phone.
        if (netForce > 4.0 && speed < 15) return;

        if (netForce >= config.pothole.zThreshold && speed >= config.pothole.minSpeed) {
            if (now - state.lastPotholeTime > config.pothole.cooldown) {
                state.lastPotholeTime = now;

                let severity = 'low';
                if (netForce >= config.pothole.severityHigh) severity = 'high';
                else if (netForce >= config.pothole.severityMed) severity = 'medium';

                // Check for Crowdsourced Validation (Did we hit an already known pothole?)
                let isDuplicate = false;
                if (state.activePotholes && state.activePotholes.length > 0) {
                    for (let i = 0; i < state.activePotholes.length; i++) {
                        const existing = state.activePotholes[i];
                        
                        // Don't merge hits from the exact same trip within 1 minute
                        if (existing.tripId === state.currentTripId && (now - existing.timestamp) < 60000) continue;

                        const dist = DrivePulse.Sensors.haversineDistance(
                            pos.latitude, pos.longitude,
                            existing.lat, existing.lng
                        );

                        // If within 15 meters of an active pothole, update the existing one
                        if (dist <= 0.015) {
                            existing.confirmations = (existing.confirmations || 1) + 1;
                            existing.timestamp = now; // Refresh decay timer!
                            
                            // Crowd Severity Validation:
                            // If it was 'low' but 3+ trips confirm it, bump to 'medium'
                            // If it was 'medium' and 6+ trips confirm it, bump to 'high'
                            if (existing.severity === 'low' && existing.confirmations >= 3) existing.severity = 'medium';
                            if (existing.severity === 'medium' && existing.confirmations >= 6) existing.severity = 'high';
                            
                            // If this new hit was physically much harder, adopt the higher severity immediately
                            if (severity === 'high' || (severity === 'medium' && existing.severity === 'low')) {
                                existing.severity = severity;
                            }

                            // Save the updated confidence back to DB
                            DB.saveInfraEvent(existing).catch(() => {});
                            
                            // Synchronize updates to global Supabase
                            if (typeof SupabaseSync !== 'undefined' && SupabaseSync.isConfigured() && typeof existing.id === 'string') {
                                SupabaseSync.updateEvent(existing.id, {
                                    confirmations: existing.confirmations,
                                    severity: existing.severity
                                });
                            }
                            
                            if (callbacks.onInfraEvent) callbacks.onInfraEvent(existing);
                            if (callbacks.onAlert) callbacks.onAlert({
                                message: `⚠️ Verified Hazard area! (${existing.confirmations} reports)`,
                                type: 'pothole', severity: existing.severity, timestamp: now
                            });
                            
                            isDuplicate = true;
                            break;
                        }
                    }
                }

                if (!isDuplicate) {
                    const event = {
                        type: 'pothole',
                        lat: pos?.latitude || 0,
                        lng: pos?.longitude || 0,
                        severity,
                        value: parseFloat(netForce.toFixed(2)),
                        speed: Math.round(speed),
                        tripId: state.currentTripId,
                        timestamp: now,
                        confirmations: 1 // Start at 1
                    };

                    saveAndNotify(event, `⚠️ Pothole detected! (${severity})`);
                    state.stats.potholes++;
                    state.activePotholes.push(event); // Add to active memory for cross-validation
                }
            }
        }

        // Accumulate for road quality segment (using orientation-agnostic magnitude)
        state.segmentAccel.push(netForce);
    }

    function feedGPS(gpsData) {
        if (!state.active) return;

        const now = Date.now();
        const pos = { latitude: gpsData.latitude, longitude: gpsData.longitude };

        // Initialize segment start
        if (!state.segmentStartPos) {
            state.segmentStartPos = pos;
            state.segmentDistance = 0;
            state.segmentAccel = [];
            state.lastFedPos = pos;
            return;
        }

        // Compute distance from last fed position using haversine
        let dist = 0;
        if (state.lastFedPos) {
            dist = DrivePulse.Sensors.haversineDistance(
                state.lastFedPos.latitude, state.lastFedPos.longitude,
                pos.latitude, pos.longitude
            );
        }
        state.lastFedPos = pos;

        // Accumulate distance
        state.segmentDistance += dist;

        // EDGE CASE 2: The "Stop Sign" False Positive.
        // Maintain a 60-second rolling buffer of speeds. 
        state.trafficSpeedBuffer.push({ speed: gpsData.speed, time: now });
        state.trafficSpeedBuffer = state.trafficSpeedBuffer.filter(s => (now - s.time) <= config.traffic.bufferDuration);

        // Check if we've covered a full segment
        if (state.segmentDistance >= config.roadQuality.segmentDistance && state.segmentAccel.length > 5) {
            processRoadSegment(pos);
        }

        // Traffic detection
        if (now - state.lastTrafficTime > config.traffic.checkInterval && state.trafficSpeedBuffer.length > 5) {
            state.lastTrafficTime = now;
            
            // Calculate rolling average
            const avgSpeed = state.trafficSpeedBuffer.reduce((sum, s) => sum + s.speed, 0) / state.trafficSpeedBuffer.length;
            checkTraffic(avgSpeed);
        }

        // Active Pothole Healing (Checking for smooth passes over known pothole footprints)
        if (state.activePotholes && state.activePotholes.length > 0 && gpsData.speed > 15) {
            // Require a 4-second buffer since the last spike to assure it was a smooth pass
            if (now - state.lastPotholeTime > 4000) {
                for (let i = state.activePotholes.length - 1; i >= 0; i--) {
                    const pothole = state.activePotholes[i];
                    
                    // Skip if this pothole was just logged during this exact same trip
                    if (pothole.tripId === state.currentTripId && (now - pothole.timestamp) < 60000) continue;

                    const distToPothole = DrivePulse.Sensors.haversineDistance(
                        pos.latitude, pos.longitude,
                        pothole.lat, pothole.lng
                    );

                    // If we crossed exactly over it (within 15 meters) and no spike occurred -> It's patched!
                    if (distToPothole <= 0.015) {
                        pothole.smoothPasses = (pothole.smoothPasses || 0) + 1;
                        if (pothole.smoothPasses >= 2) {
                            // 2 smooth passes over an old pothole = Mathematically resolved!
                            DB.deleteInfraEvent(pothole.id).catch(() => {});
                            
                            // Permanently delete from global Supabase Network
                            if (typeof SupabaseSync !== 'undefined' && SupabaseSync.isConfigured() && typeof pothole.id === 'string') {
                                SupabaseSync.deleteEvent(pothole.id);
                            }
                            
                            state.activePotholes.splice(i, 1);
                        } else {
                            // Save vote progress
                            DB.saveInfraEvent(pothole).catch(() => {});
                            
                            // Sync the smooth pass increment so we don't lose progress if device closes
                            // (If you want you can add a `smooth_passes` column on Supabase to track this globally, 
                            // otherwise it just relies on local tracking till the delete is fired)
                        }
                    }
                }
            }
        }
    }

    function processRoadSegment(endPos) {
        if (state.segmentAccel.length < 5) return;

        // Calculate variance of 3D magnitude
        const values = state.segmentAccel;
        const mean = values.reduce((s, v) => s + v, 0) / values.length;
        const gVariance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length; // Already in G

        let quality = 'smooth';
        let score = 100;
        if (gVariance >= config.roadQuality.roughThreshold) {
            quality = 'damaged';
            score = Math.max(10, 30 - Math.round(gVariance * 10));
            state.stats.roughSegments++;
        } else if (gVariance >= config.roadQuality.smoothThreshold) {
            quality = 'rough';
            score = Math.max(30, 70 - Math.round(gVariance * 20));
            state.stats.roughSegments++;
        }

        const segment = {
            startLat: state.segmentStartPos.latitude,
            startLng: state.segmentStartPos.longitude,
            endLat: endPos.latitude,
            endLng: endPos.longitude,
            quality,
            score,
            variance: parseFloat(gVariance.toFixed(4)),
            sampleCount: values.length,
            distance: parseFloat(state.segmentDistance.toFixed(3)),
            tripId: state.currentTripId,
        };

        DB.saveRoadSegment(segment).catch(e => console.warn('CityPulse: road segment save error:', e));

        if (quality === 'damaged') {
            const event = {
                type: 'road_quality',
                lat: endPos.latitude,
                lng: endPos.longitude,
                severity: 'high',
                value: score,
                tripId: state.currentTripId,
                timestamp: Date.now(),
            };
            saveAndNotify(event, `🛣️ Poor road quality detected (Score: ${score})`);
        }

        // Reset segment
        state.segmentStartPos = endPos;
        state.segmentDistance = 0;
        state.segmentAccel = [];
    }

    // ===== TRAFFIC DETECTION =====
    function checkTraffic(avgSpeed) {
        if (avgSpeed < 3) return; // Ignore if stopped

        if (avgSpeed < config.traffic.minExpectedSpeed * config.traffic.speedRatio) {
            const Sensors = DrivePulse.Sensors;
            const pos = Sensors.getCurrentPosition();
            const event = {
                type: 'traffic',
                lat: pos?.latitude || 0,
                lng: pos?.longitude || 0,
                severity: avgSpeed < 5 ? 'high' : 'medium',
                value: Math.round(avgSpeed),
                tripId: state.currentTripId,
                timestamp: Date.now(),
            };
            saveAndNotify(event, `🚦 Traffic congestion detected (~${Math.round(avgSpeed)} km/h avg)`);
            state.stats.trafficSlowdowns++;
        }
    }

    // ===== NOISE POLLUTION DETECTION =====
    async function startNoiseSensor() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            state.micStream = stream;
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = state.audioContext.createMediaStreamSource(stream);
            state.analyser = state.audioContext.createAnalyser();
            state.analyser.fftSize = 256;
            source.connect(state.analyser);
            console.log('CityPulse: Microphone started for noise detection');
        } catch (err) {
            console.warn('CityPulse: Microphone not available:', err.message);
        }
    }

    function stopNoiseSensor() {
        if (state.micStream) {
            state.micStream.getTracks().forEach(t => t.stop());
            state.micStream = null;
        }
        if (state.audioContext) {
            state.audioContext.close().catch(() => {});
            state.audioContext = null;
            state.analyser = null;
        }
    }

    function measureNoise() {
        if (!state.active || !state.analyser) return;

        // EDGE CASE 3: Highway Wind Contamination
        // If the car is driving fast, wind/tire drone easily hits >85dB. We pause noise check at speed.
        const speed = DrivePulse.Sensors.getCurrentSpeed();
        if (speed > config.noise.maxSpeed) {
            state.consecutiveLoudSamples = 0;
            return;
        }

        const bufferLength = state.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        state.analyser.getByteFrequencyData(dataArray);

        // Calculate RMS (Root Mean Square) for volume
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / bufferLength);

        // Convert to approximate dB (0-128 range mapped to ~30-120 dB)
        const dB = Math.round(30 + (rms / 128) * 90);
        state.noiseLevel = dB;

        if (dB >= config.noise.threshold) {
            state.consecutiveLoudSamples++;
            
            // Require sustained noise (2 consecutive samples > threshold)
            if (state.consecutiveLoudSamples >= 2) {
                const Sensors = DrivePulse.Sensors;
                const pos = Sensors.getCurrentPosition();
                const event = {
                    type: 'noise',
                    lat: pos?.latitude || 0,
                    lng: pos?.longitude || 0,
                    severity: dB >= 100 ? 'high' : 'medium',
                    value: dB,
                    tripId: state.currentTripId,
                    timestamp: Math.floor(Date.now()), // Ensure integer timestamp
                };
                saveAndNotify(event, `🔊 High noise zone (${dB} dB)`);
                state.stats.noiseZones++;
                state.consecutiveLoudSamples = 0; // Reset after logging
            }
        } else {
            state.consecutiveLoudSamples = 0; // Reset if quiet
        }
    }

    // ===== NETWORK SIGNAL DETECTION =====
    function checkSignalStrength() {
        if (!state.active) return;

        // Use Network Information API
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (!connection) return;

        const effectiveType = connection.effectiveType; // 'slow-2g', '2g', '3g', '4g'
        const downlink = connection.downlink || 0; // Mbps

        let isDeadZone = false;
        let severity = 'low';

        if (effectiveType === 'slow-2g' || effectiveType === '2g' || downlink < 0.1) {
            isDeadZone = true;
            severity = effectiveType === 'slow-2g' ? 'high' : 'medium';
        }

        if (isDeadZone) {
            const Sensors = DrivePulse.Sensors;
            const pos = Sensors.getCurrentPosition();
            const event = {
                type: 'dead_zone',
                lat: pos?.latitude || 0,
                lng: pos?.longitude || 0,
                severity,
                value: effectiveType,
                tripId: state.currentTripId,
                timestamp: Date.now(),
            };
            saveAndNotify(event, `📵 Weak network signal (${effectiveType})`);
            state.stats.deadZones++;
        }
    }

    // ===== SAVE & NOTIFY =====
    async function saveAndNotify(event, alertMessage) {
        try {
            await DB.saveInfraEvent(event);
            // Push new auto-detected event to Supabase
            if (typeof SupabaseSync !== 'undefined' && SupabaseSync.isConfigured()) {
                SupabaseSync.pushEvent(event);
            }
        } catch (e) {
            console.warn('CityPulse: Failed to save infra event:', e);
        }

        if (callbacks.onInfraEvent) {
            callbacks.onInfraEvent(event);
        }

        if (callbacks.onAlert && alertMessage) {
            callbacks.onAlert({
                message: alertMessage,
                type: event.type,
                severity: event.severity,
                timestamp: event.timestamp,
            });
        }
    }

    // ===== GET STATS =====
    function getLiveStats() {
        return { ...state.stats, noiseLevel: state.noiseLevel };
    }

    async function getAggregatedStats() {
        const rawEvents = await DB.getAllInfraEvents();
        const rawSegments = await DB.getAllRoadSegments();

        const now = Date.now();
        const decayMs = config.dataDecayDays * 24 * 60 * 60 * 1000;

        // Temporal Decay Filter: Only process data from the last 30 days.
        // If a place was noisy 2 months ago but is quiet now, the old data is ignored.
        const events = rawEvents.filter(e => (now - e.timestamp) < decayMs);
        const segments = rawSegments.filter(s => (now - s.timestamp) < decayMs);

        const potholes = events.filter(e => e.type === 'pothole');
        const noise = events.filter(e => e.type === 'noise');
        const traffic = events.filter(e => e.type === 'traffic');
        const deadZones = events.filter(e => e.type === 'dead_zone');
        const roadQuality = events.filter(e => e.type === 'road_quality');

        // Calculate avg road quality
        const avgRoadScore = segments.length > 0
            ? Math.round(segments.reduce((s, seg) => s + seg.score, 0) / segments.length)
            : 100;

        // Total km monitored
        const totalKm = segments.reduce((s, seg) => s + (seg.distance || 0), 0);

        return {
            totalPotholes: potholes.length,
            potholeSeverity: {
                low: potholes.filter(p => p.severity === 'low').length,
                medium: potholes.filter(p => p.severity === 'medium').length,
                high: potholes.filter(p => p.severity === 'high').length,
            },
            avgRoadScore,
            totalRoadSegments: segments.length,
            noiseZones: noise.length,
            trafficSlowdowns: traffic.length,
            deadZones: deadZones.length,
            poorRoads: roadQuality.length,
            totalKmMonitored: parseFloat(totalKm.toFixed(1)),
            totalIssues: events.length,
            allEvents: events,
            allSegments: segments,
        };
    }

    // ===== CALLBACKS =====
    function on(event, callback) {
        const key = 'on' + event.charAt(0).toUpperCase() + event.slice(1);
        if (callbacks.hasOwnProperty(key)) {
            callbacks[key] = callback;
        }
    }

    // ===== PUBLIC API =====
    return {
        init,
        start,
        stop,
        feedAcceleration,
        feedGPS,
        getLiveStats,
        getAggregatedStats,
        getConfig: () => ({ ...config }),
        getNoiseLevel: () => state.noiseLevel,
        isActive: () => state.active,
        on,
    };
})();
