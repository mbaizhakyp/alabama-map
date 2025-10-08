// Your Mapbox public access token
mapboxgl.accessToken = 'pk.eyJ1IjoibWJhaXpoYWt5cCIsImEiOiJjbWdndndyMzkwbmFqMmtxNnQ3djdjdnV2In0.EHvEVkrhFwZWmZbLsT8b3g';

// --- CONFIGURATION ---
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const years = [2020, 2021, 2022, 2023, 2024, 2025];
const INITIAL_VIEW_STATE = { center: [-86.9, 32.8], zoom: 6.5 };

// --- THEME MANAGEMENT ---
let currentTheme = localStorage.getItem('theme') || 'dark';
document.body.classList.toggle('light-theme', currentTheme === 'light');

// --- MAP INITIALIZATION ---
const map = new mapboxgl.Map({
    container: 'map',
    style: `mapbox://styles/mapbox/${currentTheme}-v11`,
    center: INITIAL_VIEW_STATE.center,
    zoom: INITIAL_VIEW_STATE.zoom
});

const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });

// --- MAP LAYERS & SOURCES FUNCTION ---
function addSourcesAndLayers() {
    const currentDataType = document.querySelector('input[name="datatype"]:checked').value;
    const isPrecipitationVisible = currentDataType === 'precipitation';

    map.addSource('precipitation-data', { type: 'geojson', data: `precipitation-data/${months[0]}.geojson` });
    map.addSource('flood-data', { type: 'geojson', data: `flood-data/Flood_Events_${years[0]}.geojson` });

    map.addLayer({
        id: 'precipitation-fill-layer', type: 'fill', source: 'precipitation-data',
        layout: { 'visibility': isPrecipitationVisible ? 'visible' : 'none' },
        paint: {
            'fill-color': ['step', ['get', 'total_precipitation_inches'], '#eff3ff', 3, '#bdd7e7', 5, '#6baed6', 7, '#3182bd', 9, '#08519c'],
            'fill-opacity': 0.7, 'fill-outline-color': currentTheme === 'dark' ? '#0f172a' : '#f1f5f9'
        }
    });
    map.addLayer({
        id: 'flood-points-layer', type: 'circle', source: 'flood-data',
        layout: { 'visibility': isPrecipitationVisible ? 'none' : 'visible' },
        paint: {
            'circle-radius': 6, 'circle-color': '#22d3ee',
            'circle-stroke-color': currentTheme === 'dark' ? '#0f172a' : '#f1f5f9', 'circle-stroke-width': 2
        }
    });
    
    toggleDataType(currentDataType, false);
}

function setupPopupListeners() {
    map.on('mousemove', 'precipitation-fill-layer', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const props = e.features[0].properties;
        const content = `<h4>${props.name}</h4><p>Precipitation: <strong>${props.total_precipitation_inches} in</strong></p>`;
        popup.setLngLat(e.lngLat).setHTML(content).addTo(map);
    });
    map.on('mouseleave', 'precipitation-fill-layer', () => { map.getCanvas().style.cursor = ''; popup.remove(); });
    map.on('mousemove', 'flood-points-layer', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const props = e.features[0].properties;
        const date = new Date(props.BEGIN_DATE).toLocaleDateString();
        const content = `<h4>Flood Event</h4><p>${props.CZ_NAME_STR}</p><p>Date: <strong>${date}</strong></p>`;
        popup.setLngLat(e.features[0].geometry.coordinates.slice()).setHTML(content).addTo(map);
    });
    map.on('mouseleave', 'flood-points-layer', () => { map.getCanvas().style.cursor = ''; popup.remove(); });
}

// --- UI EVENT LISTENERS (SETUP ONCE) ---
document.addEventListener('DOMContentLoaded', () => {
    // UPDATED: Set sidebar to be active by default
    document.body.classList.add('sidebar-active');

    const sidebarToggle = document.getElementById('sidebar-toggle');
    const recenterButton = document.getElementById('recenter-button');
    const themeToggle = document.getElementById('theme-toggle');
    const dataTypeRadios = document.querySelectorAll('input[name="datatype"]');
    const monthSlider = document.getElementById('month-slider');
    const monthLabel = document.getElementById('month-label');
    const yearSlider = document.getElementById('year-slider');
    const yearLabel = document.getElementById('year-label');

    // UPDATED: Sidebar logic now toggles a class on the body
    sidebarToggle.addEventListener('click', () => {
        document.body.classList.toggle('sidebar-active');
    });

    recenterButton.addEventListener('click', () => map.flyTo(INITIAL_VIEW_STATE));
    
    themeToggle.addEventListener('click', () => {
        currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', currentTheme);
        document.body.classList.toggle('light-theme', currentTheme === 'light');
        map.setStyle(`mapbox://styles/mapbox/${currentTheme}-v11`);
    });

    dataTypeRadios.forEach(radio => radio.addEventListener('change', (e) => toggleDataType(e.target.value)));

    monthSlider.addEventListener('input', (e) => {
        const monthName = months[parseInt(e.target.value, 10)];
        monthLabel.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
        if (map.getSource('precipitation-data')) map.getSource('precipitation-data').setData(`precipitation-data/${monthName}.geojson`);
    });
    yearSlider.addEventListener('input', (e) => {
        const year = years[parseInt(e.target.value, 10)];
        yearLabel.textContent = year;
        if (map.getSource('flood-data')) map.getSource('flood-data').setData(`flood-data/Flood_Events_${year}.geojson`);
    });
});

// --- MAP EVENTS ---
map.on('load', () => {
    addSourcesAndLayers();
    setupPopupListeners();
});
map.on('style.load', () => {
    addSourcesAndLayers();
    setupPopupListeners();
});

// --- HELPER FUNCTION ---
function toggleDataType(dataType, changeLayerVisibility = true) {
    const isPrecipitation = dataType === 'precipitation';
    if (changeLayerVisibility && map.isStyleLoaded() && map.getLayer('precipitation-fill-layer')) {
        map.setLayoutProperty('precipitation-fill-layer', 'visibility', isPrecipitation ? 'visible' : 'none');
        map.setLayoutProperty('flood-points-layer', 'visibility', isPrecipitation ? 'none' : 'visible');
    }
    document.getElementById('precipitation-selector-container').style.display = isPrecipitation ? 'block' : 'none';
    document.getElementById('flood-selector-container').style.display = isPrecipitation ? 'none' : 'block';
    document.getElementById('precipitation-legend').style.display = isPrecipitation ? 'block' : 'none';
    document.getElementById('flood-legend').style.display = isPrecipitation ? 'none' : 'block';
}