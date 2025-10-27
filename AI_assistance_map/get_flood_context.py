#!/usr/bin/env python3
"""
Flood Information Retrieval and Question Answering System

This script provides an end-to-end pipeline for flood-related queries:
1. Extract locations from user query
2. Retrieve flood contextual data from database
3. Intelligently filter relevant information
4. Generate natural language answers using LLM
"""

from dotenv import load_dotenv
import os
import json
import psycopg2
import openai
import requests
import sys
import time
import traceback
from datetime import datetime
from zoneinfo import ZoneInfo
from select_function import select_relevant_context
# from generate_pdf_report import generate_pdf_from_dict
# from generate_markdown_report import generate_markdown_from_dict


class GoogleMapsClient:
    """
    A client to interact with various Google Maps Platform APIs.
    """
    GEOCODE_API_URL = "https://maps.googleapis.com/maps/api/geocode/json"
    ELEVATION_API_URL = "https://maps.googleapis.com/maps/api/elevation/json"
    TIMEZONE_API_URL = "https://maps.googleapis.com/maps/api/timezone/json"
    WEATHER_API_URL = "https://weather.googleapis.com/v1"

    def __init__(self, api_key):
        """
        Initializes the client with a Google Maps API Key.
        """
        if not api_key:
            raise ValueError("Google Maps API Key not found. Ensure your .env file is set up correctly.")
        self.api_key = api_key

    def _make_request(self, url, params):
        """
        Internal method to perform API requests, handle errors, and return JSON.
        """
        params['key'] = self.api_key
        try:
            response = requests.get(url, params=params)
            response.raise_for_status()
            data = response.json()
            if 'error' in data:
                print(f"API Error: {data['error']['message']}", file=sys.stderr)
                return None
            if 'status' in data and data['status'] != 'OK':
                print(f"API Error: {data['status']} - {data.get('error_message', '')}", file=sys.stderr)
                return None
            return data
        except requests.exceptions.RequestException as e:
            print(f"Connection Error: {e}", file=sys.stderr)
            return None
        except ValueError:
            print("Error: A valid JSON response was not received. Response received:", file=sys.stderr)
            print(response.text, file=sys.stderr)
            return None

    def geocode_by_address(self, address, language='en'):
        """
        Gets geolocation data from a text-based address.
        """
        params = {'address': address, 'language': language}
        return self._make_request(self.GEOCODE_API_URL, params)

    def reverse_geocode(self, lat, lng, language='en'):
        """
        Gets geolocation data (reverse geocoding) from coordinates.
        """
        params = {'latlng': f"{lat},{lng}", 'language': language}
        return self._make_request(self.GEOCODE_API_URL, params)

    def get_timezone(self, lat, lng):
        """
        Gets the time zone information for a pair of coordinates.
        """
        params = {
            'location': f"{lat},{lng}",
            'timestamp': int(time.time())
        }
        return self._make_request(self.TIMEZONE_API_URL, params)

    def get_hourly_forecast(self, lat, lng, hours=None, units='IMPERIAL', page_token=None):
        """
        Gets the hourly weather forecast including precipitation data.
        Can specify the number of hours (e.g., hours=24).
        Units can be 'IMPERIAL' (Fahrenheit) or 'METRIC' (Celsius).
        Supports pagination via page_token.
        Returns hourly forecast data with precipitation information.
        """
        url = f"{self.WEATHER_API_URL}/forecast/hours:lookup"
        params = {
            'location.latitude': lat,
            'location.longitude': lng,
            'unitsSystem': units,
        }
        if hours is not None:
            params['hours'] = hours
        if page_token is not None:
            params['pageToken'] = page_token

        # Note: Google Maps Weather API uses different authentication
        # The _make_request method handles the API key
        return self._make_request(url, params)


