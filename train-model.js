// train-model.js - Script pour entraîner le modèle une fois avec le dataset Kaggle
// Usage: Ouvrir train-model.html dans le navigateur après avoir placé us_accidents_sample.json

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Firebase config (même que app.js)
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

const app = initializeApp(FIREBASE_CONFIG);
const db = getDatabase(app);

// Zone management (même système que app.js)
let accidentsByZone = new Map();

function getAccidentZoneKey(lat, lon) {
    const zoneLat = Math.round(lat * 100) / 100;
    const zoneLon = Math.round(lon * 100) / 100;
    return `${zoneLat.toFixed(2)},${zoneLon.toFixed(2)}`;
}

function getAccidentRisk(lat, lon) {
    const zoneKey = getAccidentZoneKey(lat, lon);
    const accidentCount = accidentsByZone.get(zoneKey) || 0;
    return Math.min(accidentCount / 20, 1.0);
}

// Load and process Kaggle dataset
async function loadKaggleDataset() {
    try {
        const response = await fetch('us_accidents_sample.json');
        if (!response.ok) {
            throw new Error('Dataset file not found');
        }
        const data = await response.json();
        console.log(`✅ Loaded ${data.length} accident records from Kaggle`);
        
        // Process accidents into zones
        data.forEach(accident => {
            const lat = parseFloat(accident.Start_Lat);
            const lng = parseFloat(accident.Start_Lng);
            if (!isNaN(lat) && !isNaN(lng)) {
                const zoneKey = getAccidentZoneKey(lat, lng);
                const severity = parseInt(accident.Severity) || 1;
                const weight = severity;
                accidentsByZone.set(zoneKey, (accidentsByZone.get(zoneKey) || 0) + weight);
            }
        });
        
        console.log(`📍 Processed ${accidentsByZone.size} accident zones`);
        return true;
    } catch (error) {
        console.error('❌ Error loading Kaggle dataset:', error);
        return false;
    }
}

// Load vehicle history from Firebase
async function loadVehicleHistory() {
    try {
        const historyRef = ref(db, 'vehicle_history');
        const snapshot = await get(historyRef);
        
        if (snapshot.exists()) {
            return Object.values(snapshot.val());
        }
        return [];
    } catch (error) {
        console.error('❌ Error loading vehicle history:', error);
        return [];
    }
}

// Create and train model
async function trainModel() {
    console.log('🚀 Starting model training...');
    
    // Load datasets
    const kaggleLoaded = await loadKaggleDataset();
    const vehicleHistory = await loadVehicleHistory();
    
    if (vehicleHistory.length < 10) {
        console.warn('⚠️ Not enough vehicle history data. Generating synthetic data for training...');
    }
    
    // Create model (same architecture as app.js)
    const model = tf.sequential();
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
    
    // Prepare training data
    const xsData = [];
    const ysData = [];
    
    // Use vehicle history if available
    if (vehicleHistory.length >= 10) {
        vehicleHistory.forEach(entry => {
            const temp = Number(entry.temperature || 0);
            const hum = Number(entry.humidity || 0);
            const lat = parseFloat(entry.latitude || 0);
            const lon = parseFloat(entry.longitude || 0);
            
            if (temp > 0 && hum > 0 && !isNaN(lat) && !isNaN(lon)) {
                const accidentRisk = kaggleLoaded ? getAccidentRisk(lat, lon) : Math.random() * 0.5;
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
    }
    
    // Add synthetic data if not enough real data
    if (xsData.length < 100) {
        console.log('📊 Generating additional synthetic training data...');
        for (let i = 0; i < 500; i++) {
            const t = Math.random() * 100;
            const h = Math.random() * 100;
            const accidentRisk = kaggleLoaded ? (Math.random() * 0.8) : (Math.random() * 0.5);
            xsData.push([t / 100, h / 100, accidentRisk]);
            
            let risk = 0.1;
            if (t > 60 || h > 80) risk = 0.9;
            else if (t > 40 || h > 70) risk = 0.5;
            
            risk = Math.min(1.0, risk + accidentRisk * 0.4);
            ysData.push([risk]);
        }
    }
    
    console.log(`📊 Training with ${xsData.length} data points...`);
    
    // Train model
    const xs = tf.tensor2d(xsData);
    const ys = tf.tensor2d(ysData);
    
    await model.fit(xs, ys, {
        epochs: 10,
        batchSize: 32,
        validationSplit: 0.2,
        shuffle: true,
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                console.log(`Epoch ${epoch + 1}/10 - Loss: ${logs.loss.toFixed(4)}, Val Loss: ${logs.val_loss?.toFixed(4) || 'N/A'}`);
            }
        }
    });
    
    xs.dispose();
    ys.dispose();
    
    console.log('✅ Model training completed!');
    
    // Save model to IndexedDB
    try {
        await model.save('indexeddb://risk-prediction-model');
        console.log('💾 Model saved to IndexedDB successfully!');
        console.log('✅ You can now use the model in app.js without the dataset');
        
        // Also save accident zones to localStorage (for quick access)
        const zonesArray = Array.from(accidentsByZone.entries());
        localStorage.setItem('accidentZones', JSON.stringify(zonesArray));
        console.log('💾 Accident zones saved to localStorage');
        
        return true;
    } catch (error) {
        console.error('❌ Error saving model:', error);
        return false;
    }
}

// Export for use in HTML
export { trainModel };

