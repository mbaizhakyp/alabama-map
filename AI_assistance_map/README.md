# AI-Assisted Weather Map 🗺️
This project is an interactive map designed to visualize complex weather data in a simple and user-friendly way. It uses AI assistance to process and display real-time, forecast, and historical weather information from official government sources.

## How It Works
The map works in three main steps, using AI to bridge the gap between raw scientific data and a clear, interactive visualization.

1. Data Fetching 📡
The map connects directly to official government APIs (like those from NOAA and the USGS) to get the latest scientific data. This includes:

Precipitation forecasts (rain, snow)

Streamflow and river level predictions

Historical flood and inundation data

This raw data is accurate but often too complex for a simple map.

2. AI-Powered Processing 🤖
This is where the AI assistance comes in. Instead of just plotting raw data points, the system uses AI to process, simplify, and add context to the information. This includes:

Summarizing Data: Aggregating thousands of data points into simple, county-wide summaries.

Interpreting Requests: Allowing users to potentially ask questions in natural language.

Processing Geospatial Data: Performing complex tasks like calculating how gridded rainfall data applies to specific county shapes.

Essentially, the AI acts as a smart assistant that translates the complex scientific data into a clean, map-ready format.

3. Interactive Visualization ✨
Once the data is processed, it's displayed on an interactive map (powered by Mapbox). You can then explore the data through several key features:

Dynamic Layers: See data like precipitation volume shown with intuitive color gradients.

Time-Slider & Animation: A "play" button and slider let you watch how a forecast (like a week of rain) changes over time.

Interactive Popups: Hover or click on a specific county or river gauge to see detailed charts and exact data values.

## Project Structure
- `get_flood_context.py`: The main script for the AI assistance pipeline. It takes a user query, retrieves data from the database and APIs, and generates a natural language answer.
- `select_function.py`: A module used by the main script to intelligently filter the retrieved data, ensuring only the most relevant context is passed to the language model.
- `GoogleMapsAPIsExample.ipynb`: A Jupyter Notebook demonstrating how to use the Google Maps and Weather APIs.
- `flood_query_results.json`: An example output file showing the final answer and the data used to generate it.
- `prompts/`: Contains text files used as prompts for the language model, such as the description of the Social Vulnerability Index (SVI).
- `collected_data_db/`: Contains the data and scripts needed to create and populate the primary PostgreSQL database (`flai`).
  - `createDatabase.ipynb`: A Jupyter Notebook that loads all the necessary `.geojson` and `.json` data into the database.
  - `database.sql`: The SQL schema for the `flai` database.
  - `*.geojson`, `*.json`: Data files for states, counties, flood events, and precipitation.
- `ontology_db/`: Contains scripts and schema for a separate knowledge graph database.
  - `populate_database.py`: Script to populate the ontology database from a `.ttl` file.
  - `schema.sql`: The SQL schema for the `map_ontology_db` database.

## Setup

### 1. Dependencies
Install the required Python libraries. It is recommended to use a virtual environment.
```bash
pip install psycopg2-binary openai requests python-dotenv rdflib numpy
```

### 2. Database Setup
This project uses a PostgreSQL database with the PostGIS extension.

1.  **Create the Database**: Create a PostgreSQL database (e.g., `flai_map`).
2.  **Run the Schema**: Execute the `database.sql` script from the `collected_data_db` directory to create the necessary tables and functions.
3.  **Populate the Database**: Run the `createDatabase.ipynb` notebook to load all the data into the database. You will need to have a running Jupyter Notebook environment.

### 3. Environment Variables
Create a `.env` file in the `AI_assistance_map` directory and add the following credentials:

```
POSTGRES_HOST=your_db_host
POSTGRES_DB=your_db_name
POSTGRES_USER=your_db_user
POSTGRES_PASSWORD=your_db_password
OPENAI_API_KEY=your_openai_api_key
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

## How to Run
The main entry point for the application is `get_flood_context.py`. You can run it from the command line:

```bash
python3 get_flood_context.py
```
The script will prompt you to enter a query. It will then process the query, fetch the relevant data, and generate a response.
