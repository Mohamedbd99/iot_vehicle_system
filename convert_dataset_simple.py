#!/usr/bin/env python3
"""
Script simple pour convertir le dataset - Version allégée
Prend seulement les colonnes nécessaires pour réduire la taille
"""

import pandas as pd
import json

# Chemin du fichier CSV
CSV_PATH = r"C:\Users\moham\Downloads\archive (1)\US_Accidents_March23.csv"
OUTPUT_PATH = "us_accidents_sample.json"

print("🔄 Converting dataset...")

try:
    # Lire seulement les colonnes nécessaires (beaucoup plus rapide)
    print("📖 Reading CSV (only necessary columns)...")
    df = pd.read_csv(CSV_PATH, usecols=['Start_Lat', 'Start_Lng', 'Severity', 'Start_Time'])
    
    print(f"✅ Loaded {len(df)} records")
    
    # Échantillonner pour réduire la taille
    if len(df) > 50000:
        print("📉 Sampling 50,000 records...")
        df = df.sample(n=50000, random_state=42)
    
    # Nettoyer
    df = df.dropna(subset=['Start_Lat', 'Start_Lng', 'Severity'])
    df = df[
        (df['Start_Lat'] >= 24) & (df['Start_Lat'] <= 50) &
        (df['Start_Lng'] >= -125) & (df['Start_Lng'] <= -66)
    ]
    
    print(f"✅ {len(df)} valid records after cleaning")
    
    # Convertir en JSON
    print("💾 Saving to JSON...")
    records = df.to_dict('records')
    
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(records, f)
    
    print(f"✅ Done! File saved: {OUTPUT_PATH}")
    print(f"📊 {len(records)} accident records ready for training")
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()

