# AI-Assisted Weather Map 🗺️
This project is an interactive map designed to visualize complex weather data in a simple and user-friendly way. It uses AI assistance to process and display real-time, forecast, and historical weather information from official government sources.

## How It Works
The map works in three main steps, using AI to bridge the gap between raw scientific data and a clear, interactive visualization.

1. Data Fetching 📡
The map connects directly to official government APIs (like those from NOAA and the USGS) to get the latest scientific data. This includes:

*   Precipitation forecasts (rain, snow)
*   Streamflow and river level predictions
*   Historical flood and inundation data

This raw data is accurate but often too complex for a simple map.

2. AI-Powered Processing 🤖
This is where the AI assistance comes in. Instead of just plotting raw data points, the system uses AI to process, simplify, and add context to the information. This includes:

*   Summarizing Data: Aggregating thousands of data points into simple, county-wide summaries.
*   Interpreting Requests: Allowing users to potentially ask questions in natural language.
*   Processing Geospatial Data: Performing complex tasks like calculating how gridded rainfall data applies to specific county shapes.

Essentially, the AI acts as a smart assistant that translates the complex scientific data into a clean, map-ready format.

3. Interactive Visualization ✨
Once the data is processed, it's displayed on an interactive map (powered by Mapbox). You can then explore the data through several key features:

*   Dynamic Layers: See data like precipitation volume shown with intuitive color gradients.
*   Time-Slider & Animation: A "play" button and slider let you watch how a forecast (like a week of rain) changes over time.
*   Interactive Popups: Hover or click on a specific county or river gauge to see detailed charts and exact data values.

## Project Structure

The project is a web application with a Node.js backend and a vanilla JavaScript frontend. It also includes a Python-based AI component for data processing and a React-based chat component.

### Main Files and Directories

*   **`index.html`**: The main entry point of the web application. It sets up the HTML structure, including the map container, controls, and legends.
*   **`style.css`**: Contains the main styles for the application, including the layout of the sidebar, controls, and map elements.
*   **`script.js`**: The core of the frontend application. It initializes the Mapbox map, fetches data, adds layers, and handles all user interactions like sliders, checkboxes, and popups.
*   **`server.js`**: A Node.js Express server that serves the static frontend files and provides a simple API.
    *   The `/api/forecast` endpoint fetches 3-day weather forecast data from the Google Weather API for each county in Alabama, processes it, and sends it to the frontend.
*   **`package.json`**: Defines the project's Node.s dependencies (like Express and a CORS) and scripts for running the application (e.g., `npm start`).

### Data Directories

*   **`flood-data/`**: Contains historical flood event data in GeoJSON format, separated by year and type (river vs. flash floods).
*   **`precipitation-data/`**: Contains historical monthly precipitation data for Alabama counties in GeoJSON format.
*   **`svi-data/`**: Contains Social Vulnerability Index (SVI) data for Alabama census tracts in GeoJSON format.

### AI Assistance Component (`AI_assistance_map/`)

This directory contains a separate Python-based component for more advanced AI-powered data analysis.

*   **`get_flood_context.py`**: The main script that takes a user query, fetches data from a PostgreSQL database, and uses a language model to generate a natural language response.
*   **`collected_data_db/`**: Contains the scripts and data needed to create and populate the PostgreSQL database with flood, precipitation, and SVI data.

### Chat Component (`chat/`)

This directory contains a React-based chat component that provides a user interface for interacting with the AI assistant.

*   **`index.tsx`**: The main entry point for the React component.
*   **`ChatPanel.tsx`**: The main chat panel component.
*   The component is built using `esbuild` into a bundle file (`dist/chat-bundle.js`) which is then included in `index.html`.

## How to Run

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Build the chat component:**
    ```bash
    npm run build:chat
    ```

3.  **Start the server:**
    ```bash
    npm start
    ```

    The application will be available at `http://localhost:3000`.

## How They Interact

1.  The user opens `index.html` in their browser.
2.  The `server.js` process serves the HTML, CSS, and JavaScript files.
3.  The `script.js` file initializes the Mapbox map.
4.  `script.js` makes a request to the `/api/forecast` endpoint on the `server.js` backend to get the latest weather forecast.
5.  The backend fetches the data from the Google Weather API, processes it, and returns it to the frontend.
6.  `script.js` also loads the local GeoJSON data from the `flood-data`, `precipitation-data`, and `svi-data` directories to display on the map.
7.  The user can interact with the map controls (sliders, checkboxes) to change the displayed data layers.
8.  The chat component (`dist/chat-bundle.js`) is loaded into the page, allowing the user to interact with the AI assistant.

## Chat Component

This project also includes a chat component for AI assistance. The chat component is built with React and Tailwind CSS.
