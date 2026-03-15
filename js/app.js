/* ============================================
   DrivePulse – Main Application UI Controller
   Connects real sensors, DB, and trip engine
   to the user interface.
   ============================================ */

(function () {
    'use strict';

    const DB = DrivePulse.DB;
    const Sensors = DrivePulse.Sensors;
    const TripEngine = DrivePulse.TripEngine;
    const CityPulse = DrivePulse.CityPulse;

    // ===== UI STATE =====
    const ui = {
        currentScreen: 'home',
        previousScreen: null,
        charts: {},
        map: null,
        liveMap: null,
        liveMarker: null,
        liveMapFollows: true,
        updateInterval: null,
        permissionsGranted: false,
    };

    // ===== DOM HELPERS =====
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // ============================================
    // SPLASH & INIT
    // ============================================
    function initSplash() {
        setTimeout(() => {
            const splash = $('#splash-screen');
            splash.classList.add('fade-out');
            setTimeout(() => {
                splash.classList.remove('active');
                splash.style.display = 'none';
                $('#app-container').classList.remove('hidden');
                initApp();
            }, 600);
        }, 2800);
    }

    async function initApp() {
        // Initialize database
        await DB.open();

        // Initialize trip engine
        await TripEngine.init();

        // Initialize CityPulse infrastructure engine
        CityPulse.init();
        CityPulse.on('alert', handleInfraAlert);
        CityPulse.on('infraEvent', handleInfraEvent);

        // Register PWA service worker
        registerServiceWorker();

        // Setup UI
        updateGreeting();
        await loadProfile();
        await loadAndRenderTrips();
        initSpeedometerTicks();
        initHomeSpeedChart();
        initNavigation();
        initTripToggle();
        await initSettings();
        initShareModal();
        initFilterChips();
        initPeriodChips();
        initNotificationPanel();
        initProfileModal();
        initHazardModal();
        initPermissionFlow();
        initInfraFilterChips();

        // Register trip engine callbacks
        TripEngine.on('tripStart', handleTripStarted);
        TripEngine.on('tripEnd', handleTripEnded);
        TripEngine.on('tripUpdate', handleTripUpdate);
        TripEngine.on('eventDetected', handleEventDetected);
        TripEngine.on('statusChange', handleEngineStatusChange);

        // Update notification badge
        await updateNotificationBadge();

        // Load sensor status
        updateSensorStatusUI();

        // Initialize Live Tracking Map safely so it doesn't block other UI
        try {
            initLiveTrackingMap();
        } catch(e) {
            console.warn("Failed to initialize Live Tracking Map:", e);
        }
    }

    // ===== SERVICE WORKER =====
    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            // First, clear ALL old caches and unregister old SW to force fresh load
            caches.keys().then(keys => {
                keys.forEach(key => {
                    if (key !== 'drivepulse-v2.0') {
                        caches.delete(key);
                        console.log('Cleared old cache:', key);
                    }
                });
            });

            navigator.serviceWorker.register('/sw.js').then((reg) => {
                console.log('SW registered:', reg.scope);
                // Force the new SW to activate immediately
                if (reg.waiting) {
                    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'activated') {
                            console.log('New SW activated, reloading for fresh content');
                        }
                    });
                });
            }).catch((err) => {
                console.warn('SW registration failed:', err);
            });
        }
    }

    // ============================================
    // GREETING
    // ============================================
    function updateGreeting() {
        const hour = new Date().getHours();
        let greeting = 'Good Evening';
        if (hour < 12) greeting = 'Good Morning';
        else if (hour < 17) greeting = 'Good Afternoon';

        const nameEl = $('#greeting-name');
        const greetEl = $('#greeting-prefix');
        if (greetEl) greetEl.textContent = greeting + ',';
    }

    // ============================================
    // PROFILE
    // ============================================
    async function loadProfile() {
        const profile = await DB.getProfile();
        const nameEl = $('#greeting-name');
        if (nameEl) nameEl.textContent = profile.name || 'Driver';
        const profileNameEl = $('.profile-name');
        if (profileNameEl) profileNameEl.textContent = profile.name || 'Driver';
        const profileEmailEl = $('.profile-email');
        if (profileEmailEl) profileEmailEl.textContent = profile.email || 'Tap to set up profile';
        const vehicleEl = $('#profile-vehicle-display');
        if (vehicleEl) vehicleEl.textContent = profile.vehicle || 'Not set';
    }

    function initProfileModal() {
        const modal = $('#profile-modal');
        if (!modal) return;

        // Open profile modal
        const editBtn = $('.profile-edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', async () => {
                const profile = await DB.getProfile();
                $('#profile-name-input').value = profile.name || '';
                $('#profile-email-input').value = profile.email || '';
                $('#profile-vehicle-input').value = profile.vehicle || '';
                $('#profile-vehicle-type').value = profile.vehicleType || 'car';
                modal.classList.add('active');
            });
        }

        // Also open from profile card click
        const profileCard = $('.profile-card');
        if (profileCard) {
            profileCard.addEventListener('click', (e) => {
                if (!e.target.closest('.profile-edit-btn')) {
                    editBtn?.click();
                }
            });
        }

        // Close
        $('#profile-modal-close')?.addEventListener('click', () => {
            modal.classList.remove('active');
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });

        // Save
        $('#profile-save-btn')?.addEventListener('click', async () => {
            const profile = {
                name: $('#profile-name-input').value.trim() || 'Driver',
                email: $('#profile-email-input').value.trim(),
                vehicle: $('#profile-vehicle-input').value.trim(),
                vehicleType: $('#profile-vehicle-type').value,
            };
            await DB.saveProfile(profile);
            await loadProfile();
            updateGreeting();
            modal.classList.remove('active');
            showToast('Profile updated!');
        });
    }

    // ============================================
    // HAZARD REPORTING MODAL 
    // ============================================
    let _pendingHazardCoords = null;

    function initHazardModal() {
        const modal = $('#hazard-modal');
        const closeBtn = $('#hazard-modal-close');
        const submitBtn = $('#hazard-submit-btn');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.remove('active');
                _pendingHazardCoords = null;
            });
        }

        if (submitBtn) {
            submitBtn.addEventListener('click', async () => {
                if (!_pendingHazardCoords) return;

                const category = $('#hazard-category').value;
                const desc = $('#hazard-desc').value.trim();
                const profile = await DB.getProfile();

                const newEvent = {
                    type: category,
                    lat: _pendingHazardCoords.lat,
                    lng: _pendingHazardCoords.lng,
                    severity: 'low', // default for 1 single report
                    value: desc || 'User Reported',
                    timestamp: Date.now(),
                    confirmations: 1,
                    reported_by: profile.email
                };

                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Reporting...';

                try {
                    // Save locally
                    await DB.saveInfraEvent(newEvent);
                    // Push to global Supabase
                    if (typeof SupabaseSync !== 'undefined' && SupabaseSync.isConfigured()) {
                        await SupabaseSync.pushEvent(newEvent);
                    }
                    showToast('📍 Hazard reported globally!');
                    const events = await DB.getAllInfraEvents();
                    if (typeof MapLayers !== 'undefined') MapLayers.updateInfraData(events);
                } catch(err) {
                    console.warn(err);
                    showToast('Failed to report hazard.');
                }

                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Report Globally';
                modal.classList.remove('active');
                _pendingHazardCoords = null;
                $('#hazard-desc').value = ''; // clear input
            });
        }
    }

    async function openHazardModal(coords) {
        const profile = await DB.getProfile();
        
        // 1. Mandatory Email Check
        if (!profile || !profile.email || !profile.email.includes('@')) {
            showToast('⚠️ Please set a valid email in your profile before reporting hazards.');
            setTimeout(() => {
                $('#profile-modal').classList.add('active');
            }, 1000);
            return;
        }

        // 2. Open standard custom modal
        _pendingHazardCoords = coords;
        $('#hazard-modal').classList.add('active');
    }

    // ============================================
    // NOTIFICATIONS
    // ============================================
    function initNotificationPanel() {
        const btn = $('#notification-btn');
        const panel = $('#notification-panel');
        if (!btn || !panel) return;

        btn.addEventListener('click', async () => {
            panel.classList.toggle('active');
            if (panel.classList.contains('active')) {
                await renderNotifications();
                await DB.markAllNotificationsRead();
                await updateNotificationBadge();
            }
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#notification-panel') && !e.target.closest('#notification-btn')) {
                panel.classList.remove('active');
            }
        });

        // Clear all
        $('#clear-notifs-btn')?.addEventListener('click', async () => {
            await DB.clearAllNotifications();
            await renderNotifications();
            await updateNotificationBadge();
            showToast('Notifications cleared');
        });
    }

    async function renderNotifications() {
        const list = $('#notification-list');
        if (!list) return;

        const notifs = await DB.getAllNotifications();

        if (notifs.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-bell-slash"></i>
                    <p>No notifications yet</p>
                    <span>Start a trip to see updates here</span>
                </div>
            `;
            return;
        }

        list.innerHTML = notifs.slice(0, 20).map(n => `
            <div class="notif-item ${n.read ? '' : 'unread'}">
                <div class="notif-icon"><i class="fas ${n.icon || 'fa-info-circle'}"></i></div>
                <div class="notif-content">
                    <span class="notif-title">${n.title}</span>
                    <span class="notif-message">${n.message}</span>
                    <span class="notif-time">${formatTimeAgo(n.timestamp)}</span>
                </div>
            </div>
        `).join('');
    }

    async function updateNotificationBadge() {
        const badge = $('.notif-badge');
        if (!badge) return;
        const count = await DB.getUnreadCount();
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }

    function formatTimeAgo(timestamp) {
        const diff = Date.now() - timestamp;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }

    // ============================================
    // PERMISSIONS
    // ============================================
    function initPermissionFlow() {
        const overlay = $('#permission-overlay');
        if (!overlay) return;

        const grantBtn = $('#grant-permissions-btn');
        const skipBtn = $('#skip-permissions-btn');

        grantBtn?.addEventListener('click', async () => {
            grantBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Requesting...';
            grantBtn.disabled = true;

            const perms = await Sensors.requestPermissions();
            await TripEngine.requestNotificationPermission();

            ui.permissionsGranted = perms.gps;

            updateSensorStatusUI();
            overlay.classList.remove('active');

            if (perms.gps) {
                showToast('All sensors activated! 🎯');
                // Start auto-monitoring
                TripEngine.startMonitoring();
            } else {
                showToast('GPS permission needed for tracking');
            }
        });

        skipBtn?.addEventListener('click', () => {
            overlay.classList.remove('active');
            showToast('You can enable sensors from Settings');
        });

        // Show permission overlay if GPS not yet granted
        checkAndShowPermissions();
    }

    async function checkAndShowPermissions() {
        // Check if GPS permission was previously granted
        if (navigator.permissions) {
            try {
                const result = await navigator.permissions.query({ name: 'geolocation' });
                if (result.state === 'granted') {
                    ui.permissionsGranted = true;
                    const perms = await Sensors.requestPermissions();
                    if (perms.gps) {
                        TripEngine.startMonitoring();
                    }
                    updateSensorStatusUI();
                    return;
                }
            } catch (e) {
                // permissions API not available
            }
        }

        // Show permission overlay
        setTimeout(() => {
            const overlay = $('#permission-overlay');
            if (overlay) overlay.classList.add('active');
        }, 500);
    }

    function updateSensorStatusUI() {
        const caps = Sensors.checkCapabilities();
        const state = Sensors.getState();

        $$('.sensor-status-indicator').forEach(el => {
            const sensor = el.dataset.sensor;
            if (sensor === 'gps') {
                el.className = `sensor-status-indicator ${state.permissionsGranted.gps ? 'active' : 'inactive'}`;
                el.textContent = state.permissionsGranted.gps ? 'Active' : 'Inactive';
            } else if (sensor === 'motion') {
                el.className = `sensor-status-indicator ${state.permissionsGranted.motion ? 'active' : 'inactive'}`;
                el.textContent = state.permissionsGranted.motion ? 'Active' : 'Inactive';
            } else if (sensor === 'orientation') {
                el.className = `sensor-status-indicator ${state.permissionsGranted.orientation ? 'active' : 'inactive'}`;
                el.textContent = state.permissionsGranted.orientation ? 'Active' : 'Inactive';
            }
        });
    }

    // ============================================
    // NAVIGATION
    // ============================================
    function initNavigation() {
        $$('.nav-item').forEach(btn => {
            btn.addEventListener('click', () => navigateTo(btn.dataset.screen));
        });

        $$('.see-all-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.navigate;
                if (target) navigateTo(target);
            });
        });

        $('#back-btn').addEventListener('click', () => {
            navigateTo(ui.previousScreen || 'home', false);
        });
    }

    function navigateTo(screenName, saveHistory = true) {
        if (screenName === ui.currentScreen) return;

        $$('.page-screen').forEach(s => s.classList.remove('active'));
        const target = $(`#screen-${screenName}`);
        if (target) target.classList.add('active');

        $$('.nav-item').forEach(n => n.classList.remove('active'));
        const navBtn = $(`.nav-item[data-screen="${screenName}"]`);
        if (navBtn) navBtn.classList.add('active');

        const backBtn = $('#back-btn');
        const brand = $('.app-brand');
        if (screenName === 'detail') {
            backBtn.classList.remove('hidden');
            brand.classList.add('hidden');
        } else {
            backBtn.classList.add('hidden');
            brand.classList.remove('hidden');
        }

        if (saveHistory) ui.previousScreen = ui.currentScreen;
        ui.currentScreen = screenName;

        if (screenName === 'analytics') setTimeout(() => initAnalyticsCharts(), 100);
        if (screenName === 'history') loadAndRenderTrips();
        if (screenName === 'infra') {
            setTimeout(async () => {
                renderInfraMap();
                updateInfraDashboard();
            }, 300);
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ============================================
    // SPEEDOMETER
    // ============================================
    function initSpeedometerTicks() {
        const ticksGroup = $('#tick-marks');
        if (!ticksGroup) return;
        const speeds = [0, 20, 40, 60, 80, 100, 120, 140, 160];

        speeds.forEach((speed, i) => {
            const angle = -180 + (i / (speeds.length - 1)) * 180;
            const rad = (angle * Math.PI) / 180;
            const cx = 150 + 100 * Math.cos(rad);
            const cy = 180 + 100 * Math.sin(rad);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', cx);
            text.setAttribute('y', cy);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.textContent = speed;
            ticksGroup.appendChild(text);
        });
    }

    function updateSpeedometer(speed) {
        const ratio = Math.min(speed / 160, 1);
        const offset = 377 * (1 - ratio);
        const arc = $('#speed-arc');
        if (arc) arc.setAttribute('stroke-dashoffset', offset);
        const val = $('#speed-value');
        if (val) val.textContent = Math.round(speed);
    }

    // ============================================
    // TRIP CONTROL
    // ============================================
    function initTripToggle() {
        const btn = $('#trip-toggle-btn');
        if (!btn) return;
        btn.addEventListener('click', async () => {
            const status = TripEngine.getStatus();
            if (status === 'tracking') {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Stopping...</span>';
                TripEngine.manualStopTrip();
            } else {
                // Request permissions if not yet granted
                if (!ui.permissionsGranted) {
                    const perms = await Sensors.requestPermissions();
                    await TripEngine.requestNotificationPermission();
                    ui.permissionsGranted = perms.gps;
                    updateSensorStatusUI();
                    if (!perms.gps) {
                        showToast('GPS permission is required for tracking');
                        return;
                    }
                }
                TripEngine.manualStartTrip();
            }
        });
    }

    // ===== ENGINE CALLBACKS =====
    function handleTripStarted(data) {
        const btn = $('#trip-toggle-btn');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-stop"></i><span>Stop Trip</span>';
            btn.classList.add('stop');
        }

        $('#live-trip-card')?.classList.add('tracking');
        const indicator = $('#live-status-text');
        if (indicator) indicator.textContent = 'LIVE TRACKING';

        showToast('Trip tracking started! 🚗');
        updateNotificationBadge();

        // Start CityPulse infrastructure monitoring
        CityPulse.start(data.tripId);

        // Start live UI updates
        ui.updateInterval = setInterval(updateLiveUI, 500);
    }

    function handleTripEnded(trip) {
        const btn = $('#trip-toggle-btn');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-play"></i><span>Start Trip</span>';
            btn.classList.remove('stop');
        }

        $('#live-trip-card')?.classList.remove('tracking');
        const indicator = $('#live-status-text');
        if (indicator) indicator.textContent = 'READY';
        const accEl = $('#gps-accuracy');
        if (accEl) accEl.textContent = '';

        // Stop live updates
        if (ui.updateInterval) {
            clearInterval(ui.updateInterval);
            ui.updateInterval = null;
        }

        // Animate speedometer to 0
        animateSpeedDown();

        showToast(`Trip completed! Score: ${trip.score}/100 🏁`);
        updateNotificationBadge();

        // Stop CityPulse infrastructure monitoring
        CityPulse.stop();

        // Reload trips
        loadAndRenderTrips();

        // Show trip detail
        setTimeout(() => showTripDetail(trip), 1000);
    }

    function handleTripUpdate(data) {
        // Updated via interval in updateLiveUI
    }

    function handleEventDetected(event) {
        const typeNames = {
            acceleration: '🚀 Hard Acceleration',
            braking: '🛑 Hard Braking',
            cornering: '🔀 Sharp Corner',
            turn_left: '↩️ Hard Left Turn',
            turn_right: '↪️ Hard Right Turn',
        };
        const name = typeNames[event.type] || event.type;
        // Show brief indicator (subtle, don't distract driver)
        const indicator = $('#event-indicator');
        if (indicator) {
            indicator.textContent = name;
            indicator.classList.add('show');
            setTimeout(() => indicator.classList.remove('show'), 2000);
        }
    }

    function handleInfraAlert(alert) {
        showToast(`⚠️ CityPulse Alert: ${alert.title}`);
    }

    async function handleInfraEvent(event) {
        // Push the real detection to Supabase (global)
        if (typeof SupabaseSync !== 'undefined' && SupabaseSync.isConfigured()) {
            try {
                await SupabaseSync.pushEvent(event);
            } catch(e) { console.warn('Could not push infra event to Supabase', e); }
        }

        // Update the map with all local events
        if (typeof MapLayers !== 'undefined') {
            try {
                const events = await DB.getAllInfraEvents();
                if (events && events.length > 0) {
                    MapLayers.updateInfraData(events);
                }
            } catch(e) {}
        }
    }

    function handleEngineStatusChange(status) {
        const statusEl = $('#engine-status');
        if (statusEl) {
            const labels = {
                idle: 'Sensors Off',
                detecting: 'Detecting...',
                tracking: 'Tracking Active',
            };
            statusEl.textContent = labels[status] || status;
        }
    }

    // ===== LIVE UI UPDATE =====
    function updateLiveUI() {
        const data = TripEngine.getLiveData();
        if (!data) return;

        // Feed data to CityPulse infrastructure engine
        if (CityPulse.isActive()) {
            const accel = DrivePulse.Sensors.getCurrentAcceleration();
            if (accel) CityPulse.feedAcceleration(accel);

            const pos = DrivePulse.Sensors.getCurrentPosition();
            const speed = DrivePulse.Sensors.getCurrentSpeed();
            if (pos) {
                CityPulse.feedGPS({
                    latitude: pos.latitude,
                    longitude: pos.longitude,
                    speed: speed,
                });
            }
        }

        updateSpeedometer(data.speed);
        const distEl = $('#live-distance');
        if (distEl) distEl.textContent = data.distance.toFixed(1);
        const durEl = $('#live-duration');
        if (durEl) durEl.textContent = formatDuration(data.duration);
        const avgEl = $('#live-avg-speed');
        if (avgEl) avgEl.textContent = Math.round(data.avgSpeed);
        const gEl = $('#live-gforce');
        if (gEl) gEl.textContent = data.maxGForce.toFixed(1);

        // GPS accuracy indicator
        const accEl = $('#gps-accuracy');
        if (accEl && data.gpsAccuracy !== null) {
            let quality = 'poor';
            if (data.gpsAccuracy < 10) quality = 'excellent';
            else if (data.gpsAccuracy < 25) quality = 'good';
            else if (data.gpsAccuracy < 50) quality = 'fair';
            accEl.className = `gps-accuracy ${quality}`;
            accEl.textContent = `±${Math.round(data.gpsAccuracy)}m`;
        }

        // Real-time speed chart update
        if (ui.charts.homeSpeed && data.speedData && data.speedData.length > 0) {
            const labels = data.speedData.map((_, i) => {
                const totalMinutes = data.duration / 60;
                const min = ((i / data.speedData.length) * totalMinutes).toFixed(1);
                return `${min}m`;
            });
            ui.charts.homeSpeed.data.labels = labels;
            ui.charts.homeSpeed.data.datasets[0].data = data.speedData;
            ui.charts.homeSpeed.update('none'); // 'none' disables animation for performance during tracking
        }
    }

    function animateSpeedDown() {
        let speed = parseFloat($('#speed-value')?.textContent || 0);
        const animate = () => {
            speed *= 0.85;
            if (speed < 0.5) {
                updateSpeedometer(0);
                return;
            }
            updateSpeedometer(speed);
            requestAnimationFrame(animate);
        };
        animate();
    }

    function formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // ============================================
    // TRIP LIST RENDERING
    // ============================================
    async function loadAndRenderTrips() {
        let trips = await DB.getAllTrips();
        trips = trips.filter(t => t.status === 'completed').sort((a, b) => b.startTime - a.startTime);

        // Update today's stats
        const today = new Date().toISOString().split('T')[0];
        const todayTrips = trips.filter(t => t.date === today);

        const todayTripsEl = $('#today-trips');
        if (todayTripsEl) todayTripsEl.textContent = todayTrips.length;

        const todayDistEl = $('#today-distance');
        if (todayDistEl) todayDistEl.textContent = todayTrips.reduce((s, t) => s + (t.distance || 0), 0).toFixed(1);

        const todayMaxEl = $('#today-max-speed');
        if (todayMaxEl) todayMaxEl.textContent = todayTrips.length > 0 ? Math.max(...todayTrips.map(t => t.maxSpeed || 0)) : 0;

        // Average driver score
        const allScores = trips.filter(t => t.score > 0).map(t => t.score);
        const avgScore = allScores.length > 0 ? Math.round(allScores.reduce((s, v) => s + v, 0) / allScores.length) : '--';
        const scoreEl = $('#driving-score');
        if (scoreEl) scoreEl.textContent = avgScore;

        // Render recent trips (home)
        renderTripsList($('#recent-trips-home'), trips.slice(0, 3));

        // Render full trips list (history)
        renderTripsList($('#trips-list'), trips);

        // Update history summary
        updateHistorySummary(trips);

        // Update driving behavior
        updateDrivingBehavior(trips);
    }

    function renderTripsList(container, trips) {
        if (!container) return;

        if (trips.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-road"></i>
                    <p>No trips yet</p>
                    <span>Start driving to record your first trip!</span>
                </div>
            `;
            return;
        }

        container.innerHTML = trips.map(trip => {
            const dateObj = new Date(trip.startTime || trip.date);
            const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const timeStr = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const scoreColor = trip.score >= 90 ? '#10b981' : trip.score >= 80 ? '#fbbf24' : '#ef4444';
            const title = trip.title || generateTripTitle(trip);

            return `
                <div class="trip-item glass-card" data-trip-id="${trip.id}">
                    <div class="trip-item-icon"><i class="fas fa-route"></i></div>
                    <div class="trip-item-info">
                        <span class="trip-item-title">${title}</span>
                        <div class="trip-item-meta">
                            <span><i class="fas fa-calendar"></i> ${dateStr} ${timeStr}</span>
                            <span><i class="fas fa-clock"></i> ${trip.duration || 0} min</span>
                            <span><i class="fas fa-gauge"></i> ${trip.maxSpeed || 0} km/h</span>
                        </div>
                    </div>
                    <div class="trip-item-stats">
                        <span class="trip-item-distance">${(trip.distance || 0).toFixed(1)} km</span>
                        <span class="trip-item-score" style="color: ${scoreColor}">Score: ${trip.score || 0}</span>
                    </div>
                </div>
            `;
        }).join('');

        // Click handlers
        container.querySelectorAll('.trip-item').forEach(item => {
            item.addEventListener('click', async () => {
                const tripId = parseInt(item.dataset.tripId);
                const trip = await DB.getTrip(tripId);
                if (trip) showTripDetail(trip);
            });
        });
    }

    function generateTripTitle(trip) {
        const hour = new Date(trip.startTime).getHours();
        if (hour < 6) return 'Early Morning Drive';
        if (hour < 10) return 'Morning Commute';
        if (hour < 12) return 'Mid-Morning Trip';
        if (hour < 14) return 'Lunch Run';
        if (hour < 17) return 'Afternoon Drive';
        if (hour < 20) return 'Evening Commute';
        return 'Night Drive';
    }

    function updateHistorySummary(trips) {
        const totalTrips = trips.length;
        const totalDist = trips.reduce((s, t) => s + (t.distance || 0), 0);
        const totalDurMins = trips.reduce((s, t) => s + (t.duration || 0), 0);
        const hours = Math.floor(totalDurMins / 60);
        const mins = totalDurMins % 60;

        const el1 = document.querySelectorAll('.hss-value');
        if (el1.length >= 3) {
            el1[0].textContent = totalTrips;
            el1[1].textContent = totalDist.toFixed(1) + ' km';
            el1[2].textContent = `${hours}h ${mins}m`;
        }
    }

    function updateDrivingBehavior(trips) {
        // Last 7 days
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const weekTrips = trips.filter(t => (t.startTime || 0) >= weekAgo);

        const totalAccel = weekTrips.reduce((s, t) => s + (t.accelerations || 0), 0);
        const totalBrake = weekTrips.reduce((s, t) => s + (t.brakings || 0), 0);
        const totalCorner = weekTrips.reduce((s, t) => s + (t.cornerings || 0), 0);
        const totalStops = weekTrips.reduce((s, t) => s + (t.stops || 0), 0);

        const maxEvents = Math.max(totalAccel, totalBrake, totalCorner, totalStops, 1);

        const counts = $$('.behavior-count');
        const bars = $$('.behavior-bar');

        if (counts.length >= 4) {
            counts[0].textContent = totalAccel;
            counts[1].textContent = totalBrake;
            counts[2].textContent = totalCorner;
            counts[3].textContent = totalStops;
        }

        if (bars.length >= 4) {
            bars[0].style.setProperty('--bar-width', (totalAccel / maxEvents * 100) + '%');
            bars[1].style.setProperty('--bar-width', (totalBrake / maxEvents * 100) + '%');
            bars[2].style.setProperty('--bar-width', (totalCorner / maxEvents * 100) + '%');
            bars[3].style.setProperty('--bar-width', (totalStops / maxEvents * 100) + '%');
        }
    }

    // ============================================
    // TRIP DETAIL
    // ============================================
    async function showTripDetail(trip) {
        // Fetch GPS points incrementally so map shows the path
        if (!trip.route) {
            try {
                const points = await DB.getGPSPoints(trip.id);
                if (points && points.length > 0) {
                    trip.route = points.map(p => [p.longitude, p.latitude]);
                } else if (trip.startLocation && trip.endLocation) {
                    trip.route = [[trip.startLocation.lng, trip.startLocation.lat], [trip.endLocation.lng, trip.endLocation.lat]];
                }
            } catch(e) {}
        }

        const dateObj = new Date(trip.startTime);
        const endObj = new Date(trip.endTime);
        const title = trip.title || generateTripTitle(trip);

        $('#detail-date').textContent = dateObj.toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        $('#detail-time').textContent =
            dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + ' – ' +
            endObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

        // Location labels
        const startLoc = trip.startLocation;
        const endLoc = trip.endLocation;
        $('#detail-start-loc').textContent = startLoc ? `${startLoc.lat.toFixed(4)}, ${startLoc.lng.toFixed(4)}` : 'Start';
        $('#detail-end-loc').textContent = endLoc ? `${endLoc.lat.toFixed(4)}, ${endLoc.lng.toFixed(4)}` : 'End';

        // Try reverse geocoding from coordinates
        if (startLoc) reverseGeocode(startLoc.lat, startLoc.lng, '#detail-start-loc');
        if (endLoc) reverseGeocode(endLoc.lat, endLoc.lng, '#detail-end-loc');

        // Stats
        $('#detail-distance').textContent = (trip.distance || 0).toFixed(1);
        $('#detail-duration').textContent = `${trip.duration || 0} min`;
        $('#detail-avg-speed').textContent = trip.avgSpeed || 0;
        $('#detail-max-speed').textContent = trip.maxSpeed || 0;
        $('#detail-accel').textContent = trip.accelerations || 0;
        $('#detail-braking').textContent = trip.brakings || 0;
        $('#detail-cornering').textContent = trip.cornerings || 0;
        $('#detail-gforce').textContent = (trip.maxGForce || 0).toFixed(1);
        $('#detail-score').textContent = trip.score || 0;

        // Score breakdown
        const bd = trip.scoreBreakdown || { speedControl: 0, smoothBraking: 0, cornering: 0, acceleration: 0 };
        const scoreOffset = 314 * (1 - (trip.score || 0) / 100);
        const scoreEl = $('#score-progress');
        if (scoreEl) scoreEl.style.strokeDashoffset = scoreOffset;

        const fills = $$('.driving-score-card .si-fill');
        const vals = $$('.driving-score-card .si-val');
        if (fills.length >= 4) {
            fills[0].style.width = bd.speedControl + '%'; vals[0].textContent = bd.speedControl;
            fills[1].style.width = bd.smoothBraking + '%'; vals[1].textContent = bd.smoothBraking;
            fills[2].style.width = bd.cornering + '%'; vals[2].textContent = bd.cornering;
            fills[3].style.width = bd.acceleration + '%'; vals[3].textContent = bd.acceleration;
        }

        // Share data
        $('#share-distance').textContent = (trip.distance || 0).toFixed(1) + ' km';
        $('#share-duration').textContent = (trip.duration || 0) + ' min';
        $('#share-max-speed').textContent = (trip.maxSpeed || 0) + ' km/h';
        $('#share-score').textContent = (trip.score || 0) + '/100';

        // Store current trip for delete/share
        ui.currentDetailTrip = trip;

        navigateTo('detail');

        setTimeout(() => {
            initTripMap(trip);
            initDetailCharts(trip);
        }, 300);
    }

    // ===== REVERSE GEOCODING =====
    async function reverseGeocode(lat, lng, selector) {
        try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`, {
                headers: { 'Accept-Language': 'en' },
            });
            const data = await resp.json();
            if (data.display_name) {
                const parts = data.display_name.split(',');
                const short = parts.slice(0, 2).join(',').trim();
                const el = $(selector);
                if (el) el.textContent = short;
            }
        } catch (e) {
            // Keep coordinate display as fallback
        }
    }

    // ============================================
    // LIVE TRACKING MAP
    // ============================================
    async function initLiveTrackingMap() {
        if (!$('#live-tracking-map')) return;
        // MapEngine handles everything: GPS acquisition, map creation,
        // marker, tracking, controls, layers.
        await MapEngine.initLiveMap('live-tracking-map');
    }

    // ============================================
    // TRIP MAP
    // ============================================
    function initTripMap(trip) {
        const mapContainer = $('#trip-map');
        if (!mapContainer) return;

        if (ui.map) {
            ui.map.remove();
            ui.map = null;
        }

        const route = trip.route || [];
        const singlePoint = trip.startLocation ? { lat: trip.startLocation.lat, lng: trip.startLocation.lng } : null;

        if (route.length < 2 && !singlePoint) {
            mapContainer.innerHTML = '<div class="map-placeholder"><i class="fas fa-map-marked-alt"></i><p>No route data available</p></div>';
            return;
        }

        try {
            ui.map = new maplibregl.Map({
                container: 'trip-map',
                style: MapEngine ? MapEngine.themes[MapEngine.currentTheme] : {
                    version: 8,
                    sources: { 'osm': { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19 } },
                    layers: [{ id: 'osm-layer', type: 'raster', source: 'osm', minzoom: 0, maxzoom: 19 }]
                },
                center: singlePoint ? [singlePoint.lng, singlePoint.lat] : (route.length > 0 ? [route[0].lng, route[0].lat] : [0,0]),
                zoom: 15,
                attributionControl: false,
                scrollZoom: false
            });

            ui.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

            const createMarker = (color) => {
                const el = document.createElement('div');
                el.className = 'custom-marker';
                el.innerHTML = `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 0 10px ${color};"></div>`;
                return el;
            };

            ui.map.on('load', () => {
                if (route.length >= 2) {
                    ui.map.addSource('route', {
                        'type': 'geojson',
                        'data': {
                            'type': 'Feature',
                            'properties': {},
                            'geometry': {
                                'type': 'LineString',
                                'coordinates': route.map(p => [p.lng, p.lat])
                            }
                        }
                    });

                    ui.map.addLayer({
                        'id': 'route-line-bg',
                        'type': 'line',
                        'source': 'route',
                        'layout': { 'line-join': 'round', 'line-cap': 'round' },
                        'paint': { 'line-color': '#00d4ff', 'line-width': 4, 'line-opacity': 0.8 }
                    });

                    ui.map.addLayer({
                        'id': 'route-line',
                        'type': 'line',
                        'source': 'route',
                        'layout': { 'line-join': 'round', 'line-cap': 'round' },
                        'paint': { 'line-color': '#7c3aed', 'line-width': 2, 'line-opacity': 0.5 }
                    });

                    new maplibregl.Marker({ element: createMarker('#00d4ff') })
                        .setLngLat([route[0].lng, route[0].lat])
                        .addTo(ui.map);

                    new maplibregl.Marker({ element: createMarker('#ff006e') })
                        .setLngLat([route[route.length - 1].lng, route[route.length - 1].lat])
                        .addTo(ui.map);

                    const bounds = new maplibregl.LngLatBounds();
                    route.forEach(p => bounds.extend([p.lng, p.lat]));
                    ui.map.fitBounds(bounds, { padding: 40 });
                } else if (singlePoint) {
                    new maplibregl.Marker({ element: createMarker('#00d4ff') })
                        .setLngLat([singlePoint.lng, singlePoint.lat])
                        .addTo(ui.map);
                        
                    ui.map.jumpTo({ center: [singlePoint.lng, singlePoint.lat], zoom: 15 });
                }
            });
        } catch (e) {
            console.warn('Map error:', e);
        }
    }

    // ============================================
    // CHARTS
    // ============================================
    function getChartDefaults() {
        return {
            responsive: true, maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(17,24,39,0.95)',
                    titleColor: '#f1f5f9', bodyColor: '#94a3b8',
                    borderColor: 'rgba(255,255,255,0.05)', borderWidth: 1,
                    padding: 12, cornerRadius: 10,
                    titleFont: { family: 'Inter', weight: '600' },
                    bodyFont: { family: 'Inter' },
                },
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                    ticks: { color: '#64748b', font: { family: 'Inter', size: 11 } },
                    border: { display: false },
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                    ticks: { color: '#64748b', font: { family: 'Inter', size: 11 } },
                    border: { display: false },
                },
            },
        };
    }

    function initHomeSpeedChart() {
        const ctx = $('#speed-chart');
        if (!ctx) return;

        const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 200);
        gradient.addColorStop(0, 'rgba(0,212,255,0.3)');
        gradient.addColorStop(1, 'rgba(0,212,255,0)');

        ui.charts.homeSpeed = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    borderColor: '#00d4ff', backgroundColor: gradient,
                    borderWidth: 2, fill: true, tension: 0.4,
                    pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#00d4ff',
                }],
            },
            options: {
                ...getChartDefaults(),
                scales: {
                    ...getChartDefaults().scales,
                    y: {
                        ...getChartDefaults().scales.y,
                        suggestedMax: 100,
                        ticks: { ...getChartDefaults().scales.y.ticks, callback: v => v + ' km/h' },
                    },
                },
            },
        });

        // Populate with last trip's data if available
        updateHomeSpeedChart();
    }

    async function updateHomeSpeedChart() {
        const trips = await DB.getAllTrips();
        const lastTrip = trips.filter(t => t.status === 'completed' && t.speedData?.length > 0)
            .sort((a, b) => b.startTime - a.startTime)[0];

        if (lastTrip && ui.charts.homeSpeed) {
            const labels = lastTrip.speedData.map((_, i) => {
                const min = Math.floor((i / lastTrip.speedData.length) * (lastTrip.duration || 1));
                return `${min}m`;
            });
            ui.charts.homeSpeed.data.labels = labels;
            ui.charts.homeSpeed.data.datasets[0].data = lastTrip.speedData;
            ui.charts.homeSpeed.update('none');
        }
    }

    function initDetailCharts(trip) {
        if (ui.charts.detailSpeed) ui.charts.detailSpeed.destroy();
        if (ui.charts.detailAccel) ui.charts.detailAccel.destroy();

        const speedData = trip.speedData || [];
        const accelData = trip.accelData || [];

        // Speed chart
        const speedCtx = $('#detail-speed-chart');
        if (speedCtx && speedData.length > 0) {
            const gradient = speedCtx.getContext('2d').createLinearGradient(0, 0, 0, 200);
            gradient.addColorStop(0, 'rgba(0,212,255,0.25)');
            gradient.addColorStop(1, 'rgba(0,212,255,0)');

            ui.charts.detailSpeed = new Chart(speedCtx, {
                type: 'line',
                data: {
                    labels: speedData.map((_, i) => `${Math.floor((i / speedData.length) * (trip.duration || 1))}m`),
                    datasets: [{
                        label: 'Speed', data: speedData,
                        borderColor: '#00d4ff', backgroundColor: gradient,
                        borderWidth: 2, fill: true, tension: 0.4,
                        pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#00d4ff',
                    }],
                },
                options: {
                    ...getChartDefaults(),
                    scales: {
                        ...getChartDefaults().scales,
                        y: { ...getChartDefaults().scales.y, suggestedMax: 100,
                            ticks: { ...getChartDefaults().scales.y.ticks, callback: v => v + ' km/h' },
                        },
                    },
                },
            });
        }

        // Acceleration chart
        const accelCtx = $('#detail-accel-chart');
        if (accelCtx && accelData.length > 0) {
            ui.charts.detailAccel = new Chart(accelCtx, {
                type: 'bar',
                data: {
                    labels: accelData.map((_, i) => `${Math.floor((i / accelData.length) * (trip.duration || 1))}m`),
                    datasets: [{
                        label: 'G-Force', data: accelData,
                        backgroundColor: accelData.map(v => v >= 0 ? 'rgba(0,212,255,0.6)' : 'rgba(255,0,110,0.6)'),
                        borderColor: accelData.map(v => v >= 0 ? '#00d4ff' : '#ff006e'),
                        borderWidth: 1, borderRadius: 3,
                    }],
                },
                options: {
                    ...getChartDefaults(),
                    scales: {
                        ...getChartDefaults().scales,
                        y: { ...getChartDefaults().scales.y, suggestedMin: -1, suggestedMax: 1,
                            ticks: { ...getChartDefaults().scales.y.ticks, callback: v => v.toFixed(1) + ' G' },
                        },
                    },
                },
            });
        }
    }

    async function initAnalyticsCharts() {
        const trips = await DB.getAllTrips();
        let completed = trips.filter(t => t.status === 'completed');

        // Determine active period
        const activeChip = $('.period-chip.active');
        const period = activeChip ? activeChip.dataset.period : 'week';
        
        const now = Date.now();
        let periodTrips = completed;
        if (period === 'week') {
            periodTrips = completed.filter(t => (t.startTime || 0) >= now - 7 * 86400000);
        } else if (period === 'month') {
            periodTrips = completed.filter(t => (t.startTime || 0) >= now - 30 * 86400000);
        } else if (period === 'year') {
            periodTrips = completed.filter(t => (t.startTime || 0) >= now - 365 * 86400000);
        }

        const labels = [];
        const distData = [];
        const scores = [];

        if (period === 'year') {
            for (let i = 11; i >= 0; i--) {
                const d = new Date(now);
                d.setMonth(d.getMonth() - i);
                labels.push(d.toLocaleDateString('en-US', { month: 'short' }));
                const monthTrips = periodTrips.filter(t => {
                    const td = new Date(t.startTime);
                    return td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear();
                });
                distData.push(parseFloat(monthTrips.reduce((s, t) => s + (t.distance || 0), 0).toFixed(1)));
                const scoredTrips = monthTrips.filter(t => t.score > 0);
                scores.push(scoredTrips.length > 0 ? Math.round(scoredTrips.reduce((s, t) => s + t.score, 0) / scoredTrips.length) : null);
            }
        } else if (period === 'month') {
            for (let i = 3; i >= 0; i--) {
                const end = now - i * 7 * 86400000;
                const start = end - 7 * 86400000;
                labels.push(`Week ${4-i}`);
                const weekTrips = periodTrips.filter(t => t.startTime >= start && t.startTime < end);
                distData.push(parseFloat(weekTrips.reduce((s, t) => s + (t.distance || 0), 0).toFixed(1)));
                const scoredTrips = weekTrips.filter(t => t.score > 0);
                scores.push(scoredTrips.length > 0 ? Math.round(scoredTrips.reduce((s, t) => s + t.score, 0) / scoredTrips.length) : null);
            }
        } else {
            // week
            for (let i = 6; i >= 0; i--) {
                const d = new Date(now - i * 86400000);
                const dateStr = d.toISOString().split('T')[0];
                labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
                const dayTrips = periodTrips.filter(t => t.date === dateStr);
                distData.push(parseFloat(dayTrips.reduce((s, t) => s + (t.distance || 0), 0).toFixed(1)));
                const scoredTrips = dayTrips.filter(t => t.score > 0);
                scores.push(scoredTrips.length > 0 ? Math.round(scoredTrips.reduce((s, t) => s + t.score, 0) / scoredTrips.length) : null);
            }
        }

        // Distance chart - Destroy old instance to prevent canvas memory leak
        if (ui.charts.analyticsDist) {
            ui.charts.analyticsDist.destroy();
            ui.charts.analyticsDist = null;
        }
        {
            const distCtx = $('#analytics-distance-chart');
            if (distCtx) {
                ui.charts.analyticsDist = new Chart(distCtx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Distance (km)', data: distData,
                            backgroundColor: labels.map((_, i) => i >= labels.length - 2 && period === 'week' ? 'rgba(124,58,237,0.5)' : 'rgba(0,212,255,0.5)'),
                            borderColor: labels.map((_, i) => i >= labels.length - 2 && period === 'week' ? '#7c3aed' : '#00d4ff'),
                            borderWidth: 1, borderRadius: 8, borderSkipped: false,
                        }],
                    },
                    options: {
                        ...getChartDefaults(),
                        scales: {
                            ...getChartDefaults().scales,
                            y: { ...getChartDefaults().scales.y,
                                ticks: { ...getChartDefaults().scales.y.ticks, callback: v => v + ' km' },
                            },
                        },
                    },
                });
            }
        }

        // Speed distribution - destroy old to prevent leak
        if (ui.charts.analyticsSpeedDist) {
            ui.charts.analyticsSpeedDist.destroy();
            ui.charts.analyticsSpeedDist = null;
        }
        {
            const speedCtx = $('#analytics-speed-dist');
            if (speedCtx) {
                const buckets = [0, 0, 0, 0, 0, 0]; // 0-20, 20-40, 40-60, 60-80, 80-100, 100+
                periodTrips.forEach(t => {
                    (t.speedData || []).forEach(s => {
                        if (s < 20) buckets[0]++;
                        else if (s < 40) buckets[1]++;
                        else if (s < 60) buckets[2]++;
                        else if (s < 80) buckets[3]++;
                        else if (s < 100) buckets[4]++;
                        else buckets[5]++;
                    });
                });

                ui.charts.analyticsSpeedDist = new Chart(speedCtx, {
                    type: 'doughnut',
                    data: {
                        labels: ['0-20 km/h', '20-40 km/h', '40-60 km/h', '60-80 km/h', '80-100 km/h', '100+ km/h'],
                        datasets: [{
                            data: buckets,
                            backgroundColor: [
                                'rgba(0,212,255,0.7)', 'rgba(59,130,246,0.7)',
                                'rgba(124,58,237,0.7)', 'rgba(255,0,110,0.7)',
                                'rgba(249,115,22,0.7)', 'rgba(239,68,68,0.7)',
                            ],
                            borderColor: 'rgba(10,14,26,0.8)', borderWidth: 3,
                        }],
                    },
                    options: {
                        responsive: true, maintainAspectRatio: true, cutout: '65%',
                        plugins: {
                            legend: {
                                display: true, position: 'bottom',
                                labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, padding: 16, usePointStyle: true, pointStyle: 'circle' },
                            },
                        },
                    },
                });
            }
        }

        // Score trend
        if (!ui.charts.analyticsScore) {
            const scoreCtx = $('#analytics-score-chart');
            if (scoreCtx) {
                const gradient = scoreCtx.getContext('2d').createLinearGradient(0, 0, 0, 180);
                gradient.addColorStop(0, 'rgba(16,185,129,0.25)');
                gradient.addColorStop(1, 'rgba(16,185,129,0)');

                ui.charts.analyticsScore = new Chart(scoreCtx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Score', data: scores, spanGaps: true,
                            borderColor: '#10b981', backgroundColor: gradient,
                            borderWidth: 2.5, fill: true, tension: 0.4,
                            pointRadius: 4, pointBackgroundColor: '#10b981',
                            pointBorderColor: '#0a0e1a', pointBorderWidth: 2,
                        }],
                    },
                    options: {
                        ...getChartDefaults(),
                        scales: {
                            ...getChartDefaults().scales,
                            y: { ...getChartDefaults().scales.y, min: 0, max: 100,
                                ticks: { ...getChartDefaults().scales.y.ticks, stepSize: 20 },
                            },
                        },
                    },
                });
            }
        }

        // Update analytics overview numbers
        const aoValues = $$('.ao-value');
        if (aoValues.length >= 3) {
            aoValues[0].textContent = periodTrips.reduce((s, t) => s + (t.distance || 0), 0).toFixed(1) + ' km';
            const totalMins = periodTrips.reduce((s, t) => s + (t.duration || 0), 0);
            aoValues[1].textContent = `${Math.floor(totalMins / 60)}h ${totalMins % 60}m`;
            aoValues[2].textContent = periodTrips.length;
        }
    }

    // ============================================
    // SETTINGS
    // ============================================
    async function initSettings() {
        const engineSettings = TripEngine.getSettings();

        const sliders = [
            { id: 'setting-start-speed', valId: 'setting-start-speed-val', key: 'autoStartSpeed', suffix: ' km/h' },
            { id: 'setting-stop-speed', valId: 'setting-stop-speed-val', key: 'autoStopSpeed', suffix: ' km/h' },
            { id: 'setting-stop-timeout', valId: 'setting-stop-timeout-val', key: 'autoStopDuration',
                suffix: ' min', transform: v => v, displayTransform: v => Math.round(v / 60) + ' min', saveTransform: v => v * 60 },
            { id: 'setting-accel-thresh', valId: 'setting-accel-thresh-val', key: 'accelThreshold',
                suffix: ' G', transform: v => (v / 10).toFixed(1), saveTransform: v => v / 10 },
            { id: 'setting-brake-thresh', valId: 'setting-brake-thresh-val', key: 'brakeThreshold',
                suffix: ' G', transform: v => (v / 10).toFixed(1), saveTransform: v => v / 10 },
            { id: 'setting-corner-thresh', valId: 'setting-corner-thresh-val', key: 'cornerThreshold', suffix: ' °/s' },
        ];

        sliders.forEach(({ id, valId, key, suffix, transform, displayTransform, saveTransform }) => {
            const slider = $(`#${id}`);
            const valEl = $(`#${valId}`);
            if (!slider || !valEl) return;

            // Set initial value from settings
            if (key === 'autoStopDuration') {
                slider.value = Math.round(engineSettings[key] / 60);
            } else if (key === 'accelThreshold' || key === 'brakeThreshold') {
                slider.value = engineSettings[key] * 10;
            } else {
                slider.value = engineSettings[key];
            }

            const update = () => {
                const display = displayTransform ? displayTransform(parseFloat(slider.value))
                    : transform ? transform(slider.value) + suffix
                    : slider.value + suffix;
                valEl.textContent = display;

                const saveVal = saveTransform ? saveTransform(parseFloat(slider.value)) : parseFloat(slider.value);
                TripEngine.updateSetting(key, saveVal);
            };

            slider.addEventListener('input', update);
            update();
        });

        // Toggle switches
        const notifToggle = $('#setting-notifs');
        if (notifToggle) {
            notifToggle.addEventListener('change', async () => {
                if (notifToggle.checked) {
                    await TripEngine.requestNotificationPermission();
                }
            });
        }

        const bgToggle = $('#setting-background');
        if (bgToggle) {
            bgToggle.addEventListener('change', () => {
                if (bgToggle.checked) {
                    Sensors.requestWakeLock();
                    showToast('Background tracking enabled');
                } else {
                    Sensors.releaseWakeLock();
                    showToast('Background tracking disabled');
                }
            });
        }

        // Enable sensors button in settings
        const enableSensorsBtn = $('#enable-sensors-btn');
        if (enableSensorsBtn) {
            enableSensorsBtn.addEventListener('click', async () => {
                const perms = await Sensors.requestPermissions();
                ui.permissionsGranted = perms.gps;
                updateSensorStatusUI();
                if (perms.gps) {
                    TripEngine.startMonitoring();
                    showToast('Sensors activated!');
                } else {
                    showToast('Please grant location permission');
                }
            });
        }

        // Export data
        const exportBtn = $('#export-data-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', async () => {
                const trips = await DB.getAllTrips();
                const blob = new Blob([JSON.stringify(trips, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `DrivePulse_Trips_${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
                showToast('Trip data exported!');
            });
        }

        // Clear all data
        const clearDataBtn = $('#clear-data-btn');
        if (clearDataBtn) {
            clearDataBtn.addEventListener('click', async () => {
                if (confirm('Are you sure you want to delete all trip data? This cannot be undone.')) {
                    const trips = await DB.getAllTrips();
                    for (const t of trips) {
                        await DB.deleteTrip(t.id);
                    }
                    await DB.clearAllNotifications();
                    await loadAndRenderTrips();
                    showToast('All data cleared');
                }
            });
        }

        // About Modal
        $('#about-btn')?.addEventListener('click', async () => {
            navigateTo('about');
            const contentDiv = $('#about-content');
            if (contentDiv && !contentDiv.innerHTML.includes('about-container')) {
                try {
                    contentDiv.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--accent-light);"><i class="fas fa-spinner fa-spin fa-2x"></i><p style="margin-top:16px;">Loading documentation...</p></div>';
                    const res = await fetch('about-content.html');
                    if (!res.ok) throw new Error('Failed to load about content');
                    const html = await res.text();
                    contentDiv.innerHTML = html;
                } catch (e) {
                    contentDiv.innerHTML = '<div style="padding:30px; text-align:center;"><i class="fas fa-exclamation-triangle" style="font-size:2rem; color:var(--danger-color); margin-bottom:12px;"></i><p>Failed to load documentation. Please try again.</p></div>';
                }
            }
        });

        $('#about-back-btn')?.addEventListener('click', () => {
            navigateTo('settings', false);
        });
    }

    // ============================================
    // FILTER & PERIOD CHIPS
    // ============================================
    function initFilterChips() {
        $$('.filter-chip').forEach(chip => {
            chip.addEventListener('click', async () => {
                $$('.filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                await filterTrips(chip.dataset.filter);
            });
        });
    }

    async function filterTrips(filter) {
        let trips = await DB.getAllTrips();
        trips = trips.filter(t => t.status === 'completed').sort((a, b) => b.startTime - a.startTime);

        const now = Date.now();
        const today = new Date().toISOString().split('T')[0];

        if (filter === 'today') {
            trips = trips.filter(t => t.date === today);
        } else if (filter === 'week') {
            trips = trips.filter(t => (t.startTime || 0) >= now - 7 * 86400000);
        } else if (filter === 'month') {
            trips = trips.filter(t => (t.startTime || 0) >= now - 30 * 86400000);
        }

        renderTripsList($('#trips-list'), trips);
    }

    function initPeriodChips() {
        $$('.period-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                $$('.period-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                // Re-init analytics charts with new period
                if (ui.charts.analyticsDist) { ui.charts.analyticsDist.destroy(); ui.charts.analyticsDist = null; }
                if (ui.charts.analyticsSpeedDist) { ui.charts.analyticsSpeedDist.destroy(); ui.charts.analyticsSpeedDist = null; }
                if (ui.charts.analyticsScore) { ui.charts.analyticsScore.destroy(); ui.charts.analyticsScore = null; }
                initAnalyticsCharts();
            });
        });
    }

    // ============================================
    // SHARE
    // ============================================
    function initShareModal() {
        const modal = $('#share-modal');
        if (!modal) return;

        $('#share-trip-btn')?.addEventListener('click', () => modal.classList.add('active'));
        $('#modal-close')?.addEventListener('click', () => modal.classList.remove('active'));
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });

        $('#share-download')?.addEventListener('click', () => {
            const shareCard = document.querySelector('.share-card');
            if (typeof html2canvas !== 'undefined' && shareCard) {
                html2canvas(shareCard, { backgroundColor: '#0d1326', scale: 2 }).then(canvas => {
                    const link = document.createElement('a');
                    link.download = 'DrivePulse_Trip.png';
                    link.href = canvas.toDataURL();
                    link.click();
                    showToast('Image downloaded!');
                });
            }
        });

        $('#share-copy')?.addEventListener('click', () => {
            const text = `🚗 DrivePulse Trip Summary\n` +
                `Distance: ${$('#share-distance')?.textContent}\n` +
                `Duration: ${$('#share-duration')?.textContent}\n` +
                `Max Speed: ${$('#share-max-speed')?.textContent}\n` +
                `Score: ${$('#share-score')?.textContent}\n` +
                `\nTracked with DrivePulse – Smart Trip Tracker`;

            if (navigator.share) {
                navigator.share({ text }).catch(() => {});
            } else {
                navigator.clipboard.writeText(text).then(() => showToast('Copied!')).catch(() => {});
            }
        });

        document.querySelector('.share-action-btn.whatsapp')?.addEventListener('click', () => {
            const text = encodeURIComponent(`🚗 DrivePulse Trip: ${$('#share-distance')?.textContent} | ${$('#share-duration')?.textContent} | Score: ${$('#share-score')?.textContent}`);
            window.open(`https://wa.me/?text=${text}`, '_blank');
        });

        document.querySelector('.share-action-btn.twitter')?.addEventListener('click', () => {
            const text = encodeURIComponent(`Just tracked my drive with DrivePulse! 🚗 ${$('#share-distance')?.textContent} | Score: ${$('#share-score')?.textContent}`);
            window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
        });
    }

    // ============================================
    // TOAST
    // ============================================
    function showToast(message) {
        const toast = $('#toast');
        if (!toast) return;
        $('#toast-message').textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // ============================================
    // CITYPULSE INFRASTRUCTURE UI
    // ============================================
    // CityPulse reference is declared at the top of this IIFE

    // Infra alert toast during trips
    function handleInfraAlert(alert) {
        let alertEl = $('#infra-alert-toast');
        if (!alertEl) {
            alertEl = document.createElement('div');
            alertEl.id = 'infra-alert-toast';
            alertEl.className = 'infra-alert';
            document.body.appendChild(alertEl);
        }
        alertEl.textContent = alert.message;
        alertEl.className = `infra-alert ${alert.type}`;
        // Show
        requestAnimationFrame(() => {
            alertEl.classList.add('show');
            setTimeout(() => alertEl.classList.remove('show'), 3000);
        });
    }

    function handleInfraEvent(event) {
        // Could do real-time map updates here if infra screen is active
    }

    // Infrastructure filter chips
    function initInfraFilterChips() {
        document.querySelectorAll('.infra-filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.infra-filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                renderInfraMap(chip.dataset.infraFilter);
            });
        });
    }

    // Render infrastructure map with markers
    async function renderInfraMap(filter = 'all') {
        const mapEl = $('#infra-map');
        if (!mapEl) return;

        if (ui.infraMap) {
            ui.infraMap.remove();
            ui.infraMap = null;
        }

        const stats = await CityPulse.getAggregatedStats();
        const events = stats.allEvents;

        const filtered = filter === 'all' ? events : events.filter(e => e.type === filter);
        const validEvents = filtered.filter(e => e.lat && e.lng && e.lat !== 0 && e.lng !== 0);
        
        let center = [78.9629, 20.5937]; 
        let zoom = 4;

        if (validEvents.length > 0) {
            const avgLat = validEvents.reduce((s, e) => s + e.lat, 0) / validEvents.length;
            const avgLng = validEvents.reduce((s, e) => s + e.lng, 0) / validEvents.length;
            center = [avgLng, avgLat];
            zoom = 13;
        } else {
            const pos = DrivePulse.Sensors.getCurrentPosition();
            if (pos) { center = [pos.longitude, pos.latitude]; zoom = 13; }
        }

        ui.infraMap = new maplibregl.Map({
            container: 'infra-map',
            style: MapEngine ? MapEngine.themes[MapEngine.currentTheme] : {
                version: 8,
                sources: {
                    'carto-dark': {
                        type: 'raster',
                        tiles: [
                            'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                            'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                            'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                            'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
                        ],
                        tileSize: 256,
                        maxzoom: 19
                    }
                },
                layers: [{
                    id: 'carto-dark-layer', type: 'raster', source: 'carto-dark', minzoom: 0, maxzoom: 22
                }]
            },
            center: center,
            zoom: zoom,
            attributionControl: false
        });

        ui.infraMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

        const typeStyles = {
            pothole: { low: '#fdba74', medium: '#f97316', high: '#c2410c', icon: '⚠️' },
            road_quality: { low: '#fca5a5', medium: '#ef4444', high: '#b91c1c', icon: '🛣️' },
            noise: { low: '#d8b4fe', medium: '#a855f7', high: '#7e22ce', icon: '🔊' },
            traffic: { low: '#fde047', medium: '#eab308', high: '#a16207', icon: '🚦' },
            dead_zone: { low: '#d1d5db', medium: '#6b7280', high: '#374151', icon: '📵' },
        };

        const typeLabels = {
            pothole: 'Pothole',
            road_quality: 'Poor Road',
            noise: 'Noise Zone',
            traffic: 'Traffic',
            dead_zone: 'Dead Zone',
        };

        ui.infraMap.on('load', () => {
            validEvents.forEach(event => {
                const styleObj = typeStyles[event.type] || { low: '#fff', medium: '#fff', high: '#fff', icon: '📍' };
                const sevKey = event.severity === 'high' ? 'high' : (event.severity === 'low' ? 'low' : 'medium');
                const markerColor = styleObj[sevKey];

                const radius = event.severity === 'high' ? 24 : event.severity === 'medium' ? 16 : 10;
                const opacity = event.severity === 'high' ? 0.8 : event.severity === 'medium' ? 0.6 : 0.4;

                const el = document.createElement('div');
                el.style.width = radius + 'px';
                el.style.height = radius + 'px';
                el.style.borderRadius = '50%';
                el.style.background = markerColor;
                el.style.opacity = opacity;
                el.style.border = `${event.severity === 'high' ? 2 : 1}px solid white`;
                el.style.boxShadow = `0 0 10px ${markerColor}`;
                el.style.cursor = 'pointer';

                const popupHtml = `
                    <div style="font-family:'Inter',sans-serif;font-size:13px;padding:4px;color:#111;">
                        <strong style="font-size:14px;">${styleObj.icon} ${typeLabels[event.type] || event.type}</strong><br>
                        Severity: <b style="color:${markerColor};text-transform:capitalize;">${event.severity}</b><br>
                        <span style="color:#666;font-size:11px;">${new Date(event.timestamp).toLocaleString()}</span>
                    </div>
                `;

                const popup = new maplibregl.Popup({ offset: 15, closeButton: false }).setHTML(popupHtml);

                new maplibregl.Marker({ element: el })
                    .setLngLat([event.lng, event.lat])
                    .setPopup(popup)
                    .addTo(ui.infraMap);
            });
            setTimeout(() => ui.infraMap.resize(), 300);
        });
    }

    // Update infra dashboard with aggregated stats
    async function updateInfraDashboard() {
        const stats = await CityPulse.getAggregatedStats();

        // Overview cards
        const potholeEl = $('#infra-potholes');
        if (potholeEl) potholeEl.textContent = stats.totalPotholes;
        const roadScoreEl = $('#infra-road-score');
        if (roadScoreEl) roadScoreEl.textContent = stats.avgRoadScore + '/100';
        const noiseEl = $('#infra-noise');
        if (noiseEl) noiseEl.textContent = stats.noiseZones;
        const trafficEl = $('#infra-traffic');
        if (trafficEl) trafficEl.textContent = stats.trafficSlowdowns;

        // Breakdown bars
        const total = Math.max(stats.totalIssues, 1);
        const setBar = (id, count) => {
            const bar = $(`#${id}`);
            if (bar) bar.style.setProperty('--bar-width', `${Math.min(100, (count / total) * 100)}%`);
        };
        setBar('infra-bar-pothole', stats.totalPotholes);
        setBar('infra-bar-road', stats.poorRoads);
        setBar('infra-bar-noise', stats.noiseZones);
        setBar('infra-bar-traffic', stats.trafficSlowdowns);
        setBar('infra-bar-signal', stats.deadZones);

        // Breakdown counts
        const setCount = (id, count) => { const el = $(`#${id}`); if (el) el.textContent = count; };
        setCount('infra-count-pothole', stats.totalPotholes);
        setCount('infra-count-road', stats.poorRoads);
        setCount('infra-count-noise', stats.noiseZones);
        setCount('infra-count-traffic', stats.trafficSlowdowns);
        setCount('infra-count-signal', stats.deadZones);

        // Community impact
        const kmEl = $('#infra-km-monitored');
        if (kmEl) kmEl.textContent = stats.totalKmMonitored + ' km';
        const issuesEl = $('#infra-total-issues');
        if (issuesEl) issuesEl.textContent = stats.totalIssues;
        const healthEl = $('#infra-road-health');
        if (healthEl) healthEl.textContent = stats.avgRoadScore + '/100';

        // Pothole severity chart
        initPotholeChart(stats);

        // Recent events list
        renderInfraEvents(stats.allEvents);
    }

    function initPotholeChart(stats) {
        if (ui.charts.infraPothole) ui.charts.infraPothole.destroy();
        const ctx = $('#infra-pothole-chart');
        if (!ctx) return;

        ui.charts.infraPothole = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Low Severity', 'Medium Severity', 'High Severity'],
                datasets: [{
                    data: [
                        stats.potholeSeverity.low,
                        stats.potholeSeverity.medium,
                        stats.potholeSeverity.high,
                    ],
                    backgroundColor: [
                        'rgba(16,185,129,0.7)',
                        'rgba(234,179,8,0.7)',
                        'rgba(239,68,68,0.7)',
                    ],
                    borderColor: 'rgba(10,14,26,0.8)',
                    borderWidth: 3,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: true, cutout: '65%',
                plugins: {
                    legend: {
                        display: true, position: 'bottom',
                        labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, padding: 16, usePointStyle: true, pointStyle: 'circle' },
                    },
                },
            },
        });
    }

    function renderInfraEvents(events) {
        const list = $('#infra-events-list');
        if (!list) return;

        if (events.length === 0) {
            list.innerHTML = `<div class="empty-state">
                <i class="fas fa-city"></i>
                <p>No infrastructure data yet</p>
                <span>Start a trip to begin collecting road intelligence</span>
            </div>`;
            return;
        }

        const typeConfig = {
            pothole: { icon: 'fa-circle-exclamation', label: 'Pothole Detected' },
            road_quality: { icon: 'fa-road', label: 'Poor Road Quality' },
            noise: { icon: 'fa-volume-high', label: 'Noise Pollution' },
            traffic: { icon: 'fa-traffic-light', label: 'Traffic Congestion' },
            dead_zone: { icon: 'fa-signal', label: 'Network Dead Zone' },
        };

        const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);

        // Sanitize function to prevent XSS from stored data
        const esc = (str) => String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

        list.innerHTML = sorted.map(event => {
            const cfg = typeConfig[event.type] || { icon: 'fa-circle', label: event.type };
            const timeAgo = formatTimeAgo(event.timestamp);
            return `<div class="infra-event-card">
                <div class="infra-event-icon ${esc(event.type)}">
                    <i class="fas ${esc(cfg.icon)}"></i>
                </div>
                <div class="infra-event-info">
                    <span class="infra-event-title">${esc(cfg.label)}</span>
                    <span class="infra-event-meta">${esc(timeAgo)} • Value: ${esc(event.value)}</span>
                </div>
                <span class="infra-event-severity ${esc(event.severity)}">${esc(event.severity)}</span>
            </div>`;
        }).join('');
    }

    // Export UI methods to DrivePulse global namespace
    window.DrivePulse = window.DrivePulse || {};
    window.DrivePulse.UI = { openHazardModal };

    document.addEventListener('DOMContentLoaded', initSplash);

})();
