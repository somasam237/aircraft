import requests
import time
from datetime import datetime
from data_processor import DataProcessor, Aircraft
from typing import List, Dict, Any

def fetch_opensky_data():
    """
    Ruft Live-Flugdaten von der OpenSky Network API ab.
    Gibt die 'state vectors' aller verfügbaren Flugzeuge zurück.
    """
    url = "https://opensky-network.org/api/states/all"
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()  
        data = response.json()
        
        # Timestamp hinzufügen für spätere Verarbeitung
        data['fetch_time'] = datetime.now().isoformat()
        
        print(f"Données récupérées : {len(data.get('states', []))} avions à {data['fetch_time']}")
        return data
    except requests.exceptions.RequestException as e:
        print(f"Erreur lors de la récupération des données OpenSky : {e}")
        return None

def live_data_collector_with_processing(interval_seconds=10, 
                                      save_to_file=False,
                                      filters=None):
    """
    Sammelt kontinuierlich Live-Flugdaten mit Datenverarbeitung.
    
    Args:
        interval_seconds (int): Abrufintervall in Sekunden
        save_to_file (bool): Speichert Daten in JSON-Dateien
        filters (dict): Filterkriterien für Flugzeuge
    """
    print(f"Starte erweiterten Live-Datenabruf alle {interval_seconds} Sekunden...")
    print("Features: Datenverarbeitung, Statistiken, Filterung")
    if save_to_file:
        print("✓ Speichert Daten in JSON-Dateien")
    print("Drücken Sie Ctrl+C zum Stoppen\n")
    
    processor = DataProcessor()
    iteration = 0
    
    try:
        while True:
            iteration += 1
            print(f"--- Iteration {iteration} ---")
            
            # 1. Daten abrufen
            raw_data = fetch_opensky_data()
            if not raw_data:
                print("❌ Keine Daten erhalten, warte bis zum nächsten Versuch...")
                time.sleep(interval_seconds)
                continue
            
            # 2. Daten verarbeiten
            aircraft_list = processor.process_opensky_data(raw_data)
            
            # 3. Filter anwenden (falls vorhanden)
            if filters:
                aircraft_list = processor.filter_aircraft(aircraft_list, filters)
                print(f"✓ Nach Filterung: {len(aircraft_list)} Flugzeuge")
            
            # 4. Statistiken berechnen und anzeigen
            stats = processor.get_statistics(aircraft_list)
            print(f"✓ Total: {stats['total_aircraft']} | "
                  f"Fliegend: {stats['airborne']} | "
                  f"Am Boden: {stats['on_ground']} | "
                  f"Mit Position: {stats['with_position']}")
            
            if stats['avg_altitude']:
                print(f"✓ Durchschnittshöhe: {stats['avg_altitude']:.0f}m | "
                      f"Max: {stats['max_altitude']:.0f}m | "
                      f"Länder: {stats['country_count']}")
            
            # 5. Daten speichern (optional)
            if save_to_file and aircraft_list:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"airtrack_data_{timestamp}.json"
                processor.export_to_json(aircraft_list, filename)
                print(f"✓ Daten gespeichert: {filename}")
            
            print(f"⏱ Warte {interval_seconds} Sekunden...\n")
            time.sleep(interval_seconds)
            
    except KeyboardInterrupt:
        print(f"\n🛑 Live-Datenabruf gestoppt nach {iteration} Iterationen")
        print(f"📊 Verarbeitungsstatistiken:")
        print(f"   Verarbeitet: {processor.processed_count}")
        print(f"   Fehler: {processor.error_count}")

def analyze_current_flights():
    """Analysiert die aktuellen Flüge mit verschiedenen Filtern."""
    print("=== FLUGANALYSE ===")
    
    # Daten abrufen und verarbeiten
    raw_data = fetch_opensky_data()
    if not raw_data:
        print("❌ Keine Daten verfügbar!")
        return
    
    processor = DataProcessor()
    all_aircraft = processor.process_opensky_data(raw_data)
    
    print(f"\n📊 GESAMTSTATISTIKEN:")
    stats = processor.get_statistics(all_aircraft)
    for key, value in stats.items():
        if key != 'countries' and key != 'processing_stats':
            print(f"   {key}: {value}")
    
    # Verschiedene Analysen
    analyses = [
        {
            'name': 'Hochfliegende Flugzeuge (>10.000m)',
            'filters': {'only_airborne': True, 'min_altitude': 10000}
        },
        {
            'name': 'Schnelle Flugzeuge (>800 km/h)', 
            'filters': {'only_airborne': True},
            'post_filter': lambda a: a.get_speed_kmh() and a.get_speed_kmh() > 800
        },
        {
            'name': 'Deutsche Flugzeuge',
            'filters': {'country': 'Germany'}
        },
        {
            'name': 'US-Amerikanische Flugzeuge',
            'filters': {'country': 'United States'}
        },
        {
            'name': 'Flugzeuge am Boden',
            'filters': {'only_airborne': False}
        }
    ]
    
    print(f"\n🔍 DETAILANALYSEN:")
    for analysis in analyses:
        filtered = processor.filter_aircraft(all_aircraft, analysis['filters'])
        
        # Post-Filter anwenden (für komplexere Bedingungen)
        if 'post_filter' in analysis:
            filtered = [a for a in filtered if analysis['post_filter'](a)]
        
        print(f"   {analysis['name']}: {len(filtered)} Flugzeuge")
        
        # Zeige Beispiele
        if filtered and len(filtered) <= 5:
            for aircraft in filtered[:3]:
                callsign = aircraft.callsign or "N/A"
                country = aircraft.origin_country or "N/A"
                print(f"     - {aircraft.icao24} ({callsign}) aus {country}")

if __name__ == "__main__":
    print("=== AIRTRACK DATENVERARBEITUNG ===")
    print("Was möchten Sie testen?")
    print("1. Einzelne Analyse der aktuellen Flüge")
    print("2. Live-Datenabruf mit Verarbeitung (einfach)")
    print("3. Live-Datenabruf mit Verarbeitung + Speicherung")
    print("4. Live-Datenabruf nur für deutsche Flugzeuge")
    print("5. Live-Datenabruf nur für Hochfliegende (>5000m)")
    
    choice = input("\nWählen Sie (1-5): ").strip()
    
    if choice == "1":
        analyze_current_flights()
    elif choice == "2":
        live_data_collector_with_processing(10, save_to_file=False)
    elif choice == "3":
        live_data_collector_with_processing(15, save_to_file=True)
    elif choice == "4":
        filters = {'country': 'Germany', 'only_with_position': True}
        live_data_collector_with_processing(10, filters=filters)
    elif choice == "5":
        filters = {'only_airborne': True, 'min_altitude': 5000, 'only_with_position': True}
        live_data_collector_with_processing(10, filters=filters)
    else:
        print("Ungültige Auswahl. Führe Standardanalyse aus...")
        analyze_current_flights()
