# 🚗 Système IoT Véhicule - Tableau de Bord Mobilité Connectée

Un système complet de surveillance IoT de véhicules en temps réel avec prédiction de risques basée sur l'apprentissage automatique, suivi GPS et analyses avancées.

---

## 📋 Table des Matières

- [Démarrage Rapide](#-démarrage-rapide)
- [Fonctionnalités](#-fonctionnalités)
- [Installation](#-installation)
- [Lancer le Projet](#-lancer-le-projet)
- [Optionnel : Réentraîner le Modèle ML](#-optionnel--réentraîner-le-modèle-ml)
- [Structure du Projet](#-structure-du-projet)
- [Détails Techniques](#-détails-techniques)

---

## 🚀 Démarrage Rapide

### Prérequis
- Node.js (v14 ou supérieur)
- npm ou yarn
- Un navigateur web moderne
- Projet Firebase configuré

### Installation

1. **Cloner ou télécharger le projet**
   ```bash
   cd iot_vehicle_system
   ```

2. **Installer les dépendances**
   ```bash
   npm install
   ```

3. **Configurer Firebase** (si pas déjà fait) (pas besoin d'utiliser le mien)
   - Mettre à jour la configuration Firebase dans `app.js` avec vos identifiants Firebase
   - S'assurer que Firebase Realtime Database est activé

4. **Démarrer le serveur web** (dans un terminal)
   ```bash
   npx http-server -p 3000
   ```
   Ou utiliser n'importe quel serveur de fichiers statiques :
   ```bash
   python -m http.server 3000
   # ou
   php -S localhost:3000
   ```

5. **Démarrer le simulateur** (dans un terminal séparé)
   ```bash
   npm run simulator
   ```
   Ou :
   ```bash
   node simulator.js
   ```

6. **Ouvrir le tableau de bord**
   - Naviguer vers `http://localhost:3000` dans votre navigateur
   - Le tableau de bord chargera automatiquement le modèle ML pré-entraîné depuis IndexedDB

---

## ✨ Fonctionnalités

### 🎯 Fonctionnalités Principales

#### 1. **Tableau de Bord Temps Réel** (`index.html`)
- **Données de Capteurs en Direct** : Surveillance en temps réel de la température et de l'humidité
- **Suivi GPS** : Carte interactive affichant l'emplacement du véhicule avec Leaflet
- **Score de Risque** : Prédiction de risque basée sur ML (échelle 0-1) mise à jour en temps réel
- **Statut du Système** : Indicateurs visuels (LEDs) pour l'état de santé du système :
  - 🔴 **LED Rouge** : Conditions critiques (temp > 60°C, humidité > 80%, ou en zone dangereuse)
  - 🟠 **LED Orange** : Conditions d'avertissement (temp > 40°C ou humidité > 70%)
  - 🔵 **LED Bleue** : Conditions de fonctionnement normales
- **Jauges Interactives** : Jauges visuelles de température et d'humidité (plage 0-100°C)
- **Système d'Alerte** : Alertes en temps réel avec messages contextuels
- **Panneau de Statistiques** : 
  - Température et humidité moyennes
  - Score de risque actuel
  - Nombre total d'incidents
- **Graphiques Temporels** : 
  - Graphique d'évolution de la température
  - Graphique d'évolution de l'humidité
  - Graphique d'évolution du score de risque
  - Filtrable par plage horaire (Dernière heure, 6 dernières heures, 24 dernières heures, Toutes les données)

#### 2. **Détection de Zones Dangereuses**
- **Identification de Zones Basée sur ML** : Réseau de neurones identifie les zones à haut risque à partir du dataset Kaggle US Accidents
- **Affichage Dynamique de Zones** : Affiche jusqu'à 40 zones à haut risque sur la carte
- **Amélioration du Risque Basée sur la Proximité** : Les zones proches ont la priorité dans le calcul du risque
- **Marqueurs Visuels** : Marqueurs codés par couleur sur la carte :
  - 🔴 Zones à haut risque (≥60% de risque)
  - 🟠 Zones à risque moyen (30-60% de risque)
  - 🟡 Zones à faible risque (<30% de risque)
- **Liste de Zones** : Affiche les zones dangereuses principales avec coordonnées et niveaux de risque

#### 3. **Historique des Données** (`history.html`)
- **Données Historiques Complètes** : Visualiser toutes les données de véhicule enregistrées
- **Pagination** : Navigation efficace de grands ensembles de données
- **Filtrage Date/Heure** : Filtrer par plages de dates spécifiques
- **Vue Tableau** : Affichage tabulaire détaillé avec :
  - Horodatage
  - Température
  - Humidité
  - Coordonnées GPS (latitude/longitude)
  - Statut du système (NORMAL/WARNING/CRITICAL)

#### 4. **Paramètres** (`settings.html`)
- **Gestion des Thèmes** : 
  - Mode clair
  - Mode sombre
  - Préférence système (auto)
- **Persistance du Thème** : Sauvegarde la préférence dans localStorage
- **Design Responsive** : Fonctionne sur ordinateur et mobile

#### 5. **Modèle d'Apprentissage Automatique**
- **Modèle Pré-entraîné** : Charge automatiquement depuis IndexedDB au démarrage
- **TensorFlow.js** : Réseau de neurones côté client (3 couches : 8→4→1 neurones)
- **Caractéristiques d'Entrée** : 
  - Température normalisée (0-1)
  - Humidité normalisée (0-1)
  - Risque d'accident du dataset Kaggle (basé sur les zones)
- **Prédiction en Temps Réel** : Score de risque calculé pour chaque point de données
- **Persistance du Modèle** : Sauvegarde le modèle entraîné dans IndexedDB du navigateur

#### 6. **Simulateur de Véhicule** (`simulator.js`)
- **Mouvement GPS Réaliste** : Simule le mouvement du véhicule entre les zones dangereuses
- **Navigation Intelligente** : 
  - Se déplace d'une zone dangereuse vers la zone non visitée la plus proche
  - Ignore les zones récemment visitées (suit les 3 dernières visitées)
  - Machine à états : approche → départ → voyage
- **Chargement Dynamique de Zones** : Charge les zones dangereuses depuis `us_accidents_sample.json`
- **Calcul du Score de Risque** : Simule la prédiction de risque du modèle ML
- **Calcul du Statut** : Dérive le statut (CRITICAL/WARNING/NORMAL) du score de risque
- **Envoi de Données** : Envoie les données à Firebase toutes les 2 secondes
- **Journalisation Console** : Logs détaillés avec indicateurs emoji (⚠️ 🟡 ✅)

---

## 🛠️ Lancer le Projet

### Workflow Standard (Avec Modèle Pré-entraîné)

1. **Démarrer le simulateur** (Terminal 1) :
   ```bash
   npm run simulator
   ```
   Vous devriez voir :
   ```
   🚀 Starting IoT Vehicle Simulator...
   📡 Connected to Firebase: [votre-projet]
   ⏱️  Pushing data every 2 seconds...
   [HH:MM:SS] Data Pushed: Temp=XX°C, Hum=XX%, Risk=0.XX, Status=XXX
   ```

2. **Démarrer le serveur web** (Terminal 2) :
   ```bash
   npx http-server -p 3000
   ```

3. **Ouvrir le tableau de bord** :
   - Naviguer vers `http://localhost:3000`
   - Le modèle se chargera automatiquement depuis IndexedDB
   - Les données en temps réel apparaîtront sur le tableau de bord

### Arrêter les Services

- **Simulateur** : Appuyer sur `Ctrl+C` dans le Terminal 1
- **Serveur Web** : Appuyer sur `Ctrl+C` dans le Terminal 2

---

## 🔄 Optionnel : Réentraîner le Modèle ML

Si vous souhaitez supprimer le modèle existant et le réentraîner avec de nouvelles données :

### Étape 1 : Supprimer le Modèle Existant

**Option A : Utiliser l'Outil de Débogage** (Recommandé)
1. Ouvrir `debug-model.html` dans votre navigateur
2. Cliquer sur le bouton **"Clear Model"**
3. Confirmer la suppression

**Option B : Suppression Manuelle**
1. Ouvrir les DevTools du navigateur (F12)
2. Aller dans l'onglet **Application** → **IndexedDB**
3. Trouver la base de données `tensorflowjs_models`
4. Supprimer l'entrée du modèle

### Étape 2 : Entraîner le Modèle

1. **Ouvrir la page d'entraînement** :
   ```
   http://localhost:3000/train-model.html
   ```

2. **Cliquer sur "Start Training"** :
   - Le modèle s'entraînera en utilisant `us_accidents_sample.json`
   - L'entraînement utilise 50 000 échantillons d'accidents du dataset Kaggle
   - La progression sera affichée en temps réel
   - Le modèle sera sauvegardé dans IndexedDB automatiquement

3. **Attendre la fin** :
   - L'entraînement prend généralement 1-3 minutes
   - Vous verrez les valeurs de perte diminuer
   - Le statut affichera "Training complete!"

### Étape 3 : Analyser le Modèle

1. **Ouvrir l'outil de débogage** :
   ```
   http://localhost:3000/debug-model.html
   ```

2. **Cliquer sur "Analyze Model"** :
   - Affiche les statistiques du modèle
   - Affiche les zones à haut risque identifiées
   - Montre la distribution des zones (risque élevé/moyen/faible)
   - Carte interactive avec toutes les zones dangereuses

3. **Examiner les résultats** :
   - Vérifier combien de zones ont été identifiées
   - Vérifier que la distribution des zones est logique
   - Exporter les données si nécessaire (format JSON)

### Étape 4 : Démarrer le Système

1. **Démarrer le simulateur** :
   ```bash
   npm run simulator
   ```

2. **Démarrer le serveur web** (si pas déjà en cours d'exécution) :
   ```bash
   npx http-server -p 3000
   ```

3. **Ouvrir le tableau de bord** :
   - Le modèle nouvellement entraîné se chargera automatiquement
   - Les prédictions de risque utiliseront le nouveau modèle

---

## 📁 Structure du Projet

```
iot_vehicle_system/
│
├── 📄 index.html              # Page principale du tableau de bord
├── 📄 history.html            # Visualiseur de données historiques
├── 📄 settings.html           # Paramètres et gestion des thèmes
├── 📄 train-model.html        # Interface d'entraînement du modèle ML
├── 📄 debug-model.html        # Outil d'analyse et de débogage du modèle
│
├── 📜 app.js                  # Logique principale de l'application
├── 📜 simulator.js            # Simulateur de données véhicule (Node.js)
├── 📜 history.js              # Logique de la page historique
├── 📜 settings.js             # Logique de la page paramètres
├── 📜 train-model.js          # Logique d'entraînement du modèle
├── 📜 theme-init.js           # Initialisation des thèmes
│
├── 🎨 style.css               # Feuille de style principale
├── 🎨 themes.css              # Définitions des thèmes (clair/sombre)
├── 🎨 pagination.css          # Styles de pagination
│
├── 📊 us_accidents_sample.json # Dataset Kaggle (50k échantillons)
├── 📦 package.json            # Dépendances Node.js
│
├── 📚 README.md               # Documentation en anglais
└── 📚 README_FR.md            # Documentation en français
```

---

## 🔧 Détails Techniques

### Pile Technologique

- **Frontend** :
  - JavaScript Vanilla (ES6+)
  - TensorFlow.js (v4.15.0) - Apprentissage automatique
  - Leaflet.js - Cartes interactives
  - Chart.js - Visualisation de données
  - Font Awesome - Icônes
  - Firebase Realtime Database - Stockage de données

- **Backend** :
  - Node.js - Runtime du simulateur
  - Firebase Admin SDK - Opérations de base de données
  - csv-parse - Traitement de fichiers CSV

### Flux de Données

1. **Simulateur** (`simulator.js`) :
   - Génère des données de capteurs réalistes (temp, humidité, GPS)
   - Calcule le score de risque en utilisant la logique du modèle ML
   - Envoie les données à Firebase toutes les 2 secondes

2. **Tableau de Bord** (`app.js`) :
   - Écoute Firebase pour les mises à jour en temps réel
   - Charge le modèle ML depuis IndexedDB
   - Calcule les prédictions de risque en temps réel
   - Met à jour l'interface avec les dernières données
   - Affiche les zones dangereuses sur la carte

3. **Modèle ML** :
   - Entrée : `[temperature/100, humidity/100, accident_risk]`
   - Architecture : Réseau de neurones à 3 couches (8→4→1 neurones)
   - Sortie : Score de risque (0-1)
   - Optimiseur : Adam
   - Perte : Erreur Quadratique Moyenne

### Schéma Firebase

```javascript
vehicle_history/
  └── {autoId}/
      ├── temperature: Number
      ├── humidity: Number
      ├── latitude: String
      ├── longitude: String
      ├── altitude: Number
      ├── timestamp: String (format ISO)
      ├── status: String ("NORMAL" | "WARNING" | "CRITICAL")
      └── riskScore: Number (0-1)
```

### Stockage du Modèle

- **Emplacement** : IndexedDB du navigateur
- **Base de données** : `tensorflowjs_models`
- **Clé** : Métadonnées et poids du modèle
- **Persistance** : Survit aux redémarrages du navigateur
- **Taille** : ~50-100 KB (compressé)

### Calcul du Score de Risque

Le score de risque combine :
1. **Température** (poids : 30%) : Normalisée 0-100°C → 0-1
2. **Humidité** (poids : 30%) : Normalisée 0-100% → 0-1
3. **Risque de Zone** (poids : 40%) : Du dataset d'accidents Kaggle
   - Vérifie si la position GPS actuelle est dans une zone à haut risque
   - Utilise un renforcement basé sur la proximité pour les zones proches

**Score Final** : Moyenne pondérée de tous les facteurs (échelle 0-1)

### Dérivation du Statut

- **CRITICAL** (Rouge) : `riskScore >= 0.7`
- **WARNING** (Orange) : `riskScore >= 0.4`
- **NORMAL** (Bleu) : `riskScore < 0.4`

---

## 🐛 Dépannage

### Modèle Ne Charge Pas

**Problème** : Le tableau de bord affiche "Model not loaded" ou le score de risque est 0

**Solutions** :
1. Vérifier la console du navigateur pour les erreurs
2. Vérifier que IndexedDB est activé dans le navigateur
3. Réentraîner le modèle en utilisant `train-model.html`
4. Vider le cache du navigateur et recharger

### Le Simulateur N'Envoie Pas de Données

**Problème** : Aucune donnée n'apparaît sur le tableau de bord

**Solutions** :
1. Vérifier que le simulateur fonctionne (`npm run simulator`)
2. Vérifier la connexion Firebase dans la console du simulateur
3. Vérifier les identifiants Firebase dans `simulator.js`
4. Vérifier les règles Firebase Realtime Database (doivent autoriser lecture/écriture)

### Les Zones Dangereuses N'Apparaissent Pas

**Problème** : Aucune zone affichée sur la carte

**Solutions** :
1. S'assurer que `us_accidents_sample.json` existe à la racine du projet
2. Vérifier la console du navigateur pour les erreurs de chargement
3. Attendre quelques secondes pour que le modèle analyse les zones
4. Utiliser `debug-model.html` pour vérifier que le modèle identifie les zones

### Les Graphiques Ne Se Mettent Pas à Jour

**Problème** : Les graphiques n'affichent aucune donnée ou sont vides

**Solutions** :
1. S'assurer que le simulateur fonctionne et envoie des données
2. Vérifier le sélecteur de plage horaire (par défaut "Dernière heure")
3. Attendre au moins 2-3 points de données avant que les graphiques n'apparaissent
4. Actualiser la page

---

## 📝 Notes

- Le modèle pré-entraîné est stocké dans IndexedDB du navigateur et se charge automatiquement
- Le simulateur doit fonctionner en continu pour envoyer des données à Firebase
- Le tableau de bord fonctionne mieux avec Chrome, Firefox ou Edge (navigateurs modernes)
- Le modèle ML est entraîné une fois et réutilisé - pas besoin de réentraînement sauf si vous souhaitez le mettre à jour
- Le fichier `us_accidents_sample.json` n'est nécessaire que pour l'entraînement, pas pour l'exécution

---

## 📄 Licence

ISC

---

## 👤 Auteur

Mohamedbd99

---

**Profitez de la surveillance de votre système IoT véhicule ! 🚗📊**

