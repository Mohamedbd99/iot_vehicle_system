import { initializeApp } from "firebase/app";
import { getDatabase, ref, push, serverTimestamp } from "firebase/database";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

console.log("🚀 Starting IoT Vehicle Simulator...");
console.log("📡 Connected to Firebase: iot-pro-35cd1");
console.log("⏱️  Pushing data every 2 seconds...");
console.log("🤖 Dynamic navigation between ML-identified high-risk zones");
console.log("   The simulator will:");
console.log("   1. Load dangerous zones from accident data");
console.log("   2. Navigate between zones (approaching → leaving → traveling)");
console.log("   3. Cycle through all identified danger zones");
console.log("Press Ctrl+C to stop\n");

// --- State ---
let DANGEROUS_ZONES = [];
let currentTargetZone = null;
let visitedZones = []; // Track recently visited zones to skip them
const MAX_VISITED_TRACK = 3; // Skip last 3 visited zones
let navigationState = 'approaching'; // 'approaching', 'leaving', 'traveling'
let stepsInCurrentState = 0;
const STEPS_TO_APPROACH = 50;  // Steps to get close to a zone
const STEPS_TO_LEAVE = 80;     // Steps to move away from a zone
const STEPS_TO_TRAVEL = 30;    // Steps traveling between zones

let currentData = {
    lat: 40.7128, // Default: NYC area
    lon: -74.0060,
    alt: 10
};

let stepCount = 0;

// Load dangerous zones dynamically from accident data
function loadDangerousZones() {
    try {
        console.log("🔍 Loading dangerous zones from accident data...");
        const jsonPath = path.join(__dirname, 'us_accidents_sample.json');
        
        if (!fs.existsSync(jsonPath)) {
            console.warn("⚠️ Accident data file not found, using fallback zones");
            DANGEROUS_ZONES = [
                { lat: 40.75, lon: -74.00, name: "NYC Area", risk: 0.85, accidentCount: 100 },
                { lat: 34.05, lon: -118.25, name: "LA Area", risk: 0.82, accidentCount: 90 },
                { lat: 41.88, lon: -87.63, name: "Chicago Area", risk: 0.78, accidentCount: 80 },
            ];
            return;
        }
        
        // Read and parse JSON file
        const fileContent = fs.readFileSync(jsonPath, 'utf-8');
        const accidents = JSON.parse(fileContent);
        
        // Group accidents by zone (0.01° = ~1km grid)
        const zonesMap = new Map();
        
        accidents.forEach(accident => {
            const lat = parseFloat(accident.Start_Lat);
            const lng = parseFloat(accident.Start_Lng);
            if (!isNaN(lat) && !isNaN(lng)) {
                const zoneLat = Math.round(lat * 100) / 100;
                const zoneLon = Math.round(lng * 100) / 100;
                const zoneKey = `${zoneLat.toFixed(2)},${zoneLon.toFixed(2)}`;
                
                const severity = parseInt(accident.Severity) || 1;
                const weight = severity;
                zonesMap.set(zoneKey, (zonesMap.get(zoneKey) || 0) + weight);
            }
        });
        
        // Convert to array and sort by accident count (highest first)
        const zonesArray = Array.from(zonesMap.entries())
            .map(([zoneKey, accidentCount]) => {
                const [lat, lon] = zoneKey.split(',').map(Number);
                return {
                    lat,
                    lon,
                    name: `Zone ${zoneKey}`,
                    risk: Math.min(accidentCount / 20, 1.0),
                    accidentCount
                };
            })
            .sort((a, b) => b.accidentCount - a.accidentCount)
            .slice(0, 20); // Top 20 most dangerous zones
        
        DANGEROUS_ZONES = zonesArray;
        console.log(`✅ Loaded ${DANGEROUS_ZONES.length} dangerous zones from accident data`);
        console.log(`   Top zone: ${DANGEROUS_ZONES[0].name} with ${DANGEROUS_ZONES[0].accidentCount} accidents`);
        
        // Start near the first zone
        if (DANGEROUS_ZONES.length > 0) {
            currentTargetZone = DANGEROUS_ZONES[0];
            const startOffset = {
                lat: (Math.random() - 0.5) * 0.002, // ~200m variation
                lon: (Math.random() - 0.5) * 0.002
            };
            currentData.lat = currentTargetZone.lat + startOffset.lat;
            currentData.lon = currentTargetZone.lon + startOffset.lon;
            console.log(`📍 Starting near ${currentTargetZone.name}`);
            console.log(`   Will navigate to nearest danger zones, skipping recently visited ones`);
        }
    } catch (error) {
        console.error("❌ Error loading dangerous zones:", error.message);
        // Fallback to hardcoded zones
        DANGEROUS_ZONES = [
            { lat: 40.75, lon: -74.00, name: "NYC Area", risk: 0.85, accidentCount: 100 },
            { lat: 34.05, lon: -118.25, name: "LA Area", risk: 0.82, accidentCount: 90 },
        ];
    }
}

