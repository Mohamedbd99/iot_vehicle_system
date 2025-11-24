import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, serverTimestamp } from "firebase/database";
import fetch from "node-fetch";

// --- Configuration ---
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAvXRpYIdckVFKeRQ9m2wr7JRDyFlLPAMY",
    authDomain: "iot-pro-35cd1.firebaseapp.com",
    databaseURL: "https://iot-pro-35cd1-default-rtdb.firebaseio.com",
    projectId: "iot-pro-35cd1",
    storageBucket: "iot-pro-35cd1.firebasestorage.app",
    messagingSenderId: "616038775289",
    appId: "1:616038775289:web:fb268b27f656377fcb6528",
    measurementId: "G-J6B47C11SZ"
};

const SENSOR_URLS = {
    temp: "https://esp32client-22674-default-rtdb.europe-west1.firebasedatabase.app/temperature.json?auth=AIzaSyD2C_E45ECsLXO4W6fs6NCEiF0MZPe02M8",
    humidity: "https://esp32client-22674-default-rtdb.europe-west1.firebasedatabase.app/humidity.json?auth=AIzaSyD2C_E45ECsLXO4W6fs6NCEiF0MZPe02M8"
};

// --- Initialization ---
const app = initializeApp(FIREBASE_CONFIG);
const db = getDatabase(app);

console.log("Starting IoT Vehicle Simulator...");
console.log("Connected to Firebase: iot-pro-35cd1");

// --- State ---
let currentData = {
    lat: 48.8566, // Start in Paris
    lon: 2.3522,
    alt: 35
};

// --- Simulation Logic ---
async function fetchAndPushData() {
    try {
        // 1. Fetch Sensor Data (Simulating the ESP32 connection)
        const [tempRes, humRes] = await Promise.all([
            fetch(SENSOR_URLS.temp),
            fetch(SENSOR_URLS.humidity)
        ]);

        const tempVal = await tempRes.json();
        const humVal = await humRes.json();

        // 2. Simulate GPS Movement (Random Walk)
        // Move slightly (~10-20 meters)
        currentData.lat += (Math.random() - 0.5) * 0.0002;
        currentData.lon += (Math.random() - 0.5) * 0.0002;
        currentData.alt += (Math.random() - 0.5) * 0.5;

        // 3. Prepare Data Packet
        const packet = {
            latitude: String(currentData.lat.toFixed(6)),
            longitude: String(currentData.lon.toFixed(6)),
            altitude: Number(currentData.alt.toFixed(1)),
            temperature: Number(tempVal || 20), // Fallback if null
            humidity: Number(humVal || 50),     // Fallback if null
            timestamp: new Date().toISOString(),
            status: calculateStatus(Number(tempVal), Number(humVal))
        };

        // 4. Push to Firebase
        const historyRef = ref(db, 'vehicle_history');
        await push(historyRef, packet);

        console.log(`[${new Date().toLocaleTimeString()}] Data Pushed: Temp=${packet.temperature}°C, Hum=${packet.humidity}%, Lat=${packet.latitude}`);

    } catch (error) {
        console.error("Error in simulation loop:", error);
    }
}

function calculateStatus(temp, humidity) {
    if (temp > 60 || humidity > 80) return 'CRITICAL';
    if (temp > 40 || humidity > 70) return 'WARNING';
    return 'NORMAL';
}

// --- Run Loop ---
// Run every 2 seconds
setInterval(fetchAndPushData, 2000);
fetchAndPushData(); // Initial run
