/* ============================================
   DrivePulse – Supabase Infrastructure Sync & Auth
   ============================================ */
const SupabaseSync = (() => {
    const SUPABASE_URL = 'https://eowglcxngpiivyrcwsve.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvd2dsY3huZ3BpaXZ5cmN3c3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NTc3OTgsImV4cCI6MjA4OTEzMzc5OH0.6Ry-cZlDqR9JiUlovXNcW8Z3lFDoDwEC6NBXx3osrMQ';

    let supaClient;
    if (typeof window.supabase !== 'undefined') {
        supaClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }

    const TABLE = 'infra_events';
    let _initialized = false;
    let _syncInterval = null;

    function isConfigured() {
        return SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY' && supaClient;
    }

    // ═══════════════════════════════════════════
    // AUTHENTICATION
    // ═══════════════════════════════════════════
    async function getSession() {
        if (!isConfigured()) return null;
        const { data, error } = await supaClient.auth.getSession();
        if (error) console.error("Supabase Auth Error:", error.message);
        return data?.session;
    }

    async function login(email, password) {
        if (!isConfigured()) throw new Error("Supabase is not configured.");
        const { data, error } = await supaClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data.session;
    }

    async function register(email, password) {
        if (!isConfigured()) throw new Error("Supabase is not configured.");
        const { data, error } = await supaClient.auth.signUp({ email, password });
        if (error) throw error;
        return data.session;
    }

    async function logout() {
        if (!isConfigured()) return;
        await supaClient.auth.signOut();
    }

    // ═══════════════════════════════════════════
    // INFRASTRUCTURE EVENTS (Public Data)
    // ═══════════════════════════════════════════
    async function fetchGlobalEvents() {
        if (!isConfigured()) return [];
        try {
            const { data, error } = await supaClient
                .from(TABLE)
                .select('*')
                .order('created_at', { ascending: false })
                .limit(500);

            if (error) {
                console.warn('SupabaseSync: Fetch global events error', error.message);
                return [];
            }
            return data.map(evt => ({
                id: evt.id,
                type: evt.type,
                lat: evt.lat,
                lng: evt.lng,
                severity: evt.severity,
                value: evt.value,
                description: evt.description,
                confirmations: evt.confirmations,
                reported_by: evt.reported_by,
                timestamp: new Date(evt.created_at).getTime(),
                expires_at: evt.expires_at,
                source: 'global'
            }));
        } catch (e) {
            console.warn('SupabaseSync: Fetch error', e.message);
            return [];
        }
    }

    async function pushEvent(event) {
        if (!isConfigured()) return false;
        try {
            const { error } = await supaClient.from(TABLE).insert({
                type: event.type,
                lat: event.lat,
                lng: event.lng,
                severity: event.severity || 'medium',
                value: String(event.value || ''),
                description: event.description || '',
                confirmations: event.confirmations || 1,
                reported_by: event.reported_by || 'anonymous'
            });

            if (error) {
                console.warn('SupabaseSync: Push failed', error.message);
                _queueForSync(event);
                return false;
            }
            console.log('📤 SupabaseSync: Event pushed globally');
            return true;
        } catch (e) {
            console.warn('SupabaseSync: Push error (offline?)', e.message);
            _queueForSync(event);
            return false;
        }
    }

    async function pushEvents(events) {
        if (!isConfigured() || events.length === 0) return false;
        try {
            const payload = events.map(e => ({
                type: e.type,
                lat: e.lat,
                lng: e.lng,
                severity: e.severity || 'medium',
                value: String(e.value || ''),
                description: e.description || '',
                confirmations: e.confirmations || 1,
                reported_by: e.reported_by || 'anonymous'
            }));

            const { error } = await supaClient.from(TABLE).insert(payload);
            if (error) {
                console.warn('SupabaseSync: Batch push failed', error.message);
                return false;
            }
            console.log(`📤 SupabaseSync: ${events.length} events pushed to global DB`);
            return true;
        } catch (e) {
            console.warn('SupabaseSync: Batch push error', e.message);
            return false;
        }
    }

    async function updateEvent(id, updates) {
        if (!isConfigured() || typeof id !== 'string') return false;
        try {
            const { error } = await supaClient.from(TABLE).update(updates).eq('id', id);
            if (error) {
                console.warn('SupabaseSync: Update failed', error.message);
                return false;
            }
            console.log(`🔄 SupabaseSync: Event ${id} updated globally`);
            return true;
        } catch (e) {
            console.warn('SupabaseSync: Update error', e.message);
            return false;
        }
    }

    async function deleteEvent(id) {
        if (!isConfigured() || typeof id !== 'string') return false;
        try {
            const { error } = await supaClient.from(TABLE).delete().eq('id', id);
            if (error) {
                console.warn('SupabaseSync: Delete failed', error.message);
                return false;
            }
            console.log(`🗑️ SupabaseSync: Event ${id} permanently deleted globally (Healed!)`);
            return true;
        } catch (e) {
            console.warn('SupabaseSync: Delete error', e.message);
            return false;
        }
    }

    // ═══════════════════════════════════════════
    // OFFLINE QUEUE
    // ═══════════════════════════════════════════
    const QUEUE_KEY = 'drivepulse_sync_queue';
    function _queueForSync(event) {
        try {
            const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
            queue.push({ ...event, _queuedAt: Date.now() });
            localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
            console.log('📥 SupabaseSync: Event queued for later sync');
        } catch(e) {}
    }

    async function _flushQueue() {
        try {
            const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
            if (queue.length === 0) return;
            console.log(`🔄 SupabaseSync: Flushing ${queue.length} queued events...`);
            const success = await pushEvents(queue);
            if (success) {
                localStorage.setItem(QUEUE_KEY, '[]');
                console.log('✅ SupabaseSync: Queue flushed successfully');
            }
        } catch(e) {}
    }

    async function fullSync() {
        if (!isConfigured()) return [];
        await _flushQueue();
        const globalEvents = await fetchGlobalEvents();
        if (globalEvents.length > 0 && typeof DB !== 'undefined') {
            try {
                await DB.clearInfraEvents();
                for (const event of globalEvents) await DB.saveInfraEvent(event);
                console.log(`💾 SupabaseSync: Synced ${globalEvents.length} events to local cache`);
            } catch(e) {
                console.warn('SupabaseSync: Local cache update failed', e);
            }
        }
        return globalEvents;
    }

    function startAutoSync(intervalMs = 120000) {
        if (_syncInterval) clearInterval(_syncInterval);
        // Instant sync on startup
        fullSync();

        _syncInterval = setInterval(async () => {
            if (navigator.onLine) {
                await fullSync();
                try {
                    const events = await DB.getAllInfraEvents();
                    if (events.length > 0 && typeof MapLayers !== 'undefined') {
                        MapLayers.updateInfraData(events);
                    }
                } catch(e) {}
            }
        }, intervalMs);

        window.addEventListener('online', () => {
            console.log('🌐 SupabaseSync: Back online, syncing...');
            fullSync();
        });

        _initialized = true;
        console.log('🔄 SupabaseSync: Auto-sync started (every ' + (intervalMs / 1000) + 's)');
    }

    function stopAutoSync() {
        if (_syncInterval) {
            clearInterval(_syncInterval);
            _syncInterval = null;
        }
    }

    // ═══════════════════════════════════════════
    // CLOUD BACKUP & RESTORE (Trips & Telemetry)
    // ═══════════════════════════════════════════
    async function syncTripsToCloud() {
        const session = await getSession();
        if (!session) throw new Error("Must be logged in to sync to cloud.");
        const userId = session.user.id;

        // Fetch all local trips
        const trips = await DB.getAllTrips();
        if (trips.length === 0) return { success: true, count: 0 };

        console.log(`Uploading ${trips.length} trips to cloud...`);

        for (const trip of trips) {
            // Upsert trip
            const { error: tripError } = await supaClient.from('trips').upsert({
                id: trip.id,
                user_id: userId,
                date: trip.date,
                start_time: trip.startTime,
                end_time: trip.endTime,
                distance: trip.distance,
                duration: trip.duration,
                score: trip.score,
                route: trip.route,
                stats: trip.stats
            });
            if (tripError) {
                console.warn(`Failed to sync trip ${trip.id}:`, tripError);
                continue;
            }

            // Sync GPS Points
            const gpsPoints = await DB.getGPSPoints(trip.id);
            if (gpsPoints.length > 0) {
                const payload = gpsPoints.map(p => ({
                    trip_id: trip.id,
                    latitude: p.latitude,
                    longitude: p.longitude,
                    speed: p.speed,
                    altitude: p.altitude,
                    accuracy: p.accuracy,
                    timestamp: p.timestamp
                }));
                await supaClient.from('gps_points').delete().eq('trip_id', trip.id); // Clear old
                await supaClient.from('gps_points').insert(payload);
            }

            // Sync Sensor Events
            const sensorEvents = await DB.getSensorEvents(trip.id);
            if (sensorEvents.length > 0) {
                const payload = sensorEvents.map(e => ({
                    trip_id: trip.id,
                    type: e.type,
                    timestamp: e.timestamp,
                    lat: e.latitude,
                    lng: e.longitude,
                    speed: e.speed,
                    value: e.value
                }));
                await supaClient.from('sensor_events').delete().eq('trip_id', trip.id);
                await supaClient.from('sensor_events').insert(payload);
            }
        }
        return { success: true, count: trips.length };
    }

    async function restoreTripsFromCloud() {
        const session = await getSession();
        if (!session) throw new Error("Must be logged in to restore from cloud.");
        const userId = session.user.id;

        // Fetch user's trips
        const { data: trips, error: tripsError } = await supaClient.from('trips').select('*').eq('user_id', userId);
        if (tripsError) throw tripsError;
        if (!trips || trips.length === 0) return { success: true, count: 0 };

        console.log(`Found ${trips.length} trips in cloud. Restoring local...`);

        for (const t of trips) {
            // format trip object for IndexedDB
            const localTrip = {
                id: t.id,
                date: t.date,
                startTime: parseFloat(t.start_time),
                endTime: parseFloat(t.end_time),
                distance: parseFloat(t.distance),
                duration: parseFloat(t.duration),
                score: parseFloat(t.score),
                route: t.route || [],
                stats: t.stats || {}
            };
            await DB.saveTrip(localTrip);

            // Fetch and Restore GPS
            const { data: gpsData } = await supaClient.from('gps_points').select('*').eq('trip_id', t.id);
            if (gpsData && gpsData.length > 0) {
                for (const p of gpsData) {
                    await DB.saveGPSPoint({
                        tripId: t.id,
                        latitude: p.latitude,
                        longitude: p.longitude,
                        speed: parseFloat(p.speed),
                        altitude: parseFloat(p.altitude),
                        accuracy: parseFloat(p.accuracy),
                        timestamp: parseFloat(p.timestamp) // Keep exact numeric ms
                    });
                }
            }

            // Fetch and Restore Sensor Events
            const { data: sensorData } = await supaClient.from('sensor_events').select('*').eq('trip_id', t.id);
            if (sensorData && sensorData.length > 0) {
                for (const e of sensorData) {
                    await DB.saveSensorEvent({
                        tripId: t.id,
                        type: e.type,
                        timestamp: parseFloat(e.timestamp),
                        latitude: e.lat,
                        longitude: e.lng,
                        speed: parseFloat(e.speed),
                        value: parseFloat(e.value)
                    });
                }
            }
        }
        return { success: true, count: trips.length };
    }

    return {
        isConfigured,
        getSession,
        login,
        register,
        logout,
        fetchGlobalEvents,
        pushEvent,
        pushEvents,
        updateEvent,
        deleteEvent,
        fullSync,
        startAutoSync,
        stopAutoSync,
        syncTripsToCloud,
        restoreTripsFromCloud,
        getSupabase: () => supaClient // exposed for custom calls
    };
})();
