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
from select_function import select_relevant_context
from generate_pdf_report import generate_pdf_from_dict
from generate_markdown_report import generate_markdown_from_dict


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
                print(f"API Error: {data['error']['message']}")
                return None
            if 'status' in data and data['status'] != 'OK':
                print(f"API Error: {data['status']} - {data.get('error_message', '')}")
                return None
            return data
        except requests.exceptions.RequestException as e:
            print(f"Connection Error: {e}")
            return None
        except ValueError:
            print("Error: A valid JSON response was not received. Response received:")
            print(response.text)
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

    def get_hourly_forecast(self, lat, lng, hours=None):
        """
        Gets the hourly weather forecast including precipitation data.
        Can specify the number of hours (e.g., hours=24).
        Returns hourly forecast data with precipitation information.
        """
        url = f"{self.WEATHER_API_URL}/forecast/hours:lookup"
        params = {
            'location.latitude': lat,
            'location.longitude': lng,
        }
        if hours is not None:
            params['hours'] = hours

        # Note: Google Maps Weather API uses different authentication
        # The _make_request method handles the API key
        return self._make_request(url, params)


def extract_precipitation_time_request(user_input, openai_api_key):
    """
    Uses OpenAI to determine if the user is requesting precipitation forecast data
    and extract the time duration requested.
    Returns the number of hours requested, or None if no forecast is requested.
    """
    try:
        client = openai.OpenAI(api_key=openai_api_key)
        prompt = f"""
        You are an expert at analyzing user queries to determine if they are requesting
        precipitation or rainfall forecast/prediction data.

        Analyze the following query and determine:
        1. Does the user want precipitation forecast/prediction data? (yes/no)
        2. If yes, how many hours into the future? (extract the number)

        Your answer MUST be a JSON object with these keys:
        - "requested": boolean (true if precipitation forecast is requested, false otherwise)
        - "hours": integer or null (number of hours if specified, null if not specified but requested, 0 if not requested)

        Examples:
        - "What will the rainfall be like in the next 2 hours in Tuscaloosa?"
          → {{"requested": true, "hours": 2}}

        - "Show me precipitation forecast for the next 24 hours"
          → {{"requested": true, "hours": 24}}

        - "Will it rain tomorrow in Birmingham?"
          → {{"requested": true, "hours": 24}}

        - "What is the flood history at this address?"
          → {{"requested": false, "hours": 0}}

        - "Tell me about flooding in this area"
          → {{"requested": false, "hours": 0}}

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
            # Default to 24 hours if requested but not specified
            return hours if hours and hours > 0 else 24
        return None

    except Exception as e:
        print(f"Error extracting precipitation time request: {e}")
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
        print(f"OpenAI API Error: {e}")
        return None
    except json.JSONDecodeError:
        print(f"Error: OpenAI did not return valid JSON. Response was: {content}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred with OpenAI: {e}")
        return None


def extract_coordinates(user_query, maps_client, openai_api_key):
    """
    Extracts locations from a query, geocodes them, and returns a list of
    dictionaries containing location information.
    """
    print(f"Processing user query: '{user_query}'\n")

    geocoded_locations = []

    locations = extract_locations(user_query, openai_api_key)
    if not locations or 'result' not in locations or not locations['result']:
        print("No locations were identified in the user query.")
        return geocoded_locations

    print(f"Locations identified by OpenAI: {locations['result']}\n")

    for location_name in locations['result']:
        print(f"--- Geocoding: {location_name} ---")

        geo_data = maps_client.geocode_by_address(location_name)
        if not geo_data or not geo_data.get('results'):
            print(f"Could not geocode '{location_name}'. Moving to the next location.\n")
            continue

        first_result = geo_data['results'][0]
        lat = first_result['geometry']['location']['lat']
        lng = first_result['geometry']['location']['lng']
        formatted_address = first_result.get('formatted_address', 'N/A')

        print(f"Coordinates: Lat={lat}, Lng={lng}")
        print(f"Formatted Address: {formatted_address}\n")

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
        print(f"Error executing query: {e}")
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

    Note: Deduplicates events based on date, type, and location coordinates.
    """
    query = """
        SELECT DISTINCT ON (et.EventType, e.beginDate, ST_Y(e.geometry), ST_X(e.geometry))
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
        ORDER BY et.EventType, e.beginDate, ST_Y(e.geometry), ST_X(e.geometry), distance_meters ASC;
    """
    params = (user_lon, user_lat, fips_code)
    results = execute_query(connection, query, params=params, fetch=True)

    event_list = []
    if not results:
        return event_list

    print(f"Found {len(results)} unique historical flood events. Sorting by distance and reverse geocoding...")

    # Build event list with distance info, then sort by distance
    events_with_distance = []
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
        events_with_distance.append(event_details)

    # Sort by distance (nearest first)
    event_list = sorted(events_with_distance, key=lambda x: x['distance_from_query_point_miles'])

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


