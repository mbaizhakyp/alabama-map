// merge_all_svi_data.js

const fs = require('fs');

console.log("--- Starting Full SVI GeoJSON Merge Process ---");

// --- Configuration ---
const basePath = 'svi-data/svi_2022_RPL_THEMES.geojson'; // Base file with geometries
const outputPath = 'svi-data/alabama_svi_tracts_master.geojson'; // Final output file

// List all other files and the specific property to extract from each
const filesToMerge = [
    { path: 'svi-data/svi_2022_RPL_THEME1.geojson', key: 'RPL_THEME1_state' },
    { path: 'svi-data/svi_2022_RPL_THEME2.geojson', key: 'RPL_THEME2_state' },
    { path: 'svi-data/svi_2022_RPL_THEME3.geojson', key: 'RPL_THEME3_state' },
    { path: 'svi-data/svi_2022_RPL_THEME4.geojson', key: 'RPL_THEME4_state' },
    { path: 'svi-data/svi_2022_EPL_POV150.geojson', key: 'EPL_POV150_state' },
    { path: 'svi-data/svi_2022_EPL_UNEMP.geojson', key: 'EPL_UNEMP_state' },
    { path: 'svi-data/svi_2022_EPL_HBURD.geojson', key: 'EPL_HBURD_state' },
    { path: 'svi-data/svi_2022_EPL_NOHSDP.geojson', key: 'EPL_NOHSDP_state' },
    { path: 'svi-data/svi_2022_EPL_UNINSUR.geojson', key: 'EPL_UNINSUR_state' },
    { path: 'svi-data/svi_2022_EPL_AGE65.geojson', key: 'EPL_AGE65_state' },
    { path: 'svi-data/svi_2022_EPL_AGE17.geojson', key: 'EPL_AGE17_state' },
    { path: 'svi-data/svi_2022_EPL_DISABL.geojson', key: 'EPL_DISABL_state' },
    { path: 'svi-data/svi_2022_EPL_SNGPNT.geojson', key: 'EPL_SNGPNT_state' },
    { path: 'svi-data/svi_2022_EPL_LIMENG.geojson', key: 'EPL_LIMENG_state' },
    { path: 'svi-data/svi_2022_EPL_MINRTY.geojson', key: 'EPL_MINRTY_state' },
    { path: 'svi-data/svi_2022_EPL_MUNIT.geojson', key: 'EPL_MUNIT_state' },
    { path: 'svi-data/svi_2022_EPL_MOBILE.geojson', key: 'EPL_MOBILE_state' },
    { path: 'svi-data/svi_2022_EPL_CROWD.geojson', key: 'EPL_CROWD_state' },
    { path: 'svi-data/svi_2022_EPL_NOVEH.geojson', key: 'EPL_NOVEH_state' },
    { path: 'svi-data/svi_2022_EPL_GROUPQ.geojson', key: 'EPL_GROUPQ_state' }
];

try {
    const baseGeoJSON = JSON.parse(fs.readFileSync(basePath, 'utf8'));
    console.log(`Read base file: ${basePath}`);

    // Create lookup maps for all other files
    const allDataMaps = new Map();
    for (const file of filesToMerge) {
        const data = JSON.parse(fs.readFileSync(file.path, 'utf8'));
        const dataMap = new Map();
        for (const feature of data.features) {
            dataMap.set(feature.properties.FIPS, feature.properties[file.key]);
        }
        allDataMaps.set(file.key, dataMap);
        console.log(`Processed: ${file.path}`);
    }

    // Merge data into the base GeoJSON
    baseGeoJSON.features.forEach(feature => {
        const fips = feature.properties.FIPS;
        for (const [key, dataMap] of allDataMaps.entries()) {
            if (dataMap.has(fips)) {
                feature.properties[key] = dataMap.get(fips);
            }
        }
    });

    fs.writeFileSync(outputPath, JSON.stringify(baseGeoJSON));
    console.log(`\n✅ Success! New master file created at: ${outputPath}`);

} catch (error) {
    console.error("\n❌ An error occurred:", error.message);
    console.error("Please ensure all 21 'svi_2022' GeoJSON files are in the 'svi-data' folder.");
}