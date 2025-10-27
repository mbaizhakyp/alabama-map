// Your Mapbox public access token
mapboxgl.accessToken = 'pk.eyJ1IjoibWJhaXpoYWt5cCIsImEiOiJjbWdndndyMzkwbmFqMmtxNnQ3djdjdnV2In0.EHvEVkrhFwZWmZbLsT8b3g';

// --- CONFIGURATION ---
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const years = [2020, 2021, 2022, 2023, 2024, 2025];
const dayLabels = ['Today', 'Tomorrow', '+2 Days'];
const INITIAL_VIEW_STATE = { center: [-86.9, 32.8], zoom: 6.5 };
const MAP_BG_COLOR = '#e2e8f0';
const FLOOD_COLORS = { river: '#319795', flash: '#dd6b20' };
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
let forecastData = [];
let allCountyGeometries = []; // <-- ADD THIS

// --- MAP INITIALIZATION ---
const map = new mapboxgl.Map({
    container: 'map', style: 'mapbox://styles/mapbox/light-v11',
    center: INITIAL_VIEW_STATE.center, zoom: INITIAL_VIEW_STATE.zoom
});

// --- DATA FETCHING ---
async function fetchForecastData() {
    try {
        const response = await fetch('http://localhost:3001/api/forecast');
        if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
        
        forecastData = await response.json();

        if (map.isStyleLoaded() && !map.getSource('forecast-data')) {
            map.addSource('forecast-data', { type: 'geojson', data: forecastData[0] });
            map.addLayer({
                id: 'forecast-layer',
                type: 'fill',
                source: 'forecast-data',
                paint: {
                    'fill-color': ['interpolate', ['linear'], ['coalesce', ['get', 'predicted_precipitation_inches'], 0],
                        0.5, '#edf8fb',
                        0.65, '#74a9cf',
                        0.8, '#023858'
                    ],
                    'fill-opacity': 0.75,
                    'fill-outline-color': MAP_BG_COLOR
                },
                layout: { 'visibility': 'none' }
            }, 'river-flood-layer');
            
            // Set up listeners again to include the new forecast layer
            setupInteractionListeners();
        }
    } catch (error) {
        console.error("Failed to fetch forecast data:", error);
        alert("Could not load forecast data. Is the local server running?");
    }
}

// --- MAP LAYERS & SOURCES ---
function addSourcesAndLayers() {
    if (map.getLayer('background-tint')) return;

    map.addLayer({ id: 'background-tint', type: 'background', paint: { 'background-color': MAP_BG_COLOR, 'background-opacity': 0.7 } }, 'land-structure-line');
    
    map.addSource('precipitation-data', { type: 'geojson', data: `precipitation-data/${months[0]}.geojson` });
    map.addLayer({ id: 'precipitation-layer', type: 'fill', source: 'precipitation-data', paint: { 'fill-color': ['interpolate', ['linear'], ['coalesce', ['get', 'total_precipitation_inches'], 0], 0, '#ffffcc', 10, '#a1dab4', 25, '#41b6c4', 50, '#2c7fb8', 100, '#253494'], 'fill-opacity': 0.7, 'fill-outline-color': MAP_BG_COLOR }, layout: { visibility: 'none' } });
    
    map.addSource('svi-data', { type: 'geojson', data: 'svi-data/alabama_svi_tracts_master.geojson' });
    map.addLayer({ id: 'svi-layer', type: 'fill', source: 'svi-data', paint: { 'fill-color': ['interpolate', ['linear'], ['coalesce', ['get', 'RPL_THEMES_state'], 0], 0, '#4d9221', 0.5, '#f1b621', 1, '#c51b7d'], 'fill-opacity': 0.75, 'fill-outline-color': MAP_BG_COLOR }, layout: { visibility: 'none' } });

    map.addSource('river-flood-data', { type: 'geojson', data: `flood-data/river-flood-events/Flood_Events_${years[0]}.geojson` });
    map.addLayer({ id: 'river-flood-layer', type: 'circle', source: 'river-flood-data', paint: { 'circle-radius': 6, 'circle-color': FLOOD_COLORS.river, 'circle-stroke-color': MAP_BG_COLOR, 'circle-stroke-width': 2 }, layout: { visibility: 'none' } });
    
    map.addSource('flash-flood-data', { type: 'geojson', data: `flood-data/flash-flood-events/AL_Flood_Events_${years[0]}.geojson` });
    map.addLayer({ id: 'flash-flood-layer', type: 'circle', source: 'flash-flood-data', paint: { 'circle-radius': 6, 'circle-color': FLOOD_COLORS.flash, 'circle-stroke-color': MAP_BG_COLOR, 'circle-stroke-width': 2 }, layout: { visibility: 'none' } });
    // --- ADD NEW HIGHLIGHT LAYER ---
    map.addSource('highlight-county-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] } // Start empty
    });

    map.addLayer({
        id: 'highlight-county-layer-line',
        type: 'line',
        source: 'highlight-county-source',
        paint: {
            'line-color': '#005a9c', // A distinct blue
            'line-width': 3,
            'line-opacity': 0.9
        },
        layout: { 'visibility': 'visible' }
    });
    // --- END NEW HIGHLIGHT LAYER ---
    map.addSource('all-counties-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] } // Start empty
    });
    map.addLayer({
        id: 'county-mask-layer',
        type: 'fill',
        source: 'all-counties-source', // Use the new source
        paint: {
            'fill-color': '#000', // Black
            'fill-opacity': 0.5    // 50% opacity. Adjust this value to make it lighter/darker
        },
        // This filter ["==", ["get", "name"], ""] means "show nothing" by default.
        filter: ["==", ["get", "name"], ""]
    }, 'highlight-county-layer-line');
}