def get_precipitation_forecast(maps_client, lat, lon, hours):
    """
    Retrieves hourly precipitation forecast data for a specific location.

    Args:
        maps_client: GoogleMapsClient instance
        lat: Latitude
        lon: Longitude
        hours: Number of hours to forecast

    Returns:
        List of hourly precipitation data or empty list if not available
    """
    if not hours or hours <= 0:
        return []

    print(f"Fetching {hours}-hour precipitation forecast...")

    try:
        # This call is correct and uses your get_hourly_forecast method
        forecast_data = maps_client.get_hourly_forecast(lat, lon, hours=hours)

        # PROBLEM 1 (FIXED): The correct key is 'forecastHours'
        if not forecast_data or 'forecastHours' not in forecast_data:
            print("No precipitation forecast data available from Google Maps API (key 'forecastHours' not found).")
            return []

        precipitation_forecast = []

        # PROBLEM 2 (FIXED): Loop over 'forecastHours'
        for hour_data in forecast_data['forecastHours']:
            
            # PROBLEM 3 (FIXED): All data extraction keys were incorrect
            
            # Get time from the 'interval' object
            time = hour_data.get('interval', {}).get('startTime', 'N/A')
            
            # Get precipitation data from the 'precipitation' object
            precip_data = hour_data.get('precipitation', {})
            
            # Get precipitation data from the 'precipitation' object
            # Check if 'probability' is a dict (e.g., {"value": 0.25}) or a number (e.g., 0.25)
            precip_prob_obj = precip_data.get('probability', {})
            if isinstance(precip_prob_obj, dict):
                precip_prob_decimal = precip_prob_obj.get('value', 0)
            elif isinstance(precip_prob_obj, (int, float)):
                precip_prob_decimal = precip_prob_obj
            else:
                precip_prob_decimal = 0

            # Parse Amount
            # Do the same check for 'amount'
            precip_amount_obj = precip_data.get('amount', {})
            if isinstance(precip_amount_obj, dict):
                precip_amount_mm = precip_amount_obj.get('value', 0)
            elif isinstance(precip_amount_obj, (int, float)):
                precip_amount_mm = precip_amount_obj
            else:
                precip_amount_mm = 0
            
            # Get weather condition from the 'weather' object
            weather_data = hour_data.get('weather', {})
            condition = weather_data.get('condition', 'N/A')

            precip_info = {
                "time": time,
                "precipitation_probability": round(precip_prob_decimal * 100, 1), # Convert 0.25 to 25.0
                "precipitation_amount_mm": precip_amount_mm,
                "precipitation_amount_in": round(precip_amount_mm / 25.4, 2),
                "weather_condition": condition
            }
            precipitation_forecast.append(precip_info)

        print(f"Successfully retrieved {len(precipitation_forecast)} hours of precipitation forecast.")
        return precipitation_forecast

    except Exception as e:
        print(f"Error processing precipitation forecast data: {e}")
        return []


def get_contextual_data_for_locations(geocoded_locations, connection, maps_client, forecast_hours=None):
    """
    Main orchestrator function. Takes a list of geocoded locations and
    enriches each with data from the local database.
    """
    enriched_data = []

    for location in geocoded_locations:
        lat = location['latitude']
        lon = location['longitude']
        print(f"--- Fetching contextual data for: {location['name']} ({lat}, {lon}) ---")

        county_info = get_county_info(connection, lat, lon)

        if not county_info:
            print(f"Location '{location['name']}' is not within a known county. Skipping.\n")
            enriched_data.append({
                "input_location": location,
                "status": "No county found"
            })
            continue

        fips_code = county_info['fips_code']
        print(f"Found County: {county_info['county_name']} ({fips_code})")

        # Get precipitation forecast if requested
        precipitation_forecast = []
        if forecast_hours:
            precipitation_forecast = get_precipitation_forecast(maps_client, lat, lon, forecast_hours)

        location_context = {
            "input_location": location,
            "county_data": county_info,
            "precipitation_history": get_precipitation_history(connection, fips_code),
            "precipitation_forecast": precipitation_forecast,
            "flood_event_history": get_flood_history(connection, fips_code, maps_client, lat, lon),
            "social_vulnerability_index": get_svi_data(connection, fips_code, release_year=2022)
        }

        enriched_data.append(location_context)
        print("Successfully fetched all data.\n")

    return enriched_data


def generate_llm_answer(user_query, filtered_context, openai_api_key):
    """
    Generates a natural language answer using GPT-4o based on the filtered context.

    Args:
        user_query: The user's original question
        filtered_context: The filtered contextual data from select_relevant_context()
        openai_api_key: OpenAI API key

    Returns:
        String containing the LLM's answer
    """
    try:
        client = openai.OpenAI(api_key=openai_api_key)

        # Prepare the context as a formatted string
        context_str = json.dumps(filtered_context['filtered_data'], indent=2)

        system_prompt = """You are an expert flood information assistant. You have access to flood-related data including:
- Precipitation forecasts and historical data
- Historical flood events with locations and dates
- Social Vulnerability Index (SVI) data indicating community risk factors
- County-level geographic information

Your task is to provide clear, accurate, and helpful answers based on the provided data.
If the data doesn't contain enough information to fully answer the question, acknowledge what you can answer and what information is missing.
Always cite specific data points when making claims."""

        user_prompt = f"""User Question: {user_query}

Available Data:
{context_str}

Please provide a comprehensive answer to the user's question based on the available data above.
Structure your response clearly and include specific numbers, dates, and locations when relevant."""

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.2,
        )

        return response.choices[0].message.content

    except Exception as e:
        print(f"Error generating LLM answer: {e}")
        return None


