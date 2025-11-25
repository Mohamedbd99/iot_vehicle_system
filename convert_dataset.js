// convert_dataset.js - Convert Kaggle CSV to JSON using Node.js (Streaming version)
// Usage: node convert_dataset.js

import fs from 'fs';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';

const CSV_PATH = "C:\\Users\\moham\\Downloads\\archive (1)\\US_Accidents_March23.csv";
const OUTPUT_PATH = "us_accidents_sample.json";
const SAMPLE_SIZE = 50000; // Sample size for training

console.log("🔄 Converting Kaggle US Accidents dataset...");
console.log(`📂 Input: ${CSV_PATH}`);
console.log(`📂 Output: ${OUTPUT_PATH}\n`);

try {
    console.log("📖 Reading CSV file (streaming - this may take a while)...");
    
    const records = [];
    let lineCount = 0;
    let validCount = 0;
    
    // Read CSV line by line (streaming) to handle large files
    const parser = createReadStream(CSV_PATH)
        .pipe(parse({
            columns: true,
            skip_empty_lines: true,
            relax_column_count: true
        }));
    
    console.log("📊 Processing records...");
    
    for await (const record of parser) {
        lineCount++;
        
        // Progress indicator
        if (lineCount % 100000 === 0) {
            console.log(`   Processed ${lineCount.toLocaleString()} lines, found ${validCount} valid records...`);
        }
        
        // Parse coordinates
        const lat = parseFloat(record.Start_Lat);
        const lng = parseFloat(record.Start_Lng);
        const severity = parseInt(record.Severity) || 1;
        
        // Validate coordinates (USA bounds)
        if (!isNaN(lat) && !isNaN(lng) &&
            lat >= 24 && lat <= 50 &&
            lng >= -125 && lng <= -66) {
            
            records.push({
                Start_Lat: lat,
                Start_Lng: lng,
                Severity: severity,
                Start_Time: record.Start_Time || new Date().toISOString()
            });
            
            validCount++;
            
            // Stop when we have enough samples
            if (validCount >= SAMPLE_SIZE) {
                console.log(`\n✅ Collected ${SAMPLE_SIZE} valid records, stopping...`);
                break;
            }
        }
    }
    
    console.log(`\n✅ Processing complete!`);
    console.log(`📊 Total lines processed: ${lineCount.toLocaleString()}`);
    console.log(`✅ Valid records: ${records.length}`);
    
    // Randomize order
    console.log("🔀 Randomizing order...");
    for (let i = records.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [records[i], records[j]] = [records[j], records[i]];
    }
    
    // Save to JSON
    console.log("💾 Saving to JSON...");
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(records, null, 2), 'utf-8');
    
    const fileSize = fs.statSync(OUTPUT_PATH).size / (1024 * 1024);
    console.log(`\n✅ Conversion complete!`);
    console.log(`📁 Output file: ${OUTPUT_PATH}`);
    console.log(`📊 Records: ${records.length.toLocaleString()}`);
    console.log(`💾 File size: ${fileSize.toFixed(2)} MB`);
    console.log(`\n🎯 Next steps:`);
    console.log(`   1. Open train-model.html in your browser`);
    console.log(`   2. Click 'Start Training'`);
    console.log(`   3. Wait for training to complete`);
    console.log(`   4. The model will be saved and ready to use!`);
    
} catch (error) {
    console.error("❌ Error:", error.message);
    if (error.code === 'ENOENT') {
        console.error(`\n   File not found: ${CSV_PATH}`);
        console.error(`   Please check the path and update it in convert_dataset.js`);
    } else {
        console.error(error.stack);
    }
}

