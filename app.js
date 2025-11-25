// Import Firebase SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, query, limitToLast, onValue, get, orderByChild, startAt } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
let allHistoryData = []; // Complete history for statistics
let dangerousZones = new Map(); // Zone -> incident count
let riskZones = new Set(); // Zones with high incident rate
let tempChart, humidityChart, riskChart; // Chart.js instances
let usAccidentsData = []; // Kaggle US Accidents dataset
let accidentsByZone = new Map(); // Zone -> accident count from Kaggle dataset

// Risk score update throttling to prevent glitchy behavior
let lastRiskScoreUpdate = 0;
let pendingRiskScoreUpdate = null;
let currentRiskScoreCalculation = null; // Track ongoing calculation to cancel if needed
const RISK_SCORE_UPDATE_THROTTLE = 500; // Update max once per 500ms

// --- Map Setup (Leaflet) ---
let dangerZoneMarkers = [];

function initMap() {
    // Default to New York, USA
    map = L.map('map').setView([40.7128, -74.0060], 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const carIcon = L.divIcon({
        className: 'custom-car-icon',
        html: '<i class="fa-solid fa-car-side" style="font-size: 24px; color: #3b82f6; text-shadow: 0 0 10px rgba(59,130,246,0.5);"></i>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });

    marker = L.marker([40.7128, -74.0060], { icon: carIcon }).addTo(map);
}

function updateDangerZonesOnMap() {
    // Clear existing markers
    dangerZoneMarkers.forEach(m => map.removeLayer(m));
    dangerZoneMarkers = [];

    // Add markers for dangerous zones
    riskZones.forEach(zoneKey => {
        const [lat, lon] = zoneKey.split(',').map(Number);
        const incidentCount = dangerousZones.get(zoneKey) || 0;
        
        const dangerIcon = L.divIcon({
            className: 'danger-zone-icon',
            html: `<i class="fa-solid fa-triangle-exclamation" style="font-size: 20px; color: #ef4444; text-shadow: 0 0 10px rgba(239,68,68,0.8);"></i>`,
            iconSize: [25, 25],
            iconAnchor: [12, 12]
        });

        const dangerMarker = L.marker([lat, lon], { icon: dangerIcon })
            .addTo(map)
            .bindPopup(`⚠️ High Risk Zone<br>Incidents: ${incidentCount}`)
            .openPopup();
        
        dangerZoneMarkers.push(dangerMarker);
    });
}

let accidentZoneMarkers = [];

// Model-identified high-risk zones (populated by model predictions, not hardcoded)
let modelRiskZones = new Map(); // zoneKey -> { lat, lon, risk, lastUpdated }

async function updateModelRiskZones() {
    console.log('🔍 updateModelRiskZones called');
    console.log(`   Model loaded: ${!!model}`);
    console.log(`   accidentsByZone exists: ${!!accidentsByZone}`);
    console.log(`   accidentsByZone size: ${accidentsByZone?.size || 0}`);
    console.log(`   Map exists: ${!!map}`);
    
    if (!model) {
        console.error('❌ Model not loaded yet!');
        return;
    }
    
    if (!accidentsByZone || accidentsByZone.size === 0) {
        console.error('❌ No accident data loaded!');
        console.log('   Trying to load from localStorage...');
        const savedZones = localStorage.getItem('accidentZones');
        if (savedZones) {
            try {
                const zonesArray = JSON.parse(savedZones);
                accidentsByZone = new Map(zonesArray);
                console.log(`✅ Loaded ${accidentsByZone.size} zones from localStorage`);
            } catch (e) {
                console.error('❌ Failed to load from localStorage:', e);
            }
        }
        
        if (!accidentsByZone || accidentsByZone.size === 0) {
            console.error('❌ Still no data! Check if train-model.html was run.');
            return;
        }
    }
    
    if (!map) {
        console.error('❌ Map not initialized!');
        return;
    }
    
    console.log(`🔍 Evaluating ${accidentsByZone.size} zones with ML model...`);
    
    // Clear old markers
    accidentZoneMarkers.forEach(m => map.removeLayer(m));
    accidentZoneMarkers = [];
    modelRiskZones.clear();
    
    // Evaluate ALL zones with the model (or sample if too many)
    const allZoneRisks = [];
    const maxZonesToEvaluate = 500; // Evaluate more zones
    const zonesArray = Array.from(accidentsByZone.entries());
    const zonesToEvaluate = zonesArray.slice(0, Math.min(maxZonesToEvaluate, zonesArray.length));
    
    console.log(`📊 Evaluating ${zonesToEvaluate.length} zones...`);
    
    // Evaluate each zone with the model
    for (const [zoneKey, accidentCount] of zonesToEvaluate) {
        const [lat, lon] = zoneKey.split(',').map(Number);
        
        // Use average conditions for the zone
        const avgTemp = 25;
        const avgHum = 50;
        
        // Get accident risk contribution (raw data for model input)
        const accidentRisk = getAccidentRiskRaw(lat, lon);
        
        // Let MODEL decide the risk for this zone
        const predictedRisk = await predictRisk(avgTemp, avgHum, lat, lon);
        
        // Store all predictions
        allZoneRisks.push({ 
            zoneKey, 
            lat, 
            lon, 
            risk: predictedRisk, 
            accidentCount,
            accidentRisk 
        });
    }
    
    // Sort by risk (highest first)
    allZoneRisks.sort((a, b) => b.risk - a.risk);
    
    // Show some debug info about predictions
    if (allZoneRisks.length > 0) {
        const maxRisk = Math.max(...allZoneRisks.map(z => z.risk));
        const minRisk = Math.min(...allZoneRisks.map(z => z.risk));
        const avgRisk = allZoneRisks.reduce((sum, z) => sum + z.risk, 0) / allZoneRisks.length;
        console.log(`📊 Risk stats: Max=${(maxRisk * 100).toFixed(1)}%, Min=${(minRisk * 100).toFixed(1)}%, Avg=${(avgRisk * 100).toFixed(1)}%`);
    }
    
    // Get current vehicle position to prioritize nearby zones
    let vehicleLat = null, vehicleLon = null;
    if (marker) {
        const vehiclePos = marker.getLatLng();
        vehicleLat = vehiclePos.lat;
        vehicleLon = vehiclePos.lng;
    } else if (allHistoryData.length > 0) {
        // Fallback: use latest position from history
        const latest = allHistoryData[allHistoryData.length - 1];
        vehicleLat = parseFloat(latest.latitude);
        vehicleLon = parseFloat(latest.longitude);
    }
    
    // Calculate distance from vehicle for each zone and add proximity score
    if (vehicleLat && vehicleLon) {
        allZoneRisks.forEach(zone => {
            const latDiff = zone.lat - vehicleLat;
            const lonDiff = zone.lon - vehicleLon;
            const distanceKm = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff) * 111;
            zone.distanceKm = distanceKm;
            // Boost risk for nearby zones (within 50km)
            if (distanceKm < 50) {
                zone.proximityBoost = Math.max(0, (50 - distanceKm) / 50) * 0.3; // Up to 0.3 boost
                zone.adjustedRisk = Math.min(1.0, zone.risk + zone.proximityBoost);
            } else {
                zone.proximityBoost = 0;
                zone.adjustedRisk = zone.risk;
            }
        });
        
        // Sort by adjusted risk (risk + proximity boost)
        allZoneRisks.sort((a, b) => b.adjustedRisk - a.adjustedRisk);
        console.log(`🚗 Vehicle position: ${vehicleLat.toFixed(4)}, ${vehicleLon.toFixed(4)}`);
    }
    
    // Dynamic threshold: top 30% OR risk > 0.2 (whichever gives more zones)
    // Much lower threshold to detect more zones, especially near vehicle
    const top30Percent = Math.max(1, Math.floor(allZoneRisks.length * 0.30));
    const thresholdRisk = allZoneRisks[top30Percent - 1]?.adjustedRisk || allZoneRisks[top30Percent - 1]?.risk || 0.2;
    const finalThreshold = Math.max(thresholdRisk, 0.15); // Minimum 0.15 risk (very low)
    
    // Get high-risk zones: prioritize nearby zones or high-risk zones
    // Improved strategy to ensure we always show zones, especially near vehicle
    let highRiskZones = [];
    
    if (vehicleLat && vehicleLon) {
        // Strategy 1: Zones very close to vehicle (within 20km) - always include
        const veryNearbyZones = allZoneRisks
            .filter(zone => zone.distanceKm < 20 && zone.risk >= 0.05)
            .slice(0, 15);
        
        // Strategy 2: Zones moderately close (20-100km) with decent risk
        const nearbyZones = allZoneRisks
            .filter(zone => zone.distanceKm >= 20 && zone.distanceKm < 100 && zone.risk >= 0.1)
            .slice(0, 15);
        
        // Strategy 3: Top risk zones by adjusted risk (regardless of distance)
        const topRiskZones = allZoneRisks
            .filter(zone => zone.adjustedRisk >= finalThreshold)
            .slice(0, 25);
        
        // Strategy 4: Top risk zones by raw risk (fallback)
        const topRawRiskZones = allZoneRisks
            .filter(zone => zone.risk >= finalThreshold)
            .slice(0, 20);
        
        // Combine all strategies and deduplicate
        const zoneMap = new Map();
        [...veryNearbyZones, ...nearbyZones, ...topRiskZones, ...topRawRiskZones].forEach(zone => {
            if (!zoneMap.has(zone.zoneKey) || zoneMap.get(zone.zoneKey).adjustedRisk < zone.adjustedRisk) {
                zoneMap.set(zone.zoneKey, zone);
            }
        });
        
        highRiskZones = Array.from(zoneMap.values())
            .sort((a, b) => b.adjustedRisk - a.adjustedRisk)
            .slice(0, 50); // Max 50 zones to show more
        
        console.log(`   📍 Found: ${veryNearbyZones.length} very nearby, ${nearbyZones.length} nearby, ${topRiskZones.length} top risk`);
    } else {
        // No vehicle position: take top risk zones with lower threshold
        const lowerThreshold = Math.max(0.1, finalThreshold * 0.7); // Even lower threshold
        highRiskZones = allZoneRisks
            .filter(zone => zone.risk >= lowerThreshold)
            .slice(0, 50);
        
        console.log(`   📍 No vehicle position, using lower threshold: ${(lowerThreshold * 100).toFixed(1)}%`);
    }
    
    console.log(`✅ Model identified ${highRiskZones.length} high-risk zones (threshold: ${(finalThreshold * 100).toFixed(1)}%)`);
    
    // If still no zones, use top zones regardless of threshold
    if (highRiskZones.length === 0 && allZoneRisks.length > 0) {
        console.log('⚠️ No zones found with threshold, using top 30 zones regardless of risk...');
        highRiskZones = allZoneRisks.slice(0, 30);
        console.log(`⚠️ Using top ${highRiskZones.length} zones (risks: ${highRiskZones.slice(0, 5).map(z => ((z.adjustedRisk || z.risk) * 100).toFixed(1)).join('%, ')}...)`);
    }
    
    // Ensure we have at least some zones to display
    if (highRiskZones.length < 5 && allZoneRisks.length > 0) {
        console.log(`⚠️ Only ${highRiskZones.length} zones found, adding more from top risk zones...`);
        const additionalZones = allZoneRisks
            .filter(zone => !highRiskZones.find(hz => hz.zoneKey === zone.zoneKey))
            .slice(0, 20);
        highRiskZones.push(...additionalZones);
        highRiskZones.sort((a, b) => (b.adjustedRisk || b.risk) - (a.adjustedRisk || a.risk));
        highRiskZones = highRiskZones.slice(0, 50);
        console.log(`✅ Now showing ${highRiskZones.length} zones total`);
    }
    
    // Display model-identified high-risk zones
    highRiskZones.forEach(({ lat, lon, risk, accidentCount, distanceKm, adjustedRisk }) => {
        modelRiskZones.set(`${lat.toFixed(2)},${lon.toFixed(2)}`, { 
            lat, 
            lon, 
            risk, 
            lastUpdated: Date.now() 
        });
        
        // Color based on adjusted risk level
        const displayRisk = adjustedRisk || risk;
        const riskColor = displayRisk > 0.7 ? '#dc2626' : displayRisk > 0.5 ? '#f59e0b' : '#ef4444';
        const riskIcon = L.divIcon({
            className: 'accident-zone-icon',
            html: `<i class="fa-solid fa-triangle-exclamation" style="font-size: 20px; color: ${riskColor}; text-shadow: 0 0 8px ${riskColor}99;"></i>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        let popupText = `⚠️ High Risk Zone (ML Identified)<br>Risk Score: ${(displayRisk * 100).toFixed(1)}%<br>Accidents: ${accidentCount.toFixed(0)}<br>Model Prediction`;
        if (distanceKm !== undefined) {
            popupText += `<br>Distance: ${distanceKm.toFixed(1)}km`;
        }

        const riskMarker = L.marker([lat, lon], { icon: riskIcon })
            .addTo(map)
            .bindPopup(popupText);
        
        accidentZoneMarkers.push(riskMarker);
    });
    
    if (highRiskZones.length > 0) {
        const topRisk = highRiskZones[0].adjustedRisk || highRiskZones[0].risk;
        const nearbyCount = vehicleLat && vehicleLon ? highRiskZones.filter(z => z.distanceKm < 50).length : 0;
        console.log(`📍 Displayed ${highRiskZones.length} high-risk zones on map`);
        console.log(`   Top risk: ${(topRisk * 100).toFixed(1)}% at ${highRiskZones[0].lat.toFixed(4)}, ${highRiskZones[0].lon.toFixed(4)}`);
        if (nearbyCount > 0) {
            console.log(`   🚗 ${nearbyCount} zones within 50km of vehicle`);
        }
        
        // Show distribution
        const highCount = highRiskZones.filter(z => (z.adjustedRisk || z.risk) >= 0.6).length;
        const mediumCount = highRiskZones.filter(z => {
            const risk = z.adjustedRisk || z.risk;
            return risk >= 0.3 && risk < 0.6;
        }).length;
        const lowCount = highRiskZones.filter(z => (z.adjustedRisk || z.risk) < 0.3).length;
        console.log(`   📊 Distribution: ${highCount} high (≥60%), ${mediumCount} medium (30-60%), ${lowCount} low (<30%)`);
    } else {
        console.log('⚠️ No high-risk zones identified by model');
        console.log('   💡 Try: 1) Retrain model with train-model.html, 2) Check if accident data is loaded');
    }
}

// --- UI Updates ---
function updateUI(latestEntry, skipAlerts = false) {
    if (!latestEntry) return;

    // 1. Gauges
    const temp = latestEntry.temperature !== undefined ? Number(latestEntry.temperature) : 0;
    const hum = latestEntry.humidity !== undefined ? Number(latestEntry.humidity) : 0;

    document.getElementById('tempValue').textContent = `${temp.toFixed(1)}°C`;
    document.getElementById('humidityValue').textContent = `${hum.toFixed(1)}%`;

    const tempPercent = Math.min(Math.max(temp / 100, 0), 1); // Range 0 to 100°C
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

    // 4. Alerts (with GPS zone check) - only if not skipped
    // If riskScore is in Firebase, status is already set by updateSystemStatusFromRiskScore
    if (!skipAlerts) {
        checkAlerts(temp, hum, lat, lon);
    }
}

// --- Zone Management ---
function getZoneKey(lat, lon) {
    // Round to 0.01° (~1km grid) for zone identification
    const zoneLat = Math.round(lat * 100) / 100;
    const zoneLon = Math.round(lon * 100) / 100;
    return `${zoneLat.toFixed(2)},${zoneLon.toFixed(2)}`;
}

function isInDangerousZone(lat, lon) {
    const zoneKey = getZoneKey(lat, lon);
    return riskZones.has(zoneKey);
}

function analyzeZones(entries) {
    dangerousZones.clear();
    riskZones.clear();

    // Count CRITICAL incidents per zone (WARNING alone doesn't make a zone dangerous)
    entries.forEach(entry => {
        if (entry.status === 'CRITICAL') {
            const lat = parseFloat(entry.latitude);
            const lon = parseFloat(entry.longitude);
            if (!isNaN(lat) && !isNaN(lon)) {
                const zoneKey = getZoneKey(lat, lon);
                dangerousZones.set(zoneKey, (dangerousZones.get(zoneKey) || 0) + 1);
            }
        }
    });

    // Identify high-risk zones (2+ CRITICAL incidents)
    dangerousZones.forEach((count, zone) => {
        if (count >= 2) {
            riskZones.add(zone);
        }
    });

    console.log(`📍 Identified ${riskZones.size} high-risk zones (${dangerousZones.size} zones with incidents)`);
}

// --- US Accidents Dataset Integration ---
function getAccidentZoneKey(lat, lon) {
    // Same zone system as vehicle tracking (0.01° = ~1km)
    const zoneLat = Math.round(lat * 100) / 100;
    const zoneLon = Math.round(lon * 100) / 100;
    return `${zoneLat.toFixed(2)},${zoneLon.toFixed(2)}`;
}

async function loadUSAccidentsData() {
    // Ensure accidentsByZone is initialized
    if (!accidentsByZone) {
        accidentsByZone = new Map();
    }
    
    // First, try to load from localStorage (saved during training)
    const savedZones = localStorage.getItem('accidentZones');
    if (savedZones) {
        try {
            const zonesArray = JSON.parse(savedZones);
            accidentsByZone = new Map(zonesArray);
            console.log(`✅ Loaded ${accidentsByZone.size} accident zones from localStorage (pre-trained model)`);
            return true;
        } catch (error) {
            console.warn('⚠️ Error loading zones from localStorage:', error);
            // Ensure it's still initialized even if parsing fails
            if (!accidentsByZone) {
                accidentsByZone = new Map();
            }
        }
    }
    
    // If not in localStorage, try to load from file (for training)
    try {
        const response = await fetch('us_accidents_sample.json');
        
        if (response.ok) {
            const data = await response.json();
            processAccidentsData(data);
            console.log(`✅ Loaded ${data.length} accident records from Kaggle dataset file`);
            return true;
        } else {
            console.warn('⚠️ US Accidents dataset file not found. Using sample accident zones.');
            generateSampleAccidentZones();
            return false;
        }
    } catch (error) {
        console.warn('⚠️ Could not load US Accidents dataset:', error.message);
        generateSampleAccidentZones();
        return false;
    }
}

function processAccidentsData(accidents) {
    // Ensure accidentsByZone is initialized
    if (!accidentsByZone) {
        accidentsByZone = new Map();
    }
    
    accidentsByZone.clear();
    
    // Store ALL accident data - let the MODEL decide what's dangerous
    // No hardcoded thresholds or filtering
    accidents.forEach(accident => {
        const lat = parseFloat(accident.Start_Lat);
        const lng = parseFloat(accident.Start_Lng);
        
        if (!isNaN(lat) && !isNaN(lng)) {
            const zoneKey = getAccidentZoneKey(lat, lng);
            const severity = parseInt(accident.Severity) || 1;
            // Weight by severity (1-4, higher = more dangerous)
            const weight = severity;
            accidentsByZone.set(zoneKey, (accidentsByZone.get(zoneKey) || 0) + weight);
        }
    });
    
    console.log(`📍 Processed ${accidents.length} accidents into ${accidentsByZone.size} zones (model will identify dangerous ones)`);
}

function generateSampleAccidentZones() {
    // Ensure accidentsByZone is initialized
    if (!accidentsByZone) {
        accidentsByZone = new Map();
    }
    
    // Generate sample zones with varying accident counts
    // Model will decide which are dangerous, not hardcoded thresholds
    const sampleZones = [
        { lat: 40.75, lon: -74.00, count: 25 }, // NYC area
        { lat: 34.05, lon: -118.25, count: 22 }, // LA area
        { lat: 41.88, lon: -87.63, count: 18 }, // Chicago area
        { lat: 29.76, lon: -95.37, count: 16 },  // Houston area
        { lat: 33.75, lon: -84.39, count: 12 },  // Atlanta area
        { lat: 40.71, lon: -74.01, count: 8 },  // NYC downtown
        { lat: 34.06, lon: -118.24, count: 5 }, // LA downtown
    ];
    
    sampleZones.forEach(zone => {
        const zoneKey = `${zone.lat.toFixed(2)},${zone.lon.toFixed(2)}`;
        accidentsByZone.set(zoneKey, zone.count);
    });
    
    console.log(`📍 Generated ${sampleZones.length} sample accident zones (model will identify dangerous ones)`);
}

// Check if current location is in a model-identified high-risk zone
async function isInAccidentZone(lat, lon) {
    if (!lat || !lon) {
        return false;
    }
    
    // First check if it's in the model-identified risk zones (faster)
    const zoneKey = getAccidentZoneKey(lat, lon);
    if (modelRiskZones.has(zoneKey)) {
        return true;
    }
    
    // If not in cached zones, use model to predict risk for this location
    if (!model) {
        return false;
    }
    
    const avgTemp = 25; // Could use actual temp if available
    const avgHum = 50;
    const risk = await predictRisk(avgTemp, avgHum, lat, lon);
    
    // Model decides: risk > 0.4 = dangerous zone (lower threshold for real-time detection)
    return risk > 0.4;
}

// Raw accident data contribution (for model input)
function getAccidentRiskRaw(lat, lon) {
    if (!accidentsByZone || accidentsByZone.size === 0) {
        return 0;
    }
    
    const zoneKey = getAccidentZoneKey(lat, lon);
    const accidentCount = accidentsByZone.get(zoneKey) || 0;
    
    if (accidentCount === 0) {
        return 0;
    }
    
    // Find max accident count for normalization
    const maxCount = Math.max(...Array.from(accidentsByZone.values()), 1);
    
    // Normalize to 0-1 scale (raw data for model, no hardcoded thresholds)
    return Math.min(accidentCount / maxCount, 1.0);
}

// Legacy function name for compatibility
function getAccidentRisk(lat, lon) {
    return getAccidentRiskRaw(lat, lon);
}

// Helper function to update alerts and status based on risk score
async function updateSystemStatusFromRiskScore(riskScore, temp, humidity, lat, lon) {
    const ledRed = document.getElementById('ledRed');
    const ledOrange = document.getElementById('ledOrange');
    const ledBlue = document.getElementById('ledBlue');
    const alertBox = document.getElementById('alertBox');
    const alertMsg = document.getElementById('alertMessage');
    const riskScoreEl = document.getElementById('riskScore');
    
    if (!ledRed || !ledOrange || !ledBlue || !alertBox || !alertMsg) return;
    
    // Reset all LEDs
    ledRed.classList.remove('active');
    ledOrange.classList.remove('active');
    ledBlue.classList.remove('active');
    
    // Determine status based on risk score
    let statusColor, statusBg, statusText, ledToActivate;
    
    if (riskScore >= 0.7) {
        // CRITICAL - High risk
        statusColor = 'var(--danger)';
        statusBg = 'rgba(239, 68, 68, 0.1)';
        ledToActivate = ledRed;
        
        // Determine reason
        let reason = '';
        if (temp > 60) reason = 'High Temperature';
        else if (humidity > 80) reason = 'High Humidity';
        else if (lat && lon) {
            const inModelRiskZone = await isInAccidentZone(lat, lon);
            if (inModelRiskZone) reason = 'High Risk Zone (ML Identified)';
            else reason = 'High Risk Conditions';
        } else {
            reason = 'High Risk Conditions';
        }
        statusText = `CRITICAL ALERT: ${reason} detected!`;
    } else if (riskScore >= 0.4) {
        // WARNING - Medium risk
        statusColor = 'var(--warning)';
        statusBg = 'rgba(245, 158, 11, 0.1)';
        ledToActivate = ledOrange;
        
        let reason = '';
        if (temp > 40) reason = 'Elevated Temperature';
        else if (humidity > 70) reason = 'Elevated Humidity';
        else if (lat && lon) {
            const inModelRiskZone = await isInAccidentZone(lat, lon);
            if (inModelRiskZone) reason = 'Near Risk Zone';
            else reason = 'Elevated Risk Conditions';
        } else {
            reason = 'Elevated Risk Conditions';
        }
        statusText = `WARNING: ${reason}. Drive with caution.`;
    } else {
        // NORMAL - Low risk
        statusColor = 'var(--info)';
        statusBg = 'rgba(59, 130, 246, 0.1)';
        ledToActivate = ledBlue;
        statusText = "System operating normally. Conditions optimal.";
    }
    
    // Update UI
    ledToActivate.classList.add('active');
    alertMsg.textContent = statusText;
    alertBox.style.borderLeftColor = statusColor;
    alertBox.style.background = statusBg;
    
    // Update risk score color to match status
    if (riskScoreEl) {
        if (riskScore >= 0.7) riskScoreEl.style.color = 'var(--danger)';
        else if (riskScore >= 0.4) riskScoreEl.style.color = 'var(--warning)';
        else riskScoreEl.style.color = 'var(--success)';
    }
}

// Helper function to update alerts with model risk (legacy, kept for compatibility)
function updateAlertsWithModelRisk(temp, humidity, inDangerZone, inModelRiskZone) {
    const ledRed = document.getElementById('ledRed');
    const alertMsg = document.getElementById('alertMessage');
    const alertBox = document.getElementById('alertBox');
    
    if (!ledRed || !alertMsg || !alertBox) return;
    
    const isCritical = temp > 60 || humidity > 80 || inDangerZone || inModelRiskZone;
    
    if (isCritical) {
        ledRed.classList.add('active');
        let reason = '';
        if (temp > 60) reason = 'High Temperature';
        else if (humidity > 80) reason = 'High Humidity';
        else if (inModelRiskZone) reason = 'High Risk Zone (ML Identified)';
        else if (inDangerZone) reason = 'Dangerous GPS Zone';
        alertMsg.textContent = `CRITICAL ALERT: ${reason} detected!`;
        alertBox.style.borderLeftColor = 'var(--danger)';
        alertBox.style.background = 'rgba(239, 68, 68, 0.1)';
    }
}

// Centralized function to update risk score (prevents glitchy behavior from multiple updates)
function updateRiskScoreDisplay(riskScore, temp, humidity, lat, lon) {
    const now = Date.now();
    
    // Throttle updates to prevent glitchy behavior
    if (now - lastRiskScoreUpdate < RISK_SCORE_UPDATE_THROTTLE) {
        // Cancel pending update and schedule new one with latest values
        if (pendingRiskScoreUpdate) {
            clearTimeout(pendingRiskScoreUpdate);
        }
        pendingRiskScoreUpdate = setTimeout(() => {
            updateRiskScoreDisplay(riskScore, temp, humidity, lat, lon);
        }, RISK_SCORE_UPDATE_THROTTLE - (now - lastRiskScoreUpdate));
        return;
    }
    
    // Cancel any ongoing calculation if we have a direct value
    if (currentRiskScoreCalculation) {
        // Can't cancel Promise, but we can ignore its result
        currentRiskScoreCalculation = null;
    }
    
    lastRiskScoreUpdate = now;
    pendingRiskScoreUpdate = null;
    
    // Update risk score display immediately
    const riskScoreEl = document.getElementById('riskScore');
    if (riskScoreEl) {
        riskScoreEl.textContent = riskScore.toFixed(2);
        if (riskScore >= 0.7) riskScoreEl.style.color = 'var(--danger)';
        else if (riskScore >= 0.4) riskScoreEl.style.color = 'var(--warning)';
        else riskScoreEl.style.color = 'var(--success)';
    }
    
    // Update system status based on risk score
    updateSystemStatusFromRiskScore(riskScore, temp, humidity, lat, lon).catch(err => {
        console.error('Error updating system status:', err);
    });
}

// --- Logic & Alerts ---
// Use risk score as the primary source for system status
// The risk score already includes temperature, humidity, and zone risk
function checkAlerts(temp, humidity, lat, lon) {
    // Use risk score as the primary source for system status
    // The risk score already includes temperature, humidity, and zone risk
    if (model) {
        // Track this calculation
        const calculationPromise = predictRisk(temp, humidity, lat, lon);
        currentRiskScoreCalculation = calculationPromise;
        
        calculationPromise.then(riskScore => {
            // Only update if this is still the current calculation (not cancelled)
            if (currentRiskScoreCalculation === calculationPromise) {
                updateRiskScoreDisplay(riskScore, temp, humidity, lat, lon);
                currentRiskScoreCalculation = null;
            }
        }).catch(error => {
            // Only handle error if this is still the current calculation
            if (currentRiskScoreCalculation === calculationPromise) {
                console.error('Error calculating risk score:', error);
                // Fallback to basic checks if model fails
                const isCritical = temp > 60 || humidity > 80;
                const isWarning = temp > 40 || humidity > 70;
                
                const fallbackRisk = isCritical ? 0.8 : (isWarning ? 0.5 : 0.2);
                updateRiskScoreDisplay(fallbackRisk, temp, humidity, lat, lon);
                currentRiskScoreCalculation = null;
            }
        });
    } else {
        // Fallback if model not loaded yet
        const isCritical = temp > 60 || humidity > 80;
        const isWarning = temp > 40 || humidity > 70;
        
        const fallbackRisk = isCritical ? 0.8 : (isWarning ? 0.5 : 0.2);
        updateRiskScoreDisplay(fallbackRisk, temp, humidity, lat, lon);
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
                const latestEntry = entries[0];
                
                const temp = Number(latestEntry.temperature || 0);
                const hum = Number(latestEntry.humidity || 0);
                const lat = parseFloat(latestEntry.latitude || 0);
                const lon = parseFloat(latestEntry.longitude || 0);
                
                // Priority: Use riskScore from Firebase if available (most accurate, from simulator)
                // Otherwise calculate it using the model
                if (latestEntry.riskScore !== undefined) {
                    // Use risk score from Firebase (calculated by simulator)
                    const riskScore = Number(latestEntry.riskScore);
                    // Use centralized update function to prevent glitchy behavior
                    updateRiskScoreDisplay(riskScore, temp, hum, lat, lon);
                    
                    // Still update gauges and map (skip alerts since we already set status from risk score)
                    updateUI(latestEntry, true);
                } else {
                    // Fallback: calculate risk score if not in Firebase
                    // Use checkAlerts which will calculate and update risk score (with throttling)
                    updateUI(latestEntry);
                }
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

// --- Load Last Hour (Default) ---
async function loadLastHour() {
    try {
        // Get recent entries (last 1800 entries = ~1 hour at 2 sec intervals)
        const historyRef = ref(db, 'vehicle_history');
        const snapshot = await get(query(historyRef, limitToLast(1800)));
        
        if (snapshot.exists()) {
            let entries = Object.values(snapshot.val());
            // Filter to last hour based on timestamp
            const oneHourAgo = Date.now() - (60 * 60 * 1000);
            entries = entries.filter(entry => {
                const entryTime = new Date(entry.timestamp || entry.timestamp).getTime();
                return entryTime >= oneHourAgo;
            });
            
            allHistoryData = entries;
            console.log(`📊 Loaded ${allHistoryData.length} entries from last hour`);
            
            // Analyze zones from recent history
            analyzeZones(allHistoryData);
            
            // Update map with danger zones (vehicle incidents)
            updateDangerZonesOnMap();
            
            // Update statistics with recent data (only if DOM is ready)
            if (document.getElementById('avgTemp') || document.getElementById('dangerZonesList')) {
                updateCompleteStats();
            }
            
            // Update charts with last 1h data (only if charts are initialized)
            if (tempChart || humidityChart || riskChart) {
                updateCharts('Last 1h');
            }
        } else {
            allHistoryData = [];
            console.log('📊 No data in the last hour');
        }
    } catch (error) {
        console.error("❌ Error loading last hour:", error);
        allHistoryData = [];
    }
}

// --- Load Complete History for Statistics (Only when user requests it) ---
async function loadCompleteHistory() {
    try {
        const historyRef = ref(db, 'vehicle_history');
        const snapshot = await get(historyRef);
        
        if (snapshot.exists()) {
            allHistoryData = Object.values(snapshot.val());
            console.log(`📊 Loaded ${allHistoryData.length} historical entries for statistics`);
            
            // Analyze zones from complete history
            analyzeZones(allHistoryData);
            
            // Update map with danger zones (vehicle incidents)
            updateDangerZonesOnMap();
            
            // Model identifies high-risk zones dynamically (wait for model to be ready)
            setTimeout(async () => {
                console.log('⏰ Updating risk zones after history load...');
                if (model && map && accidentsByZone && accidentsByZone.size > 0) {
                    await updateModelRiskZones();
                } else {
                    console.log('⚠️ Not ready: model=', !!model, 'map=', !!map, 'zones=', accidentsByZone?.size || 0);
                }
            }, 2000);
            
            // Retrain model with real data
            await retrainModelWithRealData(allHistoryData);
            
            // Update statistics with complete data
            updateCompleteStats();
            
            // Update charts with all data
            const timeRange = document.getElementById('chartTimeRange')?.value || 'all';
            updateCharts(timeRange);
        }
    } catch (error) {
        console.error("❌ Error loading complete history:", error);
    }
}

function updateCompleteStats() {
    if (allHistoryData.length === 0) return;

    // Calculate statistics from ALL history
    const cleanEntries = allHistoryData.map(e => ({
        temp: Number(e.temperature || 0),
        humidity: Number(e.humidity || 0),
        status: e.status || 'NORMAL'
    }));

    const totalTemp = cleanEntries.reduce((acc, curr) => acc + curr.temp, 0);
    const totalHum = cleanEntries.reduce((acc, curr) => acc + curr.humidity, 0);

    const avgTemp = totalTemp / cleanEntries.length;
    const avgHum = totalHum / cleanEntries.length;
    // Count only CRITICAL as incidents (WARNING is just a warning, not an incident)
    const totalIncidents = cleanEntries.filter(e => e.status === 'CRITICAL').length;
    const totalWarnings = cleanEntries.filter(e => e.status === 'WARNING').length;
    const incidentsByZone = Array.from(dangerousZones.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // Top 5 zones

    // Check if elements exist before updating
    const avgTempEl = document.getElementById('avgTemp');
    const avgHumEl = document.getElementById('avgHum');
    const incidentCountEl = document.getElementById('incidentCount');
    const zonesList = document.getElementById('dangerZonesList');
    
    if (avgTempEl) avgTempEl.textContent = `${avgTemp.toFixed(1)}°C`;
    if (avgHumEl) avgHumEl.textContent = `${avgHum.toFixed(1)}%`;
    if (incidentCountEl) incidentCountEl.textContent = totalIncidents;
    
    // Log breakdown for debugging
    console.log(`📊 Breakdown: ${totalIncidents} CRITICAL incidents, ${totalWarnings} WARNINGS, ${cleanEntries.length - totalIncidents - totalWarnings} NORMAL`);

    // Display top dangerous zones (only if element exists)
    if (zonesList) {
        if (incidentsByZone.length > 0) {
            zonesList.innerHTML = incidentsByZone.map(([zone, count]) => {
                const [lat, lon] = zone.split(',');
                return `<div style="margin: 0.25rem 0;">
                    <i class="fa-solid fa-triangle-exclamation" style="color: var(--danger);"></i>
                    ${lat}°, ${lon}° - <strong>${count}</strong> incident${count > 1 ? 's' : ''}
                </div>`;
            }).join('');
        } else {
            zonesList.innerHTML = '<span style="color: var(--success);"><i class="fa-solid fa-check-circle"></i> No high-risk zones detected</span>';
        }
    }

    // Update risk score with latest conditions (including accident data)
    // Priority: Use riskScore from Firebase if available, otherwise calculate
    const latest = allHistoryData[allHistoryData.length - 1];
    if (latest) {
        const lat = parseFloat(latest.latitude || 0);
        const lon = parseFloat(latest.longitude || 0);
        const temp = Number(latest.temperature || 0);
        const hum = Number(latest.humidity || 0);
        
        // If riskScore is in Firebase, use it (most accurate, from simulator)
        if (latest.riskScore !== undefined) {
            const riskScore = Number(latest.riskScore);
            updateRiskScoreDisplay(riskScore, temp, hum, lat, lon);
        } else if (model) {
            // Fallback: calculate if not in Firebase
            predictRisk(
                temp, 
                hum,
                !isNaN(lat) && !isNaN(lon) ? lat : null,
                !isNaN(lat) && !isNaN(lon) ? lon : null
            ).then(risk => {
                updateRiskScoreDisplay(risk, temp, hum, lat, lon);
            }).catch(() => {
                // Silently fail if model not ready
            });
        }
    }

    console.log(`📈 Stats: Avg Temp=${avgTemp.toFixed(1)}°C, Avg Hum=${avgHum.toFixed(1)}%, Incidents=${totalIncidents}, Risk Zones=${riskZones.size}`);
    
    // Update charts with complete data
    updateCharts();
}

// --- Chart Management ---
function filterDataByTimeRange(data, timeRange) {
    if (timeRange === 'all') return data;
    
    const now = Date.now();
    let cutoffTime;
    
    switch(timeRange) {
        case '24h': cutoffTime = now - 24 * 60 * 60 * 1000; break;
        case '12h': cutoffTime = now - 12 * 60 * 60 * 1000; break;
        case '6h': cutoffTime = now - 6 * 60 * 60 * 1000; break;
        case '1h': cutoffTime = now - 60 * 60 * 1000; break;
        default: return data;
    }
    
    return data.filter(entry => {
        const entryTime = new Date(entry.timestamp).getTime();
        return entryTime >= cutoffTime;
    });
}

function getChartColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
        text: isDark ? '#94a3b8' : '#64748b',
        grid: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
        temp: '#3b82f6',
        humidity: '#8b5cf6',
        risk: '#ef4444',
        background: isDark ? 'rgba(21, 25, 50, 0.3)' : 'rgba(255, 255, 255, 0.5)'
    };
}

function initCharts() {
    const colors = getChartColors();
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: colors.text, font: { family: 'Outfit', size: 12 } }
            },
            tooltip: {
                backgroundColor: colors.background,
                titleColor: colors.text,
                bodyColor: colors.text,
                borderColor: colors.grid,
                borderWidth: 1
            }
        },
        scales: {
            x: {
                ticks: { color: colors.text, font: { family: 'Outfit', size: 11 } },
                grid: { color: colors.grid }
            },
            y: {
                ticks: { color: colors.text, font: { family: 'Outfit', size: 11 } },
                grid: { color: colors.grid }
            }
        }
    };

    // Temperature Chart
    const tempCtx = document.getElementById('tempChart').getContext('2d');
    tempChart = new Chart(tempCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Temperature (°C)',
                data: [],
                borderColor: colors.temp,
                backgroundColor: colors.temp + '20',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 4
            }]
        },
        options: {
            ...chartOptions,
            plugins: {
                ...chartOptions.plugins,
                title: {
                    display: false
                }
            }
        }
    });

    // Humidity Chart
    const humCtx = document.getElementById('humidityChart').getContext('2d');
    humidityChart = new Chart(humCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Humidity (%)',
                data: [],
                borderColor: colors.humidity,
                backgroundColor: colors.humidity + '20',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 4
            }]
        },
        options: chartOptions
    });

    // Risk Chart
    const riskCtx = document.getElementById('riskChart').getContext('2d');
    riskChart = new Chart(riskCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Risk Score',
                data: [],
                borderColor: colors.risk,
                backgroundColor: colors.risk + '20',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 4
            }]
        },
        options: {
            ...chartOptions,
            scales: {
                ...chartOptions.scales,
                y: {
                    ...chartOptions.scales.y,
                    min: 0,
                    max: 1
                }
            }
        }
    });

    // Time range selector
    document.getElementById('chartTimeRange').addEventListener('change', (e) => {
        updateCharts(e.target.value);
    });
}

async function updateCharts(timeRange = 'all') {
    if (allHistoryData.length === 0) {
        // Clear charts if no data
        if (tempChart) {
            tempChart.data.labels = [];
            tempChart.data.datasets[0].data = [];
            tempChart.update('none');
        }
        if (humidityChart) {
            humidityChart.data.labels = [];
            humidityChart.data.datasets[0].data = [];
            humidityChart.update('none');
        }
        if (riskChart) {
            riskChart.data.labels = [];
            riskChart.data.datasets[0].data = [];
            riskChart.update('none');
        }
        return;
    }

    const filteredData = filterDataByTimeRange(allHistoryData, timeRange);
    
    if (filteredData.length === 0) {
        console.log('No data for selected time range');
        return;
    }
    
    // Sort by timestamp
    filteredData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Limit to reasonable number of points for performance (max 500)
    const step = Math.max(1, Math.floor(filteredData.length / 500));
    const sampledData = filteredData.filter((_, i) => i % step === 0 || i === filteredData.length - 1);

    // Prepare labels (time) - show date if time range is large
    const showDate = timeRange === 'all' || timeRange === '24h';
    const labels = sampledData.map(entry => {
        const date = new Date(entry.timestamp);
        if (showDate) {
            return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } else {
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        }
    });

    // Temperature data
    const tempData = sampledData.map(entry => Number(entry.temperature || 0));

    // Humidity data
    const humData = sampledData.map(entry => Number(entry.humidity || 0));

    // Risk data (calculate for each point)
    const riskData = await Promise.all(
        sampledData.map(async (entry) => {
            const temp = Number(entry.temperature || 0);
            const hum = Number(entry.humidity || 0);
            return await predictRisk(temp, hum);
        })
    );

    // Update charts
    if (tempChart) {
        tempChart.data.labels = labels;
        tempChart.data.datasets[0].data = tempData;
        tempChart.update('none'); // 'none' = no animation for performance
    }

    if (humidityChart) {
        humidityChart.data.labels = labels;
        humidityChart.data.datasets[0].data = humData;
        humidityChart.update('none');
    }

    if (riskChart) {
        riskChart.data.labels = labels;
        riskChart.data.datasets[0].data = riskData;
        riskChart.update('none');
    }
    
    console.log(`📊 Charts updated with ${sampledData.length} data points (${timeRange} range)`);
}

function updateStats(entries) {
    // This is called for real-time updates (last 10 entries)
    // Complete stats are updated separately via updateCompleteStats()
    // Note: Risk score is updated in checkAlerts() and listenToHistory(), 
    // so we don't update it here to avoid conflicts and glitchy behavior
    if (entries.length === 0) return;
    
    // Stats are updated via updateCompleteStats() which is called separately
    // We don't update risk score here to avoid glitchy behavior from multiple updates
}

// --- Machine Learning (TensorFlow.js) ---
let model;

async function initModel() {
    // Try to load pre-trained model from IndexedDB first
    try {
        console.log("🔍 Looking for pre-trained model...");
        model = await tf.loadLayersModel('indexeddb://risk-prediction-model');
        console.log("✅ Loaded pre-trained model from IndexedDB!");
        
        // Load accident zones from localStorage if available
        const savedZones = localStorage.getItem('accidentZones');
        if (savedZones) {
            try {
                const zonesArray = JSON.parse(savedZones);
                accidentsByZone = new Map(zonesArray);
                console.log(`📍 Loaded ${accidentsByZone.size} accident zones from localStorage`);
                // Model will identify high-risk zones after map initialization
            } catch (error) {
                console.warn('⚠️ Error loading zones from localStorage:', error);
                // Initialize empty map if loading fails
                if (!accidentsByZone) {
                    accidentsByZone = new Map();
                }
            }
        }
        
        return; // Model loaded, no need to train
    } catch (error) {
        console.log("⚠️ No pre-trained model found. Initializing new model...");
        // Continue to create new model
    }
    
    // Create new model if pre-trained not found
    model = tf.sequential();
    model.add(tf.layers.dense({ 
        units: 16, 
        inputShape: [3],
        activation: 'relu',
        kernelInitializer: 'heNormal'
    }));
    model.add(tf.layers.dropout({ rate: 0.2 }));
    model.add(tf.layers.dense({ 
        units: 8, 
        activation: 'relu',
        kernelInitializer: 'heNormal'
    }));
    model.add(tf.layers.dense({ 
        units: 4, 
        activation: 'relu' 
    }));
    model.add(tf.layers.dense({ 
        units: 1, 
        activation: 'sigmoid' 
    }));
    model.compile({ 
        loss: 'meanSquaredError', 
        optimizer: tf.train.adam(0.001),
        metrics: ['accuracy']
    });
    
    // Train with synthetic data initially
    const xsData = [];
    const ysData = [];

    for (let i = 0; i < 300; i++) {
        const t = Math.random() * 100;
        const h = Math.random() * 100;
        const accidentRisk = Math.random();
        xsData.push([t / 100, h / 100, accidentRisk]);
        
        let risk = 0.1;
        if (t > 60 || h > 80) risk = 0.9;
        else if (t > 40 || h > 70) risk = 0.5;
        
        risk = Math.min(1.0, risk + accidentRisk * 0.4);
        ysData.push([risk]);
    }

    const xs = tf.tensor2d(xsData);
    const ys = tf.tensor2d(ysData);

    await model.fit(xs, ys, { epochs: 20, batchSize: 32 });
    console.log("✅ Risk Model Initialized with synthetic data");
    console.log("💡 Tip: Train with Kaggle dataset using train-model.html for better accuracy");
    
    xs.dispose();
    ys.dispose();
}

async function retrainModelWithRealData(historyData) {
    // Skip retraining if we have a pre-trained model (it's already trained with Kaggle data)
    // Only retrain if using the basic model
    if (!model || historyData.length < 10) {
        return;
    }
    
    // Check if model was loaded from IndexedDB (pre-trained)
    // If so, don't retrain - it's already optimized
    try {
        // This is a simple check - if model was loaded, it won't need retraining
        // We'll skip retraining for pre-trained models to preserve the Kaggle training
        console.log("💡 Using pre-trained model - skipping retraining to preserve Kaggle dataset training");
        return;
    } catch (error) {
        // If not pre-trained, continue with light retraining
    }
    
    // Only retrain if we don't have a pre-trained model
    // Light retraining with recent data only
    try {
        const xsData = [];
        const ysData = [];

        // Use only recent data for light retraining
        const recentData = historyData.slice(-100); // Last 100 entries
        
        recentData.forEach(entry => {
            const temp = Number(entry.temperature || 0);
            const hum = Number(entry.humidity || 0);
            const lat = parseFloat(entry.latitude || 0);
            const lon = parseFloat(entry.longitude || 0);
            
            if (temp > 0 && hum > 0 && !isNaN(lat) && !isNaN(lon)) {
                const accidentRisk = getAccidentRisk(lat, lon);
                xsData.push([temp / 100, hum / 100, accidentRisk]);
                
                let risk = 0.1;
                if (entry.status === 'CRITICAL') risk = 1.0;
                else if (entry.status === 'WARNING') risk = 0.6;
                else if (temp > 60 || hum > 80) risk = 0.9;
                else if (temp > 40 || hum > 70) risk = 0.5;
                
                if (accidentRisk > 0.3) {
                    risk = Math.min(1.0, risk + accidentRisk * 0.3);
                }
                
                ysData.push([risk]);
            }
        });

        if (xsData.length < 10) {
            return;
        }

        const xs = tf.tensor2d(xsData);
        const ys = tf.tensor2d(ysData);

        // Light retraining (fewer epochs to not override pre-trained model)
        await model.fit(xs, ys, { 
            epochs: 5, 
            batchSize: Math.min(32, xsData.length),
            shuffle: true
        });
        console.log(`✅ Model lightly retrained with ${xsData.length} recent data points`);

        xs.dispose();
        ys.dispose();
    } catch (error) {
        console.error("❌ Error retraining model:", error);
    }
}

async function predictRisk(temp, hum, lat = null, lon = null) {
    if (!model) return 0;
    
    // Get accident risk from Kaggle dataset if coordinates provided
    const accidentRisk = (lat !== null && lon !== null) ? getAccidentRisk(lat, lon) : 0;
    
    // Input: [temperature, humidity, accident_risk]
    const input = tf.tensor2d([[temp / 100, hum / 100, accidentRisk]]);
    const prediction = model.predict(input);
    const riskVal = (await prediction.data())[0];
    input.dispose();
    prediction.dispose();
    return riskVal;
}

// Initialize model on load
initModel();

// --- Start ---
window.addEventListener('DOMContentLoaded', async () => {
    initMap();
    
    // Initialize charts
    initCharts();
    
    // Load US Accidents dataset from Kaggle
    await loadUSAccidentsData();
    
    // Model identifies high-risk zones dynamically (after map and model are ready)
    // Improved retry mechanism to ensure zones are displayed
    let updateAttempts = 0;
    const maxAttempts = 5;
    
    const tryUpdateZones = async () => {
        updateAttempts++;
        console.log(`⏰ Attempt ${updateAttempts}/${maxAttempts} to update risk zones...`);
        
        if (model && map) {
            if (accidentsByZone && accidentsByZone.size > 0) {
                await updateModelRiskZones();
                return true; // Success
            } else {
                // Try to load zones from localStorage
                const savedZones = localStorage.getItem('accidentZones');
                if (savedZones) {
                    try {
                        const zonesArray = JSON.parse(savedZones);
                        accidentsByZone = new Map(zonesArray);
                        console.log(`✅ Loaded ${accidentsByZone.size} zones from localStorage, retrying update...`);
                        await updateModelRiskZones();
                        return true;
                    } catch (e) {
                        console.log('⚠️ Failed to load zones, will retry...');
                    }
                }
            }
        }
        
        // Retry if not successful and haven't exceeded max attempts
        if (updateAttempts < maxAttempts) {
            setTimeout(tryUpdateZones, 2000);
        } else {
            console.error('❌ Failed to update risk zones after all attempts');
            console.error('   💡 Make sure: 1) Model is trained (train-model.html), 2) Accident data is loaded');
        }
        
        return false;
    };
    
    // Start first attempt after 2 seconds
    setTimeout(tryUpdateZones, 2000);
    
    // Load last hour by default (not complete history)
    await loadLastHour();
    
    // Then start listening for real-time updates
    listenToHistory();
    
    // Refresh stats with last hour every 30 seconds
    setInterval(async () => {
        await loadLastHour();
    }, 30000);
    
    // Listen for chart time range changes to load complete history if needed
    const chartTimeRangeSelect = document.getElementById('chartTimeRange');
    if (chartTimeRangeSelect) {
        chartTimeRangeSelect.addEventListener('change', async (e) => {
            const timeRange = e.target.value;
            // Only load complete history if user selects "All" or "24h"
            if (timeRange === 'all' || timeRange === '24h') {
                console.log('📊 User requested full history, loading complete data...');
                await loadCompleteHistory();
            } else {
                // For other ranges, just update charts with current data
                updateCharts(timeRange);
            }
        });
    }
    
    // Update charts when theme changes
    const themeObserver = new MutationObserver(() => {
        if (tempChart && humidityChart && riskChart) {
            const colors = getChartColors();
            // Update chart colors
            [tempChart, humidityChart, riskChart].forEach(chart => {
                if (chart) {
                    chart.options.plugins.legend.labels.color = colors.text;
                    chart.options.scales.x.ticks.color = colors.text;
                    chart.options.scales.y.ticks.color = colors.text;
                    chart.options.scales.x.grid.color = colors.grid;
                    chart.options.scales.y.grid.color = colors.grid;
                    chart.update('none');
                }
            });
        }
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
});