def main(user_query):
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
        print(f"Error: {e}")
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
        print(f"Database connection error: {e}")
        return None

    try:
        print("="*70)
        print("STAGE 1: RETRIEVING FLOOD CONTEXT DATA")
        print("="*70)

        # Step 1: Check if user is requesting precipitation forecast
        print("\n[1.1] Analyzing query for precipitation forecast request...")
        forecast_hours = extract_precipitation_time_request(user_query, OPENAI_API_KEY)

        if forecast_hours:
            print(f"✓ User requested {forecast_hours}-hour precipitation forecast.\n")
        else:
            print("✓ No precipitation forecast requested.\n")

        # Step 2: Extract coordinates from user query
        print("[1.2] Extracting locations from query...")
        geocoded_results = extract_coordinates(user_query, maps_client, OPENAI_API_KEY)

        if not geocoded_results:
            print("✗ Could not extract locations from query.")
            return None

        # Step 3: Get contextual data from database
        print("\n[1.3] Retrieving contextual data from database...")
        retrieval_results = get_contextual_data_for_locations(
            geocoded_results,
            conn,
            maps_client,
            forecast_hours=forecast_hours
        )

        if not retrieval_results:
            print("✗ No contextual data retrieved.")
            return None

        print(f"\n✓ Successfully retrieved data for {len(retrieval_results)} location(s)")

        # Step 4: Intelligently filter relevant information
        print("\n" + "="*70)
        print("STAGE 2: FILTERING RELEVANT INFORMATION")
        print("="*70)

        filtered_context = select_relevant_context(
            retrieval_results,
            user_query,
            OPENAI_API_KEY
        )

        # Step 5: Generate final answer using LLM
        print("\n" + "="*70)
        print("STAGE 3: GENERATING ANSWER")
        print("="*70)
        print("\n[3.1] Generating natural language answer using GPT-4o...")

        final_answer = generate_llm_answer(user_query, filtered_context, OPENAI_API_KEY)

        if not final_answer:
            print("✗ Failed to generate answer.")
            return None

        print("✓ Answer generated successfully.\n")

        return {
            "query": user_query,
            "answer": final_answer,
            "filtered_context": filtered_context,
            "full_retrieval_data": retrieval_results
        }

    finally:
        # Close database connection
        if conn:
            conn.close()
            print("\n" + "="*70)
            print("Database connection closed.")
            print("="*70)


if __name__ == "__main__":
    print("="*70)
    print("  FLOOD INFORMATION RETRIEVAL & QUESTION ANSWERING SYSTEM")
    print("="*70)
    print("\nThis system will:")
    print("  1. Retrieve flood-related data from our database")
    print("  2. Intelligently filter relevant information")
    print("  3. Generate a comprehensive answer to your question")
    print("\nExample queries:")
    print("  - 'What is the flood history in Tuscaloosa, Alabama?'")
    print("  - 'What is the precipitation forecast for next 2 hours in Birmingham?'")
    print("  - 'Why is Mobile, AL vulnerable to flooding?'")
    print("="*70 + "\n")

    user_query = input("Enter your query: ").strip()

    if not user_query:
        print("Error: Query cannot be empty.")
        sys.exit(1)

    print("\n")

    result = main(user_query)

    if result:
        print("\n" + "="*70)
        print("FINAL ANSWER")
        print("="*70)
        print(f"\nQuestion: {result['query']}\n")
        print(result['answer'])
        print("\n" + "="*70)

        # Optionally save results
        print("\n" + "="*70)
        save_choice = input("Save detailed results? (json/pdf/md/all/no): ").strip().lower()

        # Create results directory if needed
        if save_choice != 'no':
            os.makedirs('results', exist_ok=True)
            from datetime import datetime
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        # Save JSON
        if save_choice in ['json', 'all']:
            json_file = f"results/flood_query_results_{timestamp}.json"
            with open(json_file, 'w') as f:
                json.dump(result, f, indent=2)
            print(f"✓ JSON results saved to {json_file}")

        # Generate PDF
        if save_choice in ['pdf', 'all']:
            print("\n📄 Generating PDF report...")
            try:
                pdf_filename = f"flood_report_{timestamp}.pdf"
                pdf_path = generate_pdf_from_dict(result, pdf_filename)
                print(f"✓ PDF report generated: {pdf_path}")
            except Exception as e:
                print(f"✗ Error generating PDF: {e}")

        # Generate Markdown
        if save_choice in ['md', 'all']:
            print("\n📝 Generating Markdown report...")
            try:
                md_filename = f"flood_report_{timestamp}.md"
                md_path = generate_markdown_from_dict(result, md_filename)
                print(f"✓ Markdown report generated: {md_path}")
            except Exception as e:
                print(f"✗ Error generating Markdown: {e}")
    else:
        print("\n✗ Failed to process query. Please check the errors above.")
