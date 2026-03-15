# DrivePulse: Smart Trip Tracker & Infrastructure Intelligence Network

## Overview
**DrivePulse** is a cutting-edge Progressive Web Application (PWA) that transforms a standard smartphone into an advanced vehicle telemetry and city infrastructure monitoring device. Designed with an **Offline-First Cloud Architecture**, it processes real-time sensor data using edge computing to deliver insights into driving behavior while crowdsourcing critical city infrastructure health (via the **CityPulse** module) to a global Supabase backend.

---

## The Purpose & Problem Solved

### The Problem
1. **For Drivers:** Most drivers are completely unaware of their micro-driving habits (harsh braking, rapid acceleration, excessive G-forces during cornering) which leads to poor fuel economy, faster vehicle wear-and-tear, and reduced safety.
2. **For Cities & Governments:** Municipalities spend millions of dollars deploying specialized laser-equipped survey vans to map road quality, identify potholes, track noise pollution, and analyze traffic bottlenecks. This process is slow, expensive, and quickly outdated.

### The Solution: DrivePulse + CityPulse
DrivePulse solves these problems simultaneously without requiring any custom hardware. 
- It acts as a **personal driving coach**, scoring trips out of 100 based on physical telemetry.
- Through **crowdsourcing edge-computing**, it silently turns every car on the road into an IoT sensor node, passively scanning the environment to build a real-time, zero-cost living map of a city's infrastructure health.

---

## Target Audience & Use Cases
*   **Everyday Drivers:** To improve safety, save on fuel/maintenance by gamifying eco-driving, and keep a logbook of trips.
*   **Fleet Managers & Delivery Services:** To monitor the driving quality of their agents and reduce insurance liabilities without installing expensive OBD-II hardware.
*   **Urban Planners & Municipalities (B2G/B2B):** To access real-time heatmaps of deteriorating roads, potholes, and noise pollution hotspots for targeted maintenance dispatching.
*   **Telecom Companies:** To identify cellular "dead zones" mapped against exact geographic coordinates.

---

## Tech Stack
DrivePulse is built as an offline-first PWA, utilizing a robust cloud synchronize strategy for long-term data persistence.

*   **Frontend Core:** Vanilla JavaScript (ES6+), HTML5, and CSS3. (No heavy frameworks like React/Angular to ensure lightning-fast performance on low-end mobile browsers).
*   **Authentication & Cloud Sync:** **Supabase JS SDK** handles secure user authentication, Row Level Security (RLS) data isolation, and live global infrastructure mapping.
*   **Storage (Edge):** **IndexedDB** for asynchronous, high-capacity, 100% offline data storage (storing telemetry arrays, GPS paths, and thousands of infrastructure events before pushing to the cloud).
*   **Mapping:** **Leaflet.js** and **MapLibre GL JS** integrated with CartoDB Dark Matter tiles and OpenFreeMap 3D building vector tiles.
*   **Data Visualization:** **Chart.js** for rendering speed, acceleration, and analytics graphs.
*   **PWA Architecture:** Highly optimized Service Workers and Web Manifest for installability, offline caching, and native app-like experience.

---

## Mobile Functionalities Utilized (Browser Web APIs)
The core magic of DrivePulse lies in its deep integration with native device hardware through modern Web APIs:

1.  **Geolocation API (`navigator.geolocation`):** Fetches real-time latitude, longitude, speed, and heading data.
2.  **DeviceMotionEvent API:** Accesses the internal Accelerometer to measure exact gravitational forces (G-force) along the X (horizontal), Y (forward/backward), and Z (vertical) axes.
3.  **DeviceOrientationEvent API:** Accesses the Gyroscope/Magnetometer to track absolute device rotation and heading stability.
4.  **Web Audio API (`navigator.mediaDevices.getUserMedia`):** Accesses the microphone to capture frequency data and calculate environmental decibel (dB) levels.
5.  **Network Information API (`navigator.connection`):** Inspects the actual physical antenna connection type (eg. 4G, 3G, 2G, slow-2g) and downlink speeds.
6.  **Screen Wake Lock API (`navigator.wakeLock`):** Prevents the phone screen from sleeping while a trip is actively being tracked.
7.  **Notifications API:** Sends native background push notifications to the user (e.g., "Trip Auto-Started").

---

## The CityPulse Detection Engine: How It Works & Edge Case Handling

