// Your Mapbox public access token
mapboxgl.accessToken = 'pk.eyJ1IjoibWJhaXpoYWt5cCIsImEiOiJjbWdndndyMzkwbmFqMmtxNnQ3djdjdnV2In0.EHvEVkrhFwZWmZbLsT8b3g';

// List of months to correspond with your GeoJSON file names
const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
];

// Initialize the map
const map = new mapboxgl.Map({
    container: 'map', // The ID of the div in index.html
    style: 'mapbox://styles/mapbox/light-v11', // A light-themed base map style
    center: [-86.9, 32.8], // Center the map on Alabama
    zoom: 6.5 // Set an appropriate zoom level
});

// Create a popup, but don't add it to the map yet.
const popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false
});

// This function runs once the map has finished loading
map.on('load', () => {
    
    // 1. POPULATE THE DROPDOWN MENU
    const monthSelector = document.getElementById('month-selector');
    months.forEach(month => {
        const option = document.createElement('option');
        // Capitalize the first letter for display
        option.text = month.charAt(0).toUpperCase() + month.slice(1);
        option.value = month;
        monthSelector.add(option);
    });

    // 2. ADD THE DATA SOURCE
    // We add the source once and will update its data later.
    // We'll start by loading January's data by default.
    map.addSource('precipitation-data', {
        type: 'geojson',
        data: `data/${months[0]}.geojson` // Load the first month by default
    });

    // 3. ADD THE FILL LAYER FOR THE CHOROPLETH
    // This layer displays the county polygons, colored by precipitation.
    map.addLayer({
        id: 'precipitation-fill-layer',
        type: 'fill',
        source: 'precipitation-data',
        paint: {
            // 'fill-color' uses a 'step' expression to create a choropleth map.
            // It colors counties based on the 'total_precipitation_inches' property.
            'fill-color': [
                'step',
                ['get', 'total_precipitation_inches'],
                '#eff3ff', // Lightest blue for values < 3
                3, '#bdd7e7',
                5, '#6baed6',
                7, '#3182bd',
                9, '#08519c'  // Darkest blue for values >= 9
            ],
            'fill-opacity': 0.75, // Make the polygons slightly transparent
            'fill-outline-color': '#ffffff' // Add a white outline
        }
    });
    
    // 4. ADD AN EVENT LISTENER FOR THE DROPDOWN
    monthSelector.addEventListener('change', (event) => {
        const selectedMonth = event.target.value;
        const dataUrl = `data/${selectedMonth}.geojson`;
        
        // Efficiently update the data for the existing source
        map.getSource('precipitation-data').setData(dataUrl);
    });

    // 5. ADD MOUSEMOVE EVENT FOR POPUPS
    map.on('mousemove', 'precipitation-fill-layer', (e) => {
        // Change the cursor style as a UI indicator.
        map.getCanvas().style.cursor = 'pointer';

        // Get properties from the feature the mouse is currently over
        const countyName = e.features[0].properties.name;
        const precipInches = e.features[0].properties.total_precipitation_inches;
        const coordinates = e.lngLat;

        // Populate the popup and set its coordinates
        // based on the feature found.
        const popupContent = `
            <h4>${countyName}</h4>
            <p><strong>Precipitation:</strong> ${precipInches} inches</p>
        `;
        popup.setLngLat(coordinates).setHTML(popupContent).addTo(map);
    });

    // 6. ADD MOUSELEAVE EVENT TO REMOVE POPUP
    map.on('mouseleave', 'precipitation-fill-layer', () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
    });
});