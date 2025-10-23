#!/usr/bin/env python3
"""
Flood Information Retrieval and Question Answering System
(Reads query from stdin, outputs JSON to stdout)
"""

from dotenv import load_dotenv
import os
import json
import psycopg2
import openai
import requests
import sys
import traceback

# Attempt to import the context selection function
try:
    from select_function import select_relevant_context
except ImportError:
    print("Warning: 'select_function.py' not found. Context filtering will be skipped.", file=sys.stderr)
    def select_relevant_context(retrieval_results, user_query, openai_api_key):
        print("Warning: Using pass-through context selector.", file=sys.stderr)
        all_data = [item for item in retrieval_results if 'status' not in item]
        return {"filtered_data": all_data}

# --- GoogleMapsClient (Simplified Error Logging) ---
class GoogleMapsClient:
    GEOCODE_API_URL = "https://maps.googleapis.com/maps/api/geocode/json"
    WEATHER_API_URL = "https://weather.googleapis.com/v1"

    def __init__(self, api_key):
        if not api_key: raise ValueError("Google Maps API Key missing.")
        self.api_key = api_key

    def _make_request(self, url, params):
        params['key'] = self.api_key
        response = None
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            if data.get('error') or (data.get('status') and data['status'] not in ('OK', 'ZERO_RESULTS')):
                print(f"Google API Error: {data.get('status', 'N/A')} - {data.get('error_message', data.get('error', {}).get('message', 'Unknown'))}", file=sys.stderr)
                return None if data.get('status') != 'ZERO_RESULTS' else data
            return data
        except requests.exceptions.Timeout:
            print(f"Timeout Error making Google API request to {url}", file=sys.stderr)
            return None
        except requests.exceptions.RequestException as e:
            print(f"Google API Connection Error: {e}", file=sys.stderr)
            return None
        except json.JSONDecodeError:
            print(f"Google API Invalid JSON response. URL: {url}", file=sys.stderr)
            if response is not None: print(f"Response Text (first 500 chars): {response.text[:500]}", file=sys.stderr)
            return None

    def geocode_by_address(self, address, language='en'):
        return self._make_request(self.GEOCODE_API_URL, {'address': address, 'language': language})

    def reverse_geocode(self, lat, lng, language='en'):
        return self._make_request(self.GEOCODE_API_URL, {'latlng': f"{lat},{lng}", 'language': language})

    def get_hourly_forecast(self, lat, lng, hours=None):
        url = f"{self.WEATHER_API_URL}/forecast/hours:lookup"
        params = {'location.latitude': lat, 'location.longitude': lng}
        if hours: params['hours'] = hours
        return self._make_request(url, params)

