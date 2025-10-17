import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

const app = express();
const port = 3001;

app.use(cors());

// Helper function to calculate the rough center (centroid) of a county polygon
function getCentroid(coordinates) {
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

app.get('/api/forecast', async (req, res) => {
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

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});