// Initialize zones
loadDangerousZones();

// Helper function to calculate direction towards a target
function getDirectionToTarget(targetLat, targetLon) {
    const dx = targetLat - currentData.lat;
    const dy = targetLon - currentData.lon;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0) {
        return {
            lat: dx / distance,
            lon: dy / distance,
            distance: distance * 111 // Convert to km
        };
    }
    return { lat: 0, lon: 0, distance: 0 };
}

// Helper function to calculate direction away from a target
function getDirectionAwayFromTarget(targetLat, targetLon) {
    const dx = currentData.lat - targetLat;
    const dy = currentData.lon - targetLon;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0) {
        return {
            lat: dx / distance,
            lon: dy / distance,
            distance: distance * 111
        };
    }
    // If exactly at target, pick random direction
    const angle = Math.random() * Math.PI * 2;
    return {
        lat: Math.cos(angle),
        lon: Math.sin(angle),
        distance: 0
    };
}

// Find nearest danger zone (excluding recently visited ones)
function findNearestDangerZone(lat, lon) {
    if (DANGEROUS_ZONES.length === 0) return null;
    
    // Filter out recently visited zones
    const availableZones = DANGEROUS_ZONES.filter(zone => {
        const zoneKey = `${zone.lat.toFixed(2)},${zone.lon.toFixed(2)}`;
        return !visitedZones.includes(zoneKey);
    });
    
    // If all zones are visited, reset the visited list (except current)
    if (availableZones.length === 0) {
        console.log('   ℹ️  All zones visited, resetting visited list...');
        visitedZones = [];
        if (currentTargetZone) {
            const currentKey = `${currentTargetZone.lat.toFixed(2)},${currentTargetZone.lon.toFixed(2)}`;
            visitedZones.push(currentKey); // Keep current zone in visited list
        }
        return findNearestDangerZone(lat, lon); // Retry with reset list
    }
    
    // Find nearest zone from available zones
    let nearestZone = null;
    let minDistance = Infinity;
    
    for (const zone of availableZones) {
        const latDiff = lat - zone.lat;
        const lonDiff = lon - zone.lon;
        const distanceKm = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff) * 111;
        
        if (distanceKm < minDistance) {
            minDistance = distanceKm;
            nearestZone = zone;
        }
    }
    
    return nearestZone;
}

