// Your Mapbox public access token
mapboxgl.accessToken = 'pk.eyJ1IjoibWJhaXpoYWt5cCIsImEiOiJjbWdndndyMzkwbmFqMmtxNnQ3djdjdnV2In0.EHvEVkrhFwZWmZbLsT8b3g';

// --- CONFIGURATION ---
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const years = [2020, 2021, 2022, 2023, 2024, 2025];
const INITIAL_VIEW_STATE = { center: [-86.9, 32.8], zoom: 6.5 };
const MAP_BG_COLOR = '#e2e8f0'; 
const SVI_DATA = {
    'RPL_THEMES_state': { title: 'Overall SVI' },
    'RPL_THEME1_state': {
        title: 'Socioeconomic',
        factors: { 'EPL_POV150_state': 'Poverty', 'EPL_UNEMP_state': 'Unemployment', 'EPL_HBURD_state': 'Housing Cost Burden', 'EPL_NOHSDP_state': 'No High School Diploma', 'EPL_UNINSUR_state': 'No Health Insurance' }
    },
    'RPL_THEME2_state': {
        title: 'Household Composition',
        factors: { 'EPL_AGE65_state': 'Aged 65 or Older', 'EPL_AGE17_state': 'Aged 17 or Younger', 'EPL_DISABL_state': 'Disability', 'EPL_SNGPNT_state': 'Single-Parent Households', 'EPL_LIMENG_state': 'Limited English' }
    },
    'RPL_THEME3_state': {
        title: 'Minority Status',
        factors: { 'EPL_MINRTY_state': 'Racial & Ethnic Minorities' }
    },
    'RPL_THEME4_state': {
        title: 'Housing & Transportation',
        factors: { 'EPL_MUNIT_state': 'Multi-Unit Structures', 'EPL_MOBILE_state': 'Mobile Homes', 'EPL_CROWD_state': 'Crowding', 'EPL_NOVEH_state': 'No Vehicle', 'EPL_GROUPQ_state': 'Group Quarters' }
    }
};

// --- MAP INITIALIZATION ---
const map = new mapboxgl.Map({
    container: 'map', style: 'mapbox://styles/mapbox/light-v11',
    center: INITIAL_VIEW_STATE.center, zoom: INITIAL_VIEW_STATE.zoom
});

// --- MAP LAYERS & SOURCES FUNCTION ---
function addSourcesAndLayers() {
    if (!map.getLayer('background-tint')) map.addLayer({ id: 'background-tint', type: 'background', paint: { 'background-color': MAP_BG_COLOR, 'background-opacity': 0.7 } }, 'land-structure-line');
    if (!map.getSource('precipitation-data')) map.addSource('precipitation-data', { type: 'geojson', data: `precipitation-data/${months[0]}.geojson` });
    if (!map.getSource('flood-data')) map.addSource('flood-data', { type: 'geojson', data: `flood-data/Flood_Events_${years[0]}.geojson` });
    if (!map.getSource('svi-data')) map.addSource('svi-data', { type: 'geojson', data: 'svi-data/alabama_svi_tracts_master.geojson' });
    if (!map.getLayer('precipitation-fill-layer')) map.addLayer({ id: 'precipitation-fill-layer', type: 'fill', source: 'precipitation-data', paint: { 'fill-color': ['interpolate', ['linear'], ['coalesce', ['get', 'total_precipitation_inches'], 0], 0, '#ffffcc', 10, '#a1dab4', 25, '#41b6c4', 50, '#2c7fb8', 100, '#253494'], 'fill-opacity': 0.7, 'fill-outline-color': MAP_BG_COLOR } });
    if (!map.getLayer('flood-points-layer')) map.addLayer({ id: 'flood-points-layer', type: 'circle', source: 'flood-data', paint: { 'circle-radius': 6, 'circle-color': '#319795', 'circle-stroke-color': MAP_BG_COLOR, 'circle-stroke-width': 2 } });
    if (!map.getLayer('svi-layer')) map.addLayer({ id: 'svi-layer', type: 'fill', source: 'svi-data', paint: { 'fill-color': ['interpolate', ['linear'], ['coalesce', ['get', 'RPL_THEMES_state'], 0], 0, '#4d9221', 0.5, '#f1b621', 1, '#c51b7d'], 'fill-opacity': 0.75, 'fill-outline-color': MAP_BG_COLOR } });
    updateMapState();
}

