// Your Mapbox public access token
mapboxgl.accessToken = 'pk.eyJ1IjoibWJhaXpoYWt5cCIsImEiOiJjbWdndndyMzkwbmFqMmtxNnQ3djdjdnV2In0.EHvEVkrhFwZWmZbLsT8b3g';

// --- CONFIGURATION ---
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const years = [2020, 2021, 2022, 2023, 2024, 2025];
const dayLabels = ['Today', 'Tomorrow', '+2 Days', '+3 Days', '+4 Days', '+5 Days', '+6 Days', '+7 Days', '+8 Days', '+9 Days'];
const gaugeForecastDayLabels = ['Today', 'Tomorrow', 'Day After Tomorrow'];
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
let allCountyGeometries = [];
let lastHighlightedData = null;
let riverGaugeHistoryData = null;
let riverGaugeForecastData = [];

// --- MAP INITIALIZATION ---
const map = new mapboxgl.Map({
    container: 'map', style: 'mapbox://styles/mapbox/light-v11',
    center: INITIAL_VIEW_STATE.center, zoom: INITIAL_VIEW_STATE.zoom
});

// --- DATA FETCHING ---


async function fetchRiverGaugeHistoryData(year = 2020) {
    try {
        const response = await fetch(`river-gauge-data/River_Gauge_${year}.geojson`);
        if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);

        riverGaugeHistoryData = await response.json();
        console.log(`Loaded ${riverGaugeHistoryData.features.length} river gauge history sites for ${year}.`);

        if (map.isStyleLoaded() && map.getSource('river-gauge-history-data')) {
            map.getSource('river-gauge-history-data').setData(riverGaugeHistoryData);
        }
    } catch (error) {
        console.error("Failed to load river gauge history data:", error);
    }
}

async function fetchRiverGaugeForecastData() {
    try {
        const response = await fetch('http://localhost:3001/api/river-gauge-forecast');
        if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);

        riverGaugeForecastData = await response.json();
        console.log(`Fetched river gauge forecasts for ${riverGaugeForecastData.length} days.`);

        if (map.isStyleLoaded() && map.getSource('river-gauge-forecast-data') && riverGaugeForecastData.length > 0) {
            map.getSource('river-gauge-forecast-data').setData(riverGaugeForecastData[0]);
        }
    } catch (error) {
        console.error("Failed to fetch river gauge forecast data:", error);
    }
}

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



    // River gauge history layer
    map.addSource('river-gauge-history-data', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
        id: 'river-gauge-history-layer',
        type: 'circle',
        source: 'river-gauge-history-data',
        paint: {
            'circle-radius': [
                'interpolate', ['linear'],
                ['coalesce', ['get', 'discharge'], 0],
                0, 5,
                1000, 8,
                10000, 12,
                50000, 16
            ],
            'circle-color': [
                'interpolate', ['linear'],
                ['coalesce', ['get', 'gageHeight'], 0],
                0, '#2ecc71',    // Low - green
                5, '#f1c40f',    // Medium - yellow
                15, '#e74c3c',   // High - red
                30, '#8e44ad'    // Very high - purple
            ],
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 2,
            'circle-opacity': 0.85
        },
        layout: { visibility: 'none' }
    });

    // River gauge forecast layer
    map.addSource('river-gauge-forecast-data', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
        id: 'river-gauge-forecast-layer',
        type: 'circle',
        source: 'river-gauge-forecast-data',
        paint: {
            'circle-radius': 8,
            'circle-color': [
                'match', ['get', 'status'],
                'major-flood', '#7b2cbf',    // Dark purple - major flood
                'moderate-flood', '#8e44ad', // Purple - moderate flood
                'minor-flood', '#c0392b',    // Dark red - minor flood
                'near-flood', '#e74c3c',     // Red - near flood
                'action', '#f1c40f',         // Yellow - action stage
                '#2ecc71'                    // Green - normal
            ],
            'circle-stroke-color': '#fff',
            'circle-stroke-width': 2,
            'circle-opacity': 0.9
        },
        layout: { visibility: 'none' }
    });

    map.addSource('all-counties-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] } // Start empty
    });

    map.addSource('highlight-county-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] } // Start empty
    });

    // --- ADD THE NEW DEFAULT BORDERS LAYER ---
    map.addLayer({
        id: 'all-counties-borders-layer',
        type: 'line',
        source: 'all-counties-source', // Uses the source populated on map load
        paint: {
            'line-color': 'black', // A light-medium gray
            'line-width': 1,
            'line-opacity': 0.5
        },
        layout: {
            'visibility': 'visible' // Visible by default
        }
    });

    map.addLayer({
        id: 'highlight-county-layer-line',
        type: 'line',
        source: 'highlight-county-source',
        paint: {
            'line-color': 'red', // A distinct blue
            'line-width': 5,
            'line-opacity': 0.9
        },
        layout: { 'visibility': 'visible' }
    });

    map.addLayer({
        id: 'county-mask-layer',
        type: 'fill',
        source: 'all-counties-source', // Use the new source
        paint: {
            'fill-color': 'yellow', // Black
            'fill-opacity': 0.2    // 50% opacity. Adjust this value to make it lighter/darker
        },
        filter: ["==", ["get", "COUNTY"], ""], // Show nothing by default
    }, 'highlight-county-layer-line'); // Place mask *under* the blue highlight

    map.addLayer({
        id: 'highlight-county-layer-fill', // <-- NEW CLICK TARGET
        type: 'fill',
        source: 'highlight-county-source', // <-- SAME SOURCE as the line
        paint: {
            'fill-color': '#000', // Color doesn't matter
            'fill-opacity': 0.0      // Totally invisible
        }
    }, 'county-mask-layer');
}

