// Globale Variablen
let map;
let socket;
let flightMarkers = {};
let flightPaths = {};
let liveUpdatesEnabled = false;
let currentFilter = null; // Aktueller Filter
let availableDestinations = [];
let availableOrigins = [];

// Initialisierung beim Laden der Seite
document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    initializeWebSocket();
    initializeFilterControls();
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
        console.log('WebSocket verbunden');
        updateConnectionStatus(true);
    });
    
    socket.on('disconnect', function() {
        console.log(' WebSocket getrennt');
        updateConnectionStatus(false);
    });
    
    socket.on('flight_update', function(data) {
        console.log(`Flight Update: ${data.flights.length} Flugzeuge`);
        updateFlightDisplay(data.flights);
        updateLastUpdate(data.timestamp);
    });
    
    socket.on('status', function(data) {
        console.log('Status:', data.message);
    });
}

/**
 * Verbindungsstatus in der UI aktualisieren
 */
function updateConnectionStatus(connected) {
    const indicator = document.getElementById('connection-indicator');
    const status = document.getElementById('connection-status');
    
    if (connected) {
        indicator.textContent = 'Verbunden';
        indicator.className = 'connection-status';
        status.textContent = 'Verbunden';
    } else {
        indicator.textContent = 'Getrennt';
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
            loadStatistics(),
            loadAvailableDestinations(),
            loadAvailableOrigins()
        ]);
    } catch (error) {
        console.error('Fehler beim Laden der initialen Daten:', error);
    }
}

/**
 * Filter-Controls initialisieren
 */
function initializeFilterControls() {
    // Filter-Buttons Event Listeners
    document.getElementById('btn-all-flights')?.addEventListener('click', () => {
        clearFilter();
        loadFlights();
    });
    
    document.getElementById('btn-to-germany')?.addEventListener('click', () => {
        filterFlightsByDestination('Germany');
    });
    
    document.getElementById('btn-from-usa')?.addEventListener('click', () => {
        filterFlightsByOrigin('United States');
    });
    
    // Dropdown Event Listeners
    document.getElementById('destination-filter')?.addEventListener('change', (e) => {
        if (e.target.value) {
            filterFlightsByDestination(e.target.value);
        }
    });
    
    document.getElementById('origin-filter')?.addEventListener('change', (e) => {
        if (e.target.value) {
            filterFlightsByOrigin(e.target.value);
        }
    });
    
    console.log('🎛️ Filter-Controls initialisiert');
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
        
        console.log(`✈️ ${data.flights.length} aktuelle Flüge geladen`);
    } catch (error) {
        console.error('Fehler beim Laden der Flüge:', error);
        document.getElementById('flights-container').innerHTML = 
            '<div style="color: red;">Fehler beim Laden der Flüge</div>';
    }
}

/**
 * ALLE gespeicherten Flüge aus der Datenbank laden
 */
async function loadAllStoredFlights() {
    try {
        console.log('🗄️ Lade alle gespeicherten Flüge aus der Datenbank...');
        
        // Loading-Indikator anzeigen
        document.getElementById('flights-container').innerHTML = 
            '<div style="color: blue;">📡 Lade alle gespeicherten Flüge...</div>';
        
        const response = await fetch('/api/flights/database/all');
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Filter-Status aktualisieren
        document.getElementById('filter-status').textContent = 'Alle gespeicherten Flüge';
        document.getElementById('flight-count').textContent = `(${data.total_count} Flüge)`;
        
        // Flüge anzeigen
        updateFlightDisplay(data.flights);
        updateFlightsList(data.flights);
        
        console.log(`🗄️ ${data.total_count} gespeicherte Flüge aus Datenbank geladen`);
        
        // Erfolgs-Nachricht kurz anzeigen
        const statusElement = document.getElementById('connection-status');
        const originalText = statusElement.textContent;
        statusElement.textContent = `✅ ${data.total_count} gespeicherte Flüge geladen`;
        statusElement.style.color = 'green';
        
        setTimeout(() => {
            statusElement.textContent = originalText;
            statusElement.style.color = '';
        }, 3000);
        
    } catch (error) {
        console.error('Fehler beim Laden aller Flüge:', error);
        document.getElementById('flights-container').innerHTML = 
            '<div style="color: red;">❌ Fehler beim Laden der gespeicherten Flüge</div>';
            
        // Fehler-Nachricht anzeigen
        const statusElement = document.getElementById('connection-status');
        statusElement.textContent = '❌ Fehler beim Laden der Datenbank-Flüge';
        statusElement.style.color = 'red';
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
    // Bessere, einfachere Flugzeug-Icons
    if (flight.on_ground) {
        // Grauer Flugzeug-Icon für am Boden
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#666666" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
            </svg>
        `);
    } else {
        // Blauer Flugzeug-Icon für in der Luft
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#2196F3" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
            </svg>
        `);
    }
}

