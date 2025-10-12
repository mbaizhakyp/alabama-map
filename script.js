// Your Mapbox public access token
mapboxgl.accessToken = 'pk.eyJ1IjoibWJhaXpoYWt5cCIsImEiOiJjbWdndndyMzkwbmFqMmtxNnQ3djdjdnV2In0.EHvEVkrhFwZWmZbLsT8b3g';

// --- CONFIGURATION ---
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const years = [2020, 2021, 2022, 2023, 2024, 2025];
const INITIAL_VIEW_STATE = { center: [-86.9, 32.8], zoom: 6.5 };
const SVI_THEME_TITLES = { 'RPL_THEMES': 'Overall SVI', 'RPL_THEME1': 'Socioeconomic Vulnerability', 'RPL_THEME2': 'Household Comp. Vulnerability', 'RPL_THEME3': 'Minority Status Vulnerability', 'RPL_THEME4': 'Housing/Transport Vulnerability' };

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
    if (!map.getSource('precipitation-data')) map.addSource('precipitation-data', { type: 'geojson', data: `precipitation-data/${months[0]}.geojson` });
    if (!map.getSource('flood-data')) map.addSource('flood-data', { type: 'geojson', data: `flood-data/Flood_Events_${years[0]}.geojson` });
    if (!map.getSource('svi-data')) map.addSource('svi-data', { type: 'geojson', data: 'svi-data/alabama_svi_2022.geojson' });

    if (!map.getLayer('precipitation-fill-layer')) {
        map.addLayer({
            id: 'precipitation-fill-layer', type: 'fill', source: 'precipitation-data',
            paint: {
                // UPDATED: Changed from 'step' to 'interpolate' for a continuous gradient
                'fill-color': [
                    'interpolate', ['linear'],
                    ['coalesce', ['get', 'total_precipitation_inches'], 0], // Use coalesce for safety
                    0, '#ffffcc',    // Light yellow for 0 inches
                    10, '#a1dab4',   // Light green/teal
                    25, '#41b6c4',   // Medium blue
                    50, '#2c7fb8',   // Dark blue
                    100, '#253494'   // Deep purple for 100+ inches
                ],
                'fill-opacity': 0.7, 'fill-outline-color': currentTheme === 'dark' ? '#0f172a' : '#f1f5f9'
            }
        });
    }
    if (!map.getLayer('flood-points-layer')) {
        map.addLayer({
            id: 'flood-points-layer', type: 'circle', source: 'flood-data',
            paint: { 'circle-radius': 6, 'circle-color': '#22d3ee', 'circle-stroke-color': currentTheme === 'dark' ? '#0f172a' : '#f1f5f9', 'circle-stroke-width': 2 }
        });
    }
    if (!map.getLayer('svi-layer')) {
        map.addLayer({
            id: 'svi-layer', type: 'fill', source: 'svi-data',
            paint: {
                'fill-color': ['interpolate', ['linear'], ['coalesce', ['get', 'RPL_THEMES'], 0], 0, '#4d9221', 0.5, '#f1b621', 1, '#c51b7d'],
                'fill-opacity': 0.75, 'fill-outline-color': currentTheme === 'dark' ? '#0f172a' : '#f1f5f9'
            }
        });
    }
    
    updateMapState();
}

function setupPopupListeners() {
    map.off('mousemove', 'precipitation-fill-layer'); map.off('mouseleave', 'precipitation-fill-layer');
    map.off('mousemove', 'flood-points-layer'); map.off('mouseleave', 'flood-points-layer');
    map.off('mousemove', 'svi-layer'); map.off('mouseleave', 'svi-layer');

    map.on('mousemove', 'precipitation-fill-layer', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const props = e.features[0].properties;
        const precipValue = props.total_precipitation_inches === null || typeof props.total_precipitation_inches === 'undefined' ? 'No data' : `${props.total_precipitation_inches.toFixed(2)} in`;
        const content = `<h4>${props.name}</h4><p>Precipitation: <strong>${precipValue}</strong></p>`;
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
    map.on('mousemove', 'svi-layer', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        const props = e.features[0].properties;
        const currentSviProperty = document.querySelector('input[name="svi_theme"]:checked').value;
        const sviValue = props[currentSviProperty];
        const percentileText = sviValue === null || typeof sviValue === 'undefined' ? 'No data' : `${(sviValue * 100).toFixed(1)}th percentile`;
        const content = `<h4>${props.COUNTY}</h4><p>${SVI_THEME_TITLES[currentSviProperty]}: <strong>${percentileText}</strong></p>`;
        popup.setLngLat(e.lngLat).setHTML(content).addTo(map);
    });
    map.on('mouseleave', 'svi-layer', () => { map.getCanvas().style.cursor = ''; popup.remove(); });
}

