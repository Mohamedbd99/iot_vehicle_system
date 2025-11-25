// accidents-loader.js - Load and process US Accidents Dataset from Kaggle
// This file handles loading the Kaggle US Accidents dataset

// Dataset structure from Kaggle:
// - Start_Lat, Start_Lng: Coordinates of accident
// - Start_Time: When accident occurred
// - Temperature(F), Humidity(%), Visibility(mi), etc.
// - Severity: 1-4 (1=least severe, 4=most severe)

let accidentsData = [];
let accidentsByZone = new Map();

// Function to load accidents data from a JSON file or API
async function loadAccidentsData() {
    try {
        // Option 1: Load from local JSON file (if you've downloaded and converted the CSV)
        // You need to download the dataset from Kaggle and convert to JSON
        const response = await fetch('us_accidents_sample.json');
        
        if (response.ok) {
            const data = await response.json();
            accidentsData = data;
            console.log(`✅ Loaded ${accidentsData.length} accident records from Kaggle dataset`);
            processAccidentsData();
            return true;
        } else {
            console.warn('⚠️ US Accidents dataset file not found. Using simulated accident zones.');
            // Generate some sample accident zones for demonstration
            generateSampleAccidentZones();
            return false;
        }
    } catch (error) {
        console.warn('⚠️ Could not load US Accidents dataset:', error.message);
        // Generate sample zones for demonstration
        generateSampleAccidentZones();
        return false;
    }
}

function processAccidentsData() {
    accidentsByZone.clear();
    
    // Process each accident and group by zone
    accidentsData.forEach(accident => {
        const lat = parseFloat(accident.Start_Lat);
        const lng = parseFloat(accident.Start_Lng);
        
        if (!isNaN(lat) && !isNaN(lng)) {
            // Use same zone system as vehicle tracking
            const zoneKey = getAccidentZoneKey(lat, lng);
            const severity = parseInt(accident.Severity) || 1;
            
            // Weight by severity (higher severity = more dangerous)
            const weight = severity;
            accidentsByZone.set(zoneKey, (accidentsByZone.get(zoneKey) || 0) + weight);
        }
    });
    
    console.log(`📍 Processed ${accidentsByZone.size} accident zones from dataset`);
}

function getAccidentZoneKey(lat, lon) {
    // Same zone system as vehicle tracking (0.01° = ~1km)
    const zoneLat = Math.round(lat * 100) / 100;
    const zoneLon = Math.round(lon * 100) / 100;
    return `${zoneLat.toFixed(2)},${zoneLon.toFixed(2)}`;
}

// Generate sample accident zones for demonstration (if dataset not available)
function generateSampleAccidentZones() {
    // Generate some high-risk zones around major US cities
    const sampleZones = [
        { lat: 40.75, lon: -74.00, count: 15 }, // NYC area
        { lat: 34.05, lon: -118.25, count: 12 }, // LA area
        { lat: 41.88, lon: -87.63, count: 10 }, // Chicago area
        { lat: 29.76, lon: -95.37, count: 8 },  // Houston area
        { lat: 33.75, lon: -84.39, count: 7 },  // Atlanta area
    ];
    
    sampleZones.forEach(zone => {
        const zoneKey = `${zone.lat.toFixed(2)},${zone.lon.toFixed(2)}`;
        accidentsByZone.set(zoneKey, zone.count);
    });
    
    console.log(`📍 Generated ${sampleZones.length} sample accident zones for demonstration`);
}

// Check if a location is in a high-accident zone
function isInAccidentZone(lat, lon) {
    const zoneKey = getAccidentZoneKey(lat, lon);
    const accidentCount = accidentsByZone.get(zoneKey) || 0;
    // Consider zone dangerous if it has 5+ weighted accidents
    return accidentCount >= 5;
}

// Get accident risk for a zone
function getAccidentRisk(lat, lon) {
    const zoneKey = getAccidentZoneKey(lat, lon);
    const accidentCount = accidentsByZone.get(zoneKey) || 0;
    // Normalize to 0-1 scale (max 20 accidents = risk 1.0)
    return Math.min(accidentCount / 20, 1.0);
}

// Export functions for use in app.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadAccidentsData,
        isInAccidentZone,
        getAccidentRisk,
        accidentsByZone
    };
}