The CityPulse module is the infrastructure intelligence engine. It runs complex mathematical algorithms locally on the device. Because raw sensor data is noisy, we have implemented strict **physics-based safeguards** to prevent fake incidents, pranks, and anomalies.

### 1. Pothole Detection
*   **How it works:** Continuously monitors the Accelerometer's Z-axis (vertical force). A pothole is registered if the vertical G-force spikes above **1.5G**.
*   **Safeguard (Stationary Bumps):** The algorithm checks the GPS. If average speed is under 20 km/h, the spike is ignored (prevents logging someone bouncing the car while parked or slowly going over a legal speed breaker).
*   **Safeguard (The "Dashboard Mount" Edge Case):** Does the phone have to be flat? No. If a phone is in a dashboard mount, Earth's gravity acts on the Y-axis, not the Z-axis. To solve this, the engine calculates the **3D Vector Magnitude** ($ \sqrt{x^2 + y^2 + z^2} $) and subtracts 1G. This detects the true shockwave force of the pothole regardless of how the phone is oriented in the car.
*   **Safeguard (The "Dropped Phone" Edge Case):** What if a passenger drops the phone or shakes it wildly? When a car hits a pothole, the shockwave is relatively linear. If a phone is dropped, it tumbles chaotically. The algorithm blocks extreme instantaneous spikes (> 4G) paired with slow driving speeds as clear passenger handling/dropping.
*   **Crowdsourced Confidence & Severity Scaling:** Are pins placed based on one random mistake? Initially, yes, mapped as "Low Severity." But if a car hits a known pothole (within a 15-meter radius), the engine doesn't drop a duplicate pin on the map. Instead, it increments the pothole's `confirmations` count. If 3 cars hit the same spot, it mathematically upgrades the severity to "Medium". If 6 cars hit it, it becomes "High Severity"—proving the risk through verified crowd consensus. 
*   **Active Healing (The "Smooth Pass" Algorithm):** What if the city fixes the pothole? Does it stay on the map? No. When a trip starts, the app loads all active potholes into memory. While driving, if the GPS detects the vehicle passing within 15 meters of a known pothole footprint at >15 km/h, and **no vertical G-force spike occurs**, it registers a "Smooth Pass". If a pothole receives 2 consecutive Smooth Passes, the algorithm mathematically proves the road has been repaved and **permanently deletes the pothole from the database in real-time.** 

### 2. Road Quality Scoring
*   **How it works:** Instead of looking for single spikes, it tracks sustained vibration. It groups the GPS path into 100-meter segments. It calculates the statistical *variance* of Z-axis vibrations over that exact distance.
*   **Logic:** Low variance (< 0.3G²) = Smooth Road (Score: 70-100). High variance (> 0.8G²) = Damaged Road (Score: 10-30). 

### 3. Noise Pollution Mapping
*   **How it works:** Taps the microphone to analyze the Root Mean Square (RMS) of audio frequencies, mathematically translating it into an approximate Decibel (dB) level. >85 dB is flagged as heavy noise pollution.
*   **Safeguard (The "Friend Shouting" Edge Case):** A passenger sneezing, a friend shouting, or dropping a water bottle creates a massive, instantaneous decibel spike. True environmental noise pollution (busy intersections, construction) is sustained. **The code requires two consecutive loud samples (spanning a 3 to 6-second window) before logging a noise zone.** Sudden, isolated spikes are discarded.
*   **Safeguard (The "Highway Wind" Edge Case):** If a driver goes 90 km/h with the windows cracked, the rush of wind across the microphone easily generates >90dB. To prevent painting highways as "noise zones," the engine implements a **Speed-Gated Acoustic Filter**, automatically pausing noise detection when the vehicle exceeds 50 km/h.
*   **Privacy Guard:** No audio is ever recorded, saved, or uploaded. The audio buffer is immediately overwritten in real-time.

### 4. Traffic Congestion
*   **How it works:** Compares the live GPS speed against expected city flow. If the vehicle is moving below 50% of the minimum expected speed (e.g., crawling at 8 km/h), it drops a congestion pin.
*   **Safeguard (The "Stop Sign" Edge Case):** If you pull up to a stop sign, your speed drops to 0-5 km/h. If the app checked your instantaneous speed at that exact moment, it would falsely report "Traffic Congestion" at every Stop sign in the city. To prevent this, the engine uses a **60-Second Rolling Average Buffer**. It requires your *average* speed over a sustained minute to be below the threshold, proving you are actually in a traffic jam, not just stopped at a red light.