// Select next target zone (nearest danger zone)
function selectNextTargetZone() {
    if (DANGEROUS_ZONES.length === 0) return null;
    
    // Find nearest zone from current position
    const nearestZone = findNearestDangerZone(currentData.lat, currentData.lon);
    
    if (!nearestZone) {
        console.log('   ⚠️  No available zones found');
        return null;
    }
    
    // Mark previous zone as visited
    if (currentTargetZone) {
        const prevZoneKey = `${currentTargetZone.lat.toFixed(2)},${currentTargetZone.lon.toFixed(2)}`;
        if (!visitedZones.includes(prevZoneKey)) {
            visitedZones.push(prevZoneKey);
            // Keep only last MAX_VISITED_TRACK zones
            if (visitedZones.length > MAX_VISITED_TRACK) {
                visitedZones.shift(); // Remove oldest
            }
        }
    }
    
    currentTargetZone = nearestZone;
    
    const latDiff = currentData.lat - nearestZone.lat;
    const lonDiff = currentData.lon - nearestZone.lon;
    const distanceKm = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff) * 111;
    
    console.log(`\n🎯 New target (nearest): ${currentTargetZone.name}`);
    console.log(`   Coordinates: (${currentTargetZone.lat.toFixed(4)}, ${currentTargetZone.lon.toFixed(4)})`);
    console.log(`   Distance: ${distanceKm.toFixed(2)}km | Accidents: ${currentTargetZone.accidentCount} | Risk: ${(currentTargetZone.risk * 100).toFixed(1)}%`);
    if (visitedZones.length > 0) {
        console.log(`   Skipping ${visitedZones.length} recently visited zone(s)`);
    }
    
    return currentTargetZone;
}

