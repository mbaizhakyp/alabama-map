# Alabama Flood Map

This project displays flood event data and social vulnerability index (SVI) data for Alabama.

## Features

*   **Interactive Map**: Utilizes Leaflet.js to display an interactive map of Alabama.
*   **Flood Event Data**: Visualizes flood events from 2020 to 2025, with options to toggle data for each year.
*   **Social Vulnerability Index (SVI)**: Displays SVI data for Alabama by census tract.
*   **Precipitation Data**: Shows average monthly precipitation data.
*   **Layer Control**: Allows users to toggle different data layers on and off.

## Data Sources

*   **Flood Event Data**: `flood-data/`
*   **Flash Flood Event Data**: `flood-data/flash-flood-events/`
*   **Precipitation Data**: `precipitation-data/`
*   **SVI Data**: `svi-data/`

## Getting Started

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/alabama-map.git
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the server:
    ```bash
    node server.js
    ```
4.  Open `index.html` in your browser.