### 5. Network Dead Zones
*   **How it works:** Checks the internal `effectiveType` of the cellular radio. If the connection drops to `2g` or `slow-2g` while the vehicle is in motion, a dead zone is flagged.

### 6. Temporal Data Decay (Auto-Healing Data)
*   **The Edge Case:** What if a street is under heavy construction for 2 months, producing >90 dB noise every day, but then the construction finishes and it becomes a quiet residential street again? Will it be marked as a "Noise Zone" forever?
*   **How it works:** CityPulse implements **Temporal Filtering**. The `getAggregatedStats()` engine strips out any infrastructure event (pothole, noise zone, traffic jam) that is older than `dataDecayDays` (configurable, default is 30 days) before pushing it to the dashboard. 
*   **The Result:** The dashboard and map *always* reflect the current, living reality of the city. If a noise zone quiets down, within 30 days, the old data naturally decays and disappears from the map. (Note: Potholes are deleted even faster via the "Smooth Pass" Active Healing mechanism mentioned above).

### 7. Core Trip Engine: Driver Behavior AI 
While CityPulse monitors the city, the core Trip Engine actively monitors the driver. The AI detects **Hard Acceleration**, **Hard Braking**, and **Sharp Cornering**.
*   **Safeguard (The "Horizontal Mount" Edge Case):** How do you detect "Hard Braking" if you don't know the exact orientation of the phone in the car? If the phone is mounted upright on a dashboard, braking creates force on the Y-axis. If it's lying flat on the passenger seat, braking acts on the Z-axis. 
*   **The Solution:** The engine does not rely on a hardcoded axis. It calculates the **entire 3D pure acceleration magnitude** and cross-references it with live **historical GPS speed data vectors** in real-time. If there is a massive 0.5G burst of pure acceleration, the engine checks the GPS trend from the last few seconds. If the speed trend mathematically dropped, it registers as Hard Braking. If it spiked, it's Hard Acceleration. It works flawlessly regardless of the phone's physical orientation.

---

## Security Architecture

DrivePulse ships with a hardened security posture despite being a client-side application:

### Content Security Policy (CSP)
A strict `Content-Security-Policy` meta tag is enforced in `index.html`. It restricts:
*   **Scripts:** Only `self` and the three whitelisted CDNs (unpkg, jsdelivr, cloudflare) are allowed. No `eval()`, no inline scripts.
*   **Styles:** Only `self`, `unsafe-inline` (required by Leaflet), and Google Fonts.
*   **Images:** Only `self`, `data:` URIs, and the two map tile providers.
*   **Connections:** Only `self` and OpenStreetMap's geocoding API.
*   Any external resource not on this whitelist is automatically blocked by the browser.

### XSS Prevention
All dynamically rendered content (infrastructure event cards, map tooltips, popup details) passes through an HTML entity escaping function (`esc()`) before being injected via `innerHTML`. This prevents stored XSS attacks where a malicious value in IndexedDB could execute arbitrary JavaScript.

### Secure Cloud Backend (Supabase)
DrivePulse utilizes a PostgreSQL Supabase backend protected by strict Row Level Security (RLS). Users must authenticate to push or pull private driving telemetry. Cloud infrastructure data (potholes, traffic) is pooled globally but attributed securely via session tokens. This ensures extreme data isolation where no user can query or modify another user's private trips.

### HTTPS Requirement
In production, the app **must** be served over HTTPS. Without it, the browser will block:
*   Geolocation API access
*   DeviceMotion/DeviceOrientation sensor access
*   Service Worker registration
*   Microphone access (Web Audio API)

---

## Data Storage & Cloud Synchronization

DrivePulse uses a dual-layer storage methodology: **Edge (IndexedDB)** for uninterrupted offline tracking, and **Cloud (Supabase)** for persistent backups, cross-device restoration, and live global infrastructure pinging.

### 1. Edge Storage: `DrivePulseDB` (IndexedDB)