// --- Interaction Listeners ---
function setupInteractionListeners() {
    const clickableLayers = ['precipitation-layer', 'svi-layer', 'river-flood-layer', 'flash-flood-layer', 'forecast-layer', 'river-gauge-history-layer', 'river-gauge-forecast-layer', 'highlight-county-layer-fill'];
    console.log('Clickable layers set:', clickableLayers);
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
        },

        'river-gauge-history-layer': (e) => {
            const props = e.features[0].properties;
            const height = props.gageHeight !== null ? `${props.gageHeight.toFixed(2)} ${props.gageHeightUnit}` : 'N/A';
            const flow = props.discharge !== null ? `${props.discharge.toLocaleString()} ${props.dischargeUnit}` : 'N/A';
            return `<strong>${props.siteName}</strong><br>Year: ${props.year}<br>Avg. Water Level: ${height}<br>Avg. Flow Rate: ${flow}`;
        },
        'river-gauge-forecast-layer': (e) => {
            const props = e.features[0].properties;
            const stageValue = props.primaryValue !== null ? `${props.primaryValue.toFixed(2)} ${props.primaryUnit}` : 'N/A';
            const flowValue = props.secondaryValue !== null ? `${props.secondaryValue.toLocaleString()} ${props.secondaryUnit}` : 'N/A';
            const statusLabels = { 'major-flood': 'MAJOR FLOOD', 'moderate-flood': 'MODERATE FLOOD', 'minor-flood': 'MINOR FLOOD', 'near-flood': 'Near Flood', 'action': 'Action Stage', 'normal': 'Normal' };
            const dataType = props.dataSource === 'forecast' ? 'Forecast' : 'Observed';
            return `<strong>${props.siteName}</strong><br>Stage: ${stageValue}<br>Flow: ${flowValue}<br>${dataType} | ${statusLabels[props.status] || 'Normal'}`;
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
        console.log('Map clicked at', e.lngLat);
        const features = map.queryRenderedFeatures(e.point, { layers: clickableLayers });

        if (!features.length) {
            closeModal(); // Close modal if user clicks empty space
            return;
        }

        console.log('Clicked on feature(s) from layers:', features.map(f => f.layer.id));
        popup.remove();
        const feature = features[0];
        let content = '';
        switch (feature.layer.id) {
            case 'highlight-county-layer-fill':
                console.log("CLICKED ON 'highlight-county-layer-fill'");
                if (lastHighlightedData) {
                    console.log('Data found, building popup HTML...');
                    content = buildPopupHtmlFromData(lastHighlightedData);
                } else {
                    console.log('Data is NULL, showing generic popup.');
                    content = "<h3>Highlighted County</h3><p>No detailed data available for this query.</p>";
                }
                openModal(content); // Use your existing modal
                break;
            case 'forecast-layer':
                const forecastValue = feature.properties.predicted_precipitation_inches;
                content = `<h3>${feature.properties.name}</h3><p>Forecast Value: <strong>${forecastValue.toFixed(2)} in</strong></p>${createVisualizerHTML(forecastValue, "forecast")}`;
                openModal(content);
                break;
            case 'precipitation-layer':
                const precipValue = feature.properties.total_precipitation_inches;
                content = `<h3>${feature.properties.name}</h3><p>Total Precipitation: <strong>${precipValue.toFixed(2)} in</strong></p>${createVisualizerHTML(precipValue, "precipitation")}`;
                openModal(content);
                break;
            case 'river-flood-layer':
            case 'flash-flood-layer':
                const date = new Date(feature.properties.BEGIN_DATE).toLocaleDateString();
                const floodTitle = feature.layer.id === 'river-flood-layer' ? 'River Flood' : 'Flash Flood';
                content = `<h3>${floodTitle} Event</h3><p>County: <strong>${feature.properties.CZ_NAME_STR}</strong></p><p>Date: <strong>${date}</strong></p>`;
                openModal(content);
                break;

            case 'river-gauge-history-layer':
                const histProps = feature.properties;
                const histGageHeight = histProps.gageHeight !== null ? `${histProps.gageHeight.toFixed(2)} ${histProps.gageHeightUnit}` : 'N/A';
                const histDischarge = histProps.discharge !== null ? `${histProps.discharge.toLocaleString()} ${histProps.dischargeUnit}` : 'N/A';
                const histMaxHeight = histProps.gageHeightMax !== null ? `${histProps.gageHeightMax.toFixed(2)} ${histProps.gageHeightUnit}` : 'N/A';
                const histMaxDischarge = histProps.dischargeMax !== null ? `${histProps.dischargeMax.toLocaleString()} ${histProps.dischargeUnit}` : 'N/A';
                content = `
                    <h3>${histProps.siteName}</h3>
                    <p class="location">Year: ${histProps.year}</p>
                    <hr style="border: none; height: 1px; background-color: var(--border-color); margin: 15px 0;">
                    <p><strong>Annual Avg. Water Level</strong></p>
                    <p style="font-size: 1.5em; margin: 5px 0;">${histGageHeight}</p>
                    <p style="font-size: 0.8em; color: #666;">Max: ${histMaxHeight} | ${histProps.gageHeightReadings || 0} readings</p>
                    ${createVisualizerHTML(histProps.gageHeight || 0, "gauge-height")}
                    <hr style="border: none; height: 1px; background-color: var(--border-color); margin: 15px 0;">
                    <p><strong>Annual Avg. Flow Rate</strong></p>
                    <p style="font-size: 1.5em; margin: 5px 0;">${histDischarge}</p>
                    <p style="font-size: 0.8em; color: #666;">Max: ${histMaxDischarge} | ${histProps.dischargeReadings || 0} readings</p>
                `;
                openModal(content);
                break;
            case 'river-gauge-forecast-layer':
                const fcstProps = feature.properties;
                const fcstStage = fcstProps.primaryValue !== null ? `${fcstProps.primaryValue.toFixed(2)} ${fcstProps.primaryUnit}` : 'N/A';
                const fcstFlow = fcstProps.secondaryValue !== null ? `${fcstProps.secondaryValue.toLocaleString()} ${fcstProps.secondaryUnit}` : 'N/A';
                const fcstFlood = fcstProps.floodStage !== null ? `${fcstProps.floodStage} ${fcstProps.primaryUnit}` : 'N/A';
                const fcstAction = fcstProps.actionStage !== null ? `${fcstProps.actionStage} ${fcstProps.primaryUnit}` : 'N/A';
                const fcstTime = fcstProps.validTime ? new Date(fcstProps.validTime).toLocaleString() : 'N/A';
                const dataType = fcstProps.dataSource === 'forecast' ? 'Forecast' : 'Observed';
                const statusLabels = { 'major-flood': 'MAJOR FLOOD', 'moderate-flood': 'MODERATE FLOOD', 'minor-flood': 'MINOR FLOOD', 'near-flood': 'Near Flood Stage', 'action': 'Action Stage', 'normal': 'Normal' };
                const statusColors = { 'major-flood': '#7b2cbf', 'moderate-flood': '#8e44ad', 'minor-flood': '#c0392b', 'near-flood': '#e74c3c', 'action': '#f1c40f', 'normal': '#2ecc71' };
                content = `
                    <h3>${fcstProps.siteName}</h3>
                    <p class="location">${fcstProps.dayLabel} - ${dataType} as of: ${fcstTime}</p>
                    <hr style="border: none; height: 1px; background-color: var(--border-color); margin: 15px 0;">
                    <p><strong>Water Level (Stage)</strong></p>
                    <p style="font-size: 1.5em; margin: 5px 0;">${fcstStage}</p>
                    <p style="font-size: 0.85em; color: #666;">Flood Stage: ${fcstFlood} | Action Stage: ${fcstAction}</p>
                    <hr style="border: none; height: 1px; background-color: var(--border-color); margin: 15px 0;">
                    <p><strong>Flow Rate (Discharge)</strong></p>
                    <p style="font-size: 1.5em; margin: 5px 0;">${fcstFlow}</p>
                    <hr style="border: none; height: 1px; background-color: var(--border-color); margin: 15px 0;">
                    <p><strong>Status</strong></p>
                    <p style="font-size: 1.2em; margin: 5px 0; color: ${statusColors[fcstProps.status] || '#666'};">${statusLabels[fcstProps.status] || 'Unknown'}</p>
                `;
                openModal(content);
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
                openModal(content);
                break;
        }
    });
}

