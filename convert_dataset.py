#!/usr/bin/env python3
"""
Script pour convertir le dataset Kaggle US Accidents CSV en JSON
Usage: python convert_dataset.py
"""

import pandas as pd
import json
import os

# Chemin du fichier CSV
CSV_PATH = r"C:\Users\moham\Downloads\archive (1)\US_Accidents_March23.csv"
OUTPUT_PATH = "us_accidents_sample.json"

print("🔄 Converting Kaggle US Accidents dataset...")
print(f"📂 Input: {CSV_PATH}")
print(f"📂 Output: {OUTPUT_PATH}\n")

try:
    # Lire le CSV (peut être très volumineux)
    print("📖 Reading CSV file (this may take a while for large files)...")
    df = pd.read_csv(CSV_PATH)
    
    print(f"✅ Loaded {len(df)} accident records")
    print(f"📊 Columns: {list(df.columns[:10])}...")  # Show first 10 columns
    
    # Prendre un échantillon pour réduire la taille (optionnel mais recommandé)
    # Le dataset complet peut être très volumineux (>2GB)
    SAMPLE_SIZE = 50000  # 50k accidents pour l'entraînement
    
    if len(df) > SAMPLE_SIZE:
        print(f"\n📉 Sampling {SAMPLE_SIZE} records from {len(df)} total records...")
        df_sample = df.sample(n=SAMPLE_SIZE, random_state=42)
    else:
        df_sample = df
        print(f"\n✅ Using all {len(df)} records")
    
    # Sélectionner les colonnes importantes
    required_columns = ['Start_Lat', 'Start_Lng', 'Severity']
    optional_columns = ['Start_Time', 'Temperature(F)', 'Humidity(%)', 'Visibility(mi)', 'Weather_Condition']
    
    # Vérifier quelles colonnes existent
    available_cols = [col for col in required_columns + optional_columns if col in df_sample.columns]
    df_clean = df_sample[available_cols].copy()
    
    # Nettoyer les données
    print("\n🧹 Cleaning data...")
    # Supprimer les lignes avec coordonnées invalides
    df_clean = df_clean.dropna(subset=['Start_Lat', 'Start_Lng'])
    # Filtrer les coordonnées valides (USA: lat 24-50, lon -125 à -66)
    df_clean = df_clean[
        (df_clean['Start_Lat'] >= 24) & (df_clean['Start_Lat'] <= 50) &
        (df_clean['Start_Lng'] >= -125) & (df_clean['Start_Lng'] <= -66)
    ]
    
    print(f"✅ Cleaned data: {len(df_clean)} valid records")
    
    # Convertir en format JSON
    print("\n💾 Converting to JSON...")
    records = df_clean.to_dict('records')
    
    # Sauvegarder en JSON
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(records, f, indent=2, ensure_ascii=False)
    
    file_size = os.path.getsize(OUTPUT_PATH) / (1024 * 1024)  # MB
    print(f"\n✅ Conversion complete!")
    print(f"📁 Output file: {OUTPUT_PATH}")
    print(f"📊 Records: {len(records)}")
    print(f"💾 File size: {file_size:.2f} MB")
    print(f"\n🎯 Next steps:")
    print(f"   1. Open train-model.html in your browser")
    print(f"   2. Click 'Start Training'")
    print(f"   3. Wait for training to complete")
    print(f"   4. The model will be saved and ready to use!")
    
except FileNotFoundError:
    print(f"❌ Error: File not found at {CSV_PATH}")
    print(f"   Please check the path and try again")
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()