| Store Name | Key | Contents | Access Pattern |
|---|---|---|---|
| `trips` | Auto-increment `id` | Trip records: distance, duration, score, route, speed/accel data | Indexed by `date`, `startTime` |
| `gpsPoints` | Auto-increment `id` | Raw lat/lng/speed/altitude GPS breadcrumbs | Indexed by `tripId` |
| `sensorEvents` | Auto-increment `id` | Hard braking, acceleration, cornering events | Indexed by `tripId`, `type` |
| `settings` | `key` (string) | User preferences (thresholds, auto-detect, etc.) | Direct key lookup |
| `profile` | Fixed `'main'` | Driver name, email, vehicle type | Single record |
| `notifications` | Auto-increment `id` | Trip start/end alerts, infra alerts | Indexed by `timestamp`, `read` |
| `infraEvents` | Auto-increment `id` | CityPulse: potholes, noise, traffic, dead zones | Indexed by `type`, `timestamp`, `tripId` |
| `roadSegments` | Auto-increment `id` | Aggregated road quality scores per 100m segment | Indexed by `timestamp` |

### How to View Your Data
Open Chrome DevTools → **Application** tab → **IndexedDB** → **DrivePulseDB**. You can browse, search, and manually delete any record.

### How to Export Your Data
Open the browser console and run:
```js
// Export all trips
const trips = await DrivePulse.DB.getAllTrips();
console.log(JSON.stringify(trips, null, 2));

// Export all infrastructure events
const infra = await DrivePulse.DB.getAllInfraEvents();
console.log(JSON.stringify(infra, null, 2));
```
Copy the JSON output and save it to a file.

### How to Clear All Data
```js
// Clear CityPulse infrastructure data
await DrivePulse.DB.clearInfraEvents();
await DrivePulse.DB.clearRoadSegments();

// To clear everything (nuclear option):
indexedDB.deleteDatabase('DrivePulseDB');
location.reload();
```

### Memory Management
*   **Speed Readings:** Capped at 3,600 entries per trip (~1 hour at 1 reading/second). Older entries are discarded in real-time.
*   **Acceleration Readings:** Capped at 500 entries per trip.
*   **Traffic Speed Buffer:** Rolling 60-second window, auto-pruned.
*   **Chart.js Instances:** Properly destroyed and re-created when switching analytics periods to prevent canvas memory leaks.

---

## Frequently Asked Questions (Q&A)

**Q: Does DrivePulse require an active internet connection to work?**
A: **No.** The entire application is built offline-first. The HTML, CSS, JavaScript, and mapping logic are executed locally. Telemetry data, potholes, and noise events are queued to the device's internal `IndexedDB`. When the user gets back online, DrivePulse silently syncs the backed-up trips and event queues securely to the Supabase Cloud.

**Q: How is user privacy maintained?**
A: DrivePulse enforces PostgreSQL Row Level Security (RLS) via Supabase. A driver's raw telemetry (GPS points, exact speeds, braking metrics) is fundamentally locked to their specific authenticated `uuid`. Nobody—not even the application frontend without proper JWT tokens—can fetch another user's isolated trip routes. Global infrastructure intelligence is shared anonymously.

**Q: Does this drain the smartphone battery?**
A: Yes, tracking continuous 60Hz Accelerometer data and 1Hz GPS location data while keeping the screen awake is battery-intensive. It is highly recommended that users keep their phone plugged into a car charger while using DrivePulse for extended trips.

**Q: Why doesn't DrivePulse use a framework like React or Next.js?**
A: Performance and hardware access. Frameworks introduce DOM diffing and overhead. By utilizing pure Vanilla JavaScript, DrivePulse can process thousands of sensor readings per second and manipulate the DOM with zero latency, ensuring real-time speedometers and gap-free data collection on even the cheapest budget smartphones.

**Q: Do I need to provide an API Key to run this project?**
A: **No.** DrivePulse relies entirely on free, public, keyless APIs: OpenStreetMap's Nominatim (for reverse geocoding addresses) and CartoDB (for open-source map tiles). Everything else is pure math running on the device's internal APIs.

**Q: Can this detect phone usage while driving?**
A: Yes, technically. While not a highlighted feature, the sudden, erratic change in Gyroscope and X/Y Accelerometer data while the GPS speed remains high strongly indicates a driver picking up or texting on the phone. This could easily be added as a deducted metric in the Driving Score algorithm. 

---
*DrivePulse: Transforming the physics of driving into actionable intelligence.*
