// analyze-model.js - Analyze trained model and suggest improvements
// Run in browser console or as a script

async function analyzeModelPerformance() {
    console.log('🔍 Starting Model Analysis...\n');
    
    // Load model
    let model;
    try {
        model = await tf.loadLayersModel('indexeddb://risk-prediction-model');
        console.log('✅ Model loaded');
    } catch (error) {
        console.error('❌ Model not found:', error);
        return;
    }
    
    // Load accident zones
    let accidentsByZone = new Map();
    const savedZones = localStorage.getItem('accidentZones');
    if (savedZones) {
        const zonesArray = JSON.parse(savedZones);
        accidentsByZone = new Map(zonesArray);
        console.log(`✅ Loaded ${accidentsByZone.size} accident zones`);
    }
    
    if (accidentsByZone.size === 0) {
        console.error('❌ No accident zones found');
        return;
    }
    
    // Test predictions
    const testCases = [
        // High accident zones with normal conditions
        { temp: 25, hum: 50, lat: 40.75, lon: -74.00, desc: 'NYC Area' },
        { temp: 25, hum: 50, lat: 34.05, lon: -118.25, desc: 'LA Area' },
        { temp: 25, hum: 50, lat: 29.76, lon: -95.37, desc: 'Houston Area' },
        
        // High accident zones with extreme conditions
        { temp: 60, hum: 80, lat: 40.75, lon: -74.00, desc: 'NYC Area (Hot)' },
        { temp: 10, hum: 30, lat: 40.75, lon: -74.00, desc: 'NYC Area (Cold)' },
        
        // Low accident zones
        { temp: 25, hum: 50, lat: 35.0, lon: -100.0, desc: 'Rural Area' },
        { temp: 25, hum: 50, lat: 45.0, lon: -90.0, desc: 'Low Traffic Area' },
    ];
    
    console.log('\n📊 Testing Model Predictions:\n');
    
    function getAccidentRiskRaw(lat, lon) {
        const zoneLat = Math.round(lat * 100) / 100;
        const zoneLon = Math.round(lon * 100) / 100;
        const zoneKey = `${zoneLat.toFixed(2)},${zoneLon.toFixed(2)}`;
        const accidentCount = accidentsByZone.get(zoneKey) || 0;
        if (accidentCount === 0) return 0;
        const maxCount = Math.max(...Array.from(accidentsByZone.values()), 1);
        return Math.min(accidentCount / maxCount, 1.0);
    }
    
    async function predictRisk(temp, hum, lat, lon) {
        const accidentRisk = getAccidentRiskRaw(lat, lon);
        const input = tf.tensor2d([[temp / 100, hum / 100, accidentRisk]]);
        const prediction = model.predict(input);
        const riskVal = (await prediction.data())[0];
        input.dispose();
        prediction.dispose();
        return riskVal;
    }
    
    const results = [];
    for (const test of testCases) {
        const accidentRisk = getAccidentRiskRaw(test.lat, test.lon);
        const predictedRisk = await predictRisk(test.temp, test.hum, test.lat, test.lon);
        
        results.push({
            ...test,
            accidentRisk,
            predictedRisk
        });
        
        console.log(`${test.desc}:`);
        console.log(`  Input: Temp=${test.temp}°C, Hum=${test.hum}%, AccidentRisk=${(accidentRisk * 100).toFixed(1)}%`);
        console.log(`  Output: Risk=${(predictedRisk * 100).toFixed(1)}%`);
        console.log(`  Expected: ${accidentRisk > 0.3 ? 'HIGH' : 'LOW'} risk zone`);
        console.log(`  Model says: ${predictedRisk > 0.4 ? 'HIGH' : predictedRisk > 0.2 ? 'MEDIUM' : 'LOW'} risk`);
        console.log('');
    }
    
    // Analyze all zones
    console.log('\n📈 Analyzing All Zones:\n');
    const allZones = Array.from(accidentsByZone.entries());
    const sampleSize = Math.min(200, allZones.length);
    const zoneRisks = [];
    
    for (let i = 0; i < sampleSize; i++) {
        const [zoneKey, accidentCount] = allZones[i];
        const [lat, lon] = zoneKey.split(',').map(Number);
        const accidentRisk = getAccidentRiskRaw(lat, lon);
        const predictedRisk = await predictRisk(25, 50, lat, lon);
        
        zoneRisks.push({
            zoneKey,
            lat,
            lon,
            accidentCount,
            accidentRisk,
            predictedRisk
        });
    }
    
    zoneRisks.sort((a, b) => b.predictedRisk - a.predictedRisk);
    
    const stats = {
        total: zoneRisks.length,
        highRisk: zoneRisks.filter(z => z.predictedRisk >= 0.6).length,
        mediumRisk: zoneRisks.filter(z => z.predictedRisk >= 0.3 && z.predictedRisk < 0.6).length,
        lowRisk: zoneRisks.filter(z => z.predictedRisk < 0.3).length,
        maxRisk: Math.max(...zoneRisks.map(z => z.predictedRisk)),
        minRisk: Math.min(...zoneRisks.map(z => z.predictedRisk)),
        avgRisk: zoneRisks.reduce((sum, z) => sum + z.predictedRisk, 0) / zoneRisks.length
    };
    
    console.log('Statistics:');
    console.log(`  Total zones analyzed: ${stats.total}`);
    console.log(`  High risk (≥60%): ${stats.highRisk}`);
    console.log(`  Medium risk (30-60%): ${stats.mediumRisk}`);
    console.log(`  Low risk (<30%): ${stats.lowRisk}`);
    console.log(`  Max risk: ${(stats.maxRisk * 100).toFixed(1)}%`);
    console.log(`  Min risk: ${(stats.minRisk * 100).toFixed(1)}%`);
    console.log(`  Avg risk: ${(stats.avgRisk * 100).toFixed(1)}%`);
    
    // Top 10 zones
    console.log('\n🔝 Top 10 Highest Risk Zones:');
    zoneRisks.slice(0, 10).forEach((zone, i) => {
        console.log(`  ${i + 1}. ${zone.zoneKey}: ${(zone.predictedRisk * 100).toFixed(1)}% (${zone.accidentCount.toFixed(0)} accidents)`);
    });
    
    // Suggestions
    console.log('\n💡 Suggestions:');
    
    if (stats.highRisk < 5) {
        console.log('  ⚠️ Very few high-risk zones. Consider:');
        console.log('     - Lowering the threshold to 0.4 or 0.3');
        console.log('     - Using percentile-based selection (top 10-20%)');
        console.log('     - Retraining with more emphasis on accident data');
    }
    
    if (stats.maxRisk < 0.5) {
        console.log('  ⚠️ Maximum risk is low. Model may be too conservative.');
        console.log('     - Check if model is properly trained');
        console.log('     - Verify accident data is being used correctly');
    }
    
    if (zoneRisks.filter(z => z.accidentCount > 10 && z.predictedRisk < 0.3).length > 5) {
        console.log('  ⚠️ Many high-accident zones have low risk predictions.');
        console.log('     - Model may not be learning accident patterns');
        console.log('     - Consider retraining with more epochs');
    }
    
    console.log('  ✅ Use proximity boost to prioritize zones near vehicle');
    console.log('  ✅ Consider dynamic thresholds based on vehicle location');
    
    return { results, zoneRisks, stats };
}

// Make available globally
window.analyzeModelPerformance = analyzeModelPerformance;

console.log('📊 Model Analysis Tool Loaded');
console.log('Run: analyzeModelPerformance()');