// --- Helper function for the modal visualizer ---
function createVisualizerHTML(value, type) { let percentage = 0; let gradientClass = ''; let labels = ['', '']; if (type === 'svi') { percentage = (value || 0) * 100; gradientClass = 'svi-gradient'; labels = ['Least Vuln.', 'Most Vuln.']; } else if (type === 'precip') { percentage = Math.min((value || 0) / 100, 1) * 100; gradientClass = 'precip-gradient'; labels = ['0 in', '100+ in']; } return `<div class="modal-visualizer"><div class="modal-gradient-bar"><div class="gradient-marker" style="left: ${percentage}%;"></div><div class="${gradientClass}"></div></div><div class="modal-labels"><span>${labels[0]}</span><span>${labels[1]}</span></div></div>`; }

// --- Interaction Listeners for Clickable Layers ---
function setupInteractionListeners() { const clickableLayers = ['precipitation-fill-layer', 'flood-points-layer', 'svi-layer']; clickableLayers.forEach(layerId => { map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; }); }); map.on('click', (e) => { const features = map.queryRenderedFeatures(e.point, { layers: clickableLayers }); if (!features.length) return; const feature = features[0]; let content = ''; switch (feature.layer.id) { case 'precipitation-fill-layer': content = `<h3>${feature.properties.name}</h3><p>Total Precipitation: <strong>${feature.properties.total_precipitation_inches.toFixed(2)} in</strong></p>${createVisualizerHTML(feature.properties.total_precipitation_inches, 'precip')}`; break; case 'flood-points-layer': const date = new Date(feature.properties.BEGIN_DATE).toLocaleDateString(); content = `<h3>Flood Event</h3><p>County: <strong>${feature.properties.CZ_NAME_STR}</strong></p><p>Date: <strong>${date}</strong></p>`; break; case 'svi-layer': const props = feature.properties; const selectedThemeKey = document.getElementById('svi-theme-select').value; const selectedFactorKey = document.getElementById('svi-factor-select').value; content = `<h3>${props.COUNTY}</h3><p class="location">${props.LOCATION}</p>`; if (selectedThemeKey === 'RPL_THEMES_state') { content += `<p>Overall Vulnerability: <strong>${(props.RPL_THEMES_state * 100).toFixed(1)}th percentile</strong></p>${createVisualizerHTML(props.RPL_THEMES_state, 'svi')}<hr style="border: none; height: 1px; background-color: var(--border-color); margin: 15px 0;">`; Object.keys(SVI_DATA).forEach(themeKey => { if (themeKey !== 'RPL_THEMES_state') content += `<p>${SVI_DATA[themeKey].title}: <strong>${(props[themeKey] * 100).toFixed(1)}th percentile</strong></p>`; }); } else { const currentFactorIsTheme = selectedFactorKey === selectedThemeKey; const factorToVisualize = currentFactorIsTheme ? selectedThemeKey : selectedFactorKey; const factorTitle = currentFactorIsTheme ? `Theme: ${SVI_DATA[selectedThemeKey].title}` : SVI_DATA[selectedThemeKey].factors[selectedFactorKey]; content += `<p>${factorTitle}: <strong>${(props[factorToVisualize] * 100).toFixed(1)}th percentile</strong></p>${createVisualizerHTML(props[factorToVisualize], 'svi')}<hr style="border: none; height: 1px; background-color: var(--border-color); margin: 15px 0;">`; for (const factorKey in SVI_DATA[selectedThemeKey].factors) { content += `<p>${SVI_DATA[selectedThemeKey].factors[factorKey]}: <strong>${(props[factorKey] * 100).toFixed(1)}th percentile</strong></p>`; } } break; } openModal(content); }); }

