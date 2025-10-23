#!/usr/bin/env python3
"""
Intelligent Context Selection System

This script analyzes user queries and selectively extracts only relevant information
from the flood context retrieval results, preparing focused data for LLM processing.
"""

import json
import os
import numpy as np
from dotenv import load_dotenv
import openai
from typing import Dict, List, Any


# Load SVI description for better semantic understanding
def load_svi_context():
    """Load the SVI description file for semantic understanding of variables."""
    try:
        with open('prompts/social_vulnerability_index.txt', 'r') as f:
            return f.read()
    except FileNotFoundError:
        print("Warning: SVI context file not found. Using basic understanding.")
        return ""


SVI_CONTEXT = load_svi_context()


def analyze_query_intent(query: str, openai_api_key: str) -> Dict[str, Any]:
    """
    Analyzes the user query to determine what types of information are needed.

    Returns:
        Dictionary with boolean flags for each data type and filtering criteria
    """
    try:
        client = openai.OpenAI(api_key=openai_api_key)

        prompt = f"""
        You are an expert at analyzing flood-related queries to determine what information is needed.

        Context: The user has access to the following data types:
        1. Precipitation forecast (future rainfall predictions)
        2. Precipitation history (past monthly rainfall data)
        3. Flood event history (historical flood occurrences with locations and dates)
        4. Social Vulnerability Index (SVI) - demographic and socioeconomic risk factors
        5. County information (basic geographic data)

        Social Vulnerability Index includes 16 variables grouped into 4 themes:
        - Socioeconomic Status (poverty, unemployment, housing cost, education, insurance)
        - Household Characteristics (age groups, disabilities, single parents, language)
        - Racial & Ethnic Minority Status
        - Housing Type & Transportation (multi-unit, mobile homes, crowding, vehicles, group quarters)

        Analyze this query and determine what data is needed:
        Query: "{query}"

        Return a JSON object with these fields:
        {{
            "needs_precipitation_forecast": boolean,
            "needs_precipitation_history": boolean,
            "needs_flood_history": boolean,
            "needs_svi_data": boolean,
            "needs_county_info": boolean,
            "flood_event_filters": {{
                "max_events": integer (suggest 5-20, or null for all),
                "max_distance_miles": float (suggest radius, or null for all),
                "recent_only": boolean (true if query mentions "recent" or time period)
            }},
            "svi_relevance_threshold": float (0.0-1.0, higher means more selective)
        }}

        Guidelines:
        - If query asks about "why" or "vulnerability", set needs_svi_data to true
        - If query is about future weather/rain, needs_precipitation_forecast is true
        - If query is about past flooding, needs_flood_history is true
        - If query mentions demographics, poverty, housing, etc., needs_svi_data is true
        - For specific questions, use stricter filters; for exploratory questions, be more inclusive
        """

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are an expert at analyzing data requirements for flood-related queries."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content
        intent = json.loads(content)
        return intent

    except Exception as e:
        print(f"Error analyzing query intent: {e}")
        # Default: return all data types
        return {
            "needs_precipitation_forecast": True,
            "needs_precipitation_history": True,
            "needs_flood_history": True,
            "needs_svi_data": True,
            "needs_county_info": True,
            "flood_event_filters": {
                "max_events": 10,
                "max_distance_miles": None,
                "recent_only": False
            },
            "svi_relevance_threshold": 0.3
        }


