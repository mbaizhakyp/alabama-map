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


// CSP Middleware
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; " +
        "connect-src 'self' https://weather.googleapis.com https://api.water.noaa.gov https://api.mapbox.com; " +
        "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://api.mapbox.com; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.mapbox.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "img-src 'self' data: blob:; " +
        "worker-src 'self' blob:;"
    );
    next();
});

// Serve static files
app.use(express.static('.'));

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
    console.log("Received request for 10-day Google Weather forecast...");

    const apiKey = process.env.GOOGLE_API;
    if (!apiKey) {
        return res.status(500).json({ error: 'GOOGLE_API key not found on server.' });
    }

    try {
        const geojsonTemplate = JSON.parse(await fs.readFile('precipitation-data/january.geojson', 'utf-8'));

        // Request Imperial units (Fahrenheit, Inches) directly from the API
        const API_BASE_URL = `https://weather.googleapis.com/v1/forecast/days:lookup?days=10&unitsSystem=IMPERIAL&key=${apiKey}`;

        const promises = geojsonTemplate.features.map(feature => {
            const centroid = getCentroid(feature.geometry.coordinates);
            const API_URL = `${API_BASE_URL}&location.latitude=${centroid.lat}&location.longitude=${centroid.lon}`;
            return fetch(API_URL).then(response => response.ok ? response.json() : null);
        });

        const results = await Promise.all(promises);
        console.log(`Successfully fetched data from Google for ${results.filter(r => r).length} of 67 counties.`);

        const forecastDays = [];
        for (let dayIndex = 0; dayIndex < 10; dayIndex++) {

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

        console.log("Successfully processed Google Weather data into 10 daily GeoJSONs.");
        res.json(forecastDays);

    } catch (error) {
        console.error('Error in Google API processing:', error.message);
        res.status(500).json({ error: 'Failed to fetch or process forecast data.' });
    }
});

// --- RIVER GAUGES ENDPOINT ---




// --- RIVER GAUGE FORECAST ENDPOINT ---
let riverGaugeForecastCache = { data: null, timestamp: 0 };
const GAUGE_FORECAST_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// Helper: delay function for throttling
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: fetch with retry and throttle
async function fetchWithRetry(url, options, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) return response;
            if (response.status === 429 && i < retries) {
                console.log(`Rate limited, waiting before retry ${i + 1}...`);
                await delay(2000 * (i + 1));
                continue;
            }
            return response;
        } catch (err) {
            if (i === retries) throw err;
            await delay(1000);
        }
    }
}