// --- Simulation Logic ---
async function fetchAndPushData() {
    try {
        // 1. Fetch Sensor Data (Simulating the ESP32 connection)
        let tempVal, humVal;
        try {
            const [tempRes, humRes] = await Promise.all([
                fetch(SENSOR_URLS.temp),
                fetch(SENSOR_URLS.humidity)
            ]);

            tempVal = await tempRes.json();
            humVal = await humRes.json();
        } catch (sensorError) {
            console.warn("⚠️ Could not fetch sensor data, using simulated values:", sensorError.message);
            // Use simulated/random values if sensor fetch fails
            tempVal = 20 + Math.random() * 30; // 20-50°C
            humVal = 40 + Math.random() * 40;   // 40-80%
        }

        // 2. Simulate GPS Movement - Dynamic navigation between danger zones
        stepCount++;
        stepsInCurrentState++;
        
        if (!currentTargetZone && DANGEROUS_ZONES.length > 0) {
            // Find nearest zone from current position
            currentTargetZone = findNearestDangerZone(currentData.lat, currentData.lon);
            if (!currentTargetZone) {
                // Fallback to first zone if all are visited
                currentTargetZone = DANGEROUS_ZONES[0];
            }
        }
        
        if (!currentTargetZone) {
            // No zones available, random walk
            currentData.lat += (Math.random() - 0.5) * 0.0002;
            currentData.lon += (Math.random() - 0.5) * 0.0002;
        } else {
            const directionInfo = getDirectionToTarget(currentTargetZone.lat, currentTargetZone.lon);
            const distanceKm = directionInfo.distance;
            
            // State machine: approaching -> leaving -> traveling -> approaching next zone
            if (navigationState === 'approaching') {
                // Move towards the target zone
                if (distanceKm < 0.5) {
                    // Reached the zone, switch to leaving
                    navigationState = 'leaving';
                    stepsInCurrentState = 0;
                    console.log(`   ⚠️  Reached ${currentTargetZone.name}! Moving away...`);
                } else {
                    // Move towards zone
                    const moveSpeed = 0.0004; // ~45m per step
                    currentData.lat += directionInfo.lat * moveSpeed + (Math.random() - 0.5) * 0.00005;
                    currentData.lon += directionInfo.lon * moveSpeed + (Math.random() - 0.5) * 0.00005;
                }
                
                // Timeout: if taking too long, switch to leaving anyway
                if (stepsInCurrentState >= STEPS_TO_APPROACH) {
                    navigationState = 'leaving';
                    stepsInCurrentState = 0;
                }
            } else if (navigationState === 'leaving') {
                // Move away from the current zone
                const awayDirection = getDirectionAwayFromTarget(currentTargetZone.lat, currentTargetZone.lon);
                
                if (distanceKm > 3.0 || stepsInCurrentState >= STEPS_TO_LEAVE) {
                    // Far enough away, switch to traveling to next zone
                    navigationState = 'traveling';
                    stepsInCurrentState = 0;
                    selectNextTargetZone();
                } else {
                    // Move away from zone
                    const moveSpeed = 0.0005; // ~55m per step
                    currentData.lat += awayDirection.lat * moveSpeed + (Math.random() - 0.5) * 0.0001;
                    currentData.lon += awayDirection.lon * moveSpeed + (Math.random() - 0.5) * 0.0001;
                }
            } else if (navigationState === 'traveling') {
                // Traveling between zones - move towards nearest target
                // Recalculate nearest zone periodically in case we get closer to a different one
                if (stepsInCurrentState % 20 === 0) {
                    const nearestZone = findNearestDangerZone(currentData.lat, currentData.lon);
                    if (nearestZone && nearestZone !== currentTargetZone) {
                        // Found a closer zone, switch to it
                        if (currentTargetZone) {
                            const prevZoneKey = `${currentTargetZone.lat.toFixed(2)},${currentTargetZone.lon.toFixed(2)}`;
                            if (!visitedZones.includes(prevZoneKey)) {
                                visitedZones.push(prevZoneKey);
                                if (visitedZones.length > MAX_VISITED_TRACK) {
                                    visitedZones.shift();
                                }
                            }
                        }
                        currentTargetZone = nearestZone;
                        console.log(`   🔄 Switched to closer zone: ${nearestZone.name}`);
                    }
                }
                
                if (stepsInCurrentState >= STEPS_TO_TRAVEL) {
                    // Switch to approaching the new zone
                    navigationState = 'approaching';
                    stepsInCurrentState = 0;
                } else {
                    // Move towards next target with some randomness
                    const moveSpeed = 0.0003;
                    if (currentTargetZone) {
                        const dirInfo = getDirectionToTarget(currentTargetZone.lat, currentTargetZone.lon);
                        currentData.lat += dirInfo.lat * moveSpeed * 0.7 + (Math.random() - 0.5) * 0.00015;
                        currentData.lon += dirInfo.lon * moveSpeed * 0.7 + (Math.random() - 0.5) * 0.00015;
                    } else {
                        // No target, random walk
                        currentData.lat += (Math.random() - 0.5) * 0.0002;
                        currentData.lon += (Math.random() - 0.5) * 0.0002;
                    }
                }
            }
        }
        
        currentData.alt += (Math.random() - 0.5) * 0.5;
        
        // Calculate distance from current target for logging
        let distanceFromZoneKm = 0;
        if (currentTargetZone) {
            const dirInfo = getDirectionToTarget(currentTargetZone.lat, currentTargetZone.lon);
            distanceFromZoneKm = dirInfo.distance;
        }

        // 3. Calculate risk score and status (based on temp, humidity, and zone proximity)
        const temp = Number(tempVal || 20);
        const hum = Number(humVal || 50);
        const riskScore = calculateRiskScore(temp, hum, currentData.lat, currentData.lon);
        const status = calculateStatus(temp, hum, currentData.lat, currentData.lon);
        
        // 4. Prepare Data Packet
        const packet = {
            latitude: String(currentData.lat.toFixed(6)),
            longitude: String(currentData.lon.toFixed(6)),
            altitude: Number(currentData.alt.toFixed(1)),
            temperature: temp,
            humidity: hum,
            timestamp: new Date().toISOString(),
            status: status, // Status based on risk score (CRITICAL/WARNING/NORMAL)
            riskScore: Number(riskScore.toFixed(3)) // Include risk score in packet
        };

        // 5. Push to Firebase
        const historyRef = ref(db, 'vehicle_history');
        await push(historyRef, packet);

        // 6. Log status based on risk score (matching app.js behavior)
        let statusIcon, statusText;
        const stateEmoji = navigationState === 'approaching' ? '➡️' : navigationState === 'leaving' ? '⬅️' : '🛣️';
        
        // Status icon and text based on risk score (same as app.js)
        if (riskScore >= 0.7) {
            statusIcon = '🔴';
            statusText = `CRITICAL - Risk Score: ${(riskScore * 100).toFixed(1)}%`;
        } else if (riskScore >= 0.4) {
            statusIcon = '🟡';
            statusText = `WARNING - Risk Score: ${(riskScore * 100).toFixed(1)}%`;
        } else {
            statusIcon = '✅';
            statusText = `SAFE - Risk Score: ${(riskScore * 100).toFixed(1)}%`;
        }
        
        const targetName = currentTargetZone ? currentTargetZone.name : 'None';
        console.log(`${statusIcon} ${stateEmoji} [${new Date().toLocaleTimeString()}] Data Pushed: Temp=${packet.temperature}°C, Hum=${packet.humidity}%, Risk=${(riskScore * 100).toFixed(1)}%`);
        console.log(`   ${statusText} | Status: ${status} | Target: ${targetName} | Distance: ${distanceFromZoneKm.toFixed(2)}km | State: ${navigationState}`);

    } catch (error) {
        console.error("❌ Error in simulation loop:", error);
        console.error("Stack:", error.stack);
        // Continue running even if one push fails
    }
}

