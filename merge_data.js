// merge_data.js (Final Version with Precise Header Cleaning)

const fs = require('fs');
const d3 = require('d3-dsv');

console.log("--- Starting Data Merge Process (with Precise Header Cleaning) ---");

// Helper function to standardize county names for matching
function normalizeName(name) {
    if (!name) return '';
    return name.toLowerCase().replace(' county', '').trim();
}

// --- 1. Read CSV and precisely clean the header ---
const sviDataCSVContent = fs.readFileSync('svi-data/AL_counties_2022.csv', 'utf8');
const lines = sviDataCSVContent.split('\n');
const headerLine = lines[0];

// Define the exact headers we want to find and what to rename them to
const targetHeaders = {
    'COUNTY': 'COUNTY',
    'RPL_THEMES': 'RPL_THEMES',
    'RPL_THEME1': 'RPL_THEME1',
    'RPL_THEME2': 'RPL_THEME2',
    'RPL_THEME3': 'RPL_THEME3',
    'RPL_THEME4': 'RPL_THEME4'
};

const rawHeaders = headerLine.split(',');
const cleanedHeaders = rawHeaders.map((header, index) => {
    const cleanedHeader = header.trim().replace(/"/g, '');
    for (const key in targetHeaders) {
        // Check if the complex header STARTS WITH our target key
        if (cleanedHeader.startsWith(key)) {
            return targetHeaders[key]; // Return the clean, simple name
        }
    }
    return `column_${index}`; // Give a generic name to columns we don't need
});

// Rebuild the CSV content with our new, clean header
const cleanedCSVContent = cleanedHeaders.join(',') + '\n' + lines.slice(1).join('\n');
console.log("Successfully cleaned and mapped specific CSV headers.");

// --- 2. Read GeoJSON and parse the cleaned CSV ---
const countiesGeoJSON = JSON.parse(fs.readFileSync('precipitation-data/january.geojson', 'utf8'));
const sviData = d3.csvParse(cleanedCSVContent);

const sviDataMap = new Map();
for (const row of sviData) {
    const normalizedKey = normalizeName(row.COUNTY);
    if (normalizedKey) {
        sviDataMap.set(normalizedKey, row);
    }
}
console.log(`Successfully parsed ${sviDataMap.size} rows from the cleaned CSV.`);

// --- 3. Iterate through GeoJSON and merge data ---
let featuresMerged = 0;
let failedNames = [];

countiesGeoJSON.features.forEach(feature => {
    const geojsonCountyName = feature.properties.name;
    const normalizedKey = normalizeName(geojsonCountyName);

    if (sviDataMap.has(normalizedKey)) {
        const matchingSviRow = sviDataMap.get(normalizedKey);
        
        feature.properties.COUNTY = matchingSviRow.COUNTY;
        feature.properties.RPL_THEMES = parseFloat(matchingSviRow.RPL_THEMES);
        feature.properties.RPL_THEME1 = parseFloat(matchingSviRow.RPL_THEME1);
        feature.properties.RPL_THEME2 = parseFloat(matchingSviRow.RPL_THEME2);
        feature.properties.RPL_THEME3 = parseFloat(matchingSviRow.RPL_THEME3);
        feature.properties.RPL_THEME4 = parseFloat(matchingSviRow.RPL_THEME4);
        
        featuresMerged++;
    } else {
        failedNames.push(geojsonCountyName);
    }
});

console.log(`\n--- Merge Result ---`);
console.log(`SUCCESS: ${featuresMerged} out of ${countiesGeoJSON.features.length} counties were successfully merged.`);

if (failedNames.length > 0) {
    console.warn(`WARNING: ${failedNames.length} counties could not be matched: ${failedNames.join(', ')}`);
}

// --- 4. Write the final GeoJSON file ---
const outputPath = 'svi-data/alabama_svi_2022.geojson';
fs.writeFileSync(outputPath, JSON.stringify(countiesGeoJSON, null, 2));

console.log(`\n✅ Success! New file created at: ${outputPath}`);