// --- Interaction Listeners ---
function setupInteractionListeners() {
    const clickableLayers = ['precipitation-layer', 'svi-layer', 'river-flood-layer', 'flash-flood-layer', 'forecast-layer'];
    const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });

    const hoverLayers = {
        'precipitation-layer': (e) => `<strong>${e.features[0].properties.name} County</strong>`,
        'svi-layer': (e) => {
            const props = e.features[0].properties;
            const themeSelect = document.getElementById('svi-theme-select');
            const factorSelect = document.getElementById('svi-factor-select');
            let propertyToDisplay = themeSelect.value;
            let title = SVI_DATA[propertyToDisplay].title;
            if (SVI_DATA[propertyToDisplay].factors && factorSelect.value !== propertyToDisplay) {
                propertyToDisplay = factorSelect.value;
                title = SVI_DATA[themeSelect.value].factors[propertyToDisplay];
            }
            const value = props[propertyToDisplay] !== null ? props[propertyToDisplay].toFixed(3) : 'No data';
            return `<h3>${props.COUNTY}</h3><p>${title}: <strong>${value}</strong></p>`;
        },
        'forecast-layer': (e) => {
            const props = e.features[0].properties;
            const value = props.predicted_precipitation_inches.toFixed(2);
            return `<h3>${props.name} County</h3><p>Forecast Value: <strong>${value}</strong></p>`;
        }
    };

    Object.keys(hoverLayers).forEach(layerId => {
        map.off('mousemove', layerId);
        map.off('mouseleave', layerId);
        if (!map.getLayer(layerId)) return;
        map.on('mousemove', layerId, (e) => {
            if (e.features.length > 0) {
                map.getCanvas().style.cursor = 'pointer';
                const popupHTML = hoverLayers[layerId](e);
                popup.setLngLat(e.lngLat).setHTML(popupHTML).addTo(map);
            }
        });
        map.on('mouseleave', layerId, () => {
            map.getCanvas().style.cursor = '';
            popup.remove();
        });
    });

    ['river-flood-layer', 'flash-flood-layer'].forEach(layerId => {
        map.off('mouseenter', layerId);
        map.off('mouseleave', layerId);
        if (!map.getLayer(layerId)) return;
        map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
    });

    map.off('click');
    map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: clickableLayers });
        if (!features.length) return;
        popup.remove();
        const feature = features[0];
        let content = '';
        switch (feature.layer.id) {
            case 'forecast-layer':
                const forecastValue = feature.properties.predicted_precipitation_inches;
                content = `<h3>${feature.properties.name}</h3><p>Forecast Value: <strong>${forecastValue.toFixed(2)} in</strong></p>${createVisualizerHTML(forecastValue, "forecast")}`;
                break;
            case 'precipitation-layer':
                const precipValue = feature.properties.total_precipitation_inches;
                content = `<h3>${feature.properties.name}</h3><p>Total Precipitation: <strong>${precipValue.toFixed(2)} in</strong></p>${createVisualizerHTML(precipValue, "precipitation")}`;
                break;
            case 'river-flood-layer':
            case 'flash-flood-layer':
                const date = new Date(feature.properties.BEGIN_DATE).toLocaleDateString();
                const floodTitle = feature.layer.id === 'river-flood-layer' ? 'River Flood' : 'Flash Flood';
                content = `<h3>${floodTitle} Event</h3><p>County: <strong>${feature.properties.CZ_NAME_STR}</strong></p><p>Date: <strong>${date}</strong></p>`;
                break;
            case 'svi-layer':
                const props = feature.properties; 
                const selectedThemeKey = document.getElementById('svi-theme-select').value; 
                const selectedFactorKey = document.getElementById('svi-factor-select').value; 
                content = `<h3>${props.COUNTY}</h3><p class="location">${props.LOCATION}</p>`; 
                if (selectedThemeKey === 'RPL_THEMES_state') { 
                    content += `<p>Overall Vulnerability Index: <strong>${props.RPL_THEMES_state.toFixed(3)}</strong></p>${createVisualizerHTML(props.RPL_THEMES_state, "svi")}<hr style="border: none; height: 1px; background-color: var(--border-color); margin: 15px 0;">`; 
                    Object.keys(SVI_DATA).forEach(themeKey => { 
                        if (themeKey !== 'RPL_THEMES_state') {
                            content += `<p>${SVI_DATA[themeKey].title} Index: <strong>${props[themeKey].toFixed(3)}</strong></p>`; 
                        }
                    }); 
                } else { 
                    const currentFactorIsTheme = selectedFactorKey === selectedThemeKey; 
                    const factorToVisualize = currentFactorIsTheme ? selectedThemeKey : selectedFactorKey; 
                    const factorTitle = currentFactorIsTheme ? `Theme: ${SVI_DATA[selectedThemeKey].title}` : SVI_DATA[selectedThemeKey].factors[selectedFactorKey]; 
                    content += `<p>${factorTitle} Index: <strong>${props[factorToVisualize].toFixed(3)}</strong></p>${createVisualizerHTML(props[factorToVisualize], "svi")}<hr style="border: none; height: 1px; background-color: var(--border-color); margin: 15px 0;">`; 
                    for (const factorKey in SVI_DATA[selectedThemeKey].factors) { 
                        content += `<p>${SVI_DATA[selectedThemeKey].factors[factorKey]} Index: <strong>${props[factorKey].toFixed(3)}</strong></p>`; 
                    } 
                } 
                break;
        }
        openModal(content);
    });
}