// Calculate risk score based on temperature, humidity, and proximity to danger zones
// This simulates what the ML model does in app.js
function calculateRiskScore(temp, humidity, lat, lon) {
    // Base risk from temperature and humidity (0-1)
    const tempRisk = Math.min(temp / 100, 1.0); // Normalize to 0-1
    const humRisk = Math.min(humidity / 100, 1.0);
    
    // Zone risk from proximity to dangerous zones
    let zoneRisk = 0;
    if (lat && lon && DANGEROUS_ZONES.length > 0) {
        // Find closest dangerous zone
        let minDistance = Infinity;
        let closestZone = null;
        
        for (const zone of DANGEROUS_ZONES) {
            const latDiff = lat - zone.lat;
            const lonDiff = lon - zone.lon;
            const distanceKm = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff) * 111;
            
            if (distanceKm < minDistance) {
                minDistance = distanceKm;
                closestZone = zone;
            }
        }
        
        if (closestZone) {
            // Risk decreases with distance
            // Within 0.5km: full zone risk
            // Within 2km: 70% of zone risk
            // Within 5km: 40% of zone risk
            // Within 10km: 20% of zone risk
            // Beyond 10km: 5% of zone risk
            let proximityFactor = 0;
            if (minDistance < 0.5) {
                proximityFactor = 1.0;
            } else if (minDistance < 2) {
                proximityFactor = 0.7;
            } else if (minDistance < 5) {
                proximityFactor = 0.4;
            } else if (minDistance < 10) {
                proximityFactor = 0.2;
            } else {
                proximityFactor = 0.05;
            }
            
            zoneRisk = closestZone.risk * proximityFactor;
        }
    }
    
    // Combine risks (weighted average)
    // Temperature: 30%, Humidity: 30%, Zone Risk: 40%
    const combinedRisk = (tempRisk * 0.3) + (humRisk * 0.3) + (zoneRisk * 0.4);
    
    // Apply some non-linearity to match ML model behavior
    // Higher risks get amplified
    const finalRisk = Math.min(1.0, Math.pow(combinedRisk, 0.85));
    
    return finalRisk;
}

function calculateStatus(temp, humidity, lat, lon) {
    // Calculate risk score (same logic as ML model in app.js)
    const riskScore = calculateRiskScore(temp, humidity, lat, lon);
    
    // Determine status based on risk score (matching app.js thresholds)
    // Same thresholds as app.js: >= 0.7 = CRITICAL, >= 0.4 = WARNING, < 0.4 = NORMAL
    if (riskScore >= 0.7) return 'CRITICAL';
    if (riskScore >= 0.4) return 'WARNING';
    return 'NORMAL';
}

// --- Run Loop ---
// Run every 2 seconds
setInterval(fetchAndPushData, 2000);
fetchAndPushData(); // Initial run
