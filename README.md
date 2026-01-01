# Alabama Flood Map

An interactive map for visualizing weather data, flood forecasts, and social vulnerability in Alabama. Uses AI assistance to process and display real-time, forecast, and historical weather information from official government sources.

## Features

- **Weather Forecast**: 10-day precipitation forecast from Google Weather API
- **River Gauge Status**: 3-day river level forecasts from NOAA with flood status indicators
- **Live River Gauges**: Real-time water level and flow data from USGS
- **Historical Data**: Precipitation history, flood events, and river gauge history (2020-2025)
- **Social Vulnerability Index (SVI)**: CDC/ATSDR vulnerability data by census tract
- **AI Chat Assistant**: Natural language queries about flood risk and weather data

## Prerequisites

- Node.js 20+
- npm or yarn
- Docker (optional, for containerized deployment)
- API Keys (see Environment Variables)

## Environment Variables

Create a `.env` file in the project root:

```env
# Required for weather forecast
GOOGLE_API=your_google_weather_api_key

# Required for AI chat assistant
OPENAI_API_KEY=your_openai_api_key

# Optional: PostgreSQL for AI context (if using database features)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=flood_data
DB_USER=your_db_user
DB_PASSWORD=your_db_password
```

## Quick Start

### Option 1: Local Development

```bash
# Install dependencies
npm install

# Build the chat component
npm run build:chat

# Start the server
npm start
```

The application will be available at `http://localhost:3001`

### Option 2: Docker

```bash
# Build and run with docker-compose
docker-compose up -d

# Or build and run manually
docker build -t alabama-map:latest .
docker run -d -p 3001:3001 --env-file .env alabama-map:latest
```

The application will be available at `http://localhost:3001`

### Option 3: Docker Hub (if published)

```bash
docker run -d -p 3001:3001 --env-file .env yourusername/alabama-map:latest
```

## Project Structure

```
alabama-map/
├── server.js              # Express backend server
├── index.html             # Main HTML entry point
├── script.js              # Frontend map logic (Mapbox GL JS)
├── style.css              # Application styles
├── package.json           # Node.js dependencies
├── Dockerfile             # Docker build configuration
├── docker-compose.yml     # Docker Compose configuration
├── .env                   # Environment variables (create this)
│
├── AI_assistance_map/     # Python AI assistant module
│   ├── get_flood_context.py
│   ├── select_function.py
│   └── requirements.txt
│
├── chat/                  # React chat component source
│   ├── index.tsx
│   └── ChatPanel.tsx
│
├── dist/                  # Built chat bundle
│   └── chat-bundle.js
│
├── flood-data/            # Historical flood events (GeoJSON)
├── precipitation-data/    # Monthly precipitation (GeoJSON)
├── river-gauge-data/      # Historical river gauge data (GeoJSON)
└── svi-data/              # Social Vulnerability Index (GeoJSON)
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/forecast` | GET | 10-day weather forecast for all Alabama counties |
| `/api/river-gauges` | GET | Live USGS river gauge data (water level, discharge) |
| `/api/river-gauge-forecast` | GET | 3-day NOAA river level forecasts with flood status |
| `/api/chat` | POST | AI chat assistant (requires `query` in request body) |

### Example API Usage

```bash
# Get live river gauges
curl http://localhost:3001/api/river-gauges

# Get river gauge forecasts
curl http://localhost:3001/api/river-gauge-forecast

# Chat with AI assistant
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the flood risk in Mobile County?"}'
```

## Data Sources

- **Weather Forecast**: [Google Weather API](https://developers.google.com/maps/documentation/weather)
- **River Gauges (Live)**: [USGS Water Services](https://waterservices.usgs.gov/)
- **River Forecasts**: [NOAA National Water Prediction Service](https://api.water.noaa.gov/nwps/v1/)
- **Social Vulnerability Index**: [CDC/ATSDR SVI](https://www.atsdr.cdc.gov/placeandhealth/svi/)
- **Flood Events**: [NOAA Storm Events Database](https://www.ncdc.noaa.gov/stormevents/)

## Map Layers

| Layer | Description | Data Source |
|-------|-------------|-------------|
| Weather Forecast | 10-day precipitation forecast by county | Google Weather API |
| Precipitation History | Monthly precipitation totals (2020-2024) | Local GeoJSON |
| Flood History | Historical flood events by year | Local GeoJSON |
| River Gauges (Live) | Real-time water levels and flow | USGS API |
| River Gauge History | Annual average water levels (2020-2025) | Local GeoJSON |
| River Gauge Status | 3-day flood forecasts | NOAA NWPS API |
| Social Vulnerability | CDC SVI by census tract | Local GeoJSON |

## Development

### Rebuild Chat Component

```bash
npm run build:chat
```

### Run in Development Mode

```bash
# Start server with auto-reload (if using nodemon)
npx nodemon server.js
```

## Troubleshooting

### Common Issues

1. **"GOOGLE_API key not found"**: Create `.env` file with your Google API key
2. **Port 3001 already in use**: Kill existing process or change port in `server.js`
3. **Docker build fails**: Ensure Docker Desktop is running
4. **Chat not working**: Check OpenAI API key and Python venv setup

### Check Server Logs

```bash
# Local
npm start

# Docker
docker logs alabama-map
```

## License

ISC