def get_embeddings(texts: List[str], openai_api_key: str) -> List[List[float]]:
    """
    Get embeddings for a list of texts using OpenAI's text-embedding-3-large model.

    Args:
        texts: List of text strings to embed
        openai_api_key: OpenAI API key

    Returns:
        List of embedding vectors
    """
    try:
        client = openai.OpenAI(api_key=openai_api_key)

        response = client.embeddings.create(
            model="text-embedding-3-large",
            input=texts
        )

        return [item.embedding for item in response.data]

    except Exception as e:
        print(f"Error getting embeddings: {e}")
        return []


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Calculate cosine similarity between two vectors."""
    vec1 = np.array(vec1)
    vec2 = np.array(vec2)

    dot_product = np.dot(vec1, vec2)
    norm1 = np.linalg.norm(vec1)
    norm2 = np.linalg.norm(vec2)

    if norm1 == 0 or norm2 == 0:
        return 0.0

    return dot_product / (norm1 * norm2)


def filter_svi_variables(
    svi_data: Dict[str, Any],
    query: str,
    openai_api_key: str,
    threshold: float = 0.3
) -> Dict[str, Any]:
    """
    Filters SVI variables to keep only the most relevant ones based on semantic similarity.

    Args:
        svi_data: The full SVI data dictionary
        query: User's query
        openai_api_key: OpenAI API key
        threshold: Minimum similarity score to keep a variable (0.0-1.0)

    Returns:
        Filtered SVI data with only relevant variables
    """
    if not svi_data or 'variables' not in svi_data:
        return svi_data

    variables = svi_data['variables']

    if not variables:
        return svi_data

    # Prepare texts for embedding
    variable_names = list(variables.keys())

    # Add context to each variable name for better semantic matching
    variable_texts = [
        f"{name}: {SVI_CONTEXT}" if SVI_CONTEXT else name
        for name in variable_names
    ]

    # Add query with SVI context
    query_text = f"Query: {query}\n\nContext: {SVI_CONTEXT}" if SVI_CONTEXT else query

    print(f"Analyzing relevance of {len(variable_names)} SVI variables...")

    # Get embeddings
    all_texts = [query_text] + variable_texts
    embeddings = get_embeddings(all_texts, openai_api_key)

    if not embeddings or len(embeddings) < 2:
        print("Warning: Could not get embeddings. Returning all variables.")
        return svi_data

    query_embedding = embeddings[0]
    variable_embeddings = embeddings[1:]

    # Calculate similarities
    similarities = []
    for i, var_name in enumerate(variable_names):
        similarity = cosine_similarity(query_embedding, variable_embeddings[i])
        similarities.append((var_name, similarity, variables[var_name]))

    # Sort by similarity
    similarities.sort(key=lambda x: x[1], reverse=True)

    # Filter by threshold
    filtered_variables = {
        name: value
        for name, sim, value in similarities
        if sim >= threshold
    }

    print(f"Kept {len(filtered_variables)}/{len(variable_names)} SVI variables (threshold: {threshold})")

    if filtered_variables:
        print("Most relevant SVI variables:")
        for name, sim, _ in similarities[:5]:
            if sim >= threshold:
                print(f"  - {name} (similarity: {sim:.3f})")

    # Return filtered SVI data
    filtered_svi = {
        "release_year": svi_data.get("release_year"),
        "overall_ranking": svi_data.get("overall_ranking"),
        "themes": svi_data.get("themes"),
        "variables": filtered_variables
    }

    return filtered_svi


def filter_flood_events(
    flood_events: List[Dict[str, Any]],
    filters: Dict[str, Any]
) -> List[Dict[str, Any]]:
    """
    Filters flood events based on specified criteria.

    Args:
        flood_events: List of flood event dictionaries
        filters: Dictionary with max_events, max_distance_miles, recent_only

    Returns:
        Filtered list of flood events
    """
    if not flood_events:
        return flood_events

    filtered = flood_events.copy()

    # Filter by distance
    if filters.get('max_distance_miles') is not None:
        max_dist = filters['max_distance_miles']
        filtered = [
            event for event in filtered
            if event.get('distance_from_query_point_miles', float('inf')) <= max_dist
        ]
        print(f"Filtered to events within {max_dist} miles: {len(filtered)} events")

    # Filter by recency (if needed, could add date filtering logic here)
    # For now, events are already sorted by distance

    # Limit number of events
    if filters.get('max_events') is not None:
        max_events = filters['max_events']
        filtered = filtered[:max_events]
        print(f"Limited to {max_events} events")

    return filtered


def select_relevant_context(
    retrieval_results: List[Dict[str, Any]],
    user_query: str,
    openai_api_key: str
) -> Dict[str, Any]:
    """
    Main function that orchestrates intelligent context selection.

    Args:
        retrieval_results: Full retrieval results from get_flood_context.py
        user_query: User's original query
        openai_api_key: OpenAI API key

    Returns:
        Filtered context with only relevant information
    """
    print("\n" + "="*50)
    print("INTELLIGENT CONTEXT SELECTION")
    print("="*50)

    # Step 1: Analyze query intent
    print("\n[Step 1] Analyzing query intent...")
    intent = analyze_query_intent(user_query, openai_api_key)

    print(f"Intent Analysis:")
    print(f"  - Precipitation Forecast: {intent['needs_precipitation_forecast']}")
    print(f"  - Precipitation History: {intent['needs_precipitation_history']}")
    print(f"  - Flood History: {intent['needs_flood_history']}")
    print(f"  - SVI Data: {intent['needs_svi_data']}")
    print(f"  - County Info: {intent['needs_county_info']}")

    # Step 2: Process each location's data
    filtered_results = []

    for location_data in retrieval_results:
        filtered_location = {
            "input_location": location_data["input_location"]
        }

        # Include county info if needed
        if intent['needs_county_info']:
            filtered_location["county_data"] = location_data.get("county_data")

        # Include precipitation history if needed
        if intent['needs_precipitation_history']:
            filtered_location["precipitation_history"] = location_data.get("precipitation_history", [])

        # Include precipitation forecast if needed
        if intent['needs_precipitation_forecast']:
            filtered_location["precipitation_forecast"] = location_data.get("precipitation_forecast", [])

        # Include and filter flood events if needed
        if intent['needs_flood_history']:
            print("\n[Step 2] Filtering flood events...")
            flood_events = location_data.get("flood_event_history", [])
            filtered_events = filter_flood_events(flood_events, intent['flood_event_filters'])
            filtered_location["flood_event_history"] = filtered_events

        # Include and filter SVI data if needed
        if intent['needs_svi_data']:
            print("\n[Step 3] Filtering SVI variables...")
            svi_data = location_data.get("social_vulnerability_index")
            if svi_data:
                threshold = intent.get('svi_relevance_threshold', 0.3)
                filtered_svi = filter_svi_variables(svi_data, user_query, openai_api_key, threshold)
                filtered_location["social_vulnerability_index"] = filtered_svi

        filtered_results.append(filtered_location)

    print("\n" + "="*50)
    print("CONTEXT SELECTION COMPLETE")
    print("="*50)

    return {
        "query": user_query,
        "intent_analysis": intent,
        "filtered_data": filtered_results
    }


def main():
    """
    Main function for testing the selection system.
    """
    load_dotenv()
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

    # Example usage
    print("="*50)
    print("Context Selection System - Test Mode")
    print("="*50)

    # Load example retrieval results
    example_query = input("\nEnter your query: ").strip()

    # For testing, you would load actual retrieval results from get_flood_context.py
    print("\nNote: In production, load retrieval_results from get_flood_context.py")
    print("For now, please provide the path to a JSON file with retrieval results:")

    json_path = input("Path to retrieval results JSON (or press Enter to skip): ").strip()

    if json_path and os.path.exists(json_path):
        with open(json_path, 'r') as f:
            retrieval_results = json.load(f)

        # Run the selection
        selected_context = select_relevant_context(
            retrieval_results,
            example_query,
            OPENAI_API_KEY
        )

        # Print results
        print("\n" + "="*50)
        print("FILTERED CONTEXT (Ready for LLM)")
        print("="*50)
        print(json.dumps(selected_context, indent=2))

        # Optionally save to file
        save = input("\nSave filtered context to file? (y/n): ").strip().lower()
        if save == 'y':
            output_path = "filtered_context.json"
            with open(output_path, 'w') as f:
                json.dump(selected_context, f, indent=2)
            print(f"Saved to {output_path}")
    else:
        print("No file provided. Exiting test mode.")


if __name__ == "__main__":
    main()
