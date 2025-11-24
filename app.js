// Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, onValue, set, serverTimestamp, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

// --- State ---
let currentData = {
    temp: 0,
    humidity: 0,
    lat: 48.8566, // Default: Paris
    lon: 2.3522,
    alt: 35
};

let map, marker;
let historyData = [];

// --- Map Setup (Leaflet) ---
function initMap() {
    map = L.map('map').setView([currentData.lat, currentData.lon], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const carIcon = L.divIcon({
        className: 'custom-car-icon',
        html: '<i class="fa-solid fa-car-side" style="font-size: 24px; color: #3b82f6; text-shadow: 0 0 10px rgba(59,130,246,0.5);"></i>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });

    marker = L.marker([currentData.lat, currentData.lon], { icon: carIcon }).addTo(map);
}

// --- Data Fetching ---
async function fetchSensorData() {
    try {
        const [tempRes, humRes] = await Promise.all([
            fetch(SENSOR_URLS.temp),
            fetch(SENSOR_URLS.humidity)
        ]);

        const tempVal = await tempRes.json();
        const humVal = await humRes.json();

        // Update state
        if (tempVal !== null) currentData.temp = parseFloat(tempVal);
        if (humVal !== null) currentData.humidity = parseFloat(humVal);

        // Simulate GPS movement (Random Walk)
        currentData.lat += (Math.random() - 0.5) * 0.001;
        currentData.lon += (Math.random() - 0.5) * 0.001;
        currentData.alt += (Math.random() - 0.5) * 2;

        updateUI();
        checkAlerts();
        saveToHistory();

    } catch (error) {
        console.error("Error fetching sensor data:", error);
    }
}

// --- UI Updates ---
function updateUI() {
    // Update Gauges
    document.getElementById('tempValue').textContent = `${currentData.temp.toFixed(1)}°C`;
    document.getElementById('humidityValue').textContent = `${currentData.humidity.toFixed(1)}%`;

    // Simple gauge fill logic (rotation)
    // 0 to 100 range mapped to -90deg to 90deg (180deg span)? 
    // Or simpler: CSS clip-path rotation. 
    // Let's do simple rotation: 0% = -135deg, 100% = 45deg (total 180deg visible usually, but here we have half circle)
    // Actually, let's map 0-100 to 0-180 degrees for the half circle
    const tempPercent = Math.min(Math.max((currentData.temp + 10) / 60, 0), 1); // Range -10 to 50
    const humPercent = Math.min(Math.max(currentData.humidity / 100, 0), 1);

    const tempDeg = tempPercent * 180;
    const humDeg = humPercent * 180;

    document.getElementById('tempFill').style.transform = `rotate(${tempDeg}deg)`;
    document.getElementById('humidityFill').style.transform = `rotate(${humDeg}deg)`;

    // Update Map
    if (marker && map) {
        const newLatLng = [currentData.lat, currentData.lon];
        marker.setLatLng(newLatLng);
        map.panTo(newLatLng);
    }
    document.getElementById('lat').textContent = `Lat: ${currentData.lat.toFixed(4)}`;
    document.getElementById('lon').textContent = `Lon: ${currentData.lon.toFixed(4)}`;
    document.getElementById('alt').textContent = `Alt: ${currentData.alt.toFixed(1)}m`;

    // Update Date
    const now = new Date();
    document.getElementById('currentDateTime').textContent = now.toLocaleString();
}

// --- Logic & Alerts ---
function checkAlerts() {
    const { temp, humidity } = currentData;
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

    let status = 'NORMAL';

    // Conditions
    // Red: Temp > 60 OR Hum > 80
    if (temp > 60 || humidity > 80) {
        ledRed.classList.add('active');
        status = 'CRITICAL';
        alertMsg.textContent = `CRITICAL ALERT: High ${temp > 60 ? 'Temperature' : 'Humidity'} detected!`;
        alertBox.style.borderLeftColor = 'var(--danger)';
        alertBox.style.background = 'rgba(239, 68, 68, 0.1)';
    }
    // Orange: Temp > 40 OR Hum > 70
    else if (temp > 40 || humidity > 70) {
        ledOrange.classList.add('active');
        status = 'WARNING';
        alertMsg.textContent = `WARNING: Elevated ${temp > 40 ? 'Temperature' : 'Humidity'}. Drive with caution.`;
        alertBox.style.borderLeftColor = 'var(--warning)';
        alertBox.style.background = 'rgba(245, 158, 11, 0.1)';
    }
    // Blue: Normal
    else {
        ledBlue.classList.add('active');
        status = 'NORMAL';
        alertMsg.textContent = "System operating normally. Conditions optimal.";
    }

    return status;
}

// --- Firebase Storage ---
function saveToHistory() {
    const historyRef = ref(db, 'vehicle_history');
    const newEntry = {
        ...currentData,
        timestamp: serverTimestamp(),
        status: checkAlerts() // Store the status too
    };

    // Push to Firebase
    push(historyRef, newEntry);
}

// --- Listen for History Updates ---
function listenToHistory() {
    const historyRef = query(ref(db, 'vehicle_history'), limitToLast(10));

    onValue(historyRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        const tableBody = document.getElementById('historyTableBody');
        tableBody.innerHTML = ''; // Clear current

        // Convert object to array and reverse (newest first)
        const entries = Object.values(data).reverse();

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

            row.innerHTML = `
                <td>${time}</td>
                <td>${entry.temp.toFixed(1)}°C</td>
                <td>${entry.humidity.toFixed(1)}%</td>
                <td>${entry.lat.toFixed(3)}, ${entry.lon.toFixed(3)}</td>
                <td><span class="status-badge ${badgeClass}">${entry.status}</span></td>
            `;
            tableBody.appendChild(row);
        });
    });
}