// --- Modal Control Functions (Simplified) ---
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
    const monthSlider = document.getElementById('month-slider');
    const monthLabel = document.getElementById('month-label');
    const yearSlider = document.getElementById('year-slider');
    const yearLabel = document.getElementById('year-label');
    const sviThemeSelect = document.getElementById('svi-theme-select');
    const sviFactorGroup = document.getElementById('svi-factor-group');
    const sviFactorSelect = document.getElementById('svi-factor-select');
    const accordionHeaders = document.querySelectorAll('.accordion-header');

    accordionHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const currentlyActive = document.querySelector('.accordion-header.active');
            if (currentlyActive && currentlyActive !== header) {
                currentlyActive.classList.remove('active');
                currentlyActive.nextElementSibling.classList.remove('active');
            }
            header.classList.toggle('active');
            header.nextElementSibling.classList.toggle('active');
            updateMapState();
        });
    });
    document.querySelector('.accordion-header').click();

    for (const key in SVI_DATA) { sviThemeSelect.add(new Option(SVI_DATA[key].title, key)); }
    sviThemeSelect.dispatchEvent(new Event('change'));

    sidebarToggle.addEventListener('click', () => document.body.classList.toggle('sidebar-active'));
    recenterButton.addEventListener('click', () => map.flyTo(INITIAL_VIEW_STATE));
    modalCloseBtn.addEventListener('click', closeModal);
    
    sviThemeSelect.addEventListener('change', (e) => {
        const selectedThemeKey = e.target.value;
        const themeData = SVI_DATA[selectedThemeKey];
        sviFactorSelect.innerHTML = '';
        if (themeData.factors) {
            sviFactorGroup.style.display = 'block';
            sviFactorSelect.add(new Option(`Theme: ${themeData.title}`, selectedThemeKey));
            for (const factorKey in themeData.factors) {
                sviFactorSelect.add(new Option(themeData.factors[factorKey], factorKey));
            }
        } else {
            sviFactorGroup.style.display = 'none';
        }
        updateSviLayer();
    });
    sviFactorSelect.addEventListener('change', updateSviLayer);

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

// --- HELPER FUNCTIONS ---
function updateSviLayer() {
    const themeSelect = document.getElementById('svi-theme-select');
    const factorSelect = document.getElementById('svi-factor-select');
    const legendTitle = document.getElementById('svi-legend-title');
    let propertyToDisplay = themeSelect.value;
    let title = SVI_DATA[propertyToDisplay].title;
    if (SVI_DATA[propertyToDisplay].factors && factorSelect.value !== propertyToDisplay) {
        propertyToDisplay = factorSelect.value;
        title = SVI_DATA[themeSelect.value].factors[propertyToDisplay];
    }
    if (map.isStyleLoaded() && map.getLayer('svi-layer')) {
        map.setPaintProperty('svi-layer', 'fill-color', ['interpolate', ['linear'], ['coalesce', ['get', propertyToDisplay], 0], 0, '#4d9221', 0.5, '#f1b621', 1, '#c51b7d']);
    }
    legendTitle.textContent = title;
}

function updateMapState() {
    if (!map.isStyleLoaded()) return;

    const activeHeader = document.querySelector('.accordion-header.active');
    const selectedCategory = activeHeader ? activeHeader.dataset.category : null;

    const legends = { precipitation: document.getElementById('precipitation-legend'), floods: document.getElementById('flood-legend'), svi: document.getElementById('svi-legend') };
    const layers = { precipitation: 'precipitation-fill-layer', floods: 'flood-points-layer', svi: 'svi-layer' };

    for (const category in layers) {
        const isSelected = category === selectedCategory;
        if (legends[category]) legends[category].style.display = isSelected ? 'block' : 'none';
        if (map.getLayer(layers[category])) {
            map.setLayoutProperty(layers[category], 'visibility', isSelected ? 'visible' : 'none');
        }
    }
}