/**
 * Clears the county highlight line, blur mask, and restores default borders.
 */
function clearCountyHighlight() {
    if (map.getSource('highlight-county-source')) {
        map.getSource('highlight-county-source').setData({ type: 'FeatureCollection', features: [] });
    }
    if (map.getLayer('county-mask-layer')) {
        map.setFilter('county-mask-layer', ["==", ["get", "COUNTY"], ""]);
    }
    // Show the default gray borders
    if (map.getLayer('all-counties-borders-layer')) {
        map.setLayoutProperty('all-counties-borders-layer', 'visibility', 'visible');
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
    } else if (type === 'gauge-height') {
        percentage = Math.min(value / 30, 1) * 100;
        gradientClass = 'gauge-height-gradient';
        labels = ['0 ft', '30+ ft'];
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

    // Gauge history year slider
    const gaugeYearSlider = document.getElementById('gauge-year-slider');
    const gaugeYearLabel = document.getElementById('gauge-year-label');
    gaugeYearSlider.addEventListener('input', (e) => {
        const year = years[parseInt(e.target.value, 10)];
        gaugeYearLabel.textContent = year;
        fetchRiverGaugeHistoryData(year);
    });

    // Gauge forecast day slider
    const gaugeForecastDaySlider = document.getElementById('gauge-forecast-day-slider');
    const gaugeForecastDayLabel = document.getElementById('gauge-forecast-day-label');
    gaugeForecastDaySlider.addEventListener('input', (e) => {
        const dayIndex = parseInt(e.target.value, 10);
        gaugeForecastDayLabel.textContent = gaugeForecastDayLabels[dayIndex];
        if (map.getSource('river-gauge-forecast-data') && riverGaugeForecastData.length > dayIndex) {
            map.getSource('river-gauge-forecast-data').setData(riverGaugeForecastData[dayIndex]);
        }
    });

    riverFloodCheckbox.addEventListener('change', updateFloodLayersVisibility);
    flashFloodCheckbox.addEventListener('change', updateFloodLayersVisibility);

    console.log('Map script loaded. Attaching event listeners...');
    window.addEventListener('highlightCounty', (event) => {
        const countyName = event.detail.countyName;
        console.log('highlightCounty event HEARD! County:', countyName);
        if (countyName) {
            highlightCountyOnMap(countyName);
        }
    });
    window.addEventListener('setPopupData', (event) => {
        console.log('setPopupData event HEARD! Data:', event.detail.data);
        lastHighlightedData = event.detail.data;
    });
});

