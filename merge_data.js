// merge_data.js

const fs = require('fs');
const d3 = require('d3-dsv'); // We'll use the D3 library for robust CSV parsing

console.log("Starting data merge process...");

// --- 1. Read the input files ---
const countiesGeoJSON = JSON.parse(fs.readFileSync('svi-data/alabama_counties_base.geojson', 'utf8'));
const sviDataCSV = fs.readFileSync('svi-data/AL_counties_2022.csv', 'utf8');

// --- 2. Parse the CSV and create a lookup map for fast access ---
const sviData = d3.csvParse(sviDataCSV);

// Create a Map object where the key is the FIPS code and the value is the entire row of SVI data.
const sviDataMap = new Map();
for (const row of sviData) {
    // The FIPS column in your CSV is the key.
    sviDataMap.set(row.FIPS, row);
}
console.log(`Successfully parsed ${sviDataMap.size} rows from the CSV.`);

// --- 3. Iterate through GeoJSON features and merge the SVI data ---
let featuresMerged = 0;
countiesGeoJSON.features.forEach(feature => {
    // The FIPS code in the base GeoJSON is under properties.GEOID
    const fipsCode = feature.properties.GEOID;

    // Check if this FIPS code exists in our SVI data map
    if (sviDataMap.has(fipsCode)) {
        const matchingSviRow = sviDataMap.get(fipsCode);
        
        // --- Copy the specific SVI properties we need ---
        // We also parse them as numbers to ensure they are not strings
        feature.properties.RPL_THEMES = parseFloat(matchingSviRow.RPL_THEMES);
        feature.properties.RPL_THEME1 = parseFloat(matchingSviRow.RPL_THEME1);
        feature.properties.RPL_THEME2 = parseFloat(matchingSviRow.RPL_THEME2);
        feature.properties.RPL_THEME3 = parseFloat(matchingSviRow.RPL_THEME3);
        feature.properties.RPL_THEME4 = parseFloat(matchingSviRow.RPL_THEME4);
        
        featuresMerged++;
    }
});
console.log(`Successfully merged data for ${featuresMerged} counties.`);

// --- 4. Write the new, combined GeoJSON file ---
const outputPath = 'svi-data/alabama_svi_2022.geojson';
fs.writeFileSync(outputPath, JSON.stringify(countiesGeoJSON, null, 2));

console.log(`\n✅ Success! New file created at: ${outputPath}`);