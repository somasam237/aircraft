/**
 * Airtrack - Live Flight Tracking JavaScript
 * Interaktive Karte und Echtzeit-Flugzeugverfolgung
 */

// Globale Variablen
let map;
let socket;
let flightMarkers = {};
let flightPaths = {};
let liveUpdatesEnabled = false;

// Initialisierung beim Laden der Seite
document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    initializeWebSocket();
    loadInitialData();
});

/**
 * Karte initialisieren
 */
function initializeMap() {
    // Karte zentriert auf Europa
    map = L.map('map').setView([50.0, 10.0], 6);
    
    // OpenStreetMap Tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    console.log('🗺️ Karte initialisiert');
}

/**
 * WebSocket-Verbindung initialisieren
 */
function initializeWebSocket() {
    socket = io();
    
    socket.on('connect', function() {
        console.log('✅ WebSocket verbunden');
        updateConnectionStatus(true);
    });
    
    socket.on('disconnect', function() {
        console.log('❌ WebSocket getrennt');
        updateConnectionStatus(false);
    });
    
    socket.on('flight_update', function(data) {
        console.log(`🔄 Flight Update: ${data.flights.length} Flugzeuge`);
        updateFlightDisplay(data.flights);
        updateLastUpdate(data.timestamp);
    });
    
    socket.on('status', function(data) {
        console.log('📡 Status:', data.message);
    });
}

/**
 * Verbindungsstatus in der UI aktualisieren
 */
function updateConnectionStatus(connected) {
    const indicator = document.getElementById('connection-indicator');
    const status = document.getElementById('connection-status');
    
    if (connected) {
        indicator.textContent = '✅ Verbunden';
        indicator.className = 'connection-status';
        status.textContent = 'Verbunden';
    } else {
        indicator.textContent = '❌ Getrennt';
        indicator.className = 'connection-status disconnected';
        status.textContent = 'Verbindung getrennt';
    }
}

/**
 * Initiale Daten laden
 */
async function loadInitialData() {
    try {
        await Promise.all([
            loadFlights(),
            loadStatistics()
        ]);
    } catch (error) {
        console.error('Fehler beim Laden der initialen Daten:', error);
    }
}

/**
 * Aktuelle Flüge von der API laden
 */
async function loadFlights() {
    try {
        const response = await fetch('/api/flights/current');
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        updateFlightDisplay(data.flights);
        updateFlightsList(data.flights);
        
        console.log(`✈️ ${data.flights.length} Flüge geladen`);
    } catch (error) {
        console.error('Fehler beim Laden der Flüge:', error);
        document.getElementById('flights-container').innerHTML = 
            '<div style="color: red;">Fehler beim Laden der Flüge</div>';
    }
}

/**
 * Statistiken von der API laden
 */
async function loadStatistics() {
    try {
        const response = await fetch('/api/statistics');
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        updateStatisticsDisplay(data);
        
    } catch (error) {
        console.error('Fehler beim Laden der Statistiken:', error);
        document.getElementById('stats-container').innerHTML = 
            '<div style="color: red;">Fehler beim Laden der Statistiken</div>';
    }
}

/**
 * Flüge auf der Karte anzeigen/aktualisieren
 */
function updateFlightDisplay(flights) {
    // Alte Marker entfernen die nicht mehr existieren
    Object.keys(flightMarkers).forEach(icao24 => {
        if (!flights.find(f => f.icao24 === icao24)) {
            map.removeLayer(flightMarkers[icao24]);
            delete flightMarkers[icao24];
        }
    });
    
    // Flüge aktualisieren oder hinzufügen
    flights.forEach(flight => {
        updateFlightMarker(flight);
    });
}

/**
 * Einzelnen Flight Marker aktualisieren oder erstellen
 */
