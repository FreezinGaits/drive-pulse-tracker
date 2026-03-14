# DrivePulse - Smart Trip Tracker

A mobile progressive web app (PWA) that tracks your vehicle trips using smartphone sensors (GPS, Accelerometer, Gyroscope) to build real-time driving telemetry maps and safety scores.

## How to Run DrivePulse Locally

To test this app on your laptop and see the real-time sensors work on your mobile phone, follow these steps.

### Step 1: Start a Local Web Server

1. Open your terminal (PowerShell, Command Prompt, or VS Code Terminal).
2. Navigate into the project folder (`d:\Code Playground\Drive_Pulse`).
3. Run the following command to start a lightweight web server:
   ```bash
   npx serve .
   ```
   *Note: If `npx` asks to install the `serve` package, type `y` and press Enter.*

4. The terminal will output two addresses. It will look something like:
   - **Local:** `http://localhost:3000`
   - **Network:** `http://192.168.1.5:3000` (Your actual IP will be different, e.g., `10.200.76.39:3000`)

### Step 2: Open on your Laptop

To view the app on your computer, simply open your web browser and go to:
**`http://localhost:3000`**

### Step 3: Open on your Mobile Phone & Test Sensors

Sensors (like GPS and Gyroscopes) are strictly blocked by modern mobile browsers unless the website has a secure padlock (HTTPS). Since you are running it locally on your Wi-Fi (HTTP), you must tell your phone's browser to "trust" your laptop's IP address.

1. Ensure your laptop and your mobile phone are connected to the **exact same Wi-Fi network**.
2. Open **Google Chrome** on your Android phone.
3. In the URL bar at the top, type exactly:
   **`chrome://flags/#unsafely-treat-insecure-origin-as-secure`**
4. Under the "Insecure origins treated as secure" setting, type your laptop's Network IP address from Step 1 (for example: **`http://10.200.76.39:3000`**) into the text box.
5. Change the dropdown button next to it from "Disabled" to **"Enabled"**.
6. A blue "Relaunch" button will appear at the bottom. Tap it to restart Chrome.
7. Finally, type your laptop's Network IP (e.g., `http://10.200.76.39:3000`) into the normal URL bar and visit the site.
8. Accept the Location permissions, and your sensors will be completely unlocked!

## Future Deployment

When you eventually host `DrivePulse` on a real internet domain name (like Vercel, Netlify, or GitHub Pages), it will automatically come with a secure `HTTPS://` connection. 

At that point, anyone can just visit your website on their phone, and the sensors will work immediately—no Chrome flags or IP addresses required!