def extract_precipitation_time_request(user_input, openai_api_key):
    """
    Uses OpenAI to determine if the user is requesting precipitation forecast data
    and extract the time duration requested.
    Returns a dict with 'hours' and 'query_unit', or None if no forecast is requested.
    """
    try:
        client = openai.OpenAI(api_key=openai_api_key)
        prompt = f"""
        You are an expert at analyzing user queries to determine if they are requesting
        precipitation or rainfall forecast/prediction data.

        Analyze the following query and determine:
        1. Does the user want precipitation forecast/prediction data? (yes/no)
        2. If yes, how many hours into the future? (extract the number and convert to hours)
        3. What time unit did the user use in their query? (hours, days, or weeks)

        IMPORTANT: Convert time periods to hours:
        - Days → multiply by 24 (e.g., "7 days" = 168 hours)
        - Weeks → multiply by 168 (e.g., "1 week" = 168 hours)
        - "tomorrow" = 24 hours
        - "next week" = 168 hours
        - "today" or "this afternoon" = 12 hours

        Your answer MUST be a JSON object with these keys:
        - "requested": boolean (true if precipitation forecast is requested, false otherwise)
        - "hours": integer or null (number of hours if specified, null if not specified but requested, 0 if not requested)
        - "query_unit": string ("hours", "days", or "weeks") - the unit the user used in their query

        Examples:
        - "What will the rainfall be like in the next 2 hours in Tuscaloosa?"
          → {{"requested": true, "hours": 2, "query_unit": "hours"}}

        - "Show me precipitation forecast for the next 24 hours"
          → {{"requested": true, "hours": 24, "query_unit": "hours"}}

        - "Will it rain tomorrow in Birmingham?"
          → {{"requested": true, "hours": 24, "query_unit": "days"}}

        - "Precipitation forecast for the next 7 days"
          → {{"requested": true, "hours": 168, "query_unit": "days"}}

        - "What's the forecast for the next 3 days?"
          → {{"requested": true, "hours": 72, "query_unit": "days"}}

        - "Weather for next week"
          → {{"requested": true, "hours": 168, "query_unit": "weeks"}}

        - "What is the flood history at this address?"
          → {{"requested": false, "hours": 0, "query_unit": null}}

        - "Tell me about flooding in this area"
          → {{"requested": false, "hours": 0, "query_unit": null}}

        User query: '{user_input}'
        """

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that analyzes weather and precipitation queries."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content
        result = json.loads(content)

        if result.get('requested', False):
            hours = result.get('hours')
            query_unit = result.get('query_unit', 'hours')  # Default to hours if not specified
            # Default to 24 hours if requested but not specified
            final_hours = hours if hours and hours > 0 else 24
            return {
                'hours': final_hours,
                'query_unit': query_unit
            }
        return None

    except Exception as e:
        print(f"Error extracting precipitation time request: {e}", file=sys.stderr)
        return None


