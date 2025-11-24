// history.js – fetches vehicle history from Firebase with ONE-TIME queries (no live streaming)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// Firebase config
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "iot-pro-35cd1.firebaseapp.com",
    databaseURL: "https://iot-pro-35cd1-default-rtdb.firebaseio.com",
    projectId: "iot-pro-35cd1",
    storageBucket: "iot-pro-35cd1.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- Pagination State ---
let allData = [];
let filteredData = [];
let currentPage = 1;
let itemsPerPage = 10;

// Helper to format timestamps
function formatTime(ts) {
    return new Date(ts).toLocaleString();
}

function renderRow(entry) {
    const tbody = document.getElementById('historyPageTableBody');
    const row = document.createElement('tr');
    const time = formatTime(entry.timestamp);
    const t = Number(entry.temperature || 0).toFixed(1);
    const h = Number(entry.humidity || 0).toFixed(1);
    const lat = parseFloat(entry.latitude || 0).toFixed(3);
    const lon = parseFloat(entry.longitude || 0).toFixed(3);
    let badge = 'normal';
    if (entry.status === 'WARNING') badge = 'warning';
    if (entry.status === 'CRITICAL') badge = 'critical';
    row.innerHTML = `
        <td>${time}</td>
        <td>${t}°C</td>
        <td>${h}%</td>
        <td>${lat}, ${lon}</td>
        <td><span class="status-badge ${badge}">${entry.status || 'NORMAL'}</span></td>
    `;
    tbody.appendChild(row);
}

function clearTable() {
    document.getElementById('historyPageTableBody').innerHTML = '';
}

function applyPagination() {
    const totalPages = Math.max(1, Math.ceil(filteredData.length / itemsPerPage));
    const startIdx = (currentPage - 1) * itemsPerPage;
    const pageData = filteredData.slice(startIdx, startIdx + itemsPerPage);
    clearTable();
    pageData.forEach(renderRow);
    renderPaginationControls(totalPages);
}

function renderPaginationControls(totalPages) {
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = currentPage === totalPages;

    const container = document.getElementById('pageNumbers');
    container.innerHTML = '';
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }
    for (let i = startPage; i <= endPage; i++) {
        const btn = document.createElement('div');
        btn.className = `page-number ${i === currentPage ? 'active' : ''}`;
        btn.textContent = i;
        btn.addEventListener('click', () => {
            currentPage = i;
            applyPagination();
        });
        container.appendChild(btn);
    }
}

async function fetchLastHour() {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const historyRef = ref(db, 'vehicle_history');

    try {
        const snap = await get(historyRef);
        if (snap.exists()) {
            const data = snap.val();
            const entries = Object.values(data).filter(e => {
                const ts = new Date(e.timestamp).getTime();
                return ts >= oneHourAgo && ts <= now;
            }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            allData = entries;
            filteredData = entries;
            currentPage = 1;
            applyPagination();
        } else {
            console.warn('No data for last hour');
            clearTable();
        }
    } catch (err) {
        console.error('Firebase read error:', err);
    }
}

async function fetchRange(startMs, endMs) {
    const historyRef = ref(db, 'vehicle_history');

    try {
        const snap = await get(historyRef);
        if (snap.exists()) {
            const data = snap.val();
            const entries = Object.values(data).filter(e => {
                const ts = new Date(e.timestamp).getTime();
                return ts >= startMs && ts <= endMs;
            }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            allData = entries;
            filteredData = entries;
            currentPage = 1;
            applyPagination();
        } else {
            console.warn('No data for selected range');
            clearTable();
        }
    } catch (err) {
        console.error('Firebase read error:', err);
    }
}

// Initialize default view (last hour) - ONE TIME FETCH
fetchLastHour();

// Date range filter listener
document.getElementById('applyRange').addEventListener('click', () => {
    const startVal = document.getElementById('startPicker').value;
    const endVal = document.getElementById('endPicker').value;
    if (!startVal || !endVal) {
        alert('Please select both start and end dates.');
        return;
    }
    const startMs = new Date(startVal).getTime();
    const endMs = new Date(endVal).getTime();
    if (startMs > endMs) {
        alert('Start date must be before end date.');
        return;
    }
    fetchRange(startMs, endMs);
});

// Items per page selector
document.getElementById('itemsPerPageSelect').addEventListener('change', (e) => {
    itemsPerPage = parseInt(e.target.value, 10);
    currentPage = 1;
    applyPagination();
});

// Prev / Next page buttons
document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        applyPagination();
    }
});

document.getElementById('nextPage').addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(filteredData.length / itemsPerPage));
    if (currentPage < totalPages) {
        currentPage++;
        applyPagination();
    }
});

// Update current time display
setInterval(() => {
    const now = new Date();
    document.getElementById('currentDateTime').textContent = now.toLocaleTimeString();
}, 1000);