function clearCountyHighlight() {
    if (map.getSource('highlight-county-source')) {
        map.getSource('highlight-county-source').setData({ type: 'FeatureCollection', features: [] });
    }
    if (map.getLayer('county-mask-layer')) {
        map.setFilter('county-mask-layer', ["==", ["get", "name"], ""]);
    }
}

function createVisualizerHTML(value, type) {
    let percentage = 0;
    let gradientClass = '';
    let labels = ['', ''];
    value = value || 0;
    if (type === 'svi') {
        percentage = value * 100;
        gradientClass = 'svi-gradient';
        labels = ['Least Vuln.', 'Most Vuln.'];
    } else if (type === 'precipitation') {
        percentage = Math.min(value / 100, 1) * 100;
        gradientClass = 'precip-gradient';
        labels = ['0 in', '100+ in'];
    } else if (type === 'forecast') {
        const min = 0.5, max = 0.8;
        percentage = Math.max(0, Math.min(((value - min) / (max - min)), 1)) * 100;
        gradientClass = 'forecast-gradient';
        labels = ['~0.5', '~0.8+'];
    }
    return `<div class="modal-visualizer"><div class="modal-gradient-bar"><div class="gradient-marker" style="left: ${percentage}%;"></div><div class="${gradientClass}"></div></div><div class="modal-labels"><span>${labels[0]}</span><span>${labels[1]}</span></div></div>`;
}

const modal = document.getElementById('modal');
const modalContent = document.getElementById('modal-content');
const modalCloseBtn = document.getElementById('modal-close-btn');
function openModal(content) { modalContent.innerHTML = content; modal.classList.remove('hidden'); }
function closeModal() { modal.classList.add('hidden'); modalContent.innerHTML = ''; }