function updateStats(entries) {
    if (entries.length === 0) return;

    const totalTemp = entries.reduce((acc, curr) => acc + curr.temp, 0);
    const totalHum = entries.reduce((acc, curr) => acc + curr.humidity, 0);

    const avgTemp = totalTemp / entries.length;
    const avgHum = totalHum / entries.length;

    document.getElementById('avgTemp').textContent = `${avgTemp.toFixed(1)}°C`;
    document.getElementById('avgHum').textContent = `${avgHum.toFixed(1)}%`;
    document.getElementById('incidentCount').textContent = entries.filter(e => e.status === 'CRITICAL').length;

    // TensorFlow.js Risk Prediction
    predictRisk(avgTemp, avgHum).then(risk => {
        document.getElementById('riskScore').textContent = risk.toFixed(2);

        // Update Risk UI indicator if needed
        const riskEl = document.getElementById('riskScore');
        if (risk > 0.7) riskEl.style.color = 'var(--danger)';
        else if (risk > 0.4) riskEl.style.color = 'var(--warning)';
        else riskEl.style.color = 'var(--success)';
    });
}

// --- Machine Learning (TensorFlow.js) ---
let model;

async function initModel() {
    // Define a simple model
    model = tf.sequential();
    model.add(tf.layers.dense({ units: 4, inputShape: [2], activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));

    model.compile({ loss: 'meanSquaredError', optimizer: 'sgd' });

    // Generate some dummy training data based on the rules
    // Rules: High Temp (>60) or High Hum (>80) = High Risk (1)
    //        Mod Temp (>40) or Mod Hum (>70) = Med Risk (0.5)
    //        Else = Low Risk (0)

    const xsData = [];
    const ysData = [];

    for (let i = 0; i < 100; i++) {
        const t = Math.random() * 100; // 0-100
        const h = Math.random() * 100; // 0-100

        xsData.push([t / 100, h / 100]); // Normalize 0-1

        let risk = 0;
        if (t > 60 || h > 80) risk = 1;
        else if (t > 40 || h > 70) risk = 0.5;

        ysData.push([risk]);
    }

    const xs = tf.tensor2d(xsData);
    const ys = tf.tensor2d(ysData);

    // Train the model
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

    // Start polling loop
    fetchSensorData(); // Initial
    setInterval(fetchSensorData, 2000); // Every 2 seconds
});