/**
 * Flight Popup HTML erstellen
 */
function createFlightPopup(flight) {
    const aircraftInfo = flight.aircraft_info || {};
    const routeInfo = flight.route_info || {};
    
    // Korrekte Status-Darstellung
    const statusText = flight.on_ground ? 'Am Boden' : 'In der Luft';
    const statusClass = flight.on_ground ? 'ground' : 'airborne';
    
    let popupContent = `
        <div class="flight-popup">
            <div class="popup-header">
                ✈️ ${flight.callsign}
                <span class="flight-status flight-status-${statusClass}">${statusText}</span>
            </div>
            
            <div class="popup-section">
                <h4>📍 Flugdaten</h4>
                <div class="popup-detail">
                    <span class="popup-label">ICAO24:</span> ${flight.icao24}
                </div>
                <div class="popup-detail">
                    <span class="popup-label">Registrierungsland:</span> ${flight.origin_country}
                </div>
                <div class="popup-detail">
                    <span class="popup-label">Höhe:</span> ${flight.altitude ? Math.round(flight.altitude) + ' m' : 'N/A'}
                </div>
                <div class="popup-detail">
                    <span class="popup-label">Geschwindigkeit:</span> ${flight.velocity ? Math.round(flight.velocity * 3.6) + ' km/h' : 'N/A'}
                </div>
            </div>`;
    
    // Route-Informationen hinzufügen (NEUE FUNKTION)
    if (routeInfo && (routeInfo.origin_city || routeInfo.destination_city || routeInfo.airline)) {
        popupContent += `
            <div class="popup-section route-info">
                <h4>🛫 Flugstrecke</h4>`;
        
        if (routeInfo.airline) {
            popupContent += `
                <div class="popup-detail">
                    <span class="popup-label">Airline:</span> 
                    <span class="airline">${routeInfo.airline}</span>
                </div>`;
        }
        
        if (routeInfo.origin_city || routeInfo.destination_city) {
            const origin = routeInfo.origin_city ? `${routeInfo.origin_city}` : 'Unbekannt';
            const originCountry = routeInfo.origin_country ? ` (${routeInfo.origin_country})` : '';
            const dest = routeInfo.destination_city ? `${routeInfo.destination_city}` : 'Unbekannt';
            const destCountry = routeInfo.destination_country ? ` (${routeInfo.destination_country})` : '';
            
            popupContent += `
                <div class="popup-detail route">
                    <span class="popup-label">Route:</span><br>
                    🛫 ${origin}${originCountry} <span class="route-arrow">→</span> 🛬 ${dest}${destCountry}
                </div>`;
        }
        
        popupContent += `</div>`;
    }
    
    // Flugzeug-Informationen
    if (aircraftInfo.aircraft_type || aircraftInfo.airline) {
        popupContent += `
            <div class="popup-section">
                <h4>✈️ Flugzeugdaten</h4>`;
        
        if (aircraftInfo.aircraft_type) {
            popupContent += `
                <div class="popup-detail">
                    <span class="popup-label">Flugzeugtyp:</span> ${aircraftInfo.aircraft_type}
                </div>`;
        }
        
        if (aircraftInfo.registration) {
            popupContent += `
                <div class="popup-detail">
                    <span class="popup-label">Registrierung:</span> ${aircraftInfo.registration}
                </div>`;
        }
        
        popupContent += `</div>`;
    }
    
    popupContent += `
            <div class="popup-actions">
                <button onclick="focusOnFlight('${flight.icao24}')" class="popup-btn">
                    🎯 Verfolgen
                </button>
                <button onclick="loadFlightPath('${flight.icao24}')" class="popup-btn">
                    📍 Flugbahn
                </button>
            </div>
        </div>`;
    
    return popupContent;
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
    
    updateLiveUpdateButton();
}

/**
 * Live-Update Button aktualisieren
 */
function updateLiveUpdateButton() {
    const button = document.getElementById('toggle-live-updates');
    if (button) {
        if (liveUpdatesEnabled) {
            button.textContent = '⏸️ Live Updates stoppen';
            button.className = 'btn btn-danger'; // ROT wenn aktiv
        } else {
            button.textContent = '▶️ Live Updates starten';
            button.className = 'btn btn-success'; // GRÜN wenn inaktiv
        }
    }
}

// ============================================
// NEUE FILTER-FUNKTIONEN
// ============================================

/**
 * Flüge nach Zielland filtern
 */
