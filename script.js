// Your Mapbox public access token
mapboxgl.accessToken = 'pk.eyJ1IjoibWJhaXpoYWt5cCIsImEiOiJjbWdndndyMzkwbmFqMmtxNnQ3djdjdnV2In0.EHvEVkrhFwZWmZbLsT8b3g';

// --- CONFIGURATION ---
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const years = [2020, 2021, 2022, 2023, 2024, 2025];
const INITIAL_VIEW_STATE = { center: [-86.9, 32.8], zoom: 6.5 };
const SVI_THEME_TITLES = { 'RPL_THEMES': 'Overall SVI', 'RPL_THEME1': 'Socioeconomic', 'RPL_THEME2': 'Household Comp.', 'RPL_THEME3': 'Minority Status', 'RPL_THEME4': 'Housing/Transport' };
const MAP_BG_COLOR = '#e2e8f0';

// --- MAP INITIALIZATION ---
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/light-v11',
    center: INITIAL_VIEW_STATE.center,
    zoom: INITIAL_VIEW_STATE.zoom
});

// --- MAP LAYERS & SOURCES FUNCTION ---
function addSourcesAndLayers() {
    if (!map.getLayer('background-tint')) {
        map.addLayer({
            id: 'background-tint', type: 'background',
            paint: { 'background-color': MAP_BG_COLOR, 'background-opacity': 0.7 }
        }, 'land-structure-line');
    }
    if (!map.getSource('precipitation-data')) map.addSource('precipitation-data', { type: 'geojson', data: `precipitation-data/${months[0]}.geojson` });
    if (!map.getSource('flood-data')) map.addSource('flood-data', { type: 'geojson', data: `flood-data/Flood_Events_${years[0]}.geojson` });
    if (!map.getSource('svi-data')) map.addSource('svi-data', { type: 'geojson', data: 'svi-data/alabama_svi_2022.geojson' });

    if (!map.getLayer('precipitation-fill-layer')) {
        map.addLayer({
            id: 'precipitation-fill-layer', type: 'fill', source: 'precipitation-data',
            paint: { 'fill-color': ['interpolate', ['linear'], ['coalesce', ['get', 'total_precipitation_inches'], 0], 0, '#ffffcc', 10, '#a1dab4', 25, '#41b6c4', 50, '#2c7fb8', 100, '#253494'], 'fill-opacity': 0.7, 'fill-outline-color': MAP_BG_COLOR }
        });
    }
    if (!map.getLayer('flood-points-layer')) {
        map.addLayer({
            id: 'flood-points-layer', type: 'circle', source: 'flood-data',
            paint: { 'circle-radius': 6, 'circle-color': '#319795', 'circle-stroke-color': MAP_BG_COLOR, 'circle-stroke-width': 2 }
        });
    }
    if (!map.getLayer('svi-layer')) {
        map.addLayer({
            id: 'svi-layer', type: 'fill', source: 'svi-data',
            paint: { 'fill-color': ['interpolate', ['linear'], ['coalesce', ['get', 'RPL_THEMES'], 0], 0, '#4d9221', 0.5, '#f1b621', 1, '#c51b7d'], 'fill-opacity': 0.75, 'fill-outline-color': MAP_BG_COLOR }
        });
    }
    updateMapState();
}

// --- NEW: Helper function to create the visualizer HTML ---
function createVisualizerHTML(value, type) {
    let percentage = 0;
    let gradientClass = '';
    let labels = ['', ''];

    if (type === 'svi') {
        percentage = (value || 0) * 100;
        gradientClass = 'svi-gradient';
        labels = ['Least Vuln.', 'Most Vuln.'];
    } else if (type === 'precip') {
        // Cap the visual scale at 100 inches for clarity
        percentage = Math.min((value || 0) / 100, 1) * 100;
        gradientClass = 'precip-gradient';
        labels = ['0 in', '100+ in'];
    }

    return `
        <div class="modal-visualizer">
            <div class="modal-gradient-bar">
                <div class="gradient-marker" style="left: ${percentage}%;"></div>
                <div class="${gradientClass}"></div>
            </div>
            <div class="modal-labels">
                <span>${labels[0]}</span>
                <span>${labels[1]}</span>
            </div>
        </div>`;
}

// --- Interaction Listeners for Clickable Layers ---
function setupInteractionListeners() {
    const clickableLayers = ['precipitation-fill-layer', 'flood-points-layer', 'svi-layer'];
    
    clickableLayers.forEach(layerId => {
        map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
    });

    map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: clickableLayers });
        if (!features.length) return;
        
        const feature = features[0];
        let content = '';

        switch (feature.layer.id) {
            case 'precipitation-fill-layer':
                content = `<h3>${feature.properties.name}</h3>
                           <p>Total Precipitation: <strong>${feature.properties.total_precipitation_inches.toFixed(2)} in</strong></p>
                           ${createVisualizerHTML(feature.properties.total_precipitation_inches, 'precip')}`;
                break;
            case 'flood-points-layer':
                const date = new Date(feature.properties.BEGIN_DATE).toLocaleDateString();
                content = `<h3>Flood Event</h3>
                           <p>County: <strong>${feature.properties.CZ_NAME_STR}</strong></p>
                           <p>Date: <strong>${date}</strong></p>`;
                break;
            case 'svi-layer':
                content = `<h3>${feature.properties.COUNTY}</h3>
                           <p>Overall Vulnerability: <strong>${(feature.properties.RPL_THEMES * 100).toFixed(1)}th percentile</strong></p>
                           ${createVisualizerHTML(feature.properties.RPL_THEMES, 'svi')}
                           <hr style="border: none; height: 1px; background-color: var(--border-color); margin: 15px 0;">
                           <p>Socioeconomic: <strong>${(feature.properties.RPL_THEME1 * 100).toFixed(1)}th percentile</strong></p>
                           <p>Household Composition: <strong>${(feature.properties.RPL_THEME2 * 100).toFixed(1)}th percentile</strong></p>
                           <p>Minority Status: <strong>${(feature.properties.RPL_THEME3 * 100).toFixed(1)}th percentile</strong></p>
                           <p>Housing & Transport: <strong>${(feature.properties.RPL_THEME4 * 100).toFixed(1)}th percentile</strong></p>`;
                break;
        }
        openModal(content);
    });
}

// --- Modal Control Functions ---
const modal = document.getElementById('modal');
const modalContent = document.getElementById('modal-content');
const modalCloseBtn = document.getElementById('modal-close-btn');

function openModal(content) {
    modalContent.innerHTML = content;
    modal.classList.remove('hidden');
}
function closeModal() {
    modal.classList.add('hidden');
    modalContent.innerHTML = '';
}

// --- UI EVENT LISTENERS (SETUP ONCE) ---
document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('sidebar-active');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const recenterButton = document.getElementById('recenter-button');
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
    modalCloseBtn.addEventListener('click', closeModal);
    
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
map.on('load', () => { addSourcesAndLayers(); setupInteractionListeners(); });
map.on('style.load', () => { addSourcesAndLayers(); setupInteractionListeners(); });

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