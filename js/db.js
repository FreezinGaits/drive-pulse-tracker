/* ============================================
   DrivePulse – IndexedDB Database Module
   Persistent storage for trips, GPS points,
   settings, profile, and notifications.
   ============================================ */

window.DrivePulse = window.DrivePulse || {};

DrivePulse.DB = (function () {
    'use strict';

    const DB_NAME = 'DrivePulseDB';
    const DB_VERSION = 2;
    let db = null;

    // ===== OPEN DATABASE =====
    function open() {
        return new Promise((resolve, reject) => {
            if (db) { resolve(db); return; }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const d = event.target.result;

                // Trips store
                if (!d.objectStoreNames.contains('trips')) {
                    const tripStore = d.createObjectStore('trips', { keyPath: 'id', autoIncrement: true });
                    tripStore.createIndex('date', 'date', { unique: false });
                    tripStore.createIndex('startTime', 'startTime', { unique: false });
                }

                // GPS Points store (for route data)
                if (!d.objectStoreNames.contains('gpsPoints')) {
                    const gpsStore = d.createObjectStore('gpsPoints', { keyPath: 'id', autoIncrement: true });
                    gpsStore.createIndex('tripId', 'tripId', { unique: false });
                }

                // Sensor Events store (acceleration, braking, cornering)
                if (!d.objectStoreNames.contains('sensorEvents')) {
                    const sensorStore = d.createObjectStore('sensorEvents', { keyPath: 'id', autoIncrement: true });
                    sensorStore.createIndex('tripId', 'tripId', { unique: false });
                    sensorStore.createIndex('type', 'type', { unique: false });
                }

                // Settings store
                if (!d.objectStoreNames.contains('settings')) {
                    d.createObjectStore('settings', { keyPath: 'key' });
                }

                // Profile store
                if (!d.objectStoreNames.contains('profile')) {
                    d.createObjectStore('profile', { keyPath: 'id' });
                }

                // Notifications store
                if (!d.objectStoreNames.contains('notifications')) {
                    const notifStore = d.createObjectStore('notifications', { keyPath: 'id', autoIncrement: true });
                    notifStore.createIndex('timestamp', 'timestamp', { unique: false });
                    notifStore.createIndex('read', 'read', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                resolve(db);
            };

            request.onerror = (event) => {
                console.error('DB Error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    // ===== GENERIC HELPERS =====
    function getStore(storeName, mode = 'readonly') {
        const tx = db.transaction(storeName, mode);
        return tx.objectStore(storeName);
    }

    function promisify(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // ===== TRIPS =====
    async function saveTrip(trip) {
        await open();
        const store = getStore('trips', 'readwrite');
        return promisify(store.put(trip));
    }

    async function getTrip(id) {
        await open();
        const store = getStore('trips');
        return promisify(store.get(id));
    }

    async function getAllTrips() {
        await open();
        const store = getStore('trips');
        return promisify(store.getAll());
    }

    async function deleteTrip(id) {
        await open();
        const store = getStore('trips', 'readwrite');
        // Also delete associated GPS points and sensor events
        const gpsStore = getStore('gpsPoints', 'readwrite');
        const sensorStore = getStore('sensorEvents', 'readwrite');

        // Delete GPS points for this trip
        const gpsIndex = gpsStore.index('tripId');
        const gpsCursor = gpsIndex.openCursor(IDBKeyRange.only(id));
        gpsCursor.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };

        // Delete sensor events for this trip
        const sensorIndex = sensorStore.index('tripId');
        const sensorCursor = sensorIndex.openCursor(IDBKeyRange.only(id));
        sensorCursor.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };

        return promisify(store.delete(id));
    }

    async function getTripsByDateRange(startDate, endDate) {
        await open();
        const store = getStore('trips');
        const index = store.index('date');
        const range = IDBKeyRange.bound(startDate, endDate);
        return promisify(index.getAll(range));
    }

    // ===== GPS POINTS =====
    async function saveGPSPoint(point) {
        await open();
        const store = getStore('gpsPoints', 'readwrite');
        return promisify(store.add(point));
    }

    async function getGPSPoints(tripId) {
        await open();
        const store = getStore('gpsPoints');
        const index = store.index('tripId');
        return promisify(index.getAll(IDBKeyRange.only(tripId)));
    }

    async function saveGPSPointsBatch(points) {
        await open();
        const tx = db.transaction('gpsPoints', 'readwrite');
        const store = tx.objectStore('gpsPoints');
        for (const point of points) {
            store.add(point);
        }
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // ===== SENSOR EVENTS =====
    async function saveSensorEvent(event) {
        await open();
        const store = getStore('sensorEvents', 'readwrite');
        return promisify(store.add(event));
    }

    async function getSensorEvents(tripId) {
        await open();
        const store = getStore('sensorEvents');
        const index = store.index('tripId');
        return promisify(index.getAll(IDBKeyRange.only(tripId)));
    }

    // ===== SETTINGS =====
    async function saveSetting(key, value) {
        await open();
        const store = getStore('settings', 'readwrite');
        return promisify(store.put({ key, value }));
    }

    async function getSetting(key, defaultValue = null) {
        await open();
        const store = getStore('settings');
        const result = await promisify(store.get(key));
        return result ? result.value : defaultValue;
    }

    async function getAllSettings() {
        await open();
        const store = getStore('settings');
        const results = await promisify(store.getAll());
        const settings = {};
        results.forEach(r => { settings[r.key] = r.value; });
        return settings;
    }

    // ===== PROFILE =====
    async function saveProfile(profile) {
        await open();
        const store = getStore('profile', 'readwrite');
        profile.id = 'main'; // Single profile
        return promisify(store.put(profile));
    }

    async function getProfile() {
        await open();
        const store = getStore('profile');
        const result = await promisify(store.get('main'));
        return result || {
            id: 'main',
            name: 'Driver',
            email: '',
            vehicle: '',
            vehicleType: 'car'
        };
    }

    // ===== NOTIFICATIONS =====
    async function saveNotification(notif) {
        await open();
        const store = getStore('notifications', 'readwrite');
        notif.timestamp = notif.timestamp || Date.now();
        notif.read = notif.read || false;
        return promisify(store.add(notif));
    }

    async function getAllNotifications() {
        await open();
        const store = getStore('notifications');
        const all = await promisify(store.getAll());
        return all.sort((a, b) => b.timestamp - a.timestamp);
    }

    async function markNotificationRead(id) {
        await open();
        const store = getStore('notifications', 'readwrite');
        const notif = await promisify(store.get(id));
        if (notif) {
            notif.read = true;
            return promisify(store.put(notif));
        }
    }

    async function markAllNotificationsRead() {
        await open();
        const tx = db.transaction('notifications', 'readwrite');
        const store = tx.objectStore('notifications');
        const all = await promisify(store.getAll());
        for (const notif of all) {
            notif.read = true;
            store.put(notif);
        }
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function getUnreadCount() {
        await open();
        const store = getStore('notifications');
        const all = await promisify(store.getAll());
        return all.filter(n => !n.read).length;
    }

    async function clearAllNotifications() {
        await open();
        const store = getStore('notifications', 'readwrite');
        return promisify(store.clear());
    }

    // ===== PUBLIC API =====
    return {
        open,
        // Trips
        saveTrip,
        getTrip,
        getAllTrips,
        deleteTrip,
        getTripsByDateRange,
        // GPS
        saveGPSPoint,
        getGPSPoints,
        saveGPSPointsBatch,
        // Sensor Events
        saveSensorEvent,
        getSensorEvents,
        // Settings
        saveSetting,
        getSetting,
        getAllSettings,
        // Profile
        saveProfile,
        getProfile,
        // Notifications
        saveNotification,
        getAllNotifications,
        markNotificationRead,
        markAllNotificationsRead,
        getUnreadCount,
        clearAllNotifications,
    };
})();
