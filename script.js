// Your Mapbox public access token
mapboxgl.accessToken = 'pk.eyJ1IjoibWJhaXpoYWt5cCIsImEiOiJjbWdndndyMzkwbmFqMmtxNnQ3djdjdnV2In0.EHvEVkrhFwZWmZbLsT8b3g';

// --- DATA CONFIGURATION ---
const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
];
const years = [2020, 2021, 2022, 2023, 2024, 2025];
const INITIAL_VIEW_STATE = {
    center: [-86.9, 32.8],
    zoom: 6.5
};

// --- MAP INITIALIZATION ---
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/dark-v11', // Using Mapbox's dark theme base map
    center: INITIAL_VIEW_STATE.center,
    zoom: INITIAL_VIEW_STATE.zoom
});

const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false,
    className: 'map-popup' // Add a class for potential custom styling
});

// --- MAP LOAD EVENT ---
map.on('load', () => {

    // --- 1. ADD DATA SOURCES ---
    map.addSource('precipitation-data', {
        type: 'geojson',
        data: `precipitation-data/${months[0]}.geojson`
    });
    map.addSource('flood-data', {
        type: 'geojson',
        data: `flood-data/Flood_Events_${years[0]}.geojson`
    });

    // --- 2. ADD MAP LAYERS ---
    map.addLayer({
        id: 'precipitation-fill-layer',
        type: 'fill',
        source: 'precipitation-data',
        layout: { 'visibility': 'visible' },
        paint: {
            'fill-color': [
                'step', ['get', 'total_precipitation_inches'],
                '#eff3ff', 3, '#bdd7e7', 5, '#6baed6', 7, '#3182bd', 9, '#08519c'
            ],
            'fill-opacity': 0.7, 'fill-outline-color': '#0f172a'
        }
    });
    map.addLayer({
        id: 'flood-points-layer',
        type: 'circle',
        source: 'flood-data',
        layout: { 'visibility': 'none' },
        paint: {
            'circle-radius': 6, 'circle-color': '#22d3ee', // Using accent cyan
            'circle-stroke-color': '#0f172a', 'circle-stroke-width': 2
        }
    });

    // --- 3. UI SETUP AND EVENT LISTENERS ---
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const monthSlider = document.getElementById('month-slider');
    const monthLabel = document.getElementById('month-label');
    const yearSlider = document.getElementById('year-slider');
    const yearLabel = document.getElementById('year-label');
    const dataTypeRadios = document.querySelectorAll('input[name="datatype"]');
    const recenterButton = document.getElementById('recenter-button');

    // ** NEW: Sidebar toggle listener **
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });

    // Radio button listener
    dataTypeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => toggleDataType(e.target.value));
    });
    
    // Slider listeners
    monthSlider.addEventListener('input', (e) => {
        const monthIndex = parseInt(e.target.value, 10);
        const monthName = months[monthIndex];
        monthLabel.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
        map.getSource('precipitation-data').setData(`precipitation-data/${monthName}.geojson`);
    });
    yearSlider.addEventListener('input', (e) => {
        const yearIndex = parseInt(e.target.value, 10);
        const year = years[yearIndex];
        yearLabel.textContent = year;
        map.getSource('flood-data').setData(`flood-data/Flood_Events_${year}.geojson`);
    });

    // Recenter button listener
    recenterButton.addEventListener('click', () => map.flyTo(INITIAL_VIEW_STATE));

    // --- 4. POPUP EVENT LISTENERS ---
    // (Popup logic remains the same)
    map.on('mousemove', 'precipitation-fill-layer', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const props = e.features[0].properties;
        const content = `<h4>${props.name}</h4><p>Precipitation: <strong>${props.total_precipitation_inches} in</strong></p>`;
        popup.setLngLat(e.lngLat).setHTML(content).addTo(map);
    });
    map.on('mouseleave', 'precipitation-fill-layer', () => {
        map.getCanvas().style.cursor = ''; popup.remove();
    });
    map.on('mousemove', 'flood-points-layer', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const props = e.features[0].properties;
        const date = new Date(props.BEGIN_DATE).toLocaleDateString();
        const content = `<h4>Flood Event</h4><p>${props.CZ_NAME_STR}</p><p>Date: <strong>${date}</strong></p>`;
        popup.setLngLat(e.features[0].geometry.coordinates.slice()).setHTML(content).addTo(map);
    });
    map.on('mouseleave', 'flood-points-layer', () => {
        map.getCanvas().style.cursor = ''; popup.remove();
    });
});

// --- HELPER FUNCTION ---
function toggleDataType(dataType) {
    const isPrecipitation = dataType === 'precipitation';
    map.setLayoutProperty('precipitation-fill-layer', 'visibility', isPrecipitation ? 'visible' : 'none');
    map.setLayoutProperty('flood-points-layer', 'visibility', isPrecipitation ? 'none' : 'visible');
    document.getElementById('precipitation-selector-container').style.display = isPrecipitation ? 'block' : 'none';
    document.getElementById('flood-selector-container').style.display = isPrecipitation ? 'none' : 'block';
    document.getElementById('precipitation-legend').style.display = isPrecipitation ? 'block' : 'none';
    document.getElementById('flood-legend').style.display = isPrecipitation ? 'none' : 'block';
}