app.get('/api/river-gauge-forecast', async (req, res) => {
    console.log("Received request for NOAA river gauge forecast data...");

    // Check cache
    if (riverGaugeForecastCache.data && (Date.now() - riverGaugeForecastCache.timestamp) < GAUGE_FORECAST_CACHE_DURATION) {
        console.log("Returning cached river gauge forecast data.");
        return res.json(riverGaugeForecastCache.data);
    }

    const requestHeaders = {
        'Accept': 'application/json',
        'User-Agent': 'AlabamaFloodMap/1.0 (Educational Project)'
    };

    try {
        // Step 1: Fetch ALL Alabama gauges
        console.log("Fetching all Alabama gauges...");
        const listResponse = await fetchWithRetry(
            'https://api.water.noaa.gov/nwps/v1/gauges?state=AL',
            { headers: requestHeaders }
        );

        if (!listResponse.ok) {
            throw new Error(`NOAA API error: ${listResponse.statusText}`);
        }

        const listData = await listResponse.json();
        // Filter for Alabama gauges with coordinates and forecast capability
        // Filter by state.abbreviation === 'AL' and check for forecast PEDTS code
        const alabamaGauges = (listData.gauges || []).filter(g =>
            g.state?.abbreviation === 'AL' &&
            g.latitude &&
            g.longitude &&
            g.lid &&
            g.pedts?.forecast // Has forecast capability
        );
        console.log(`Found ${alabamaGauges.length} Alabama gauges with forecast capability`);

        // Step 2: Fetch stageflow data for each gauge with throttling
        const BATCH_SIZE = 10;
        const BATCH_DELAY = 500; // ms between batches
        const stageflowResults = [];

        for (let i = 0; i < alabamaGauges.length; i += BATCH_SIZE) {
            const batch = alabamaGauges.slice(i, i + BATCH_SIZE);
            console.log(`Fetching stageflow batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(alabamaGauges.length / BATCH_SIZE)}...`);

            const batchPromises = batch.map(async (gauge) => {
                try {
                    const sfResponse = await fetchWithRetry(
                        `https://api.water.noaa.gov/nwps/v1/gauges/${gauge.lid}/stageflow`,
                        { headers: requestHeaders }
                    );
                    if (!sfResponse.ok) return null;
                    const sfData = await sfResponse.json();
                    return { gauge, stageflow: sfData };
                } catch (err) {
                    console.log(`Failed to fetch stageflow for ${gauge.lid}: ${err.message}`);
                    return null;
                }
            });

            const batchResults = await Promise.all(batchPromises);
            stageflowResults.push(...batchResults);

            // Delay between batches to avoid rate limiting
            if (i + BATCH_SIZE < alabamaGauges.length) {
                await delay(BATCH_DELAY);
            }
        }

        // Filter for gauges with valid data (forecast OR observed)
        const validResults = stageflowResults.filter(r => {
            if (!r) return false;
            const hasForecast = r.stageflow?.forecast?.data?.length > 0;
            const hasObserved = r.stageflow?.observed?.data?.length > 0;
            return hasForecast || hasObserved;
        });
        console.log(`Got stageflow data for ${validResults.length} gauges`);

        // Step 3: Process into 3 daily GeoJSONs (Today, Tomorrow, Day After Tomorrow)
        const forecastDays = [];
        const dayLabels = ['Today', 'Tomorrow', 'Day After Tomorrow'];

        for (let dayIndex = 0; dayIndex < 3; dayIndex++) {
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + dayIndex);
            const dayStart = new Date(targetDate.setHours(0, 0, 0, 0)).getTime();
            const dayEnd = dayStart + 24 * 60 * 60 * 1000;
            const targetNoon = dayStart + 12 * 60 * 60 * 1000; // ~12:00 PM
            const targetDateStr = new Date(dayStart).toISOString().split('T')[0];

            const features = validResults.map(({ gauge, stageflow }) => {
                const forecastData = stageflow.forecast?.data || [];
                const observedData = stageflow.observed?.data || [];
                const floodCategories = stageflow.flood?.categories || gauge.flood?.categories || {};
                const floodStage = floodCategories.minor?.stage > 0 ? floodCategories.minor.stage : null;
                const actionStage = floodCategories.action?.stage > 0 ? floodCategories.action.stage : null;
                const moderateStage = floodCategories.moderate?.stage > 0 ? floodCategories.moderate.stage : null;
                const majorStage = floodCategories.major?.stage > 0 ? floodCategories.major.stage : null;
                const primaryUnit = stageflow.forecast?.primaryUnits || stageflow.observed?.primaryUnits || 'ft';
                const secondaryUnit = stageflow.forecast?.secondaryUnits || stageflow.observed?.secondaryUnits || 'cfs';

                // Find the data point closest to noon for this day
                let bestPoint = null;
                let bestTimeDiff = Infinity;
                let dataSource = 'none';

                // First try forecast data
                for (const point of forecastData) {
                    const pointTime = new Date(point.validTime).getTime();
                    if (pointTime >= dayStart && pointTime < dayEnd) {
                        const timeDiff = Math.abs(pointTime - targetNoon);
                        if (timeDiff < bestTimeDiff) {
                            bestTimeDiff = timeDiff;
                            bestPoint = point;
                            dataSource = 'forecast';
                        }
                    }
                }

                // If no forecast, use observed for today only
                if (!bestPoint && dayIndex === 0) {
                    for (const point of observedData) {
                        const pointTime = new Date(point.validTime).getTime();
                        if (pointTime >= dayStart && pointTime < dayEnd) {
                            const timeDiff = Math.abs(pointTime - targetNoon);
                            if (timeDiff < bestTimeDiff) {
                                bestTimeDiff = timeDiff;
                                bestPoint = point;
                                dataSource = 'observed';
                            }
                        }
                    }
                }

                // If still no data for this day, skip
                if (!bestPoint) return null;

                const primaryValue = bestPoint.primary;
                const secondaryValue = bestPoint.secondary;

                // Determine flood status based on primary value (stage)
                let status = 'normal';
                if (primaryValue !== null && primaryValue !== undefined) {
                    if (majorStage && primaryValue >= majorStage) {
                        status = 'major-flood';
                    } else if (moderateStage && primaryValue >= moderateStage) {
                        status = 'moderate-flood';
                    } else if (floodStage && primaryValue >= floodStage) {
                        status = 'minor-flood';
                    } else if (actionStage && primaryValue >= actionStage) {
                        status = 'action';
                    } else if (floodStage && primaryValue >= floodStage * 0.85) {
                        status = 'near-flood';
                    }
                }

                return {
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [gauge.longitude, gauge.latitude]
                    },
                    properties: {
                        siteName: gauge.name || 'Unknown',
                        lid: gauge.lid,
                        primaryValue: primaryValue,
                        primaryUnit: primaryUnit,
                        secondaryValue: secondaryValue,
                        secondaryUnit: secondaryUnit,
                        floodStage: floodStage,
                        actionStage: actionStage,
                        moderateStage: moderateStage,
                        majorStage: majorStage,
                        status: status,
                        dataSource: dataSource,
                        validTime: bestPoint.validTime,
                        dayIndex: dayIndex,
                        dayLabel: dayLabels[dayIndex]
                    }
                };
            }).filter(f => f !== null);

            forecastDays.push({
                type: 'FeatureCollection',
                features: features,
                metadata: {
                    dayIndex: dayIndex,
                    dayLabel: dayLabels[dayIndex],
                    date: targetDateStr
                }
            });
        }

        console.log(`Successfully processed forecasts into 3 daily GeoJSONs.`);
        for (let i = 0; i < forecastDays.length; i++) {
            console.log(`  ${dayLabels[i]}: ${forecastDays[i].features.length} gauges`);
        }

        // Cache the result
        riverGaugeForecastCache = { data: forecastDays, timestamp: Date.now() };

        res.json(forecastDays);

    } catch (error) {
        console.error('Error fetching NOAA forecast data:', error.message);
        res.status(500).json({ error: 'Failed to fetch river gauge forecast data.' });
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

        // --- ERROR CHECK 1: Script Exit Code ---
        // Only treat non-zero exit code as a fatal script error
        if (code !== 0) {
            console.error(`Python script failed with exit code ${code}.`);
            return res.status(500).json({
                error: 'Failed to process query due to a script execution error.',
                // Include stderr in details if it exists, otherwise just the code
                details: scriptError ? scriptError.trim() : `Script exited with code ${code}`
            });
        }

        // Proceed if code is 0
        try {
            const trimmedOutput = scriptOutput.trim();
            // --- ERROR CHECK 2: Empty Output ---
            if (!trimmedOutput) {
                console.error("Python script output (stdout) was empty despite exit code 0.");
                return res.status(500).json({ error: 'Processing script returned no output.' });
            }

            // Parse the JSON output from stdout
            const result = JSON.parse(trimmedOutput);
            console.log("--- Sending this full result to frontend: ---");
            console.log(JSON.stringify(result, null, 2));
            // --- ERROR CHECK 3: Valid JSON Content ---
            // Check if the result is valid
            // It's valid if it's an error object (e.g., {"error": "..."})
            // OR if it has an answer (e.g., {"answer": "...", ...})
            if (result && (result.answer || result.error)) {
                console.log("Successfully parsed full result from Python script.");

                // --- SUCCESS ---
                // Send the ENTIRE result object to the frontend
                // This includes .answer, .county_name, .filtered_context, etc.
                res.json(result);

            } else {
                // Handle cases where Python exited 0 but didn't produce valid JSON
                console.error("Parsed Python output missing 'answer' or 'error' key:", result);
                res.status(500).json({ error: 'Invalid response format from processing script.' });
            }
        } catch (parseError) {
            // --- ERROR CHECK 4: JSON Parsing Failed ---
            // Handle cases where stdout was not valid JSON
            console.error('Error parsing Python script output (stdout):', parseError);
            res.status(500).json({
                error: 'Failed to parse response from processing script.',
                details: parseError.message,
                raw_output: scriptOutput // Include raw output for debugging
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