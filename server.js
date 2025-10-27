import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import { spawn } from 'child_process'; // <-- Import spawn
import path from 'path'; // <-- Import path for resolving script path

dotenv.config();

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json()); // <-- Add this to parse JSON request bodies

// Helper function to calculate the rough center (centroid) of a county polygon
function getCentroid(coordinates) {
    // ...(keep existing function)...
    const polygon = coordinates[0];
    let lonSum = 0;
    let latSum = 0;
    for (const [lon, lat] of polygon) {
        lonSum += lon;
        latSum += lat;
    }
    return {
        lat: latSum / polygon.length,
        lon: lonSum / polygon.length,
    };
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

// Existing /api/forecast endpoint
app.get('/api/forecast', async (req, res) => {
    // ...(keep existing endpoint code)...
    console.log("Received request for 3-day Google Weather forecast...");

    const apiKey = process.env.GOOGLE_API;
    if (!apiKey) {
        return res.status(500).json({ error: 'GOOGLE_API key not found on server.' });
    }

    try {
        const geojsonTemplate = JSON.parse(await fs.readFile('precipitation-data/january.geojson', 'utf-8'));

        // Request Imperial units (Fahrenheit, Inches) directly from the API
        const API_BASE_URL = `https://weather.googleapis.com/v1/forecast/days:lookup?days=3&unitsSystem=IMPERIAL&key=${apiKey}`;

        const promises = geojsonTemplate.features.map(feature => {
            const centroid = getCentroid(feature.geometry.coordinates);
            const API_URL = `${API_BASE_URL}&location.latitude=${centroid.lat}&location.longitude=${centroid.lon}`;
            return fetch(API_URL).then(response => response.ok ? response.json() : null);
        });

        const results = await Promise.all(promises);
        console.log(`Successfully fetched data from Google for ${results.filter(r => r).length} of 67 counties.`);

        const forecastDays = [];
        for (let dayIndex = 0; dayIndex < 3; dayIndex++) {

            const dayFeatures = results.map((countyData, featureIndex) => {
                const feature = geojsonTemplate.features[featureIndex];
                let valueForMap = 0;

                if (countyData && countyData.forecastDays && countyData.forecastDays.length > dayIndex) {
                    const dayForecast = countyData.forecastDays[dayIndex];

                    // --- THIS IS THE CORRECTED PARSING LOGIC ---
                    let total_precip_inches = 0;

                    // Add daytime precipitation if it exists
                    if (dayForecast.daytimeForecast?.precipitation?.qpf?.inches) {
                        total_precip_inches += dayForecast.daytimeForecast.precipitation.qpf.inches;
                    }
                    // Add nighttime precipitation if it exists
                    if (dayForecast.nighttimeForecast?.precipitation?.qpf?.inches) {
                        total_precip_inches += dayForecast.nighttimeForecast.precipitation.qpf.inches;
                    }

                    if (total_precip_inches > 0) {
                        valueForMap = total_precip_inches;
                    } else if (dayForecast.maxTemperature && dayForecast.minTemperature) {
                        // **FALLBACK**: If no rain, use average temperature
                        const avgTemp = (dayForecast.maxTemperature.degrees + dayForecast.minTemperature.degrees) / 2;
                        valueForMap = avgTemp / 100; // Scale to fit color ramp (e.g., 75°F -> 0.75)
                    }
                    // --- END OF CORRECTED LOGIC ---
                }

                return {
                    ...feature,
                    properties: {
                        ...feature.properties,
                        predicted_precipitation_inches: valueForMap,
                    },
                };
            });

            forecastDays.push({ type: 'FeatureCollection', features: dayFeatures });
        }

        console.log("Successfully processed Google Weather data into 3 daily GeoJSONs.");
        res.json(forecastDays);

    } catch (error) {
        console.error('Error in Google API processing:', error.message);
        res.status(500).json({ error: 'Failed to fetch or process forecast data.' });
    }
});

// --- NEW CHAT ENDPOINT ---
app.post('/api/chat', (req, res) => {
    const userQuery = req.body.query;

    if (!userQuery) {
        return res.status(400).json({ error: 'Query is required in the request body.' });
    }
    console.log(`Received chat query: "${userQuery}"`);

    const scriptDirectory = path.resolve('AI_assistance_map');
    const scriptPath = path.resolve(scriptDirectory, 'get_flood_context.py');
    const pythonExecutable = path.resolve('.venv', 'bin', 'python3'); // Adjust for Windows if needed
    // const pythonExecutable = path.resolve('.venv', 'Scripts', 'python.exe'); // Windows example

    console.log(`Executing: ${pythonExecutable} ${scriptPath}`);
    console.log(`Working Directory: ${scriptDirectory}`);

    const pythonProcess = spawn(pythonExecutable, [scriptPath], {
        cwd: scriptDirectory
    });

    let scriptOutput = '';
    let scriptError = ''; // Still capture stderr for logging

    pythonProcess.stdin.write(userQuery);
    pythonProcess.stdin.end();

    pythonProcess.stdout.on('data', (data) => {
        scriptOutput += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        scriptError += data.toString();
        // Log stderr immediately but don't treat it as fatal *yet*
        console.log(`Python stderr chunk: ${data.toString().trim()}`);
    });

    pythonProcess.on('close', (code) => {
        console.log(`Python script exited with code ${code}`);

        // Log the complete stderr for context, regardless of exit code
        if (scriptError) {
             console.log("--- Complete Python stderr START ---");
             console.log(scriptError.trim());
             console.log("--- Complete Python stderr END ---");
        }

        // --- *** MODIFIED ERROR CHECK *** ---
        // Only treat non-zero exit code as a fatal script error
        if (code !== 0) {
            console.error(`Python script failed with exit code ${code}.`);
            return res.status(500).json({
                 error: 'Failed to process query due to a script execution error.',
                 // Include stderr in details if it exists, otherwise just the code
                 details: scriptError ? scriptError.trim() : `Script exited with code ${code}`
                });
        }
        // --- *** END MODIFIED ERROR CHECK *** ---

        // Proceed if code is 0
        try {
            const trimmedOutput = scriptOutput.trim();
            if (!trimmedOutput) {
                console.error("Python script output (stdout) was empty despite exit code 0.");
                return res.status(500).json({ error: 'Processing script returned no output.' });
            }

            // Log raw stdout before parsing for final verification
            // console.log("--- Raw Python stdout START ---");
            // console.log(trimmedOutput);
            // console.log("--- Raw Python stdout END ---");

            const result = JSON.parse(trimmedOutput);
            // console.log("Parsed Python result:", JSON.stringify(result, null, 2)); // Optional: Log parsed result

            if (result && result.answer) {
                console.log("Successfully parsed answer from Python script.");
                res.json({
                    answer: result.answer,
                    county_name: result.county_name || null
                 });
            } else if (result && result.error) { // Handle JSON errors reported by Python script
                console.error("Python script returned a JSON error:", result.error);
                res.status(500).json({ error: result.error });
            } else {
                 console.error("Parsed Python output missing 'answer' key or 'error' key:", result);
                 res.status(500).json({ error: 'Invalid response format from processing script.' });
            }
        } catch (parseError) {
            console.error('Error parsing Python script output (stdout):', parseError);
            res.status(500).json({
                error: 'Failed to parse response from processing script.',
                details: parseError.message
            });
        }
    });

    pythonProcess.on('error', (err) => { // Handle errors spawning the process
        console.error('Failed to start Python script process:', err);
        res.status(500).json({ error: 'Failed to start the processing script.', details: err.message });
    });
});
// --- END NEW CHAT ENDPOINT ---

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});