async function filterFlightsByDestination(country) {
    try {
        clearAllMarkers();
        updateFilterStatus(`Ziel: ${country}`);
        currentFilter = { type: 'destination', value: country };
        
        const response = await fetch(`/api/flights/filter/destination/${encodeURIComponent(country)}`);
        const data = await response.json();
        
        if (data.flights) {
            updateFlightDisplay(data.flights);
            updateFlightCount(data.total_count, `nach ${country}`);
            console.log(`🎯 ${data.total_count} Flüge nach ${country} geladen`);
        } else {
            console.error('Fehler beim Filtern:', data.error);
        }
    } catch (error) {
        console.error('Fehler beim Laden gefilterter Flüge:', error);
    }
}

/**
 * Flüge nach Herkunftsland filtern
 */
async function filterFlightsByOrigin(country) {
    try {
        clearAllMarkers();
        updateFilterStatus(`Herkunft: ${country}`);
        currentFilter = { type: 'origin', value: country };
        
        const response = await fetch(`/api/flights/filter/origin/${encodeURIComponent(country)}`);
        const data = await response.json();
        
        if (data.flights) {
            updateFlightDisplay(data.flights);
            updateFlightCount(data.total_count, `von ${country}`);
            console.log(`🎯 ${data.total_count} Flüge von ${country} geladen`);
        } else {
            console.error('Fehler beim Filtern:', data.error);
        }
    } catch (error) {
        console.error('Fehler beim Laden gefilterter Flüge:', error);
    }
}

/**
 * Filter zurücksetzen
 */
function clearFilter() {
    currentFilter = null;
    updateFilterStatus('Alle Flüge');
    clearFilterDropdowns();
}

/**
 * Filter-Status in der UI aktualisieren
 */
function updateFilterStatus(status) {
    const statusElement = document.getElementById('filter-status');
    if (statusElement) {
        statusElement.textContent = status;
    }
}

/**
 * Flug-Anzahl aktualisieren
 */
function updateFlightCount(count, description = '') {
    const countElement = document.getElementById('flight-count');
    if (countElement) {
        countElement.textContent = `${count} Flüge ${description}`;
    }
}

/**
 * Alle Marker von der Karte entfernen
 */
function clearAllMarkers() {
    Object.values(flightMarkers).forEach(marker => {
        map.removeLayer(marker);
    });
    flightMarkers = {};
    
    Object.values(flightPaths).forEach(path => {
        map.removeLayer(path);
    });
    flightPaths = {};
}

/**
 * Filter-Dropdowns zurücksetzen
 */
function clearFilterDropdowns() {
    const destFilter = document.getElementById('destination-filter');
    const originFilter = document.getElementById('origin-filter');
    
    if (destFilter) destFilter.value = '';
    if (originFilter) originFilter.value = '';
}

/**
 * Verfügbare Zielländer laden
 */
async function loadAvailableDestinations() {
    try {
        const response = await fetch('/api/flights/destinations');
        const data = await response.json();
        
        if (data.destinations) {
            availableDestinations = data.destinations;
            populateDestinationDropdown(data.destinations);
        }
    } catch (error) {
        console.error('Fehler beim Laden der Zielländer:', error);
    }
}

/**
 * Verfügbare Herkunftsländer laden
 */
async function loadAvailableOrigins() {
    try {
        const response = await fetch('/api/flights/origins');
        const data = await response.json();
        
        if (data.origins) {
            availableOrigins = data.origins;
            populateOriginDropdown(data.origins);
        }
    } catch (error) {
        console.error('Fehler beim Laden der Herkunftsländer:', error);
    }
}

/**
 * Zielländer-Dropdown befüllen
 */
function populateDestinationDropdown(destinations) {
    const select = document.getElementById('destination-filter');
    if (!select) return;
    
    // Dropdown leeren
    select.innerHTML = '<option value="">Zielland wählen...</option>';
    
    // Optionen hinzufügen
    destinations.forEach(country => {
        const option = document.createElement('option');
        option.value = country;
        option.textContent = country;
        select.appendChild(option);
    });
}

/**
 * Herkunftsländer-Dropdown befüllen
 */
function populateOriginDropdown(origins) {
    const select = document.getElementById('origin-filter');
    if (!select) return;
    
    // Dropdown leeren
    select.innerHTML = '<option value="">Herkunftsland wählen...</option>';
    
    // Optionen hinzufügen
    origins.forEach(country => {
        const option = document.createElement('option');
        option.value = country;
        option.textContent = country;
        select.appendChild(option);
    });
}

/**
 * Daten manuell aktualisieren
 */
function refreshData() {
    if (currentFilter) {
        // Aktuellen Filter erneut anwenden
        if (currentFilter.type === 'destination') {
            filterFlightsByDestination(currentFilter.value);
        } else if (currentFilter.type === 'origin') {
            filterFlightsByOrigin(currentFilter.value);
        }
    } else {
        // Alle Flüge laden
        loadInitialData();
    }
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
