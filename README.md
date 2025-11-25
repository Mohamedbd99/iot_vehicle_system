# 🚗 IoT Vehicle System - Connected Mobility Dashboard

A comprehensive real-time IoT vehicle monitoring system with machine learning-based risk prediction, GPS tracking, and advanced analytics.

---

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [Features](#-features)
- [Installation](#-installation)
- [Running the Project](#-running-the-project)
- [Optional: Retrain the ML Model](#-optional-retrain-the-ml-model)
- [Project Structure](#-project-structure)
- [Technical Details](#-technical-details)

---

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- A modern web browser
- Firebase project configured

### Installation

1. **Clone or download the project**
   ```bash
   cd iot_vehicle_system
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Firebase** (if not already done) (no need to use mine)
   - Update Firebase configuration in `app.js` with your Firebase credentials
   - Ensure Firebase Realtime Database is enabled

4. **Start the web server** (in a terminal)
   ```bash
   npx http-server -p 3000
   ```
   Or use any static file server:
   ```bash
   python -m http.server 3000
   # or
   php -S localhost:3000
   ```

5. **Start the simulator** (in a separate terminal)
   ```bash
   npm run simulator
   ```
   Or:
   ```bash
   node simulator.js
   ```

6. **Open the dashboard**
   - Navigate to `http://localhost:3000` in your browser
   - The dashboard will automatically load the pre-trained ML model from IndexedDB

---

## ✨ Features

### 🎯 Core Features

#### 1. **Real-Time Dashboard** (`index.html`)
- **Live Sensor Data**: Real-time temperature and humidity monitoring
- **GPS Tracking**: Interactive map showing vehicle location with Leaflet
- **Risk Score**: ML-powered risk prediction (0-1 scale) updated in real-time
- **System Status**: Visual indicators (LEDs) for system health:
  - 🔴 **Red LED**: Critical conditions (temp > 60°C, humidity > 80%, or in danger zone)
  - 🟠 **Orange LED**: Warning conditions (temp > 40°C or humidity > 70%)
  - 🔵 **Blue LED**: Normal operating conditions
- **Interactive Gauges**: Visual temperature and humidity gauges (0-100°C range)
- **Alert System**: Real-time alerts with contextual messages
- **Statistics Panel**: 
  - Average temperature and humidity
  - Current risk score
  - Total incident count
- **Time-Series Charts**: 
  - Temperature evolution chart
  - Humidity evolution chart
  - Risk score evolution chart
  - Filterable by time range (Last hour, Last 6 hours, Last 24 hours, All time)

#### 2. **Danger Zone Detection**
- **ML-Based Zone Identification**: Neural network identifies high-risk zones from Kaggle US Accidents dataset
- **Dynamic Zone Display**: Shows up to 40 high-risk zones on the map
- **Proximity-Based Risk Boosting**: Nearby zones get priority in risk calculation
- **Visual Markers**: Color-coded markers on map:
  - 🔴 High risk zones (≥60% risk)
  - 🟠 Medium risk zones (30-60% risk)
  - 🟡 Low risk zones (<30% risk)
- **Zone List**: Displays top dangerous zones with coordinates and risk levels

#### 3. **Data History** (`history.html`)
- **Complete Historical Data**: View all recorded vehicle data
- **Pagination**: Efficient browsing of large datasets
- **Date/Time Filtering**: Filter by specific date ranges
- **Table View**: Detailed tabular display with:
  - Timestamp
  - Temperature
  - Humidity
  - GPS coordinates (latitude/longitude)
  - System status (NORMAL/WARNING/CRITICAL)

#### 4. **Settings** (`settings.html`)
- **Theme Management**: 
  - Light mode
  - Dark mode
  - System preference (auto)
- **Theme Persistence**: Saves preference to localStorage
- **Responsive Design**: Works on desktop and mobile

#### 5. **Machine Learning Model**
- **Pre-trained Model**: Loads automatically from IndexedDB on startup
- **TensorFlow.js**: Client-side neural network (3 layers: 8→4→1 neurons)
- **Input Features**: 
  - Normalized temperature (0-1)
  - Normalized humidity (0-1)
  - Accident risk from Kaggle dataset (zone-based)
- **Real-time Prediction**: Risk score calculated for every data point
- **Model Persistence**: Saves trained model to browser IndexedDB

#### 6. **Vehicle Simulator** (`simulator.js`)
- **Realistic GPS Movement**: Simulates vehicle movement between danger zones
- **Smart Navigation**: 
  - Moves from one danger zone to the nearest unvisited zone
  - Skips recently visited zones (tracks last 3 visited)
  - State machine: approaching → leaving → traveling
- **Dynamic Zone Loading**: Loads danger zones from `us_accidents_sample.json`
- **Risk Score Calculation**: Simulates ML model risk prediction
- **Status Calculation**: Derives status (CRITICAL/WARNING/NORMAL) from risk score
- **Data Push**: Sends data to Firebase every 2 seconds
- **Console Logging**: Detailed logs with emoji indicators (⚠️ 🟡 ✅)

---

## 🛠️ Running the Project

### Standard Workflow (With Pre-trained Model)

1. **Start the simulator** (Terminal 1):
   ```bash
   npm run simulator
   ```
   You should see:
   ```
   🚀 Starting IoT Vehicle Simulator...
   📡 Connected to Firebase: [your-project]
   ⏱️  Pushing data every 2 seconds...
   [HH:MM:SS] Data Pushed: Temp=XX°C, Hum=XX%, Risk=0.XX, Status=XXX
   ```

2. **Start the web server** (Terminal 2):
   ```bash
   npx http-server -p 3000
   ```

3. **Open the dashboard**:
   - Navigate to `http://localhost:3000`
   - The model will load automatically from IndexedDB
   - Real-time data will appear on the dashboard

### Stopping the Services

- **Simulator**: Press `Ctrl+C` in Terminal 1
- **Web Server**: Press `Ctrl+C` in Terminal 2

---

## 🔄 Optional: Retrain the ML Model

If you want to delete the existing model and retrain it with fresh data:

### Step 1: Delete the Existing Model

**Option A: Using the Debug Tool** (Recommended)
1. Open `debug-model.html` in your browser
2. Click **"Clear Model"** button
3. Confirm the deletion

**Option B: Manual Deletion**
1. Open browser DevTools (F12)
2. Go to **Application** tab → **IndexedDB**
3. Find `tensorflowjs_models` database
4. Delete the model entry

### Step 2: Train the Model

1. **Open the training page**:
   ```
   http://localhost:3000/train-model.html
   ```

2. **Click "Start Training"**:
   - The model will train using `us_accidents_sample.json`
   - Training uses 50,000 accident samples from Kaggle dataset
   - Progress will be displayed in real-time
   - Model will be saved to IndexedDB automatically

3. **Wait for completion**:
   - Training typically takes 1-3 minutes
   - You'll see loss values decreasing
   - Status will show "Training complete!"

### Step 3: Analyze the Model

1. **Open the debug tool**:
   ```
   http://localhost:3000/debug-model.html
   ```

2. **Click "Analyze Model"**:
   - Shows model statistics
   - Displays identified high-risk zones
   - Shows zone distribution (high/medium/low risk)
   - Interactive map with all danger zones

3. **Review the results**:
   - Check how many zones were identified
   - Verify zone distribution makes sense
   - Export data if needed (JSON format)

### Step 4: Start the System

1. **Start the simulator**:
   ```bash
   npm run simulator
   ```

2. **Start the web server** (if not already running):
   ```bash
   npx http-server -p 3000
   ```

3. **Open the dashboard**:
   - The newly trained model will load automatically
   - Risk predictions will use the new model

---

## 📁 Project Structure

```
iot_vehicle_system/
│
├── 📄 index.html              # Main dashboard page
├── 📄 history.html            # Historical data viewer
├── 📄 settings.html           # Settings and theme management
├── 📄 train-model.html        # ML model training interface
├── 📄 debug-model.html        # Model analysis and debugging tool
│
├── 📜 app.js                  # Main application logic
├── 📜 simulator.js             # Vehicle data simulator (Node.js)
├── 📜 history.js              # History page logic
├── 📜 settings.js             # Settings page logic
├── 📜 train-model.js          # Model training logic
├── 📜 theme-init.js           # Theme initialization
│
├── 🎨 style.css               # Main stylesheet
├── 🎨 themes.css              # Theme definitions (light/dark)
├── 🎨 pagination.css          # Pagination styles
│
├── 📊 us_accidents_sample.json # Kaggle dataset (50k samples)
├── 📦 package.json            # Node.js dependencies
│
└── 📚 README.md               # This file
```

---

## 🔧 Technical Details

### Technology Stack

- **Frontend**:
  - Vanilla JavaScript (ES6+)
  - TensorFlow.js (v4.15.0) - Machine learning
  - Leaflet.js - Interactive maps
  - Chart.js - Data visualization
  - Font Awesome - Icons
  - Firebase Realtime Database - Data storage

- **Backend**:
  - Node.js - Simulator runtime
  - Firebase Admin SDK - Database operations
  - csv-parse - CSV file processing

### Data Flow

1. **Simulator** (`simulator.js`):
   - Generates realistic sensor data (temp, humidity, GPS)
   - Calculates risk score using ML model logic
   - Pushes data to Firebase every 2 seconds

2. **Dashboard** (`app.js`):
   - Listens to Firebase for real-time updates
   - Loads ML model from IndexedDB
   - Calculates risk predictions in real-time
   - Updates UI with latest data
   - Displays danger zones on map

3. **ML Model**:
   - Input: `[temperature/100, humidity/100, accident_risk]`
   - Architecture: 3-layer neural network (8→4→1 neurons)
   - Output: Risk score (0-1)
   - Optimizer: Adam
   - Loss: Mean Squared Error

### Firebase Schema

```javascript
vehicle_history/
  └── {autoId}/
      ├── temperature: Number
      ├── humidity: Number
      ├── latitude: String
      ├── longitude: String
      ├── altitude: Number
      ├── timestamp: String (ISO format)
      ├── status: String ("NORMAL" | "WARNING" | "CRITICAL")
      └── riskScore: Number (0-1)
```

### Model Storage

- **Location**: Browser IndexedDB
- **Database**: `tensorflowjs_models`
- **Key**: Model metadata and weights
- **Persistence**: Survives browser restarts
- **Size**: ~50-100 KB (compressed)

### Risk Score Calculation

The risk score combines:
1. **Temperature** (weight: 30%): Normalized 0-100°C → 0-1
2. **Humidity** (weight: 30%): Normalized 0-100% → 0-1
3. **Zone Risk** (weight: 40%): From Kaggle accident dataset
   - Checks if current GPS position is in a high-risk zone
   - Uses proximity-based boosting for nearby zones

**Final Score**: Weighted average of all factors (0-1 scale)

### Status Derivation

- **CRITICAL** (Red): `riskScore >= 0.7`
- **WARNING** (Orange): `riskScore >= 0.4`
- **NORMAL** (Blue): `riskScore < 0.4`

---

## 🐛 Troubleshooting

### Model Not Loading

**Problem**: Dashboard shows "Model not loaded" or risk score is 0

**Solutions**:
1. Check browser console for errors
2. Verify IndexedDB is enabled in browser
3. Retrain the model using `train-model.html`
4. Clear browser cache and reload

### Simulator Not Sending Data

**Problem**: No data appears on dashboard

**Solutions**:
1. Verify simulator is running (`npm run simulator`)
2. Check Firebase connection in simulator console
3. Verify Firebase credentials in `simulator.js`
4. Check Firebase Realtime Database rules (should allow read/write)

### Danger Zones Not Appearing

**Problem**: No zones shown on map

**Solutions**:
1. Ensure `us_accidents_sample.json` exists in project root
2. Check browser console for loading errors
3. Wait a few seconds for model to analyze zones
4. Use `debug-model.html` to verify model is identifying zones

### Charts Not Updating

**Problem**: Charts show no data or are empty

**Solutions**:
1. Ensure simulator is running and sending data
2. Check time range selector (default is "Last 1h")
3. Wait for at least 2-3 data points before charts appear
4. Refresh the page

---

## 📝 Notes

- The pre-trained model is stored in browser IndexedDB and loads automatically
- The simulator must run continuously to send data to Firebase
- The dashboard works best with Chrome, Firefox, or Edge (modern browsers)
- The ML model is trained once and reused - no retraining needed unless you want to update it
- The `us_accidents_sample.json` file is only needed for training, not for runtime

---

## 📄 License

for free

---

## 👤 Author

Mohamedbd99

---

**Enjoy monitoring your IoT vehicle system! 🚗📊**