function updateFlightMarker(flight) {
    const icao24 = flight.icao24;
    
    // Icon basierend auf Status
    let iconUrl = getFlightIcon(flight);
    
    // Marker erstellen oder aktualisieren
    if (flightMarkers[icao24]) {
        // Bestehenden Marker aktualisieren
        flightMarkers[icao24].setLatLng([flight.latitude, flight.longitude]);
    } else {
        // Neuen Marker erstellen
        const icon = L.icon({
            iconUrl: iconUrl,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        
        const marker = L.marker([flight.latitude, flight.longitude], { icon: icon })
            .addTo(map);
        
        // Popup mit Flight-Informationen
        const popupContent = createFlightPopup(flight);
        marker.bindPopup(popupContent);
        
        // Click-Handler für Flugbahn
        marker.on('click', function() {
            loadFlightPath(icao24);
        });
        
        flightMarkers[icao24] = marker;
    }
    
    // Rotation basierend auf true_track
    if (flight.true_track) {
        const element = flightMarkers[icao24].getElement();
        if (element) {
            element.style.transform += ` rotate(${flight.true_track}deg)`;
        }
    }
}

/**
 * Flight Icon basierend auf Status zurückgeben
 */
function getFlightIcon(flight) {
    if (flight.on_ground) {
        return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzc1NzU3NSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIxIDEySDNsOS05IDkgOXoiLz4KPHN2Zz4K';
    } else {
        return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iIzIxOTZGMyIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIxIDEySDNsOS05IDkgOXoiLz4KPHN2Zz4K';
    }
}

/**
 * Flight Popup HTML erstellen
 */
function createFlightPopup(flight) {
    const aircraftInfo = flight.aircraft_info || {};
    
    return `
        <div class="flight-popup">
            <div class="popup-header">${flight.callsign}</div>
            <div class="popup-detail">
                <span class="popup-label">ICAO24:</span> ${flight.icao24}
            </div>
            <div class="popup-detail">
                <span class="popup-label">Land:</span> ${flight.origin_country}
            </div>
            <div class="popup-detail">
                <span class="popup-label">Höhe:</span> ${flight.altitude ? Math.round(flight.altitude) + ' m' : 'N/A'}
            </div>
            <div class="popup-detail">
                <span class="popup-label">Geschwindigkeit:</span> ${flight.velocity ? Math.round(flight.velocity * 3.6) + ' km/h' : 'N/A'}
            </div>
            <div class="popup-detail">
                <span class="popup-label">Status:</span> 
                <span class="flight-status status-${flight.flight_status}">${flight.flight_status}</span>
            </div>
            ${aircraftInfo.aircraft_type ? `
            <div class="popup-detail">
                <span class="popup-label">Flugzeugtyp:</span> ${aircraftInfo.aircraft_type}
            </div>
            ` : ''}
            ${aircraftInfo.airline ? `
            <div class="popup-detail">
                <span class="popup-label">Airline:</span> ${aircraftInfo.airline}
            </div>
            ` : ''}
        </div>
    `;
}

/**
 * Flugbahn für spezifisches Aircraft laden und anzeigen
 */
async function loadFlightPath(icao24) {
    try {
        const response = await fetch(`/api/flights/${icao24}/path`);
        const data = await response.json();
        
        if (data.error) {
            console.log('Keine Flugbahn verfügbar für', icao24);
            return;
        }
        
        // Alte Flugbahn entfernen
        if (flightPaths[icao24]) {
            map.removeLayer(flightPaths[icao24]);
        }
        
        // Neue Flugbahn zeichnen
        const pathCoords = data.path.map(p => [p.lat, p.lng]);
        const polyline = L.polyline(pathCoords, {
            color: '#FF5722',
            weight: 3,
            opacity: 0.8
        }).addTo(map);
        
        flightPaths[icao24] = polyline;
        
        // Karte an Flugbahn anpassen
        if (pathCoords.length > 0) {
            map.fitBounds(polyline.getBounds());
        }
        
        console.log(`✈️ Flugbahn für ${icao24} angezeigt (${data.path.length} Punkte)`);
        
    } catch (error) {
        console.error('Fehler beim Laden der Flugbahn:', error);
    }
}

/**
 * Flugzeug-Liste in der Sidebar aktualisieren
 */
function updateFlightsList(flights) {
    const container = document.getElementById('flights-container');
    
    if (flights.length === 0) {
        container.innerHTML = '<div class="loading">Keine aktiven Flüge</div>';
        return;
    }
    
    const html = flights.map(flight => `
        <div class="flight-item" onclick="focusOnFlight('${flight.icao24}')">
            <div class="flight-callsign">${flight.callsign}</div>
            <div class="flight-details">
                ${flight.icao24} • ${flight.origin_country}<br>
                ${flight.altitude ? Math.round(flight.altitude) + ' m' : 'N/A'} • 
                ${flight.velocity ? Math.round(flight.velocity * 3.6) + ' km/h' : 'N/A'}<br>
                <span class="flight-status status-${flight.flight_status}">${flight.flight_status}</span>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = html;
}

/**
 * Statistiken in der Sidebar anzeigen
 */
function updateStatisticsDisplay(data) {
    const container = document.getElementById('stats-container');
    const stats = data.flight_stats || {};
    
    const html = `
        <div class="stat-item">
            <span class="stat-label">Aktive Flüge</span>
            <span class="stat-value">${stats.active_flights || 0}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Verfolgte Flüge</span>
            <span class="stat-value">${stats.total_tracked_flights || 0}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Database Writes</span>
            <span class="stat-value">${stats.total_database_writes || 0}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Database Fehler</span>
            <span class="stat-value">${stats.database_errors || 0}</span>
        </div>
    `;
    
    container.innerHTML = html;
}

/**
 * Auf spezifisches Flugzeug fokussieren
 */
function focusOnFlight(icao24) {
    const marker = flightMarkers[icao24];
    if (marker) {
        map.setView(marker.getLatLng(), 10);
        marker.openPopup();
        loadFlightPath(icao24);
    }
}

/**
 * Live-Updates ein/ausschalten
 */
function toggleLiveUpdates() {
    liveUpdatesEnabled = !liveUpdatesEnabled;
    
    fetch('/api/control/live-updates', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enable: liveUpdatesEnabled })
    });
    
    const btn = document.getElementById('live-updates-btn');
    if (liveUpdatesEnabled) {
        btn.textContent = 'Live-Updates stoppen';
        btn.className = 'btn btn-danger';
    } else {
        btn.textContent = 'Live-Updates starten';
        btn.className = 'btn btn-success';
    }
}

/**
 * Daten manuell aktualisieren
 */
function refreshData() {
    loadInitialData();
}

/**
 * Karte auf Standardansicht zentrieren
 */
function centerMap() {
    map.setView([50.0, 10.0], 6);
}

/**
 * Zeitstempel der letzten Aktualisierung anzeigen
 */
function updateLastUpdate(timestamp) {
    const status = document.getElementById('connection-status');
    const time = new Date(timestamp).toLocaleTimeString();
    status.textContent = `Letzte Aktualisierung: ${time}`;
}