// --- UI EVENT LISTENERS (SETUP ONCE) ---
document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('sidebar-active');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const recenterButton = document.getElementById('recenter-button');
    const themeToggle = document.getElementById('theme-toggle');
    const categoryRadios = document.querySelectorAll('input[name="category"]');
    const climateTypeRadios = document.querySelectorAll('input[name="datatype"]');
    const monthSlider = document.getElementById('month-slider');
    const monthLabel = document.getElementById('month-label');
    const yearSlider = document.getElementById('year-slider');
    const yearLabel = document.getElementById('year-label');
    const sviThemeRadios = document.querySelectorAll('input[name="svi_theme"]');
    const sviLegendTitle = document.getElementById('svi-legend-title');

    sidebarToggle.addEventListener('click', () => document.body.classList.toggle('sidebar-active'));
    recenterButton.addEventListener('click', () => map.flyTo(INITIAL_VIEW_STATE));
    themeToggle.addEventListener('click', () => {
        currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', currentTheme);
        document.body.classList.toggle('light-theme', currentTheme === 'light');
        map.setStyle(`mapbox://styles/mapbox/${currentTheme}-v11`);
    });

    categoryRadios.forEach(radio => radio.addEventListener('change', updateMapState));
    climateTypeRadios.forEach(radio => radio.addEventListener('change', updateMapState));
    sviThemeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const selectedSviProperty = e.target.value;
            map.setPaintProperty('svi-layer', 'fill-color', ['interpolate', ['linear'], ['coalesce', ['get', selectedSviProperty], 0], 0, '#4d9221', 0.5, '#f1b621', 1, '#c51b7d']);
            sviLegendTitle.textContent = SVI_THEME_TITLES[selectedSviProperty];
        });
    });

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
map.on('load', () => { addSourcesAndLayers(); setupPopupListeners(); });
map.on('style.load', () => { addSourcesAndLayers(); setupPopupListeners(); });

// --- MASTER STATE MANAGEMENT FUNCTION ---
function updateMapState() {
    if (!map.isStyleLoaded()) return;
    const selectedCategory = document.querySelector('input[name="category"]:checked').value;
    const isClimate = selectedCategory === 'climate';
    document.getElementById('climate-controls-container').style.display = isClimate ? 'block' : 'none';
    document.getElementById('svi-controls-container').style.display = isClimate ? 'none' : 'block';
    document.getElementById('climate-legends').style.display = isClimate ? 'block' : 'none';
    document.getElementById('svi-legend-container').style.display = isClimate ? 'none' : 'block';
    if (map.getLayer('svi-layer')) map.setLayoutProperty('svi-layer', 'visibility', isClimate ? 'none' : 'visible');
    if (isClimate) {
        const selectedClimateType = document.querySelector('input[name="datatype"]:checked').value;
        const isPrecipitation = selectedClimateType === 'precipitation';
        if (map.getLayer('precipitation-fill-layer')) map.setLayoutProperty('precipitation-fill-layer', 'visibility', isPrecipitation ? 'visible' : 'none');
        if (map.getLayer('flood-points-layer')) map.setLayoutProperty('flood-points-layer', 'visibility', isPrecipitation ? 'none' : 'visible');
        document.getElementById('precipitation-selector-container').style.display = isPrecipitation ? 'block' : 'none';
        document.getElementById('flood-selector-container').style.display = isPrecipitation ? 'none' : 'block';
        document.getElementById('precipitation-legend').style.display = isPrecipitation ? 'block' : 'none';
        document.getElementById('flood-legend').style.display = isPrecipitation ? 'none' : 'block';
    } else {
        if (map.getLayer('precipitation-fill-layer')) map.setLayoutProperty('precipitation-fill-layer', 'visibility', 'none');
        if (map.getLayer('flood-points-layer')) map.setLayoutProperty('flood-points-layer', 'visibility', 'none');
    }
}