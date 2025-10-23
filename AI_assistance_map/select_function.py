#!/usr/bin/env python3
"""
Intelligent Context Selection System (Prints logs/debug info to stderr)

This script analyzes user queries and selectively extracts only relevant information
from the flood context retrieval results, preparing focused data for LLM processing.
"""

import json
import os
import numpy as np
from dotenv import load_dotenv
import openai
from typing import Dict, List, Any
import sys # Import sys for stderr
import traceback # For detailed error logging

# Load SVI description for better semantic understanding
def load_svi_context():
    """Load the SVI description file for semantic understanding of variables."""
    try:
        # Assuming prompts/ is relative to this script's location
        script_dir = os.path.dirname(os.path.abspath(__file__))
        svi_file_path = os.path.join(script_dir, 'prompts', 'social_vulnerability_index.txt')
        with open(svi_file_path, 'r') as f:
            return f.read()
    except FileNotFoundError:
        print("Warning: SVI context file not found at prompts/social_vulnerability_index.txt. Using basic understanding.", file=sys.stderr)
        return ""
    except Exception as e:
        print(f"Error loading SVI context: {e}", file=sys.stderr)
        return ""


SVI_CONTEXT = load_svi_context()


def analyze_query_intent(query: str, openai_api_key: str) -> Dict[str, Any]:
    """
    Analyzes the user query to determine what types of information are needed.
    Returns default intent if analysis fails.
    """
    default_intent = {
            "needs_precipitation_forecast": True, "needs_precipitation_history": True,
            "needs_flood_history": True, "needs_svi_data": True, "needs_county_info": True,
            "flood_event_filters": {"max_events": 10, "max_distance_miles": None, "recent_only": False},
            "svi_relevance_threshold": 0.3
        }
    content = None # Initialize
    try:
        if not openai_api_key: raise ValueError("OpenAI API Key missing for intent analysis.")

        client = openai.OpenAI(api_key=openai_api_key)
        prompt = f"""
        You are an expert at analyzing flood-related queries to determine what information is needed.

        Context: Data types available: Precipitation forecast, Precipitation history, Flood event history, Social Vulnerability Index (SVI), County info.
        SVI Themes: Socioeconomic Status, Household Characteristics, Racial & Ethnic Minority Status, Housing Type & Transportation.

        Analyze this query: "{query}"

        Return JSON: {{"needs_precipitation_forecast": boolean, "needs_precipitation_history": boolean, "needs_flood_history": boolean, "needs_svi_data": boolean, "needs_county_info": boolean, "flood_event_filters": {{"max_events": integer_or_null, "max_distance_miles": float_or_null, "recent_only": boolean}}, "svi_relevance_threshold": float}}

        Guidelines: Need SVI for "why"/"vulnerability"/"demographics". Need forecast for future rain. Need history for past floods. Use stricter filters for specific questions.

        """

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You analyze data requirements for flood queries."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            timeout=15.0
        )

        content = response.choices[0].message.content
        intent = json.loads(content)
        # Basic validation (could be more thorough)
        if not all(k in intent for k in default_intent.keys()):
             print("Warning: OpenAI intent analysis response missing expected keys. Using defaults.", file=sys.stderr)
             return default_intent
        return intent

    except openai.APIError as e: print(f"OpenAI API Error analyzing intent: {e}", file=sys.stderr)
    except openai.APITimeoutError: print("OpenAI API request timed out analyzing intent.", file=sys.stderr)
    except json.JSONDecodeError: print(f"OpenAI Invalid JSON response for intent. Content: {content}", file=sys.stderr)
    except Exception as e:
        print(f"Unexpected error analyzing query intent: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
    # Return default on any error
    print("Using default intent due to analysis error.", file=sys.stderr)
    return default_intent


def get_embeddings(texts: List[str], openai_api_key: str) -> List[List[float]]:
    """Get embeddings using OpenAI."""
    if not texts: return []
    try:
        if not openai_api_key: raise ValueError("OpenAI API Key missing for embeddings.")
        client = openai.OpenAI(api_key=openai_api_key)
        response = client.embeddings.create(model="text-embedding-3-large", input=texts, timeout=20.0)
        return [item.embedding for item in response.data]
    except openai.APIError as e: print(f"OpenAI API Error getting embeddings: {e}", file=sys.stderr)
    except openai.APITimeoutError: print("OpenAI API request timed out getting embeddings.", file=sys.stderr)
    except Exception as e:
        print(f"Unexpected error getting embeddings: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
    return [] # Return empty list on error


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Calculate cosine similarity."""
    vec1, vec2 = np.array(vec1), np.array(vec2)
    norm1, norm2 = np.linalg.norm(vec1), np.linalg.norm(vec2)
    return np.dot(vec1, vec2) / (norm1 * norm2) if norm1 > 0 and norm2 > 0 else 0.0


def filter_svi_variables(svi_data: Dict[str, Any], query: str, api_key: str, threshold: float = 0.3) -> Dict[str, Any]:
    """Filters SVI variables based on semantic similarity to the query."""
    if not isinstance(svi_data, dict) or not isinstance(svi_data.get('variables'), dict) or not svi_data['variables']:
        # Return original structure even if empty or invalid, just without variables if they were invalid
        if isinstance(svi_data, dict):
            svi_data['variables'] = {}
            return svi_data
        return {"variables": {}} # Return minimal valid structure

    # SVI data structure changed: variables are nested under themes now
    # We need to extract all variable names across themes
    all_vars = {}
    for theme, variables in svi_data['variables'].items():
        if isinstance(variables, dict):
            all_vars.update(variables)

    if not all_vars:
        print("No SVI variables found to filter.", file=sys.stderr)
        return svi_data # Return original if no variables present

    variable_names = list(all_vars.keys())
    variable_texts = [f"{name}: {SVI_CONTEXT}" if SVI_CONTEXT else name for name in variable_names]
    query_text = f"Query: {query}\n\nContext: {SVI_CONTEXT}" if SVI_CONTEXT else query

    print(f"Analyzing relevance of {len(variable_names)} SVI variables...", file=sys.stderr)
    embeddings = get_embeddings([query_text] + variable_texts, api_key)

    if not embeddings or len(embeddings) < 2:
        print("Warning: Could not get embeddings for SVI filtering. Keeping all variables.", file=sys.stderr)
        return svi_data # Return original on embedding failure

    query_embedding, variable_embeddings = embeddings[0], embeddings[1:]
    similarities = [(name, cosine_similarity(query_embedding, var_emb), all_vars[name])
                    for name, var_emb in zip(variable_names, variable_embeddings)]
    similarities.sort(key=lambda x: x[1], reverse=True)

    # Reconstruct the nested variable structure with filtered items
    filtered_nested_vars = {}
    kept_count = 0
    for theme, variables in svi_data['variables'].items():
         if isinstance(variables, dict):
             theme_filtered = {}
             for name, value in variables.items():
                 # Find the similarity score for this variable
                 sim_score = next((sim for var_name, sim, _ in similarities if var_name == name), 0.0)
                 if sim_score >= threshold:
                     theme_filtered[name] = value
                     kept_count += 1
             if theme_filtered: # Only add theme if it has relevant variables
                 filtered_nested_vars[theme] = theme_filtered


    print(f"Kept {kept_count}/{len(variable_names)} SVI variables (threshold: {threshold})", file=sys.stderr)
    if kept_count > 0 and kept_count < len(variable_names): # Only print if filtering happened
        print("Most relevant SVI variables (top 5 matching threshold):", file=sys.stderr)
        count = 0
        for name, sim, _ in similarities:
            if sim >= threshold and count < 5:
                print(f"  - {name} (similarity: {sim:.3f})", file=sys.stderr)
                count += 1

    # Return structure consistent with original, but with filtered variables
    filtered_svi = svi_data.copy() # Start with a copy
    filtered_svi["variables"] = filtered_nested_vars # Replace with filtered nested structure

    return filtered_svi


def filter_flood_events(flood_events: List[Dict[str, Any]], filters: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Filters flood events based on distance and max count."""
    if not flood_events or not isinstance(flood_events, list): return []

    filtered = flood_events
    original_count = len(filtered)

    # Filter by distance
    max_dist = filters.get('max_distance_miles')
    if max_dist is not None and isinstance(max_dist, (int, float)) and max_dist >= 0:
        filtered = [e for e in filtered if e.get('distance_from_query_point_miles', float('inf')) <= max_dist]
        if len(filtered) < original_count:
             print(f"Filtered to {len(filtered)} events within {max_dist} miles.", file=sys.stderr)

    # Filter by recency (basic example: keep only last N years - not implemented per prompt)
    # if filters.get('recent_only'): pass # Add date filtering logic if needed

    # Limit number of events (applied *after* distance filter)
    max_events = filters.get('max_events')
    if max_events is not None and isinstance(max_events, int) and max_events > 0 and len(filtered) > max_events:
        print(f"Limiting {len(filtered)} events to the nearest {max_events}.", file=sys.stderr)
        filtered = filtered[:max_events]

    return filtered


def select_relevant_context(retrieval_results: List[Dict[str, Any]], user_query: str, openai_api_key: str) -> Dict[str, Any]:
    """
    Main function: analyzes intent, filters data based on intent.
    """
    print("\n" + "="*50, file=sys.stderr)
    print("INTELLIGENT CONTEXT SELECTION", file=sys.stderr)
    print("="*50, file=sys.stderr)

    print("\n[Step 1] Analyzing query intent...", file=sys.stderr)
    intent = analyze_query_intent(user_query, openai_api_key)

    print("Intent Analysis:", file=sys.stderr)
    print(f"  - Needs Forecast: {intent.get('needs_precipitation_forecast')}", file=sys.stderr)
    print(f"  - Needs Precip History: {intent.get('needs_precipitation_history')}", file=sys.stderr)
    print(f"  - Needs Flood History: {intent.get('needs_flood_history')}", file=sys.stderr)
    print(f"  - Needs SVI: {intent.get('needs_svi_data')}", file=sys.stderr)
    print(f"  - Needs County Info: {intent.get('needs_county_info')}", file=sys.stderr)

    filtered_results = []
    step_counter = 1 # Start step numbering for filtering

    for i, location_data in enumerate(retrieval_results):
        # Basic check for valid location data structure
        if not isinstance(location_data, dict) or 'input_location' not in location_data:
             print(f"Warning: Skipping invalid location data structure at index {i}", file=sys.stderr)
             continue

        location_name = location_data.get("input_location", {}).get("name", f"Location {i+1}")
        print(f"\n--- Filtering data for: {location_name} ---", file=sys.stderr)
        filtered_location = {"input_location": location_data["input_location"]}

        # Always include status if present
        if 'status' in location_data:
            filtered_location['status'] = location_data['status']
            # If status indicates no county/FIPS, we might skip DB lookups based on intent
            if location_data['status'] in ["No county found", "Missing FIPS code", "Missing coordinates"]:
                 if intent.get('needs_precipitation_forecast') and "precipitation_forecast" in location_data:
                     filtered_location["precipitation_forecast"] = location_data["precipitation_forecast"]
                     print("  - Included precipitation forecast (county independent).", file=sys.stderr)
                 filtered_results.append(filtered_location)
                 print(f"  - Skipping further data for {location_name} due to status: {location_data['status']}", file=sys.stderr)
                 continue # Skip DB-dependent data for this location


        # Conditionally include/filter based on intent
        if intent.get('needs_county_info') and "county_data" in location_data:
            filtered_location["county_data"] = location_data["county_data"]
            print("  - Included county data.", file=sys.stderr)

        if intent.get('needs_precipitation_history') and "precipitation_history" in location_data:
            filtered_location["precipitation_history"] = location_data["precipitation_history"]
            print("  - Included precipitation history.", file=sys.stderr)

        if intent.get('needs_precipitation_forecast') and "precipitation_forecast" in location_data:
            filtered_location["precipitation_forecast"] = location_data["precipitation_forecast"]
            print("  - Included precipitation forecast.", file=sys.stderr)

        if intent.get('needs_flood_history') and "flood_event_history" in location_data:
            step_counter += 1
            print(f"\n[Step {step_counter}] Filtering flood events for {location_name}...", file=sys.stderr)
            flood_events = location_data["flood_event_history"]
            filtered_events = filter_flood_events(flood_events, intent.get('flood_event_filters', {}))
            if filtered_events: # Only include if not empty after filtering
                filtered_location["flood_event_history"] = filtered_events
                print(f"  - Included {len(filtered_events)} filtered flood events.", file=sys.stderr)
            else:
                 print("  - No flood events remained after filtering.", file=sys.stderr)


        if intent.get('needs_svi_data') and "social_vulnerability_index" in location_data:
            step_counter += 1
            print(f"\n[Step {step_counter}] Filtering SVI variables for {location_name}...", file=sys.stderr)
            svi_data = location_data["social_vulnerability_index"]
            if svi_data: # Ensure SVI data exists before trying to filter
                threshold = intent.get('svi_relevance_threshold', 0.3)
                filtered_svi = filter_svi_variables(svi_data, user_query, openai_api_key, threshold)
                # Only include SVI if filtering didn't remove everything meaningful
                if (filtered_svi.get("overall_ranking") and (filtered_svi["overall_ranking"].get("national") is not None or filtered_svi["overall_ranking"].get("state") is not None)) \
                or filtered_svi.get("themes") \
                or filtered_svi.get("variables"):
                    filtered_location["social_vulnerability_index"] = filtered_svi
                    print("  - Included filtered SVI data.", file=sys.stderr)
                else:
                    print("  - No relevant SVI data remained after filtering.", file=sys.stderr)

            else:
                 print("  - No SVI data was available to filter.", file=sys.stderr)

        filtered_results.append(filtered_location)

    print("\n" + "="*50, file=sys.stderr)
    print("CONTEXT SELECTION COMPLETE", file=sys.stderr)
    print("="*50, file=sys.stderr)

    # Return structure expected by generate_llm_answer
    return {
        "query": user_query,
        "intent_analysis": intent, # Optional, for debugging
        "filtered_data": filtered_results
    }


# --- Main function for direct testing (prints to stderr) ---
def main_test():
    """
    Main function for testing the selection system interactively.
    """
    load_dotenv() # Load from project root .env expected here
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    if not OPENAI_API_KEY:
        print("Error: OPENAI_API_KEY not found in environment for testing.", file=sys.stderr)
        return

    print("="*50, file=sys.stderr)
    print("Context Selection System - Test Mode", file=sys.stderr)
    print("="*50, file=sys.stderr)

    example_query = input("\nEnter your query: ").strip()

    print("\nNote: In production, load retrieval_results from get_flood_context.py", file=sys.stderr)
    print("For testing, provide the path to a JSON file with retrieval results:", file=sys.stderr)

    json_path = input("Path to retrieval results JSON (e.g., flood_query_results.json): ").strip()
    retrieval_results = None

    if json_path and os.path.exists(json_path):
        try:
            with open(json_path, 'r') as f:
                # Assuming the file contains the *full* output from get_flood_context
                # which includes the 'full_retrieval_data' key
                full_data = json.load(f)
                if isinstance(full_data, dict) and 'full_retrieval_data' in full_data:
                     retrieval_results = full_data['full_retrieval_data']
                     print(f"Loaded 'full_retrieval_data' from {json_path}", file=sys.stderr)
                else:
                     # Maybe the file *only* contains the list?
                     retrieval_results = full_data
                     print(f"Loaded raw data from {json_path} (assuming it's the retrieval list)", file=sys.stderr)

        except json.JSONDecodeError:
            print(f"Error: Could not parse JSON from {json_path}", file=sys.stderr)
        except Exception as e:
            print(f"Error loading file {json_path}: {e}", file=sys.stderr)
    else:
        print("No valid file provided or file not found.", file=sys.stderr)


    if retrieval_results is not None:
         # Check if retrieval_results is a list, as expected
         if not isinstance(retrieval_results, list):
             print(f"Error: Loaded data from {json_path} is not a list as expected. Type: {type(retrieval_results)}", file=sys.stderr)
             return

         # Run the selection
         selected_context = select_relevant_context(
             retrieval_results,
             example_query,
             OPENAI_API_KEY
         )

         # Print results nicely to stderr for testing
         print("\n" + "="*50, file=sys.stderr)
         print("FILTERED CONTEXT (Ready for LLM)", file=sys.stderr)
         print("="*50, file=sys.stderr)
         print(json.dumps(selected_context, indent=2), file=sys.stderr)

         # Optionally save to file
         save = input("\nSave filtered context to file? (y/n): ").strip().lower()
         if save == 'y':
             output_path = "filtered_context_test_output.json"
             try:
                 with open(output_path, 'w') as f:
                     json.dump(selected_context, f, indent=2)
                 print(f"Saved to {output_path}", file=sys.stderr)
             except Exception as e:
                  print(f"Error saving file: {e}", file=sys.stderr)
    else:
        print("Could not load retrieval results. Cannot run context selection.", file=sys.stderr)


if __name__ == "__main__":
    # This block is for direct execution testing ONLY.
    # When imported or called by Node.js, this block does NOT run.
    main_test()