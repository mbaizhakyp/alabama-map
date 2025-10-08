// Your Mapbox public access token
mapboxgl.accessToken = 'pk.eyJ1IjoibWJhaXpoYWt5cCIsImEiOiJjbWdndndyMzkwbmFqMmtxNnQ3djdjdnV2In0.EHvEVkrhFwZWmZbLsT8b3g';

// --- DATA CONFIGURATION ---
const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
];
const years = [2020, 2021, 2022, 2023, 2024, 2025];

// --- MAP INITIALIZATION ---
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/light-v11',
    center: [-86.9, 32.8],
    zoom: 6.5
});

// Create a single popup instance
const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false
});

// --- MAP LOAD EVENT ---
map.on('load', () => {

    // --- 1. ADD DATA SOURCES ---
    // Precipitation source
    map.addSource('precipitation-data', {
        type: 'geojson',
        data: `precipitation-data/${months[0]}.geojson`
    });

    // Flood data source
    map.addSource('flood-data', {
        type: 'geojson',
        data: `flood-data/Flood_Events_${years[0]}.geojson`
    });

    // --- 2. ADD MAP LAYERS ---
    // Precipitation fill layer (visible by default)
    map.addLayer({
        id: 'precipitation-fill-layer',
        type: 'fill',
        source: 'precipitation-data',
        layout: { 'visibility': 'visible' }, // Start visible
        paint: {
            'fill-color': [
                'step', ['get', 'total_precipitation_inches'],
                '#eff3ff', 3, '#bdd7e7', 5, '#6baed6', 7, '#3182bd', 9, '#08519c'
            ],
            'fill-opacity': 0.75,
            'fill-outline-color': '#ffffff'
        }
    });

    // Flood points layer (hidden by default)
    map.addLayer({
        id: 'flood-points-layer',
        type: 'circle',
        source: 'flood-data',
        layout: { 'visibility': 'none' }, // Start hidden
        paint: {
            'circle-radius': 6,
            'circle-color': '#007cba',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1
        }
    });

    // --- 3. UI SETUP AND EVENT LISTENERS ---
    // Get UI elements
    const monthSelector = document.getElementById('month-selector');
    const yearSelector = document.getElementById('year-selector');
    const dataTypeRadios = document.querySelectorAll('input[name="datatype"]');

    // Populate dropdowns
    months.forEach(month => {
        const option = document.createElement('option');
        option.text = month.charAt(0).toUpperCase() + month.slice(1);
        option.value = month;
        monthSelector.add(option);
    });
    years.forEach(year => {
        const option = document.createElement('option');
        option.text = year;
        option.value = year;
        yearSelector.add(option);
    });

    // Listen for changes on the data type radio buttons
    dataTypeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            toggleDataType(e.target.value);
        });
    });
    
    // Listen for changes on the month selector
    monthSelector.addEventListener('change', (e) => {
        const url = `precipitation-data/${e.target.value}.geojson`;
        map.getSource('precipitation-data').setData(url);
    });
    
    // Listen for changes on the year selector
    yearSelector.addEventListener('change', (e) => {
        const url = `flood-data/Flood_Events_${e.target.value}.geojson`;
        map.getSource('flood-data').setData(url);
    });

    // --- 4. POPUP EVENT LISTENERS ---
    // Precipitation popups
    map.on('mousemove', 'precipitation-fill-layer', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const props = e.features[0].properties;
        const content = `<h4>${props.name}</h4><p><strong>Precipitation:</strong> ${props.total_precipitation_inches} inches</p>`;
        popup.setLngLat(e.lngLat).setHTML(content).addTo(map);
    });
    map.on('mouseleave', 'precipitation-fill-layer', () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
    });

    // Flood popups
    map.on('mousemove', 'flood-points-layer', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const props = e.features[0].properties;
        const date = new Date(props.BEGIN_DATE).toLocaleDateString(); // Format date
        const content = `<h4>Flood Event</h4><p><strong>County:</strong> ${props.CZ_NAME_STR}</p><p><strong>Date:</strong> ${date}</p>`;
        popup.setLngLat(e.features[0].geometry.coordinates.slice()).setHTML(content).addTo(map);
    });
    map.on('mouseleave', 'flood-points-layer', () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
    });
});


// --- HELPER FUNCTION to switch between data types ---
function toggleDataType(dataType) {
    const isPrecipitation = dataType === 'precipitation';
    
    // Toggle layer visibility
    map.setLayoutProperty('precipitation-fill-layer', 'visibility', isPrecipitation ? 'visible' : 'none');
    map.setLayoutProperty('flood-points-layer', 'visibility', isPrecipitation ? 'none' : 'visible');
    
    // Toggle UI selectors visibility
    document.getElementById('precipitation-selector-container').style.display = isPrecipitation ? 'block' : 'none';
    document.getElementById('flood-selector-container').style.display = isPrecipitation ? 'none' : 'block';
    
    // Toggle legend visibility
    document.getElementById('precipitation-legend').style.display = isPrecipitation ? 'block' : 'none';
    document.getElementById('flood-legend').style.display = isPrecipitation ? 'none' : 'block';
}