document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('sidebar-active');

    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const recenterButton = document.getElementById('recenter-button');
    const daySlider = document.getElementById('day-slider');
    const dayLabel = document.getElementById('day-label');
    const monthSlider = document.getElementById('month-slider');
    const monthLabel = document.getElementById('month-label');
    const yearSlider = document.getElementById('year-slider');
    const yearLabel = document.getElementById('year-label');
    const sviThemeSelect = document.getElementById('svi-theme-select');
    const sviFactorGroup = document.getElementById('svi-factor-group');
    const sviFactorSelect = document.getElementById('svi-factor-select');
    const accordionHeaders = document.querySelectorAll('.accordion-header');
    const riverFloodCheckbox = document.getElementById('river-flood-checkbox');
    const flashFloodCheckbox = document.getElementById('flash-flood-checkbox');

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
    
    // --- MODIFIED ---: This line was removed to prevent a default selection.
    // document.querySelector('.accordion-header[data-category="precipitation"]').click();
    
    for (const key in SVI_DATA) { sviThemeSelect.add(new Option(SVI_DATA[key].title, key)); }
    sviThemeSelect.dispatchEvent(new Event('change'));

    sidebarToggle.addEventListener('click', () => {
        document.body.classList.toggle('sidebar-active');
    });

    sidebar.addEventListener('transitionend', () => {
        map.resize();
        map.flyTo(INITIAL_VIEW_STATE);
    });

    recenterButton.addEventListener('click', () => map.flyTo(INITIAL_VIEW_STATE));
    modalCloseBtn.addEventListener('click', closeModal);

    daySlider.addEventListener('input', (e) => {
        const dayIndex = parseInt(e.target.value, 10);
        dayLabel.textContent = dayLabels[dayIndex];
        if (map.getSource('forecast-data') && forecastData.length > 0) {
            map.getSource('forecast-data').setData(forecastData[dayIndex]);
        }
    });

    sviThemeSelect.addEventListener('change', (e) => {
        const selectedThemeKey = e.target.value; const themeData = SVI_DATA[selectedThemeKey]; sviFactorSelect.innerHTML = ''; if (themeData.factors) { sviFactorGroup.style.display = 'block'; sviFactorSelect.add(new Option(`Theme: ${themeData.title}`, selectedThemeKey)); for (const factorKey in themeData.factors) { sviFactorSelect.add(new Option(themeData.factors[factorKey], factorKey)); } } else { sviFactorGroup.style.display = 'none'; } updateSviLayer();
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
        updateFloodDataSources();
    });

    riverFloodCheckbox.addEventListener('change', updateFloodLayersVisibility);
    flashFloodCheckbox.addEventListener('change', updateFloodLayersVisibility);

    // --- ADD THIS LISTENER ---
    // Listen for the custom event dispatched from useChat.ts
    window.addEventListener('highlightCounty', (event) => {
        const countyName = event.detail.countyName;
        if (countyName) {
            highlightCountyOnMap(countyName);
        }
    });
    // --- END ADD ---
});

map.on('load', () => {
    addSourcesAndLayers();
    updateMapState();
    setupInteractionListeners();
    fetchForecastData();
    // --- ADD THIS ---
    // Fetch the county geometry file so we can search it later
    fetch('precipitation-data/january.geojson')
        .then(res => res.json())
        .then(geojson => {
            allCountyGeometries = geojson.features;
            console.log(`Loaded ${allCountyGeometries.length} county geometries for highlighting.`);
            
            // --- ADD THIS ---
            // Now, populate the new mask source with all the county geometries
            if (map.getSource('all-counties-source')) {
                map.getSource('all-counties-source').setData(geojson);
            }
            // --- END ADD ---
        })
        .catch(err => console.error("Error loading county geometry file:", err));
    // --- END ADD ---
});

function updateFloodDataSources() {
    if (!map.getSource('river-flood-data')) return;
    const year = years[parseInt(document.getElementById('year-slider').value, 10)];
    map.getSource('river-flood-data').setData(`flood-data/Flood_Events_${year}.geojson`);
    map.getSource('flash-flood-data').setData(`flood-data/flash-flood-events/AL_Flood_Events_${year}.geojson`);
}

function updateFloodLayersVisibility() {
    if (!map.getLayer('river-flood-layer')) return;
    const isFloodsActive = document.querySelector('.accordion-header[data-category="floods"]').classList.contains('active');
    const riverVisible = document.getElementById('river-flood-checkbox').checked && isFloodsActive;
    const flashVisible = document.getElementById('flash-flood-checkbox').checked && isFloodsActive;
    map.setLayoutProperty('river-flood-layer', 'visibility', riverVisible ? 'visible' : 'none');
    map.setLayoutProperty('flash-flood-layer', 'visibility', flashVisible ? 'visible' : 'none');
}

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
    if (map.getLayer('svi-layer')) {
        map.setPaintProperty('svi-layer', 'fill-color', ['interpolate', ['linear'], ['coalesce', ['get', propertyToDisplay], 0], 0, '#4d9221', 0.5, '#f1b621', 1, '#c51b7d']);
    }
    legendTitle.textContent = title;
}

