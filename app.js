// Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, query, limitToLast, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

// --- Initialization ---
const app = initializeApp(FIREBASE_CONFIG);
const db = getDatabase(app);
console.log("Firebase Initialized with config:", FIREBASE_CONFIG.projectId);

// --- State ---
let map, marker;

// --- Map Setup (Leaflet) ---
function initMap() {
    // Default to Paris
    map = L.map('map').setView([48.8566, 2.3522], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const carIcon = L.divIcon({
        className: 'custom-car-icon',
        html: '<i class="fa-solid fa-car-side" style="font-size: 24px; color: #3b82f6; text-shadow: 0 0 10px rgba(59,130,246,0.5);"></i>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });

    marker = L.marker([48.8566, 2.3522], { icon: carIcon }).addTo(map);
}

// --- UI Updates ---
function updateUI(latestEntry) {
    if (!latestEntry) return;

    // 1. Gauges
    const temp = latestEntry.temperature !== undefined ? Number(latestEntry.temperature) : 0;
    const hum = latestEntry.humidity !== undefined ? Number(latestEntry.humidity) : 0;

    document.getElementById('tempValue').textContent = `${temp.toFixed(1)}°C`;
    document.getElementById('humidityValue').textContent = `${hum.toFixed(1)}%`;

    const tempPercent = Math.min(Math.max((temp + 10) / 60, 0), 1); // Range -10 to 50
    const humPercent = Math.min(Math.max(hum / 100, 0), 1);

    const tempDeg = tempPercent * 180;
    const humDeg = humPercent * 180;

    document.getElementById('tempFill').style.transform = `rotate(${tempDeg}deg)`;
    document.getElementById('humidityFill').style.transform = `rotate(${humDeg}deg)`;

    // 2. Map
    const lat = parseFloat(latestEntry.latitude);
    const lon = parseFloat(latestEntry.longitude);
    const alt = parseFloat(latestEntry.altitude);

    if (!isNaN(lat) && !isNaN(lon)) {
        if (marker && map) {
            const newLatLng = [lat, lon];
            marker.setLatLng(newLatLng);
            map.panTo(newLatLng);
        }
        document.getElementById('lat').textContent = `Lat: ${lat.toFixed(4)}`;
        document.getElementById('lon').textContent = `Lon: ${lon.toFixed(4)}`;
        document.getElementById('alt').textContent = `Alt: ${alt.toFixed(1)}m`;
    }

    // 3. Date
    const now = new Date();
    document.getElementById('currentDateTime').textContent = now.toLocaleString();

    // 4. Alerts
    checkAlerts(temp, hum);
}

// --- Logic & Alerts ---
function checkAlerts(temp, humidity) {
    const ledRed = document.getElementById('ledRed');
    const ledOrange = document.getElementById('ledOrange');
    const ledBlue = document.getElementById('ledBlue');
    const alertBox = document.getElementById('alertBox');
    const alertMsg = document.getElementById('alertMessage');

    // Reset
    ledRed.classList.remove('active');
    ledOrange.classList.remove('active');
    ledBlue.classList.remove('active');
    alertBox.style.borderLeftColor = 'var(--info)';
    alertBox.style.background = 'rgba(59, 130, 246, 0.1)';

    // Conditions
    if (temp > 60 || humidity > 80) {
        ledRed.classList.add('active');
        alertMsg.textContent = `CRITICAL ALERT: High ${temp > 60 ? 'Temperature' : 'Humidity'} detected!`;
        alertBox.style.borderLeftColor = 'var(--danger)';
        alertBox.style.background = 'rgba(239, 68, 68, 0.1)';
    }
    else if (temp > 40 || humidity > 70) {
        ledOrange.classList.add('active');
        alertMsg.textContent = `WARNING: Elevated ${temp > 40 ? 'Temperature' : 'Humidity'}. Drive with caution.`;
        alertBox.style.borderLeftColor = 'var(--warning)';
        alertBox.style.background = 'rgba(245, 158, 11, 0.1)';
    }
    else {
        ledBlue.classList.add('active');
        alertMsg.textContent = "System operating normally. Conditions optimal.";
    }
}

// --- Listen for History Updates ---
function listenToHistory() {
    console.log("Attempting to connect to Firebase History...");
    const historyRef = query(ref(db, 'vehicle_history'), limitToLast(10));

    onValue(historyRef, (snapshot) => {
        if (snapshot.exists()) {
            console.log("✅ Data received from Firebase:", snapshot.val());
            const data = snapshot.val();

            const tableBody = document.getElementById('historyTableBody');
            tableBody.innerHTML = ''; // Clear current

            // Convert object to array and reverse (newest first)
            const entries = Object.values(data).reverse();

            // Update UI with latest entry
            if (entries.length > 0) {
                updateUI(entries[0]);
            }

            // Update Stats
            updateStats(entries);

            entries.forEach(entry => {
                const row = document.createElement('tr');

                // Format time
                const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : 'Just now';

                // Status Badge
                let badgeClass = 'normal';
                if (entry.status === 'WARNING') badgeClass = 'warning';
                if (entry.status === 'CRITICAL') badgeClass = 'critical';

                const t = Number(entry.temperature || 0);
                const h = Number(entry.humidity || 0);
                const lat = parseFloat(entry.latitude || 0).toFixed(3);
                const lon = parseFloat(entry.longitude || 0).toFixed(3);

                row.innerHTML = `
                    <td>${time}</td>
                    <td>${t.toFixed(1)}°C</td>
                    <td>${h.toFixed(1)}%</td>
                    <td>${lat}, ${lon}</td>
                    <td><span class="status-badge ${badgeClass}">${entry.status || 'NORMAL'}</span></td>
                `;
                tableBody.appendChild(row);
            });
        } else {
            console.log("⚠️ Connected to Firebase, but no data found at 'vehicle_history'.");
        }
    }, (error) => {
        console.error("❌ Firebase Read Error:", error);
    });
}

function updateStats(entries) {
    if (entries.length === 0) return;

    // Map entries to standard format for calculation
    const cleanEntries = entries.map(e => ({
        temp: Number(e.temperature || 0),
        humidity: Number(e.humidity || 0)
    }));

    const totalTemp = cleanEntries.reduce((acc, curr) => acc + curr.temp, 0);
    const totalHum = cleanEntries.reduce((acc, curr) => acc + curr.humidity, 0);

    const avgTemp = totalTemp / cleanEntries.length;
    const avgHum = totalHum / cleanEntries.length;

    document.getElementById('avgTemp').textContent = `${avgTemp.toFixed(1)}°C`;
    document.getElementById('avgHum').textContent = `${avgHum.toFixed(1)}%`;
    document.getElementById('incidentCount').textContent = entries.filter(e => e.status === 'CRITICAL').length;

    // TensorFlow.js Risk Prediction
    predictRisk(avgTemp, avgHum).then(risk => {
        document.getElementById('riskScore').textContent = risk.toFixed(2);

        const riskEl = document.getElementById('riskScore');
        if (risk > 0.7) riskEl.style.color = 'var(--danger)';
        else if (risk > 0.4) riskEl.style.color = 'var(--warning)';
        else riskEl.style.color = 'var(--success)';
    });
}

// --- Machine Learning (TensorFlow.js) ---
let model;

async function initModel() {
    model = tf.sequential();
    model.add(tf.layers.dense({ units: 4, inputShape: [2], activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
    model.compile({ loss: 'meanSquaredError', optimizer: 'sgd' });

    const xsData = [];
    const ysData = [];

    for (let i = 0; i < 100; i++) {
        const t = Math.random() * 100;
        const h = Math.random() * 100;
        xsData.push([t / 100, h / 100]);
        let risk = 0;
        if (t > 60 || h > 80) risk = 1;
        else if (t > 40 || h > 70) risk = 0.5;
        ysData.push([risk]);
    }

    const xs = tf.tensor2d(xsData);
    const ys = tf.tensor2d(ysData);

    await model.fit(xs, ys, { epochs: 10 });
    console.log("Risk Model Trained");
}

async function predictRisk(temp, hum) {
    if (!model) return 0;
    const input = tf.tensor2d([[temp / 100, hum / 100]]);
    const prediction = model.predict(input);
    const riskVal = (await prediction.data())[0];
    input.dispose();
    prediction.dispose();
    return riskVal;
}

// Initialize model on load
initModel();

// --- Start ---
window.addEventListener('DOMContentLoaded', () => {
    initMap();
    listenToHistory();
});