def extract_locations(user_input, openai_api_key):
    """
    Uses OpenAI to extract and consolidate location names from a user's natural language input.
    """
    try:
        client = openai.OpenAI(api_key=openai_api_key)
        prompt = f"""
        You are an expert geographer at identifying and consolidating location information from text.
        Your task is to extract locations and combine them into the most specific strings possible
        for geocoding. If a specific place (like a building, park, or address) is mentioned
        with its city or region, you MUST combine them into a single string. Do not split
        a single conceptual place into multiple parts.

        Your answer MUST be a JSON object with a single key named "result", which contains an
        array of the final location strings.

        Example 1:
        - User query: 'What is the weather forecast for the area around the Northeast Medical Building in Tuscaloosa?'
        - Correct output: {{"result": ["Northeast Medical Building, Tuscaloosa"]}}

        Example 2:
        - User query: 'I want to know the elevation of the Eiffel Tower and the weather in Rome.'
        - Correct output: {{"result": ["Eiffel Tower, Paris", "Rome"]}}

        Now, process the following query:
        User query: '{user_input}'
        """

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a helpful and precise location extraction assistant that consolidates location information."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content
        locations = json.loads(content)
        return locations
    except openai.APIError as e:
        print(f"OpenAI API Error: {e}", file=sys.stderr)
        return None
    except json.JSONDecodeError:
        print(f"Error: OpenAI did not return valid JSON. Response was: {content}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"An unexpected error occurred with OpenAI: {e}", file=sys.stderr)
        return None


def extract_coordinates(user_query, maps_client, openai_api_key):
    """
    Extracts locations from a query, geocodes them, and returns a list of
    dictionaries containing location information.
    """
    print(f"Processing user query: '{user_query}'\n", file=sys.stderr)

    geocoded_locations = []

    locations = extract_locations(user_query, openai_api_key)
    if not locations or 'result' not in locations or not locations['result']:
        print("No locations were identified in the user query.", file=sys.stderr)
        return geocoded_locations

    print(f"Locations identified by OpenAI: {locations['result']}\n", file=sys.stderr)

    for location_name in locations['result']:
        print(f"--- Geocoding: {location_name} ---", file=sys.stderr)

        geo_data = maps_client.geocode_by_address(location_name)
        if not geo_data or not geo_data.get('results'):
            print(f"Could not geocode '{location_name}'. Moving to the next location.\n", file=sys.stderr)
            continue

        first_result = geo_data['results'][0]
        lat = first_result['geometry']['location']['lat']
        lng = first_result['geometry']['location']['lng']
        formatted_address = first_result.get('formatted_address', 'N/A')

        print(f"Coordinates: Lat={lat}, Lng={lng}", file=sys.stderr)
        print(f"Formatted Address: {formatted_address}\n", file=sys.stderr)

        location_info = {
            'name': location_name,
            'formatted_address': formatted_address,
            'latitude': lat,
            'longitude': lng
        }

        geocoded_locations.append(location_info)

    return geocoded_locations


def execute_query(conn, query, params=None, fetch=False):
    """Execute a SQL query with optional parameters."""
    cur = conn.cursor()
    try:
        if params:
            cur.execute(query, params)
        else:
            cur.execute(query)
        if fetch:
            result = cur.fetchall()
            return result
        else:
            conn.commit()
            return cur.rowcount
    except Exception as e:
        print(f"Error executing query: {e}", file=sys.stderr)
        conn.rollback()
        return None
    finally:
        cur.close()


def get_county_info(connection, lat, lon):
    """
    Finds the county that contains the given coordinates.
    """
    query = """
        SELECT c.fips_county_code, c.County, s.State, c.areaSQMI
        FROM flai.TCLCounties c
        JOIN flai.TCLStates s ON c.idState = s.idState
        WHERE ST_Intersects(c.geometry, ST_Transform(ST_SetSRID(ST_MakePoint(%s, %s), 4326), 5070));
    """
    result = execute_query(connection, query, params=(lon, lat), fetch=True)

    if result:
        row = result[0]
        return {
            "fips_code": row[0],
            "county_name": row[1],
            "state_name": row[2],
            "area_sqmi": float(row[3])
        }
    return None


def get_precipitation_history(connection, fips_code):
    """
    Retrieves the monthly precipitation history for a given county.
    """
    query = """
        SELECT year, month, totalPrecipitation_in
        FROM flai.TBLMonthlyPrecipitation
        WHERE fips_county_code = %s
        ORDER BY year, month;
    """
    results = execute_query(connection, query, params=(fips_code,), fetch=True)
    return [
        {"year": row[0], "month": row[1], "precipitation_in": float(row[2])}
        for row in results
    ]


def get_flood_history(connection, fips_code, maps_client, user_lat, user_lon):
    """
    Retrieves a detailed list of historical flood events for a given county,
    calculates the distance from a user-specified point, and sorts the results
    by proximity (nearest first).
    """
    query = """
        SELECT
            et.EventType,
            e.beginDate,
            e.warning_zone,
            c.County,
            ST_Y(e.geometry) AS latitude,
            ST_X(e.geometry) AS longitude,
            ST_Distance(
                e.geometry::geography,
                ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
            ) as distance_meters
        FROM flai.TBLFloodEvents e
        JOIN flai.TCLEventTypes et ON e.idEventType = et.idEventType
        LEFT JOIN flai.TCLCounties c ON e.fips_county_code = c.fips_county_code
        WHERE e.fips_county_code = %s
        ORDER BY distance_meters ASC;
    """
    params = (user_lon, user_lat, fips_code)
    results = execute_query(connection, query, params=params, fetch=True)

    event_list = []
    if not results:
        return event_list

    print(f"Found {len(results)} historical flood events. Sorting by distance and reverse geocoding...", file=sys.stderr)
    for row in results:
        lat = row[4]
        lon = row[5]
        distance_meters = row[6]

        # Convert meters to miles
        distance_miles = distance_meters * 0.000621371

        address = "N/A"
        if lat and lon:
            geo_data = maps_client.reverse_geocode(lat, lon)
            if geo_data and geo_data.get('results'):
                address = geo_data['results'][0]['formatted_address']

        event_details = {
            "type": row[0],
            "date": row[1].isoformat(),
            "distance_from_query_point_miles": round(distance_miles, 2),
            "warning_zone": row[2],
            "county": row[3] if row[3] else "Not Assigned (e.g., Offshore)",
            "location": {
                "latitude": lat,
                "longitude": lon
            },
            "nearest_address": address
        }
        event_list.append(event_details)

    return event_list


def get_svi_data(connection, fips_code, release_year=2022):
    """
    Retrieves the Social Vulnerability Index (SVI) data for a given county and year.
    """
    query = """
        SELECT
            s.overallNational,
            s.overallState,
            t.Theme,
            v.SVIVariable,
            s.SVIValue
        FROM flai.TBLSVI s
        JOIN flai.TCLSVIThemes t ON s.idSVITheme = t.idSVITheme
        LEFT JOIN flai.TCLSVIVariables v ON s.idSVIVariable = v.idSVIVariable
        WHERE s.fips_county_code = %s AND s.release_year = %s;
    """
    results = execute_query(connection, query, params=(fips_code, release_year), fetch=True)

    if not results:
        return None

    svi_data = {
        "release_year": release_year,
        "overall_ranking": {
            "national": float(results[0][0]) if results[0][0] is not None else None,
            "state": float(results[0][1]) if results[0][1] is not None else None
        },
        "themes": {},
        "variables": {}
    }

    for row in results:
        theme_name = row[2]
        variable_name = row[3]
        svi_value = float(row[4]) if row[4] is not None else None

        if variable_name is None:
            svi_data["themes"][theme_name] = svi_value
        else:
            svi_data["variables"][variable_name] = svi_value

    return svi_data


def get_timezone_display_name(timezone_id):
    """
    Converts a timezone ID to a human-friendly name.

    Args:
        timezone_id: Timezone ID (e.g., "America/Chicago")

    Returns:
        Friendly timezone name (e.g., "Central Time")
    """
    timezone_map = {
        'America/New_York': 'Eastern Time',
        'America/Chicago': 'Central Time',
        'America/Denver': 'Mountain Time',
        'America/Los_Angeles': 'Pacific Time',
        'America/Phoenix': 'Mountain Time',  # Arizona (no DST)
        'America/Anchorage': 'Alaska Time',
        'Pacific/Honolulu': 'Hawaii-Aleutian Time',
        'America/Toronto': 'Eastern Time',
        'America/Vancouver': 'Pacific Time',
        'America/Detroit': 'Eastern Time',
        'America/Kentucky/Louisville': 'Eastern Time',
        'America/Indiana/Indianapolis': 'Eastern Time',
        'America/Boise': 'Mountain Time',
        'America/Juneau': 'Alaska Time',
    }

    # Return mapped name or parse from timezone_id
    if timezone_id in timezone_map:
        return timezone_map[timezone_id]

    # Try to extract a readable name from the ID
    if '/' in timezone_id:
        parts = timezone_id.split('/')
        if len(parts) >= 2:
            # Return city/region name, e.g., "America/Chicago" -> "Chicago Time"
            return f"{parts[-1].replace('_', ' ')} Time"

    return timezone_id


def get_precipitation_forecast(maps_client, lat, lon, hours, local_tz=None, timezone_name=None, location_name=None):
    """
    Retrieves hourly precipitation forecast data for a specific location.

    Args:
        maps_client: GoogleMapsClient instance
        lat: Latitude
        lon: Longitude
        hours: Number of hours to forecast
        local_tz: ZoneInfo object for the location's timezone (optional)
        timezone_name: Human-readable timezone name (e.g., "America/Chicago")
        location_name: Location name for display (e.g., "Tuscaloosa")

    Returns:
        List of hourly precipitation data or empty list if not available
    """
    if not hours or hours <= 0:
        return []

    print(f"Fetching {hours}-hour precipitation forecast...", file=sys.stderr)

    try:
        precipitation_forecast = []
        page_token = None
        total_fetched = 0

        # Google Weather API uses pagination - fetch all pages until we have enough hours
        while total_fetched < hours:
            # Fetch one page of forecast data
            forecast_data = maps_client.get_hourly_forecast(
                lat, lon,
                hours=hours,
                page_token=page_token
            )

            # PROBLEM 1 (FIXED): The correct key is 'forecastHours'
            if not forecast_data or 'forecastHours' not in forecast_data:
                if total_fetched == 0:
                    print("No precipitation forecast data available from Google Maps API (key 'forecastHours' not found).", file=sys.stderr)
                break

            # PROBLEM 2 (FIXED): Loop over 'forecastHours'
            for hour_data in forecast_data['forecastHours']:
                # PROBLEM 3 (FIXED): All data extraction keys were incorrect

                # Get time from the 'interval' object
                utc_time_str = hour_data.get('interval', {}).get('startTime', 'N/A')

                # Convert UTC time to local time if timezone is provided
                if local_tz and utc_time_str != 'N/A':
                    try:
                        # The 'Z' at the end means UTC
                        utc_dt = datetime.fromisoformat(utc_time_str.replace('Z', '+00:00'))
                        local_dt = utc_dt.astimezone(local_tz)

                        # Build time display with location and timezone info
                        time_str = local_dt.strftime('%I:%M %p')
                        tz_abbr = local_dt.strftime('%Z')  # CDT, EST, etc.

                        # Add location and timezone name if available
                        if location_name and timezone_name:
                            # Extract city name from location (e.g., "University of Alabama, Tuscaloosa" -> "Tuscaloosa")
                            city_name = location_name.split(',')[-1].strip() if ',' in location_name else location_name
                            time_display = f"{time_str} {city_name} ({timezone_name}, {tz_abbr})"
                        elif timezone_name:
                            time_display = f"{time_str} ({timezone_name}, {tz_abbr})"
                        else:
                            time_display = f"{time_str} ({tz_abbr})"

                        time_full = local_dt.isoformat()
                    except (ValueError, TypeError) as e:
                        print(f"Warning: Could not parse timestamp {utc_time_str}: {e}", file=sys.stderr)
                        time_display = utc_time_str
                        time_full = utc_time_str
                else:
                    time_display = utc_time_str
                    time_full = utc_time_str

                # Get precipitation data from the 'precipitation' object
                precip_data = hour_data.get('precipitation', {})

                # Get precipitation probability
                # API structure: precipitation.probability.percent (e.g., {"percent": 25, "type": "RAIN"})
                precip_prob_obj = precip_data.get('probability', {})
                if isinstance(precip_prob_obj, dict):
                    # Extract 'percent' from the probability object (already in percentage form)
                    precip_prob_percent = precip_prob_obj.get('percent', 0)
                    # Convert to decimal (e.g., 25 -> 0.25) for consistency with old code
                    precip_prob_decimal = precip_prob_percent / 100.0 if precip_prob_percent else 0
                elif isinstance(precip_prob_obj, (int, float)):
                    # Fallback: if it's already a number, assume it's decimal
                    precip_prob_decimal = precip_prob_obj
                else:
                    precip_prob_decimal = 0

                # Get precipitation amount (QPF - Quantitative Precipitation Forecast)
                # API structure: precipitation.qpf.quantity (in inches when unitsSystem='IMPERIAL')
                qpf_obj = precip_data.get('qpf', {})
                if isinstance(qpf_obj, dict):
                    precip_amount_inches = qpf_obj.get('quantity', 0)
                    # Convert inches to mm (1 inch = 25.4 mm)
                    precip_amount_mm = precip_amount_inches * 25.4 if precip_amount_inches else 0
                elif isinstance(qpf_obj, (int, float)):
                    # Fallback: assume it's in inches
                    precip_amount_mm = qpf_obj * 25.4
                else:
                    precip_amount_mm = 0
                    precip_amount_inches = 0

                # Get weather condition from the 'weatherCondition' object
                weather_condition_data = hour_data.get('weatherCondition', {})
                if weather_condition_data:
                    # Try to get the text description first (e.g., "Sunny", "Cloudy")
                    description_data = weather_condition_data.get('description', {})
                    condition_text = description_data.get('text', None)

                    # If text not available, use the type (e.g., "CLEAR", "CLOUDY")
                    if not condition_text:
                        condition_type = weather_condition_data.get('type', 'N/A')
                        # Convert type to title case (e.g., "CLEAR" -> "Clear")
                        condition = condition_type.title() if condition_type != 'N/A' else 'N/A'
                    else:
                        condition = condition_text
                else:
                    condition = 'N/A'

                # Get temperature data
                temp_data = hour_data.get('temperature', {})
                if isinstance(temp_data, dict):
                    temp_fahrenheit = temp_data.get('degrees', None)
                    temp_unit = temp_data.get('unit', 'FAHRENHEIT')
                else:
                    temp_fahrenheit = None
                    temp_unit = 'FAHRENHEIT'

                # Convert to Celsius if temperature is available
                temp_celsius = None
                if temp_fahrenheit is not None:
                    temp_celsius = round((temp_fahrenheit - 32) * 5/9, 1)

                # Get feels-like temperature
                feels_like_data = hour_data.get('feelsLikeTemperature', {})
                if isinstance(feels_like_data, dict):
                    feels_like_fahrenheit = feels_like_data.get('degrees', None)
                else:
                    feels_like_fahrenheit = None

                feels_like_celsius = None
                if feels_like_fahrenheit is not None:
                    feels_like_celsius = round((feels_like_fahrenheit - 32) * 5/9, 1)

                precip_info = {
                    "time": time_display,
                    "time_full": time_full,
                    "precipitation_probability": round(precip_prob_decimal * 100, 1), # Convert 0.25 to 25.0
                    "precipitation_amount_mm": round(precip_amount_mm, 2),
                    "precipitation_amount_in": round(precip_amount_inches, 2),
                    "weather_condition": condition,
                    "temperature_fahrenheit": temp_fahrenheit,
                    "temperature_celsius": temp_celsius,
                    "feels_like_fahrenheit": feels_like_fahrenheit,
                    "feels_like_celsius": feels_like_celsius
                }
                precipitation_forecast.append(precip_info)
                total_fetched += 1

            # Check if there's a next page
            page_token = forecast_data.get('nextPageToken')
            if not page_token:
                # No more pages available
                break

        print(f"Successfully retrieved {len(precipitation_forecast)} hours of precipitation forecast.", file=sys.stderr)
        return precipitation_forecast

    except Exception as e:
        print(f"Error processing precipitation forecast data: {e}", file=sys.stderr)
        return []


def get_contextual_data_for_locations(geocoded_locations, connection, maps_client, forecast_hours=None):
    """
    Main orchestrator function. Takes a list of geocoded locations and
    enriches each with data from the local database.
    """
    enriched_data = []
    first_county_name = None

    for location in geocoded_locations:
        lat = location['latitude']
        lon = location['longitude']
        print(f"--- Fetching contextual data for: {location['name']} ({lat}, {lon}) ---", file=sys.stderr)

        # Get timezone for this location
        local_tz = None
        timezone_id = None
        timezone_display_name = None
        print("Fetching timezone information...", file=sys.stderr)
        tz_data = maps_client.get_timezone(lat, lon)
        if tz_data and tz_data.get('timeZoneId'):
            timezone_id = tz_data['timeZoneId']
            try:
                local_tz = ZoneInfo(timezone_id)
                timezone_display_name = get_timezone_display_name(timezone_id)
                print(f"Timezone: {timezone_id} ({timezone_display_name})", file=sys.stderr)
            except Exception as e:
                print(f"Warning: Could not create timezone object for {timezone_id}: {e}", file=sys.stderr)
        else:
            print("Could not retrieve timezone. Times will be shown in UTC.", file=sys.stderr)

        county_info = get_county_info(connection, lat, lon)

        if not county_info:
            print(f"Location '{location['name']}' is not within a known county. Skipping.\n", file=sys.stderr)
            enriched_data.append({
                "input_location": location,
                "status": "No county found"
            })
            continue

        fips_code = county_info['fips_code']
        print(f"Found County: {county_info['county_name']} ({fips_code})", file=sys.stderr)
        if first_county_name is None:  # <-- ADD THIS
            first_county_name = county_info['county_name']

        # Get precipitation forecast if requested
        precipitation_forecast = []
        if forecast_hours:
            precipitation_forecast = get_precipitation_forecast(
                maps_client,
                lat,
                lon,
                forecast_hours,
                local_tz,
                timezone_display_name,
                location['name']
            )

        location_context = {
            "input_location": location,
            "timezone": timezone_id,
            "timezone_display_name": timezone_display_name,
            "county_data": county_info,
            "precipitation_history": get_precipitation_history(connection, fips_code),
            "precipitation_forecast": precipitation_forecast,
            "flood_event_history": get_flood_history(connection, fips_code, maps_client, lat, lon),
            "social_vulnerability_index": get_svi_data(connection, fips_code, release_year=2022)
        }

        enriched_data.append(location_context)
        print("Successfully fetched all data.\n", file=sys.stderr)

    return (
        enriched_data,
        first_county_name
    )


def generate_llm_answer(user_query, filtered_context, openai_api_key, query_unit=None):
    """
    Generates a natural language answer using GPT-4o based on the filtered context.

    Args:
        user_query: The user's original question
        filtered_context: The filtered contextual data from select_relevant_context()
        openai_api_key: OpenAI API key
        query_unit: The time unit used in the user's query ('hours', 'days', or 'weeks')

    Returns:
        String containing the LLM's answer
    """
    try:
        client = openai.OpenAI(api_key=openai_api_key)

        # Prepare the context as a formatted string
        context_str = json.dumps(filtered_context['filtered_data'], indent=2)

        # Build formatting instructions based on query_unit
        if query_unit == 'hours':
            forecast_format_instruction = """
CRITICAL FORMATTING REQUIREMENT FOR HOURLY FORECASTS:
Since the user asked for an HOURLY forecast, you MUST present the data hour by hour.
Format: List each hour individually with its specific forecast details INCLUDING precipitation amount.
Example for "next 24 hours":
- **6:00 PM**: Temperature 57°F (14°C), 69% chance of precipitation, 0.03 inches expected, Conditions: Light rain
- **7:00 PM**: Temperature 56°F (13°C), 92% chance of precipitation, 0.08 inches expected, Conditions: Moderate rain
- **8:00 PM**: Temperature 54°F (12°C), 93% chance of precipitation, 0.11 inches expected, Conditions: Rain
(Continue for all hours requested)

IMPORTANT: Always include BOTH precipitation probability (%) AND precipitation amount (inches) for each hour.
DO NOT group by days. Present EVERY HOUR individually."""
        elif query_unit == 'days':
            forecast_format_instruction = """
CRITICAL FORMATTING REQUIREMENT FOR DAILY FORECASTS:
Since the user asked for a DAILY forecast, you MUST group the data by day and provide daily summaries.
Format: Group hours into days and summarize the precipitation/weather pattern for each day INCLUDING total precipitation amount.
Example for "next 7 days":
- **October 26, 2025**: Evening rain with 70-95% precipitation probability. Temperatures 54-57°F (12-14°C). Expected rainfall: 0.5-0.8 inches total.
- **October 27, 2025**: Rain tapering off by morning. Mostly cloudy afternoon with 10-20% precipitation probability. Temperatures 56-62°F (13-17°C). Expected rainfall: 0.1-0.2 inches.
- **October 28, 2025**: Partly cloudy with scattered showers (20-45% chance). Temperatures 55-65°F (13-18°C). Expected rainfall: trace to 0.1 inches.
(Continue for all days requested)

IMPORTANT: Always include BOTH precipitation probability ranges AND total precipitation amounts (inches) for each day.
Calculate daily totals by summing the hourly precipitation amounts for that day.
DO NOT list individual hours. Provide DAY-BY-DAY summaries with overall patterns."""
        elif query_unit == 'weeks':
            forecast_format_instruction = """
CRITICAL FORMATTING REQUIREMENT FOR WEEKLY FORECASTS:
Since the user asked for a WEEKLY forecast, you MUST group the data by week and provide weekly summaries.
Format: Summarize the overall weather pattern for the week INCLUDING total precipitation.
Example for "next week":
- **Week of October 26 - November 1, 2025**: Wet start with heavy rain Sunday-Monday (Oct 26-27), tapering to scattered showers mid-week. Drier conditions expected toward the weekend. Total expected precipitation: 1.5-2.0 inches. Temperature range: 38-65°F (3-18°C).

IMPORTANT: Always include total precipitation amount (inches) for the entire week.
Provide a WEEKLY OVERVIEW with general trends and totals."""
        else:
            forecast_format_instruction = """
When presenting precipitation forecasts, format them appropriately based on the time scale requested.
Always include both precipitation probability AND precipitation amount (in inches)."""

        system_prompt = f"""You are an expert flood information assistant. You have access to flood-related data including:
- Precipitation forecasts and historical data with temperature information
- Historical flood events with locations and dates
- Social Vulnerability Index (SVI) data indicating community risk factors
- County-level geographic information
- Timezone information for each location

Your task is to provide clear, accurate, and helpful answers based on the provided data.
If the data doesn't contain enough information to fully answer the question, acknowledge what you can answer and what information is missing.
Always cite specific data points when making claims.

IMPORTANT: When providing information about a location, you MUST include the timezone information at the beginning of your answer.
Format the timezone information as: "[Location] belongs to Timezone: [timezone_id] ([timezone_display_name])"
Example: "Tuscaloosa belongs to Timezone: America/Chicago (Central Time)"
This helps users understand the local time context for forecasts and events.

{forecast_format_instruction}

When presenting individual data points, include temperature, precipitation, and weather condition information.
Always include the weather condition (e.g., Clear, Cloudy, Rainy, Sunny) when available."""

        user_prompt = f"""User Question: {user_query}

Available Data:
{context_str}

Please provide a comprehensive answer to the user's question based on the available data above.
Structure your response clearly and include specific numbers, dates, and locations when relevant.

IMPORTANT: Start your answer by stating the timezone information for the queried location(s) using the format:
"[Location] belongs to Timezone: [timezone_id] ([timezone_display_name])"

Then provide the detailed answer to the user's question following the formatting requirements specified in the system prompt."""

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.1,
        )

        return response.choices[0].message.content

    except Exception as e:
        print(f"Error generating LLM answer: {e}", file=sys.stderr)
        return None