function updateMapState() {
    if (!map.isStyleLoaded()) return;

    clearCountyHighlight(); // Clear any existing highlight/mask
    
    const activeHeader = document.querySelector('.accordion-header.active');
    const selectedCategory = activeHeader ? activeHeader.dataset.category : null;

    const legends = { forecast: document.getElementById('forecast-legend'), precipitation: document.getElementById('precipitation-legend'), floods: document.getElementById('flood-legend'), svi: document.getElementById('svi-legend') };
    const layers = {
        forecast: ['forecast-layer'],
        precipitation: ['precipitation-layer'],
        floods: ['river-flood-layer', 'flash-flood-layer'],
        svi: ['svi-layer']
    };

    for (const category in layers) {
        const isSelected = category === selectedCategory;
        if (legends[category]) legends[category].style.display = isSelected ? 'block' : 'none';

        layers[category].forEach(layerId => {
            if (map.getLayer(layerId)) {
                let visibility = 'none';
                if (isSelected) {
                    if (category === 'floods') {
                        const checkboxId = layerId.replace('-layer', '-checkbox');
                        visibility = document.getElementById(checkboxId)?.checked ? 'visible' : 'none';
                    } else {
                        visibility = 'visible';
                    }
                }
                map.setLayoutProperty(layerId, 'visibility', visibility);
            }
        });
    }
}
// --- ADD THIS NEW HELPER FUNCTION ---
/**
 * Calculates the simple center (centroid) of a county feature's geometry.
 * Handles both Polygon and MultiPolygon shapes.
 */
function getCountyCenter(feature) {
    const geometryType = feature.geometry.type;
    const coordinates = feature.geometry.coordinates;
    let lonSum = 0;
    let latSum = 0;
    let pointCount = 0;

    if (geometryType === 'Polygon') {
        // coordinates[0] is the outer ring
        coordinates[0].forEach(coord => {
            lonSum += coord[0]; // lng
            latSum += coord[1]; // lat
            pointCount++;
        });
    } else if (geometryType === 'MultiPolygon') {
        // Iterate through each polygon in the multipolygon
        coordinates.forEach(polygon => {
            // polygon[0] is the outer ring of that specific polygon
            polygon[0].forEach(coord => {
                lonSum += coord[0]; // lng
                latSum += coord[1]; // lat
                pointCount++;
            });
        });
    }

    if (pointCount === 0) {
        // Fallback to Alabama's center just in case
        return { lng: -86.9, lat: 32.8 }; 
    }

    return {
        lng: lonSum / pointCount,
        lat: latSum / pointCount
    };
}
// --- REPLACE YOUR OLD FUNCTION WITH THIS ---
function highlightCountyOnMap(countyName) {
    if (!countyName || allCountyGeometries.length === 0) {
        console.warn('Cannot highlight county: No name provided or geometries not loaded.');
        return;
    }
    console.log(`Highlighting county: ${countyName}`);
    
    const countyFeature = allCountyGeometries.find(
        f => f.properties.name && f.properties.name.toLowerCase().includes(countyName.toLowerCase())
    );

    if (countyFeature) {
        // 1. Update the highlight line (unchanged)
        map.getSource('highlight-county-source').setData(countyFeature);

        // 2. Calculate the center (unchanged)
        const countyCenter = getCountyCenter(countyFeature);
        
        // 3. Fly the map (unchanged)
        map.flyTo({
            center: [countyCenter.lng, countyCenter.lat],
            zoom: 9, 
            padding: 40
        });

        // --- ADD THIS ---
        // 4. Update the mask filter
        // This filter tells the mask layer to cover every county *except* the one we found.
        const highlightedCountyName = countyFeature.properties.name;
        map.setFilter('county-mask-layer', ["!=", ["get", "name"], highlightedCountyName]);
        // --- END ADD ---

    } else {
        console.warn(`County "${countyName}" not found in geometries.`);
        // Clear highlight line
        map.getSource('highlight-county-source').setData({ type: 'FeatureCollection', features: [] });
        
        // --- ADD THIS ---
        // Reset the mask filter to show nothing
        map.setFilter('county-mask-layer', ["==", ["get", "name"], ""]);
        // --- END ADD ---
    }
}