/* ============================================
   DrivePulse – Supabase Infrastructure Sync
   Global crowdsourced road hazard data.
   
   Security:
   - Uses ONLY the anon key (safe for frontend)
   - RLS policies restrict to SELECT + INSERT only
   - service_role key is NEVER used here
   - Trip data / GPS / profiles stay local
   ============================================ */
const SupabaseSync = (() => {
    // ═══════════════════════════════════════════
    // CONFIGURATION — Replace with your Supabase project values
    // ═══════════════════════════════════════════
    const SUPABASE_URL = 'https://eowglcxngpiivyrcwsve.supabase.co';       // e.g. https://xxxxxxxxxxxx.supabase.co
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvd2dsY3huZ3BpaXZ5cmN3c3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NTc3OTgsImV4cCI6MjA4OTEzMzc5OH0.6Ry-cZlDqR9JiUlovXNcW8Z3lFDoDwEC6NBXx3osrMQ'; // The anon (public) key — safe for frontend

    const TABLE = 'infra_events';
    let _initialized = false;
    let _syncInterval = null;

    // ── Supabase REST API helper ──
    // We use raw fetch() instead of the Supabase JS library to avoid
    // adding another dependency. The REST API is simple and secure.
    const headers = () => ({
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    });

    const apiUrl = (path) => `${SUPABASE_URL}/rest/v1/${path}`;

    // ── Check if configured ──
    function isConfigured() {
        return SUPABASE_URL !== 'YOUR_SUPABASE_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';
    }

    // ═══════════════════════════════════════════
    // FETCH: Get all global infra events
    // ═══════════════════════════════════════════
    async function fetchGlobalEvents() {
        if (!isConfigured()) {
            console.warn('SupabaseSync: Not configured. Skipping fetch.');
            return [];
        }

        try {
            const resp = await fetch(
                apiUrl(`${TABLE}?select=*&order=created_at.desc&limit=500`),
                { headers: headers(), method: 'GET' }
            );

            if (!resp.ok) {
                console.warn('SupabaseSync: Fetch failed', resp.status, await resp.text());
                return [];
            }

            const data = await resp.json();
            console.log(`🌐 SupabaseSync: Fetched ${data.length} global infra events`);
            return data.map(row => {
                // Dynamic severity based on confirmations count
                const conf = row.confirmations || 1;
                let severity = 'low';
                if (conf >= 10) severity = 'critical';
                else if (conf >= 5) severity = 'high';
                else if (conf >= 2) severity = 'medium';

                return {
                    id: row.id,
                    type: row.type,
                    lat: row.lat,
                    lng: row.lng,
                    severity: severity,
                    value: row.value || '',
                    description: row.description || '',
                    confirmations: conf,
                    reported_by: row.reported_by || 'anonymous',
                    timestamp: new Date(row.created_at).getTime(),
                    source: 'global'
                };
            });
        } catch (e) {
            console.warn('SupabaseSync: Fetch error (offline?)', e.message);
            return [];
        }
    }

    // ═══════════════════════════════════════════
    // PUSH: Upload a new infra event
    // ═══════════════════════════════════════════
    async function pushEvent(event) {
        if (!isConfigured()) return false;

        try {
            const payload = {
                type: event.type,
                lat: event.lat,
                lng: event.lng,
                severity: event.severity || 'medium',
                value: event.value || '',
                description: event.description || '',
                confirmations: event.confirmations || 1,
                reported_by: event.reported_by || 'anonymous'
            };

            const resp = await fetch(apiUrl(TABLE), {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify(payload)
            });

            if (!resp.ok) {
                const errText = await resp.text();
                console.warn('SupabaseSync: Push failed', resp.status, errText);
                // Queue for later sync
                _queueForSync(event);
                return false;
            }

            console.log('📤 SupabaseSync: Event pushed to global DB');
            return true;
        } catch (e) {
            console.warn('SupabaseSync: Push error (offline?)', e.message);
            _queueForSync(event);
            return false;
        }
    }

    // ═══════════════════════════════════════════
    // BATCH PUSH: Upload multiple events at once
    // ═══════════════════════════════════════════
    async function pushEvents(events) {
        if (!isConfigured() || events.length === 0) return false;

        try {
            const payload = events.map(e => ({
                type: e.type,
                lat: e.lat,
                lng: e.lng,
                severity: e.severity || 'medium',
                value: e.value || '',
                description: e.description || '',
                confirmations: e.confirmations || 1,
                reported_by: e.reported_by || 'anonymous'
            }));

            const resp = await fetch(apiUrl(TABLE), {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify(payload)
            });

            if (!resp.ok) {
                console.warn('SupabaseSync: Batch push failed', resp.status);
                return false;
            }

            console.log(`📤 SupabaseSync: ${events.length} events pushed to global DB`);
            return true;
        } catch (e) {
            console.warn('SupabaseSync: Batch push error', e.message);
            return false;
        }
    }

    // ═══════════════════════════════════════════
    // OFFLINE QUEUE: Store failed pushes for retry
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

    // ═══════════════════════════════════════════
    // FULL SYNC: Fetch global + merge with local
    // ═══════════════════════════════════════════
    async function fullSync() {
        if (!isConfigured()) return [];

        // 1. Flush any queued events first
        await _flushQueue();

        // 2. Fetch global events
        const globalEvents = await fetchGlobalEvents();

        // 3. Merge: store globally fetched events into local IndexedDB
        if (globalEvents.length > 0 && typeof DB !== 'undefined') {
            try {
                // Clear local infra cache and replace with global data
                await DB.clearInfraEvents();
                for (const event of globalEvents) {
                    await DB.saveInfraEvent(event);
                }
                console.log(`💾 SupabaseSync: Synced ${globalEvents.length} events to local cache`);
            } catch(e) {
                console.warn('SupabaseSync: Local cache update failed', e);
            }
        }

        return globalEvents;
    }

    // ═══════════════════════════════════════════
    // AUTO-SYNC: Periodic background sync
    // ═══════════════════════════════════════════
    function startAutoSync(intervalMs = 120000) { // default: every 2 minutes
        if (_syncInterval) clearInterval(_syncInterval);

        // Initial sync
        setTimeout(() => fullSync(), 3000);

        // Periodic sync
        _syncInterval = setInterval(async () => {
            if (navigator.onLine) {
                await fullSync();
                // Update map if layers are available
                try {
                    const events = await DB.getAllInfraEvents();
                    if (events.length > 0 && typeof MapLayers !== 'undefined') {
                        MapLayers.updateInfraData(events);
                    }
                } catch(e) {}
            }
        }, intervalMs);

        // Sync when coming back online
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
    // PUBLIC API
    // ═══════════════════════════════════════════
    return {
        isConfigured,
        fetchGlobalEvents,
        pushEvent,
        pushEvents,
        fullSync,
        startAutoSync,
        stopAutoSync
    };
})();