# --- OpenAI Helper Functions (Simplified Error Handling) ---
def _call_openai_chat(api_key, system_msg, user_prompt, model="gpt-4o", is_json=True, timeout=20.0):
    if not api_key: raise ValueError("OpenAI API Key missing.")
    content = None
    try:
        client = openai.OpenAI(api_key=api_key)
        response_format = {"type": "json_object"} if is_json else None
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_prompt}
            ],
            response_format=response_format,
            timeout=timeout
        )
        content = response.choices[0].message.content
        return json.loads(content) if is_json else content
    except openai.APIError as e: print(f"OpenAI API Error: {e}", file=sys.stderr)
    except openai.APITimeoutError: print("OpenAI API request timed out.", file=sys.stderr)
    except json.JSONDecodeError as e: print(f"OpenAI Invalid JSON response: {e}. Content: {content}", file=sys.stderr)
    except Exception as e:
        print(f"OpenAI unexpected error: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
    return None

def extract_precipitation_time_request(user_input, api_key):
    system_msg = "Analyze query for precipitation forecast request. JSON: {\"requested\": boolean, \"hours\": integer_or_null}"
    prompt = f"Analyze: '{user_input}'. Is precip forecast requested? Hours (default 24)? Examples:\n'Rain next 2h?' -> {{\"requested\": true, \"hours\": 2}}\n'Flood history?' -> {{\"requested\": false, \"hours\": 0}}"
    result = _call_openai_chat(api_key, system_msg, prompt)
    if result and result.get('requested'):
        hours = result.get('hours')
        return hours if hours and hours > 0 else 24
    return None

def extract_locations(user_input, api_key):
    system_msg = "Extract specific locations (cities, counties, landmarks, addresses). Combine place+region. JSON: {\"result\": [\"location1\"]}"
    prompt = f"Extract locations from: '{user_input}'. Examples:\n'Weather near Main St Library, Anytown?' -> {{\"result\": [\"Main St Library, Anytown\"]}}\n'Risk for Dade County?' -> {{\"result\": [\"Dade County\"]}}"
    result = _call_openai_chat(api_key, system_msg, prompt)
    return result if isinstance(result, dict) and isinstance(result.get('result'), list) else {"result": []}

def generate_llm_answer(user_query, filtered_context, api_key):
    system_msg = "You are a flood info assistant. Answer ONLY from provided JSON data. State if data is insufficient. Cite specifics. Be concise."
    context_str = json.dumps(filtered_context.get('filtered_data', []), indent=2, default=str)
    if not filtered_context or not filtered_context.get('filtered_data') or context_str == '[]':
        print("No relevant context found after filtering for LLM.", file=sys.stderr)
        return f"I looked for information related to '{user_query}', but couldn't find specific data in my available sources to answer based on the locations identified."

    user_prompt = f"User Question: {user_query}\n\nAvailable Data:\n```json\n{context_str}\n```\n\nAnswer the question using ONLY the data above."
    return _call_openai_chat(api_key, system_msg, user_prompt, is_json=False, timeout=45.0) or "Sorry, I encountered an issue generating a response."


# --- ADDED BACK extract_coordinates ---
def extract_coordinates(user_query, maps_client, openai_api_key):
    """
    Extracts locations from query using OpenAI, geocodes them using Google Maps.
    Returns a list of dicts [{'name': str, 'formatted_address': str, 'latitude': float, 'longitude': float}]
    Returns empty list [] if no locations found or geocoded.
    """
    print(f"Extracting locations for query: '{user_query}'", file=sys.stderr)
    geocoded_locations = []
    locations_data = extract_locations(user_query, openai_api_key) # Handles its own errors

    if not locations_data or not locations_data.get('result'):
        print("No locations identified by OpenAI.", file=sys.stderr)
        return geocoded_locations

    location_names = locations_data['result']
    print(f"OpenAI identified locations: {location_names}", file=sys.stderr)

    for name in location_names:
        print(f"--- Geocoding: {name} ---", file=sys.stderr)
        geo_data = maps_client.geocode_by_address(name)

        if not geo_data or not geo_data.get('results'):
            status = geo_data.get('status', 'No response') if geo_data else 'No response'
            print(f"Could not geocode '{name}'. Status: {status}. Skipping.\n", file=sys.stderr)
            continue

        try:
            first_result = geo_data['results'][0]
            lat = first_result['geometry']['location']['lat']
            lng = first_result['geometry']['location']['lng']
            addr = first_result.get('formatted_address', 'N/A')
            print(f"Coordinates: Lat={lat}, Lng={lng}. Address: {addr}\n", file=sys.stderr)
            geocoded_locations.append({'name': name, 'formatted_address': addr, 'latitude': lat, 'longitude': lng})
        except (KeyError, IndexError, TypeError) as e:
            print(f"Error parsing geocode result for '{name}': {e}. Skipping.\n", file=sys.stderr)
            print(f"Received data: {geo_data.get('results', 'N/A')}", file=sys.stderr)
            continue

    return geocoded_locations
# --- END extract_coordinates ---


# --- Database Helper Functions (Simplified Error Handling) ---
def execute_query(conn, query, params=None, fetch=False):
    cur = None
    try:
        if conn is None or conn.closed: raise ConnectionError("Database connection closed.")
        cur = conn.cursor()
        cur.execute(query, params)
        if fetch: return cur.fetchall()
        conn.commit()
        return cur.rowcount
    except (psycopg2.Error, ConnectionError) as e:
        print(f"DB Error: {e}", file=sys.stderr)
        if cur and cur.query:
             try: print(f"Failed Query: {cur.mogrify(query, params).decode('utf-8', errors='replace')}", file=sys.stderr)
             except Exception: print(f"Failed Query (raw): {query}", file=sys.stderr)
        if conn and not conn.closed: conn.rollback()
        return None # Indicate error
    finally:
        if cur: cur.close()

def get_county_info(conn, lat, lon):
    query = """SELECT c.fips_county_code, c.County, s.State, c.areaSQMI FROM flai.TCLCounties c JOIN flai.TCLStates s ON c.idState = s.idState WHERE ST_Intersects(c.geometry, ST_Transform(ST_SetSRID(ST_MakePoint(%s, %s), 4326), 5070));"""
    result = execute_query(conn, query, params=(lon, lat), fetch=True)
    if result and result[0] and result[0][0]:
        r = result[0]
        try: return {"fips_code": str(r[0]), "county_name": str(r[1]), "state_name": str(r[2]), "area_sqmi": float(r[3])}
        except Exception as e: print(f"Error processing county result {r}: {e}", file=sys.stderr)
    print(f"No county found for ({lat}, {lon})", file=sys.stderr)
    return None

def get_precipitation_history(conn, fips):
    if not fips: return []
    query = "SELECT year, month, totalPrecipitation_in FROM flai.TBLMonthlyPrecipitation WHERE fips_county_code = %s ORDER BY year, month;"
    results = execute_query(conn, query, params=(fips,), fetch=True)
    return [{"year": r[0], "month": r[1], "precipitation_in": float(r[2] or 0.0)} for r in results or []]

def get_flood_history(conn, fips, maps_client, lat, lon):
    if not fips: return []
    query = """SELECT et.EventType, e.beginDate, e.warning_zone, c.County, ST_Y(e.geometry), ST_X(e.geometry), ST_Distance(e.geometry::geography, ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography) FROM flai.TBLFloodEvents e JOIN flai.TCLEventTypes et ON e.idEventType = et.idEventType LEFT JOIN flai.TCLCounties c ON e.fips_county_code = c.fips_county_code WHERE e.fips_county_code = %s ORDER BY 7 ASC;"""
    results = execute_query(conn, query, params=(lon, lat, fips), fetch=True)
    events = []
    if results:
        # print(f"Processing {len(results)} flood events for FIPS {fips}...", file=sys.stderr) # Can be noisy
        for r in results:
            try:
                event_lat, event_lon, dist_m = r[4], r[5], r[6]
                dist_miles = (dist_m * 0.000621371) if dist_m is not None else None
                address = "N/A" # Reduced reverse geocoding for brevity/speed, can be added back if needed
                # if event_lat and event_lon:
                #     geo = maps_client.reverse_geocode(event_lat, event_lon)
                #     if geo and geo.get('results'): address = geo['results'][0].get('formatted_address', "N/A")
                events.append({
                    "type": str(r[0]), "date": r[1].isoformat() if r[1] else None,
                    "distance_from_query_point_miles": round(dist_miles, 2) if dist_miles is not None else None,
                    "warning_zone": str(r[2] or 'N/A'), "county": str(r[3] or 'N/A'),
                    "location": {"latitude": event_lat, "longitude": event_lon},
                    # "nearest_address": address # Temporarily removed
                })
            except Exception as e: print(f"Error processing flood event row {r}: {e}", file=sys.stderr)
    return events

def get_svi_data(conn, fips, year=2022):
    if not fips: return None
    query = """SELECT s.overallNational, s.overallState, t.Theme, v.SVIVariable, s.SVIValue FROM flai.TBLSVI s JOIN flai.TCLSVIThemes t ON s.idSVITheme = t.idSVITheme LEFT JOIN flai.TCLSVIVariables v ON s.idSVIVariable = v.idSVIVariable WHERE s.fips_county_code = %s AND s.release_year = %s;"""
    results = execute_query(conn, query, params=(fips, year), fetch=True)
    if not results: return None
    svi = {"release_year": year, "overall_ranking": {}, "themes": {}, "variables": {}}
    try:
        svi["overall_ranking"]["national"] = float(results[0][0]) if results[0][0] is not None else None
        svi["overall_ranking"]["state"] = float(results[0][1]) if results[0][1] is not None else None
        for r in results:
            theme, variable, value = r[2], r[3], float(r[4]) if r[4] is not None else None
            if variable is None: svi["themes"][theme] = value
            else:
                if theme not in svi["variables"]: svi["variables"][theme] = {}
                svi["variables"][theme][variable] = value
        return svi
    except Exception as e: print(f"Error processing SVI data for FIPS {fips}: {e}", file=sys.stderr)
    return None

def get_precipitation_forecast(maps_client, lat, lon, hours):
    if not hours or not isinstance(hours, int) or hours <= 0: return []
    # print(f"Fetching {hours}-hour precip forecast for ({lat}, {lon})...", file=sys.stderr) # Can be noisy
    try:
        data = maps_client.get_hourly_forecast(lat, lon, hours=hours)
        if not data or not isinstance(data.get('forecastHours'), list): return []
        forecast = []
        for hour_data in data['forecastHours']:
            if not isinstance(hour_data, dict): continue
            precip = hour_data.get('precipitation', {})
            prob_obj = precip.get('probability', 0); amt_obj = precip.get('amount', 0)
            prob = float(prob_obj.get('value', 0.0)) if isinstance(prob_obj, dict) else float(prob_obj)
            amt_mm = float(amt_obj.get('value', 0.0)) if isinstance(amt_obj, dict) else float(amt_obj)
            weather = hour_data.get('weather', {}); condition = str(weather.get('condition', 'N/A')) if isinstance(weather, dict) else 'N/A'
            forecast.append({
                "time": hour_data.get('interval', {}).get('startTime', 'N/A'),
                "precipitation_probability": round(prob * 100, 1),
                "precipitation_amount_mm": amt_mm,
                "precipitation_amount_in": round(amt_mm / 25.4, 2),
                "weather_condition": condition
            })
        return forecast
    except Exception as e: print(f"Error processing forecast for ({lat}, {lon}): {e}", file=sys.stderr)
    return []

# --- Main Logic (Simplified get_contextual_data) ---
def get_contextual_data(geocoded_locations, conn, maps_client, forecast_hours=None):
    """Fetches all context data for a list of geocoded locations."""
    all_context = []
    if not geocoded_locations: return all_context
    for loc in geocoded_locations:
        lat, lon, name = loc.get('latitude'), loc.get('longitude'), loc.get('name', 'N/A')
        if lat is None or lon is None:
            all_context.append({"input_location": loc, "status": "Missing coordinates"})
            continue

        print(f"--- Fetching context for: {name} ({lat}, {lon}) ---", file=sys.stderr)
        county = get_county_info(conn, lat, lon)
        forecast = get_precipitation_forecast(maps_client, lat, lon, forecast_hours) if forecast_hours else []

        if not county or not county.get('fips_code'):
            print(f"No valid county/FIPS for '{name}'. Limited data.\n", file=sys.stderr)
            all_context.append({"input_location": loc, "county_data": county, "status": "No county found" if not county else "Missing FIPS code", "precipitation_forecast": forecast})
            continue

        fips = county['fips_code']
        print(f"County: {county.get('county_name')} ({fips})", file=sys.stderr)
        all_context.append({
            "input_location": loc, "county_data": county,
            "precipitation_history": get_precipitation_history(conn, fips),
            "precipitation_forecast": forecast,
            "flood_event_history": get_flood_history(conn, fips, maps_client, lat, lon),
            "social_vulnerability_index": get_svi_data(conn, fips)
        })
        print(f"Fetched context for {name}.\n", file=sys.stderr)
    return all_context

def main_script_logic(user_query):
    """Main pipeline: query -> locations -> context -> filter -> answer."""
    maps_client, conn = None, None
    retrieval_results, filtered_context = [], {"filtered_data": []}
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(script_dir)
        dotenv_path = os.path.join(project_root, '.env')
        loaded = load_dotenv(dotenv_path=dotenv_path, override=True)
        if loaded: print(f"Loaded .env: {dotenv_path}", file=sys.stderr)
        else: print(f"Warning: .env not found at {dotenv_path}. Using system env.", file=sys.stderr)

        PG_HOST, PG_DB, PG_USER, PG_PASS = os.getenv("POSTGRES_HOST"), os.getenv("POSTGRES_DB"), os.getenv("POSTGRES_USER"), os.getenv("POSTGRES_PASSWORD")
        OPENAI_API_KEY, GOOGLE_MAPS_API_KEY = os.getenv("OPENAI_API_KEY"), os.getenv("GOOGLE_MAPS_API_KEY")
        missing = [k for k,v in locals().items() if v is None and (k.isupper() and k.endswith('_KEY') or k.startswith('PG_'))]
        if missing: raise ValueError(f"Missing env vars: {', '.join(missing)}")

        maps_client = GoogleMapsClient(api_key=GOOGLE_MAPS_API_KEY)
        conn = psycopg2.connect(host=PG_HOST, database=PG_DB, user=PG_USER, password=PG_PASS)
        print("DB connection ok.", file=sys.stderr)

        forecast_hours = extract_precipitation_time_request(user_query, OPENAI_API_KEY)
        print(f"Precip forecast check done (hours: {forecast_hours}).", file=sys.stderr)

        geocoded_locations = extract_coordinates(user_query, maps_client, OPENAI_API_KEY)

        if not geocoded_locations:
            print("No locations geocoded.", file=sys.stderr)
        else:
            print(f"Geocoded {len(geocoded_locations)} location(s). Retrieving context...", file=sys.stderr)
            retrieval_results = get_contextual_data(geocoded_locations, conn, maps_client, forecast_hours)
            valid_results = [r for r in retrieval_results if 'status' not in r]
            if not valid_results and retrieval_results:
                print("No specific DB context found.", file=sys.stderr)
                filtered_context = {"filtered_data": retrieval_results} # Pass status info
            elif valid_results:
                 print(f"Retrieved data for {len(valid_results)} location(s). Filtering...", file=sys.stderr)
                 try:
                     filtered_context = select_relevant_context(retrieval_results, user_query, OPENAI_API_KEY)
                     if not isinstance(filtered_context, dict) or 'filtered_data' not in filtered_context:
                          print("Warning: Filter func bad structure. Using unfiltered.", file=sys.stderr)
                          filtered_context = {"filtered_data": valid_results}
                 except Exception as filter_err:
                     print(f"Error filtering: {filter_err}. Using unfiltered.", file=sys.stderr)
                     filtered_context = {"filtered_data": valid_results}
            else: # retrieval_results itself was empty
                 print("Context retrieval empty.", file=sys.stderr)
                 filtered_context = {"filtered_data": []}

        print("Generating answer...", file=sys.stderr)
        final_answer = generate_llm_answer(user_query, filtered_context, OPENAI_API_KEY)
        print("Answer generated.", file=sys.stderr)
        return {"query": user_query, "answer": final_answer}

    except Exception as e: # Catch any exception from main logic
        print(f"Error in main_script_logic: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        # Re-raise to be caught by the __main__ block for JSON error output
        raise
    finally:
        if conn and not conn.closed:
            try: conn.close(); print("DB connection closed.", file=sys.stderr)
            except Exception as e: print(f"Error closing DB: {e}", file=sys.stderr)

# --- Script Entry Point ---
if __name__ == "__main__":
    user_query = ""
    try:
        user_query = sys.stdin.read().strip()
        if not user_query:
            print(json.dumps({"error": "Query cannot be empty."}), file=sys.stdout)
            sys.exit(1)

        result = main_script_logic(user_query)
        print(json.dumps(result, ensure_ascii=False), file=sys.stdout) # Output final JSON

    except Exception as e:
        error_message = f"Failed to process query '{user_query}': {type(e).__name__} - {str(e)}"
        print(json.dumps({"error": error_message}), file=sys.stdout) # Output error JSON
        print(f"\n--- Traceback for Error ({type(e).__name__}) ---", file=sys.stderr) # Log traceback to stderr
        traceback.print_exc(file=sys.stderr)
        print(f"--- End Traceback ---", file=sys.stderr)
        sys.exit(1)