map.on('load', () => {
    addSourcesAndLayers();
    updateMapState();
    setupInteractionListeners();
    fetchForecastData();

    fetchRiverGaugeHistoryData(years[0]); // Fetch initial year (2020)
    fetchRiverGaugeForecastData(); // Fetch river gauge forecasts

    fetch('svi-data/alabama_svi_tracts_master.geojson')
        .then(res => res.json())
        .then(geojson => {
            allCountyGeometries = geojson.features;
            console.log(`Loaded ${allCountyGeometries.length} county geometries for highlighting.`);

            if (map.getSource('all-counties-source')) {
                map.getSource('all-counties-source').setData(geojson);
            }
        })
        .catch(err => console.error("Error loading county geometry file:", err));
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

    const legends = { forecast: document.getElementById('forecast-legend'), precipitation: document.getElementById('precipitation-legend'), floods: document.getElementById('flood-legend'), svi: document.getElementById('svi-legend'), 'gauge-history': document.getElementById('gauge-history-legend'), 'gauge-forecast': document.getElementById('gauge-forecast-legend') };
    const layers = {
        forecast: ['forecast-layer'],
        precipitation: ['precipitation-layer'],
        floods: ['river-flood-layer', 'flash-flood-layer'],
        svi: ['svi-layer'],
        'gauge-history': ['river-gauge-history-layer'],
        'gauge-forecast': ['river-gauge-forecast-layer']
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

/**
 * Finds, highlights, and zooms to a county on the map.
 */
function highlightCountyOnMap(countyName) {
    if (!countyName || allCountyGeometries.length === 0) {
        console.warn('Cannot highlight county: No name provided or geometries not loaded.');
        return;
    }
    console.log(`Highlighting county: ${countyName}`);

    const countyFeatures = allCountyGeometries.filter(
        f => f.properties.COUNTY && f.properties.COUNTY.toLowerCase().includes(countyName.toLowerCase())
    );

    if (countyFeatures.length > 0) {
        const featureCollection = { type: 'FeatureCollection', features: countyFeatures };

        // 1. Update the highlight line
        map.getSource('highlight-county-source').setData(featureCollection);

        // 2. Calculate the center of all found tracts
        let lngSum = 0;
        let latSum = 0;
        countyFeatures.forEach(feature => {
            const center = getCountyCenter(feature);
            lngSum += center.lng;
            latSum += center.lat;
        });
        const countyCenter = {
            lng: lngSum / countyFeatures.length,
            lat: latSum / countyFeatures.length
        };

        // 3. Fly the map
        map.flyTo({
            center: [countyCenter.lng, countyCenter.lat],
            zoom: 9, // <-- Increased zoom level for a single county
            padding: 40
        });

        // 4. Update the mask filter
        const highlightedCountyName = countyFeatures[0].properties.COUNTY;
        map.setFilter('county-mask-layer', ["!=", ["get", "COUNTY"], highlightedCountyName]);

        // 5. Hide the default gray borders
        map.setLayoutProperty('all-counties-borders-layer', 'visibility', 'none');

    } else {
        console.warn(`County "${countyName}" not found in geometries.`);
        // Clear highlight line
        map.getSource('highlight-county-source').setData({ type: 'FeatureCollection', features: [] });

        // Reset the mask filter
        map.setFilter('county-mask-layer', ["==", ["get", "COUNTY"], ""]);

        // Show the default gray borders again
        map.setLayoutProperty('all-counties-borders-layer', 'visibility', 'visible');
    }
}
/**
 * Main function to build the modal's HTML from the cached data.
 * This mimics the structure of your Markdown/PDF reports.
 */
function buildPopupHtmlFromData(context) {
    const locationData = context.filtered_data?.[0];
    if (!locationData) {
        return "<h3>Error</h3><p>Could not find location data.</p>";
    }

    const locName = locationData.input_location?.name || "Selected Area";

    const sections = [
        {
            condition: locationData.county_data,
            builder: () => buildCountyTable(locationData.county_data)
        },
        {
            condition: locationData.social_vulnerability_index,
            builder: () => buildSviTable(locationData.social_vulnerability_index)
        },
        {
            condition: locationData.precipitation_forecast?.length > 0,
            builder: () => buildForecastTable(locationData.precipitation_forecast)
        },
        {
            condition: locationData.flood_event_history?.length > 0,
            builder: () => buildFloodHistoryTable(locationData.flood_event_history)
        }
    ];

    const sectionsHtml = sections
        .filter(s => s.condition)
        .map(s => s.builder())
        .join('');

    return `<h3>${locName}</h3>${sectionsHtml}`;
}

/** Helper function to build County Info table */
function buildCountyTable(data) {
    return `
        <h4>County Information</h4>
        <table class="modal-table">
            <tr><td>County</td><td>${data.county_name || 'N/A'}</td></tr>
            <tr><td>State</td><td>${data.state_name || 'N/A'}</td></tr>
            <tr><td>FIPS Code</td><td>${data.fips_code || 'N/A'}</td></tr>
            <tr><td>Area (sq mi)</td><td>${data.area_sqmi?.toFixed(2) || 'N/A'}</td></tr>
        </table>
    `;
}

/** Helper function to build SVI table */
function buildSviTable(data) {
    let themesHtml = Object.entries(data.themes || {})
        .map(([key, value]) => `<tr><td>${key}</td><td>${value?.toFixed(2) || 'N/A'}</td></tr>`)
        .join('');

    return `
        <h4>Social Vulnerability Index (SVI)</h4>
        <table class="modal-table">
            <tr><td>Overall (National)</td><td><b>${data.overall_ranking?.national?.toFixed(2) || 'N/A'}</b></td></tr>
            <tr><td>Overall (State)</td><td><b>${data.overall_ranking?.state?.toFixed(2) || 'N/A'}</b></td></tr>
            ${themesHtml}
        </table>
    `;
}

/** Helper function to build Forecast table */
function buildForecastTable(data) {
    let forecastHtml = data.slice(0, 6) // Show first 6 hours
        .map(hour => `
            <tr>
                <td>${hour.time.split(' (')[0]}</td> 
                <td>${hour.precipitation_probability?.toFixed(0) || 0}%</td>
                <td>${hour.precipitation_amount_in?.toFixed(2) || 0.00} in</td>
                <td>${hour.weather_condition || 'N/A'}</td>
            </tr>
        `).join('');

    return `
        <h4>Precipitation Forecast (Next 6 Hours)</h4>
        <table class="modal-table">
            <thead><tr><th>Time</th><th>Chance</th><th>Amount</th><th>Condition</th></tr></thead>
            <tbody>${forecastHtml}</tbody>
        </table>
    `;
}

/** Helper function to build Flood History table */
function buildFloodHistoryTable(data) {
    let eventsHtml = data.slice(0, 5) // Show first 5 events
        .map(event => `
            <tr>
                <td>${new Date(event.date).toLocaleDateString()}</td>
                <td>${event.type || 'N/A'}</td>
                <td>${event.distance_from_query_point_miles?.toFixed(1) || 'N/A'} mi</td>
            </tr>
        `).join('');

    return `
        <h4>Recent Flood History (Nearest 5)</h4>
        <table class="modal-table">
            <thead><tr><th>Date</th><th>Type</th><th>Distance</th></tr></thead>
            <tbody>${eventsHtml}</tbody>
        </table>
    `;
}