def main_script_logic(user_query):
    """
    Main end-to-end pipeline function.

    Pipeline stages:
    1. Retrieve full flood context data from database
    2. Intelligently filter relevant information
    3. Generate natural language answer using LLM
    """
    # Load environment variables
    load_dotenv()

    PG_HOST = os.getenv("POSTGRES_HOST")
    PG_DB = os.getenv("POSTGRES_DB")
    PG_USER = os.getenv("POSTGRES_USER")
    PG_PASS = os.getenv("POSTGRES_PASSWORD")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")

    # Initialize clients
    try:
        maps_client = GoogleMapsClient(api_key=GOOGLE_MAPS_API_KEY)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return None

    # Connect to database
    try:
        conn = psycopg2.connect(
            host=PG_HOST,
            database=PG_DB,
            user=PG_USER,
            password=PG_PASS
        )
    except Exception as e:
        print(f"Database connection error: {e}", file=sys.stderr)
        return None

    try:
        print("="*70, file=sys.stderr)
        print("STAGE 1: RETRIEVING FLOOD CONTEXT DATA", file=sys.stderr)
        print("="*70, file=sys.stderr)

        # Step 1: Check if user is requesting precipitation forecast
        print("\n[1.1] Analyzing query for precipitation forecast request...", file=sys.stderr)
        forecast_request = extract_precipitation_time_request(user_query, OPENAI_API_KEY)

        if forecast_request:
            forecast_hours = forecast_request['hours']
            query_unit = forecast_request['query_unit']
            print(f"✓ User requested {forecast_hours}-hour precipitation forecast (query unit: {query_unit}).\n", file=sys.stderr)
        else:
            forecast_hours = None
            query_unit = None
            print("✓ No precipitation forecast requested.\n", file=sys.stderr)

        # Step 2: Extract coordinates from user query
        print("[1.2] Extracting locations from query...", file=sys.stderr)
        geocoded_results = extract_coordinates(user_query, maps_client, OPENAI_API_KEY)

        if not geocoded_results:
            print("✗ Could not extract locations from query.", file=sys.stderr)
            return None

        # Step 3: Get contextual data from database
        print("\n[1.3] Retrieving contextual data from database...", file=sys.stderr)
        retrieval_results, county_name = get_contextual_data_for_locations(
            geocoded_results,
            conn,
            maps_client,
            forecast_hours=forecast_hours
        )

        if not retrieval_results:
            print("✗ No contextual data retrieved.", file=sys.stderr)
            return None

        print(f"\n✓ Successfully retrieved data for {len(retrieval_results)} location(s)", file=sys.stderr)

        # Step 4: Intelligently filter relevant information
        print("\n" + "="*70, file=sys.stderr)
        print("STAGE 2: FILTERING RELEVANT INFORMATION", file=sys.stderr)
        print("="*70, file=sys.stderr)

        filtered_context = select_relevant_context(
            retrieval_results,
            user_query,
            OPENAI_API_KEY
        )

        # Step 5: Generate final answer using LLM
        print("\n" + "="*70, file=sys.stderr)
        print("STAGE 3: GENERATING ANSWER", file=sys.stderr)
        print("="*70, file=sys.stderr)
        print("\n[3.1] Generating natural language answer using GPT-4o...", file=sys.stderr)

        final_answer = generate_llm_answer(user_query, filtered_context, OPENAI_API_KEY, query_unit=query_unit)

        if not final_answer:
            print("✗ Failed to generate answer.", file=sys.stderr)
            return None

        print("✓ Answer generated successfully.\n", file=sys.stderr)

        return {
            "query": user_query,
            "answer": final_answer,
            "filtered_context": filtered_context,
            "full_retrieval_data": retrieval_results,
            "county_name": county_name
        }

    finally:
        # Close database connection
        if conn:
            conn.close()
            print("\n" + "="*70, file=sys.stderr)
            print("Database connection closed.", file=sys.stderr)
            print("="*70, file=sys.stderr)


if __name__ == "__main__":
    user_query = ""
    try:
        # 1. Read query from stdin
        user_query = sys.stdin.read().strip()
        if not user_query:
            print(json.dumps({"error": "Query cannot be empty."}), file=sys.stdout)
            sys.exit(1)

        # 2. Call your main function
        result = main_script_logic(user_query)

        # 3. Print the *full result* as JSON to stdout
        print(json.dumps(result, ensure_ascii=False, default=str), file=sys.stdout)

    except Exception as e:
        # 4. Print any errors as JSON to stdout
        error_message = f"Failed to process query '{user_query}': {type(e).__name__} - {str(e)}"
        print(json.dumps({"error": error_message}), file=sys.stdout)

        # 5. Log the full traceback to stderr
        print(f"\n--- Traceback for Error ({type(e).__name__}) ---", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        print(f"--- End Traceback ---", file=sys.stderr)
        sys.exit(1)