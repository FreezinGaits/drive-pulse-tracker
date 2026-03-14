/* ============================================
   DrivePulse – Trip Tracking Engine
   Core logic for automatic trip detection,
   real-time analytics, and event recording.
   ============================================ */

window.DrivePulse = window.DrivePulse || {};

DrivePulse.TripEngine = (function () {
    'use strict';

    const DB = DrivePulse.DB;
    const Sensors = DrivePulse.Sensors;

    // ===== ENGINE STATE =====
    const engineState = {
        status: 'idle', // idle | detecting | tracking | stopping
        currentTripId: null,
        tripData: null,

        // Detection counters
        speedAboveThresholdSince: null,
        speedBelowThresholdSince: null,

        // Trip accumulators
        totalDistance: 0,
        speedReadings: [],
        accelReadings: [],
        maxSpeed: 0,
        maxGForce: 0,
        accelerationEvents: 0,
        brakingEvents: 0,
        corneringEvents: 0,
        stops: 0,
        wasMoving: false,
        gpsBuffer: [],
        routeCoords: [],
        lastEventTime: { accel: 0, brake: 0, corner: 0 },

        // Timing
        tripStartTime: null,
        lastGPSTime: null,
    };

    // ===== SETTINGS (loaded from DB on init) =====
    let settings = {
        autoStartSpeed: 10,       // km/h
        autoStartDuration: 15,    // seconds
        autoStopSpeed: 3,         // km/h
        autoStopDuration: 180,    // seconds (3 min)
        accelThreshold: 0.4,      // G
        brakeThreshold: 0.5,      // G
        cornerThreshold: 30,      // degrees/s
        eventCooldown: 3000,      // ms between events of same type
        gpsInterval: 2000,        // ms between GPS point saves
        autoDetect: true,         // auto trip detection
    };

    // ===== CALLBACKS =====
    const callbacks = {
        onTripStart: null,
        onTripEnd: null,
        onTripUpdate: null,
        onEventDetected: null,
        onStatusChange: null,
    };

    // ===== LOAD SETTINGS =====
    async function loadSettings() {
        try {
            const saved = await DB.getAllSettings();
            if (saved.autoStartSpeed !== undefined) settings.autoStartSpeed = saved.autoStartSpeed;
            if (saved.autoStopSpeed !== undefined) settings.autoStopSpeed = saved.autoStopSpeed;
            if (saved.autoStopDuration !== undefined) settings.autoStopDuration = saved.autoStopDuration;
            if (saved.autoStartDuration !== undefined) settings.autoStartDuration = saved.autoStartDuration;
            if (saved.accelThreshold !== undefined) settings.accelThreshold = saved.accelThreshold;
            if (saved.brakeThreshold !== undefined) settings.brakeThreshold = saved.brakeThreshold;
            if (saved.cornerThreshold !== undefined) settings.cornerThreshold = saved.cornerThreshold;
            if (saved.autoDetect !== undefined) settings.autoDetect = saved.autoDetect;
        } catch (e) {
            console.warn('Could not load settings, using defaults:', e);
        }
    }

    async function updateSetting(key, value) {
        settings[key] = value;
        await DB.saveSetting(key, value);
    }

    // ===== INIT =====
    async function init() {
        await DB.open();
        await loadSettings();

        // Register sensor callbacks
        Sensors.on('SpeedUpdate', handleSpeedUpdate);
        Sensors.on('GPSUpdate', handleGPSUpdate);
        Sensors.on('AccelerationUpdate', handleAccelerationUpdate);
        Sensors.on('RotationUpdate', handleRotationUpdate);
    }

    // ===== START MONITORING =====
    function startMonitoring() {
        if (engineState.status !== 'idle') return;

        setStatus('detecting');
        Sensors.startAll();
        Sensors.requestWakeLock();
    }

    function stopMonitoring() {
        if (engineState.status === 'tracking') {
            endTrip();
        }
        Sensors.stopAll();
        Sensors.releaseWakeLock();
        setStatus('idle');
    }

    // ===== MANUAL TRIP CONTROL =====
    function manualStartTrip() {
        if (engineState.status === 'tracking') return;
        Sensors.startAll();
        Sensors.requestWakeLock();
        beginTrip();
    }

    function manualStopTrip() {
        if (engineState.status !== 'tracking') return;
        return endTrip();
    }

    // ===== GPS UPDATE HANDLER =====
    function handleGPSUpdate(gpsData) {
        if (engineState.status === 'tracking') {
            const now = Date.now();

            // Add distance
            if (gpsData.distanceFromLast > 0.001) { // > 1 meter
                engineState.totalDistance += gpsData.distanceFromLast;
            }

            // Buffer GPS point
            if (!engineState.lastGPSTime || (now - engineState.lastGPSTime) >= settings.gpsInterval) {
                const point = {
                    tripId: engineState.currentTripId,
                    latitude: gpsData.latitude,
                    longitude: gpsData.longitude,
                    speed: gpsData.speed,
                    heading: gpsData.heading,
                    accuracy: gpsData.accuracy,
                    altitude: gpsData.altitude,
                    timestamp: now,
                };
                
                engineState.gpsBuffer.push(point);
                
                // Only push to the visual map route if we're actually moving (> 2.5 km/h)
                // OR if it's the very first point of the route. This filters out stationary GPS drift.
                if (engineState.routeCoords.length === 0 || gpsData.speed >= 2.5) {
                    engineState.routeCoords.push([gpsData.latitude, gpsData.longitude]);
                }
                
                engineState.lastGPSTime = now;

                // Batch save every 10 points
                if (engineState.gpsBuffer.length >= 10) {
                    flushGPSBuffer();
                }
            }
        }
    }

    async function flushGPSBuffer() {
        if (engineState.gpsBuffer.length === 0) return;
        const points = [...engineState.gpsBuffer];
        engineState.gpsBuffer = [];
        try {
            await DB.saveGPSPointsBatch(points);
        } catch (e) {
            console.warn('Failed to save GPS batch:', e);
            // Push back for retry
            engineState.gpsBuffer.unshift(...points);
        }
    }

    // ===== SPEED UPDATE HANDLER =====
    function handleSpeedUpdate(speed, gpsData) {
        if (engineState.status === 'tracking') {
            // Record speed reading
            engineState.speedReadings.push({
                speed,
                timestamp: Date.now(),
            });

            // Cap speed readings to last 3600 entries (~1 hour at 1/sec) to prevent memory leak on long trips
            if (engineState.speedReadings.length > 3600) {
                engineState.speedReadings = engineState.speedReadings.slice(-3600);
            }

            // Update max speed
            if (speed > engineState.maxSpeed) {
                engineState.maxSpeed = speed;
            }

            // Detect stops
            if (speed < 2 && engineState.wasMoving) {
                engineState.stops++;
                engineState.wasMoving = false;
            } else if (speed >= 5) {
                engineState.wasMoving = true;
            }

            // Check for auto-stop
            if (settings.autoDetect) {
                checkAutoStop(speed);
            }

            // Fire update callback
            fireTripUpdate();

        } else if (engineState.status === 'detecting' && settings.autoDetect) {
            // Check for auto-start
            checkAutoStart(speed);
        }
    }

    // ===== AUTO-START DETECTION =====
    function checkAutoStart(speed) {
        if (speed >= settings.autoStartSpeed) {
            if (!engineState.speedAboveThresholdSince) {
                engineState.speedAboveThresholdSince = Date.now();
            } else {
                const duration = (Date.now() - engineState.speedAboveThresholdSince) / 1000;
                if (duration >= settings.autoStartDuration) {
                    beginTrip();
                }
            }
        } else {
            engineState.speedAboveThresholdSince = null;
        }
    }

    // ===== AUTO-STOP DETECTION =====
    function checkAutoStop(speed) {
        if (speed <= settings.autoStopSpeed) {
            if (!engineState.speedBelowThresholdSince) {
                engineState.speedBelowThresholdSince = Date.now();
            } else {
                const duration = (Date.now() - engineState.speedBelowThresholdSince) / 1000;
                if (duration >= settings.autoStopDuration) {
                    endTrip();
                }
            }
        } else {
            engineState.speedBelowThresholdSince = null;
        }
    }

    // ===== ACCELERATION HANDLER =====
    function handleAccelerationUpdate(data) {
        if (engineState.status !== 'tracking') return;

        const now = Date.now();
        const gForce = data.gForce;

        // Record for chart
        engineState.accelReadings.push({
            gForce,
            x: data.x,
            y: data.y,
            z: data.z,
            timestamp: now,
        });

        // Keep only last 500 readings for memory
        if (engineState.accelReadings.length > 500) {
            engineState.accelReadings = engineState.accelReadings.slice(-500);
        }

        // Update max G-force
        if (gForce > engineState.maxGForce) {
            engineState.maxGForce = gForce;
        }

        // EDGE CASE FIX: The "Horizontal Mount" failure
        // The old code hardcoded data.y for braking, which only works if the phone is perfectly upright.
        // We now use pure 3D magnitude, and cross-reference with GPS speed vectors to deduce the direction of the force.
        const totalAccelG = data.magnitude / 9.81;

        if (totalAccelG >= settings.accelThreshold) {
            // Check speed trend over the last 2 seconds to see if this force was speeding up or slowing down
            const recentSpeeds = engineState.speedReadings.slice(-3);
            const prevSpeed = recentSpeeds.length > 0 ? recentSpeeds[0].speed : Sensors.getCurrentSpeed();
            const currentSpeed = Sensors.getCurrentSpeed();
            
            if (currentSpeed > prevSpeed + 1) { // Speed increasing -> Hard Acceleration
                if (now - engineState.lastEventTime.accel > settings.eventCooldown) {
                    engineState.accelerationEvents++;
                    engineState.lastEventTime.accel = now;
                    recordEvent('acceleration', totalAccelG);
                }
            } else if (currentSpeed < prevSpeed - 1 && totalAccelG >= settings.brakeThreshold) { // Speed decreasing -> Hard Braking
                if (now - engineState.lastEventTime.brake > settings.eventCooldown) {
                    engineState.brakingEvents++;
                    engineState.lastEventTime.brake = now;
                    recordEvent('braking', totalAccelG);
                }
            }
        }
    }

    // ===== ROTATION HANDLER =====
    function handleRotationUpdate(data) {
        if (engineState.status !== 'tracking') return;

        const now = Date.now();
        const currentSpeed = Sensors.getCurrentSpeed();

        // Cornering detection: significant rotation while moving (lowered speed to 3km/h for easier testing)
        if (currentSpeed > 3 && data.magnitude >= settings.cornerThreshold) {
            if (now - engineState.lastEventTime.corner > settings.eventCooldown) {
                engineState.corneringEvents++;
                engineState.lastEventTime.corner = now;
                
                // Determine direction based on the dominant rotation axis
                let turnRate = data.alpha; // Z-axis
                if (Math.abs(data.beta) > Math.abs(turnRate)) turnRate = data.beta; // X-axis (if tilted)
                if (Math.abs(data.gamma) > Math.abs(turnRate)) turnRate = data.gamma; // Y-axis (landscape)
                
                const direction = turnRate > 0 ? 'turn_left' : 'turn_right';
                recordEvent(direction, data.magnitude);
            }
        }
    }

    // ===== RECORD SENSOR EVENT =====
    async function recordEvent(type, value) {
        const event = {
            tripId: engineState.currentTripId,
            type,
            value,
            speed: Sensors.getCurrentSpeed(),
            timestamp: Date.now(),
            position: Sensors.getCurrentPosition(),
        };

        try {
            await DB.saveSensorEvent(event);
        } catch (e) {
            console.warn('Failed to save sensor event:', e);
        }

        if (callbacks.onEventDetected) {
            callbacks.onEventDetected(event);
        }
    }

    // ===== BEGIN TRIP =====
    async function beginTrip() {
        const now = Date.now();
        const pos = Sensors.getCurrentPosition();

        // Reset accumulators
        engineState.totalDistance = 0;
        engineState.speedReadings = [];
        engineState.accelReadings = [];
        engineState.maxSpeed = 0;
        engineState.maxGForce = 0;
        engineState.accelerationEvents = 0;
        engineState.brakingEvents = 0;
        engineState.corneringEvents = 0;
        engineState.stops = 0;
        engineState.wasMoving = false;
        engineState.gpsBuffer = [];
        engineState.routeCoords = [];
        engineState.lastEventTime = { accel: 0, brake: 0, corner: 0 };
        engineState.speedAboveThresholdSince = null;
        engineState.speedBelowThresholdSince = null;
        engineState.tripStartTime = now;
        engineState.lastGPSTime = null;

        // Create trip record
        const tripData = {
            startTime: now,
            endTime: null,
            date: new Date(now).toISOString().split('T')[0],
            startLocation: pos ? { lat: pos.latitude, lng: pos.longitude } : null,
            endLocation: null,
            distance: 0,
            duration: 0,
            avgSpeed: 0,
            maxSpeed: 0,
            accelerations: 0,
            brakings: 0,
            cornerings: 0,
            maxGForce: 0,
            stops: 0,
            score: 0,
            speedData: [],
            accelData: [],
            route: [],
            status: 'active',
        };

        const id = await DB.saveTrip(tripData);
        engineState.currentTripId = id;
        engineState.tripData = tripData;

        setStatus('tracking');

        // Add notification
        await DB.saveNotification({
            title: 'Trip Started',
            message: `Trip tracking started at ${new Date(now).toLocaleTimeString()}`,
            icon: 'fa-play-circle',
            type: 'trip_start',
        });

        // Send browser notification
        sendNotification('DrivePulse', 'Trip tracking started! Drive safely. 🚗');

        if (callbacks.onTripStart) {
            callbacks.onTripStart({ tripId: id, startTime: now });
        }
    }

    // ===== END TRIP =====
    async function endTrip() {
        if (engineState.status !== 'tracking' || !engineState.currentTripId) return null;

        const now = Date.now();
        const duration = (now - engineState.tripStartTime) / 1000; // seconds

        // Flush remaining GPS buffer
        await flushGPSBuffer();

        // Calculate final stats
        const avgSpeed = duration > 0 ? (engineState.totalDistance / (duration / 3600)) : 0;

        // Sample speed data for chart (max 60 points)
        const speedData = sampleArray(
            engineState.speedReadings.map(r => Math.round(r.speed)),
            60
        );

        // Sample accel data for chart (max 40 points)
        const accelData = sampleArray(
            engineState.accelReadings.map(r => parseFloat(r.gForce.toFixed(2))),
            40
        );

        // Calculate driving score
        const score = calculateDrivingScore(
            duration,
            engineState.totalDistance,
            engineState.maxSpeed,
            engineState.accelerationEvents,
            engineState.brakingEvents,
            engineState.corneringEvents,
            engineState.maxGForce
        );

        const pos = Sensors.getCurrentPosition();

        // Update trip record
        const trip = {
            id: engineState.currentTripId,
            startTime: engineState.tripStartTime,
            endTime: now,
            date: new Date(engineState.tripStartTime).toISOString().split('T')[0],
            startLocation: engineState.tripData.startLocation,
            endLocation: pos ? { lat: pos.latitude, lng: pos.longitude } : null,
            distance: parseFloat(engineState.totalDistance.toFixed(2)),
            duration: Math.round(duration / 60), // minutes
            durationSeconds: Math.round(duration),
            avgSpeed: Math.round(avgSpeed),
            maxSpeed: Math.round(engineState.maxSpeed),
            accelerations: engineState.accelerationEvents,
            brakings: engineState.brakingEvents,
            cornerings: engineState.corneringEvents,
            maxGForce: parseFloat(engineState.maxGForce.toFixed(2)),
            stops: engineState.stops,
            score: score.total,
            scoreBreakdown: score.breakdown,
            speedData,
            accelData,
            route: engineState.routeCoords,
            status: 'completed',
        };

        await DB.saveTrip(trip);

        // Add notification
        await DB.saveNotification({
            title: 'Trip Completed',
            message: `${trip.distance} km in ${trip.duration} min • Score: ${trip.score}/100`,
            icon: 'fa-flag-checkered',
            type: 'trip_end',
        });

        sendNotification('Trip Completed! 🏁', `${trip.distance} km • Score: ${trip.score}/100`);

        const completedTrip = { ...trip };

        // Reset state
        setStatus(settings.autoDetect ? 'detecting' : 'idle');
        engineState.currentTripId = null;
        engineState.tripData = null;

        if (callbacks.onTripEnd) {
            callbacks.onTripEnd(completedTrip);
        }

        return completedTrip;
    }

    // ===== DRIVING SCORE =====
    function calculateDrivingScore(duration, distance, maxSpeed, accels, brakes, corners, maxG) {
        // Base score of 100, deduct for harsh driving events
        let speedControl = 100;
        let smoothBraking = 100;
        let corneringScore = 100;
        let accelScore = 100;

        const distKm = Math.max(distance, 0.1);

        // Speed control: penalize for very high speeds
        if (maxSpeed > 120) speedControl -= 20;
        else if (maxSpeed > 100) speedControl -= 10;
        else if (maxSpeed > 80) speedControl -= 5;

        // Acceleration events per km
        const accelPerKm = accels / distKm;
        accelScore = Math.max(50, 100 - accelPerKm * 15);

        // Braking events per km
        const brakePerKm = brakes / distKm;
        smoothBraking = Math.max(50, 100 - brakePerKm * 18);

        // Cornering events per km
        const cornerPerKm = corners / distKm;
        corneringScore = Math.max(50, 100 - cornerPerKm * 12);

        // Max G-force penalty
        if (maxG > 2.0) {
            accelScore -= 10;
            smoothBraking -= 10;
        } else if (maxG > 1.5) {
            accelScore -= 5;
            smoothBraking -= 5;
        }

        speedControl = Math.round(Math.min(100, Math.max(0, speedControl)));
        smoothBraking = Math.round(Math.min(100, Math.max(0, smoothBraking)));
        corneringScore = Math.round(Math.min(100, Math.max(0, corneringScore)));
        accelScore = Math.round(Math.min(100, Math.max(0, accelScore)));

        const total = Math.round(
            speedControl * 0.25 +
            smoothBraking * 0.30 +
            corneringScore * 0.20 +
            accelScore * 0.25
        );

        return {
            total: Math.min(100, Math.max(0, total)),
            breakdown: {
                speedControl,
                smoothBraking,
                cornering: corneringScore,
                acceleration: accelScore,
            },
        };
    }

    // ===== FIRE TRIP UPDATE =====
    function fireTripUpdate() {
        if (callbacks.onTripUpdate) {
            const now = Date.now();
            const duration = (now - engineState.tripStartTime) / 1000;
            const avgSpeed = duration > 0 ? (engineState.totalDistance / (duration / 3600)) : 0;

            callbacks.onTripUpdate({
                tripId: engineState.currentTripId,
                speed: Sensors.getCurrentSpeed(),
                distance: engineState.totalDistance,
                duration,
                avgSpeed,
                maxSpeed: engineState.maxSpeed,
                maxGForce: engineState.maxGForce,
                accelerations: engineState.accelerationEvents,
                brakings: engineState.brakingEvents,
                cornerings: engineState.corneringEvents,
                stops: engineState.stops,
                gpsAccuracy: Sensors.getGPSAccuracy(),
                heading: Sensors.getCurrentHeading(),
                position: Sensors.getCurrentPosition(),
            });
        }
    }

    // ===== UTILITY =====
    function sampleArray(arr, maxPoints) {
        if (arr.length <= maxPoints) return arr;
        const step = arr.length / maxPoints;
        const sampled = [];
        for (let i = 0; i < maxPoints; i++) {
            sampled.push(arr[Math.floor(i * step)]);
        }
        return sampled;
    }

    function setStatus(status) {
        engineState.status = status;
        if (callbacks.onStatusChange) {
            callbacks.onStatusChange(status);
        }
    }

    // ===== BROWSER NOTIFICATIONS =====
    async function requestNotificationPermission() {
        if ('Notification' in window) {
            const perm = await Notification.requestPermission();
            return perm === 'granted';
        }
        return false;
    }

    function sendNotification(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                new Notification(title, {
                    body,
                    icon: '/icons/icon-192.png',
                    badge: '/icons/icon-192.png',
                    vibrate: [200, 100, 200],
                    tag: 'drivepulse-trip',
                    renotify: true,
                });
            } catch (e) {
                // Fallback for service worker notifications
                if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                    navigator.serviceWorker.ready.then((reg) => {
                        reg.showNotification(title, { body, icon: '/icons/icon-192.png' });
                    });
                }
            }
        }
    }

    // ===== GET LIVE DATA =====
    function getLiveData() {
        if (engineState.status !== 'tracking') return null;

        const now = Date.now();
        const duration = (now - engineState.tripStartTime) / 1000;
        const avgSpeed = duration > 0 ? (engineState.totalDistance / (duration / 3600)) : 0;

        return {
            status: engineState.status,
            speed: Sensors.getCurrentSpeed(),
            distance: engineState.totalDistance,
            duration,
            avgSpeed,
            maxSpeed: engineState.maxSpeed,
            maxGForce: engineState.maxGForce,
            accelerations: engineState.accelerationEvents,
            brakings: engineState.brakingEvents,
            cornerings: engineState.corneringEvents,
            stops: engineState.stops,
            heading: Sensors.getCurrentHeading(),
            gpsAccuracy: Sensors.getGPSAccuracy(),
            speedData: sampleArray(engineState.speedReadings.map(r => Math.round(r.speed)), 60),
        };
    }

    // ===== SET CALLBACKS =====
    function on(event, callback) {
        const key = 'on' + event.charAt(0).toUpperCase() + event.slice(1);
        if (callbacks.hasOwnProperty(key)) {
            callbacks[key] = callback;
        }
    }

    // ===== PUBLIC API =====
    return {
        init,
        loadSettings,
        updateSetting,
        getSettings: () => ({ ...settings }),
        startMonitoring,
        stopMonitoring,
        manualStartTrip,
        manualStopTrip,
        getLiveData,
        getStatus: () => engineState.status,
        getCurrentTripId: () => engineState.currentTripId,
        requestNotificationPermission,
        on,
    };
})();
