/* ============================================
   DrivePulse – Sensor Manager
   Real smartphone sensor integrations:
   GPS, Accelerometer, Gyroscope, Magnetometer
   ============================================ */

window.DrivePulse = window.DrivePulse || {};

DrivePulse.Sensors = (function () {
    'use strict';

    // ===== STATE =====
    const state = {
        gpsWatchId: null,
        gpsAvailable: false,
        motionAvailable: false,
        orientationAvailable: false,
        permissionsGranted: {
            gps: false,
            motion: false,
            orientation: false,
        },
        lastPosition: null,
        lastTimestamp: null,
        currentSpeed: 0,          // km/h
        currentHeading: 0,        // degrees
        currentAcceleration: { x: 0, y: 0, z: 0 },
        gravity: { x: 0, y: 0, z: 9.81 }, // For Low-Pass Filter
        currentRotationRate: { alpha: 0, beta: 0, gamma: 0 },
        gpsAccuracy: null,
        altitude: null,
    };

    // ===== CALLBACKS =====
    const callbacks = {
        onGPSUpdate: null,
        onSpeedUpdate: null,
        onAccelerationUpdate: null,
        onRotationUpdate: null,
        onHeadingUpdate: null,
        onError: null,
        onStatusChange: null,
    };

    // ===== GPS OPTIONS =====
    const GPS_OPTIONS = {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
    };

    // ===== HAVERSINE DISTANCE =====
    function haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // km
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLon = ((lon2 - lon1) * Math.PI) / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // ===== CHECK CAPABILITIES =====
    function checkCapabilities() {
        state.gpsAvailable = 'geolocation' in navigator;
        state.motionAvailable = 'DeviceMotionEvent' in window;
        state.orientationAvailable = 'DeviceOrientationEvent' in window;

        return {
            gps: state.gpsAvailable,
            motion: state.motionAvailable,
            orientation: state.orientationAvailable,
        };
    }

    // ===== REQUEST PERMISSIONS =====
    async function requestPermissions() {
        const results = { gps: false, motion: false, orientation: false };

        // GPS permission
        if (state.gpsAvailable) {
            try {
                const pos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 10000,
                    });
                });
                results.gps = true;
                state.permissionsGranted.gps = true;
            } catch (err) {
                console.warn('GPS permission denied:', err.message);
                results.gps = false;
            }
        }

        // DeviceMotion permission (iOS 13+ requires explicit request)
        if (state.motionAvailable) {
            if (typeof DeviceMotionEvent.requestPermission === 'function') {
                try {
                    const response = await DeviceMotionEvent.requestPermission();
                    results.motion = response === 'granted';
                    state.permissionsGranted.motion = results.motion;
                } catch (err) {
                    console.warn('Motion permission denied:', err);
                    results.motion = false;
                }
            } else {
                // Android and non-iOS: permission granted by default
                results.motion = true;
                state.permissionsGranted.motion = true;
            }
        }

        // DeviceOrientation permission (iOS 13+)
        if (state.orientationAvailable) {
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                try {
                    const response = await DeviceOrientationEvent.requestPermission();
                    results.orientation = response === 'granted';
                    state.permissionsGranted.orientation = results.orientation;
                } catch (err) {
                    console.warn('Orientation permission denied:', err);
                    results.orientation = false;
                }
            } else {
                results.orientation = true;
                state.permissionsGranted.orientation = true;
            }
        }

        if (callbacks.onStatusChange) {
            callbacks.onStatusChange(results);
        }

        return results;
    }

    // ===== START GPS =====
    function startGPS() {
        if (!state.gpsAvailable) {
            console.warn('GPS not available');
            return false;
        }

        if (state.gpsWatchId !== null) {
            // Already watching
            return true;
        }

        state.gpsWatchId = navigator.geolocation.watchPosition(
            handleGPSSuccess,
            handleGPSError,
            GPS_OPTIONS
        );

        return true;
    }

    function handleGPSSuccess(position) {
        const { latitude, longitude, speed, heading, accuracy, altitude } = position.coords;
        const timestamp = position.timestamp;

        // Calculate speed from GPS (speed is in m/s, convert to km/h)
        let calculatedSpeed = 0;

        if (speed !== null && speed >= 0) {
            // Use GPS-provided speed (most accurate)
            calculatedSpeed = speed * 3.6; // m/s to km/h
        } else if (state.lastPosition && state.lastTimestamp) {
            // Fallback: calculate from consecutive positions
            const dist = haversineDistance(
                state.lastPosition.latitude,
                state.lastPosition.longitude,
                latitude,
                longitude
            );
            const timeDiff = (timestamp - state.lastTimestamp) / 1000; // seconds
            if (timeDiff > 0 && dist > 0.001) { // Minimum 1 meter to avoid noise
                calculatedSpeed = (dist / timeDiff) * 3600; // km/h
            }
        }

        // Filter out GPS noise and initial jitter
        if (accuracy > 20 && state.currentSpeed < 5) {
            // Highly inaccurate GPS point while stopped -> ignore speed
            calculatedSpeed = 0;
        }
        
        // Prevent impossible acceleration spikes (e.g. 0 to 21 km/h instantly from GPS snapping)
        if (state.currentSpeed < 2 && calculatedSpeed > 15) {
            // Dampen the spike aggressively
            calculatedSpeed = calculatedSpeed * 0.2;
        }

        state.currentSpeed = calculatedSpeed;
        state.gpsAccuracy = accuracy;
        state.altitude = altitude;
        if (heading !== null) state.currentHeading = heading;

        const gpsData = {
            latitude,
            longitude,
            speed: calculatedSpeed,
            heading: heading || state.currentHeading,
            accuracy,
            altitude,
            timestamp,
        };

        // Calculate distance from last point
        let distanceFromLast = 0;
        if (state.lastPosition) {
            distanceFromLast = haversineDistance(
                state.lastPosition.latitude,
                state.lastPosition.longitude,
                latitude,
                longitude
            );
        }
        gpsData.distanceFromLast = distanceFromLast;

        state.lastPosition = { latitude, longitude };
        state.lastTimestamp = timestamp;

        if (callbacks.onGPSUpdate) callbacks.onGPSUpdate(gpsData);
        if (callbacks.onSpeedUpdate) callbacks.onSpeedUpdate(calculatedSpeed, gpsData);
    }

    function handleGPSError(error) {
        console.error('GPS Error:', error.message);
        if (callbacks.onError) {
            callbacks.onError({
                type: 'gps',
                code: error.code,
                message: error.message,
            });
        }
    }

    function stopGPS() {
        if (state.gpsWatchId !== null) {
            navigator.geolocation.clearWatch(state.gpsWatchId);
            state.gpsWatchId = null;
        }
        state.lastPosition = null;
        state.lastTimestamp = null;
    }

    // ===== START MOTION SENSORS =====
    function startMotionSensors() {
        if (!state.motionAvailable) {
            console.warn('Motion sensors not available');
            return false;
        }

        window.addEventListener('devicemotion', handleDeviceMotion, true);
        return true;
    }

    function handleDeviceMotion(event) {
        // Acceleration including gravity
        const accel = event.accelerationIncludingGravity || {};
        // Pure acceleration (gravity removed) — preferred
        const pureAccel = event.acceleration || {};
        // Rotation rate
        const rotation = event.rotationRate || {};

        // Use pure acceleration if available, otherwise fallback using a Low-Pass Filter
        let ax = 0, ay = 0, az = 0;

        if (pureAccel && typeof pureAccel.x === 'number') {
            ax = pureAccel.x;
            ay = pureAccel.y;
            az = pureAccel.z;
        } else if (accel && typeof accel.x === 'number') {
            // Low-pass filter to isolate gravity
            const alpha = 0.8;
            state.gravity.x = alpha * state.gravity.x + (1 - alpha) * accel.x;
            state.gravity.y = alpha * state.gravity.y + (1 - alpha) * accel.y;
            state.gravity.z = alpha * state.gravity.z + (1 - alpha) * accel.z;

            // Remove gravity to leave pure acceleration
            ax = accel.x - state.gravity.x;
            ay = accel.y - state.gravity.y;
            az = accel.z - state.gravity.z;
        }

        state.currentAcceleration = { x: ax, y: ay, z: az };

        // Rotation rate in degrees/second
        state.currentRotationRate = {
            alpha: rotation.alpha || 0,
            beta: rotation.beta || 0,
            gamma: rotation.gamma || 0,
        };

        if (callbacks.onAccelerationUpdate) {
            callbacks.onAccelerationUpdate({
                x: ax,
                y: ay,
                z: az,
                magnitude: Math.sqrt(ax * ax + ay * ay + az * az),
                gForce: Math.sqrt(ax * ax + ay * ay + az * az) / 9.81,
                timestamp: Date.now(),
            });
        }

        if (callbacks.onRotationUpdate) {
            callbacks.onRotationUpdate({
                alpha: rotation.alpha || 0,
                beta: rotation.beta || 0,
                gamma: rotation.gamma || 0,
                magnitude: Math.sqrt(
                    (rotation.alpha || 0) ** 2 +
                    (rotation.beta || 0) ** 2 +
                    (rotation.gamma || 0) ** 2
                ),
                timestamp: Date.now(),
            });
        }
    }

    function stopMotionSensors() {
        window.removeEventListener('devicemotion', handleDeviceMotion, true);
    }

    // ===== START ORIENTATION =====
    function startOrientation() {
        if (!state.orientationAvailable) return false;
        window.addEventListener('deviceorientation', handleOrientation, true);
        return true;
    }

    function handleOrientation(event) {
        // On iOS, webkitCompassHeading gives true heading
        const heading = event.webkitCompassHeading || event.alpha || 0;
        state.currentHeading = heading;

        if (callbacks.onHeadingUpdate) {
            callbacks.onHeadingUpdate({
                heading,
                alpha: event.alpha,
                beta: event.beta,
                gamma: event.gamma,
                absolute: event.absolute,
                timestamp: Date.now(),
            });
        }
    }

    function stopOrientation() {
        window.removeEventListener('deviceorientation', handleOrientation, true);
    }

    // ===== START ALL SENSORS =====
    function startAll() {
        const results = {
            gps: startGPS(),
            motion: startMotionSensors(),
            orientation: startOrientation(),
        };
        return results;
    }

    function stopAll() {
        stopGPS();
        stopMotionSensors();
        stopOrientation();
    }

    // ===== WAKE LOCK (keep screen on) =====
    let wakeLock = null;

    async function requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
                wakeLock.addEventListener('release', () => {
                    console.log('Wake lock released');
                });
                return true;
            } catch (err) {
                console.warn('Wake lock failed:', err);
                return false;
            }
        }
        return false;
    }

    function releaseWakeLock() {
        if (wakeLock) {
            wakeLock.release();
            wakeLock = null;
        }
    }

    // Re-acquire wake lock on visibility change
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && state.gpsWatchId !== null) {
            await requestWakeLock();
        }
    });

    // ===== SET CALLBACKS =====
    function on(event, callback) {
        if (callbacks.hasOwnProperty('on' + event.charAt(0).toUpperCase() + event.slice(1))) {
            callbacks['on' + event.charAt(0).toUpperCase() + event.slice(1)] = callback;
        } else {
            // Try direct match
            const key = 'on' + event;
            if (callbacks.hasOwnProperty(key)) {
                callbacks[key] = callback;
            }
        }
    }

    // ===== PUBLIC API =====
    return {
        checkCapabilities,
        requestPermissions,
        startGPS,
        stopGPS,
        startMotionSensors,
        stopMotionSensors,
        startOrientation,
        stopOrientation,
        startAll,
        stopAll,
        requestWakeLock,
        releaseWakeLock,
        haversineDistance,
        on,
        getState: () => ({ ...state }),
        getCurrentSpeed: () => state.currentSpeed,
        getCurrentPosition: () => state.lastPosition ? { ...state.lastPosition } : null,
        getCurrentAcceleration: () => ({ ...state.currentAcceleration }),
        getCurrentRotation: () => ({ ...state.currentRotationRate }),
        getCurrentHeading: () => state.currentHeading,
        getGPSAccuracy: () => state.gpsAccuracy,
    };
})();
