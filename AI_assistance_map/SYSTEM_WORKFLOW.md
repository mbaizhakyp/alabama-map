# Flood Information System - Complete Workflow Documentation

## System Overview

This is an end-to-end AI-powered flood information retrieval and question-answering system that intelligently processes user queries about flood-related information.

---

## Complete Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER INPUT QUERY                              │
│  Example: "What is the flood history in Tuscaloosa, Alabama?"       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STAGE 1: DATA RETRIEVAL                          │
│                    (get_flood_context.py)                            │
└─────────────────────────────────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
   ┌─────────┐        ┌──────────┐        ┌──────────┐
   │ Step 1.1│        │ Step 1.2 │        │ Step 1.3 │
   │Forecast?│        │ Extract  │        │ Retrieve │
   │ Check   │        │Locations │        │ Context  │
   └─────────┘        └──────────┘        └──────────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │  Full Retrieval Data │
                  │  (All information)   │
                  └──────────┬───────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                STAGE 2: INTELLIGENT FILTERING                       │
│                   (select_function.py)                               │
└─────────────────────────────────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
   ┌─────────┐        ┌──────────┐        ┌──────────┐
   │ Step 2.1│        │ Step 2.2 │        │ Step 2.3 │
   │ Intent  │        │  Filter  │        │  Filter  │
   │Analysis │        │  Flood   │        │   SVI    │
   └─────────┘        │  Events  │        │Variables │
                      └──────────┘        └──────────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │  Filtered Context    │
                  │  (Relevant data only)│
                  └──────────┬───────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  STAGE 3: ANSWER GENERATION                         │
│                   (get_flood_context.py)                             │
└─────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
                      ┌─────────────┐
                      │  Step 3.1   │
                      │  GPT-4o     │
                      │  Generate   │
                      │  Answer     │
                      └──────┬──────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      FINAL ANSWER TO USER                           │
│  "Tuscaloosa, Alabama (Tuscaloosa County) has experienced 127      │
│   historical flood events. The nearest event was 0.52 miles away..."│
└─────────────────────────────────────────────────────────────────────┘
```

---

## STAGE 1: DATA RETRIEVAL (get_flood_context.py)

### **Step 1.1: Check for Precipitation Forecast Request**

**Function:** `extract_precipitation_time_request(user_query, openai_api_key)`
- **Location:** `get_flood_context.py:93-152`
- **Purpose:** Determine if user wants precipitation forecast and extract time duration
- **Technology:** GPT-4o with JSON mode
- **Input:** User query string
- **Output:**
  - `Integer` (number of hours) if forecast requested
  - `None` if no forecast requested

**Example:**
```python
Query: "What is the rainfall forecast for next 2 hours in Tuscaloosa?"
Output: 2

Query: "What is the flood history in Tuscaloosa?"
Output: None
```

**Process:**
1. Sends query to GPT-4o with specialized prompt
2. GPT-4o analyzes if precipitation forecast is requested
3. Extracts time duration (e.g., "next 2 hours" → 2)
4. Returns hours or None

---

### **Step 1.2: Extract Locations from Query**

**Function:** `extract_coordinates(user_query, maps_client, openai_api_key)`
- **Location:** `get_flood_context.py:206-247`
- **Purpose:** Extract location names and geocode them to coordinates
- **Technology:** GPT-4o + Google Maps Geocoding API
- **Input:** User query
- **Output:** List of geocoded location dictionaries

**Sub-function:** `extract_locations(user_query, openai_api_key)`
- **Location:** `get_flood_context.py:155-203`
- **Purpose:** Use GPT-4o to extract location names
- **Output:** `{"result": ["Tuscaloosa, Alabama"]}`

**Example:**
```python
Query: "What is the flood history in Tuscaloosa, Alabama?"

Step 1: extract_locations()
  → {"result": ["Tuscaloosa, Alabama"]}

Step 2: For each location, call Google Maps Geocoding API
  → Lat: 33.2098, Lng: -87.5692

Output: [
  {
    "name": "Tuscaloosa, Alabama",
    "formatted_address": "Tuscaloosa, AL, USA",
    "latitude": 33.2098,
    "longitude": -87.5692
  }
]
```

---

### **Step 1.3: Retrieve Contextual Data**

**Main Function:** `get_contextual_data_for_locations(geocoded_locations, connection, maps_client, forecast_hours)`
- **Location:** `get_flood_context.py:500-542`
- **Purpose:** Orchestrate retrieval of all flood-related data
- **Input:** Geocoded locations, DB connection, forecast hours
- **Output:** Complete contextual data for each location

**For each location, calls 5 sub-functions:**

#### **1.3.1: Get County Information**
**Function:** `get_county_info(connection, lat, lon)`
- **Location:** `get_flood_context.py:272-292`
- **Technology:** PostgreSQL + PostGIS spatial query
- **Purpose:** Find which county contains the coordinates
- **Query Used:**
```sql
SELECT c.fips_county_code, c.County, s.State, c.areaSQMI
FROM flai.TCLCounties c
JOIN flai.TCLStates s ON c.idState = s.idState
WHERE ST_Intersects(c.geometry, ST_Transform(ST_SetSRID(ST_MakePoint(lon, lat), 4326), 5070))
```
- **Output:**
```json
{
  "fips_code": "01125",
  "county_name": "Tuscaloosa",
  "state_name": "Alabama",
  "area_sqmi": 1335.22
}
```

#### **1.3.2: Get Precipitation History**
**Function:** `get_precipitation_history(connection, fips_code)`
- **Location:** `get_flood_context.py:295-309`
- **Purpose:** Retrieve monthly precipitation data for the county
- **Query Used:**
```sql
SELECT year, month, totalPrecipitation_in
FROM flai.TBLMonthlyPrecipitation
WHERE fips_county_code = '01125'
ORDER BY year, month
```
- **Output:**
```json
[
  {"year": 2020, "month": 1, "precipitation_in": 5.2},
  {"year": 2020, "month": 2, "precipitation_in": 4.8},
  ...
]
```

#### **1.3.3: Get Precipitation Forecast** (if requested)
**Function:** `get_precipitation_forecast(maps_client, lat, lon, hours)`
- **Location:** `get_flood_context.py:419-497`
- **Technology:** Google Maps Weather API
- **Purpose:** Get hourly precipitation forecast
- **API Endpoint:** `https://weather.googleapis.com/v1/forecast/hours:lookup`
- **Output:**
```json
[
  {
    "time": "2025-01-15T14:00:00Z",
    "precipitation_probability": 25.0,
    "precipitation_amount_mm": 0.5,
    "precipitation_amount_in": 0.02,
    "weather_condition": "Partly Cloudy"
  },
  ...
]
```

#### **1.3.4: Get Flood Event History**
**Function:** `get_flood_history(connection, fips_code, maps_client, user_lat, user_lon)`
- **Location:** `get_flood_context.py:312-372`
- **Purpose:** Retrieve historical flood events, sorted by distance
- **Technology:** PostgreSQL + PostGIS + Google Maps Reverse Geocoding
- **Query Used:**
```sql
SELECT
    et.EventType,
    e.beginDate,
    e.warning_zone,
    c.County,
    ST_Y(e.geometry) AS latitude,
    ST_X(e.geometry) AS longitude,
    ST_Distance(
        e.geometry::geography,
        ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography
    ) as distance_meters
FROM flai.TBLFloodEvents e
JOIN flai.TCLEventTypes et ON e.idEventType = et.idEventType
LEFT JOIN flai.TCLCounties c ON e.fips_county_code = c.fips_county_code
WHERE e.fips_county_code = '01125'
ORDER BY distance_meters ASC
```
- **Output:**
```json
[
  {
    "type": "Flash Flood",
    "date": "2021-03-15",
    "distance_from_query_point_miles": 0.52,
    "warning_zone": "ALZ023",
    "county": "Tuscaloosa",
    "location": {"latitude": 33.2104, "longitude": -87.5698},
    "nearest_address": "1234 Main St, Tuscaloosa, AL 35401"
  },
  ...
]
```

#### **1.3.5: Get Social Vulnerability Index (SVI) Data**
**Function:** `get_svi_data(connection, fips_code, release_year=2022)`
- **Location:** `get_flood_context.py:375-416`
- **Purpose:** Retrieve SVI rankings and all 16 variables
- **Query Used:**
```sql
SELECT
    s.overallNational,
    s.overallState,
    t.Theme,
    v.SVIVariable,
    s.SVIValue
FROM flai.TBLSVI s
JOIN flai.TCLSVIThemes t ON s.idSVITheme = t.idSVITheme
LEFT JOIN flai.TCLSVIVariables v ON s.idSVIVariable = v.idSVIVariable
WHERE s.fips_county_code = '01125' AND s.release_year = 2022
```
- **Output:**
```json
{
  "release_year": 2022,
  "overall_ranking": {
    "national": 0.75,
    "state": 0.62
  },
  "themes": {
    "Socioeconomic Status": 0.80,
    "Household Characteristics": 0.65,
    "Racial & Ethnic Minority Status": 0.55,
    "Housing Type & Transportation": 0.70
  },
  "variables": {
    "Below 150% Poverty": 0.78,
    "Unemployed": 0.45,
    "Housing Cost Burden": 0.62,
    "No High School Diploma": 0.71,
    "No Health Insurance": 0.56,
    "Aged 65 & Older": 0.34,
    "Aged 17 & Younger": 0.52,
    "Civilian with a Disability": 0.48,
    "Single-Parent Households": 0.68,
    "English Language Proficiency": 0.23,
    "Racial & Ethnic Minority Status": 0.55,
    "Multi-Unit Structures": 0.41,
    "Mobile Homes": 0.59,
    "Crowding": 0.27,
    "No Vehicle": 0.65,
    "Group Quarters": 0.31
  }
}
```

---

### **Stage 1 Output: Full Retrieval Data**

After Step 1.3 completes, the system has:

```json
[
  {
    "input_location": {
      "name": "Tuscaloosa, Alabama",
      "formatted_address": "Tuscaloosa, AL, USA",
      "latitude": 33.2098,
      "longitude": -87.5692
    },
    "county_data": { /* County info */ },
    "precipitation_history": [ /* Monthly data */ ],
    "precipitation_forecast": [ /* Hourly forecast if requested */ ],
    "flood_event_history": [ /* All flood events, sorted by distance */ ],
    "social_vulnerability_index": { /* All 16 SVI variables + themes */ }
  }
]
```

**Problem:** This is a LOT of data (potentially thousands of tokens). We need to filter it!

---

## STAGE 2: INTELLIGENT FILTERING (select_function.py)

**Main Function:** `select_relevant_context(retrieval_results, user_query, openai_api_key)`
- **Location:** `select_function.py:281-358`
- **Purpose:** Filter retrieval results to include only relevant information
- **Technology:** GPT-4o + OpenAI Embeddings (text-embedding-3-large)
- **Input:** Full retrieval results, user query
- **Output:** Filtered context with only relevant data

---

### **Step 2.1: Analyze Query Intent**

**Function:** `analyze_query_intent(query, openai_api_key)`
- **Location:** `select_function.py:31-111`
- **Purpose:** Determine what types of data the user needs
- **Technology:** GPT-4o with JSON mode
- **Input:** User query
- **Output:** Intent analysis with boolean flags and filters

**Example:**
```python
Query: "Why is Tuscaloosa vulnerable to flooding?"

Output: {
  "needs_precipitation_forecast": false,
  "needs_precipitation_history": false,
  "needs_flood_history": true,
  "needs_svi_data": true,  # ← "Why" triggers SVI
  "needs_county_info": true,
  "flood_event_filters": {
    "max_events": 10,
    "max_distance_miles": null,
    "recent_only": false
  },
  "svi_relevance_threshold": 0.3
}
```

**GPT-4o Decision Logic:**
- Query contains "why" or "vulnerable" → `needs_svi_data: true`
- Query mentions "forecast" or "next X hours" → `needs_precipitation_forecast: true`
- Query mentions "history" or "past" → `needs_flood_history: true`
- Query mentions demographics/poverty → `needs_svi_data: true`

---

### **Step 2.2: Filter Flood Events**

**Function:** `filter_flood_events(flood_events, filters)`
- **Location:** `select_function.py:241-278`
- **Purpose:** Apply distance and count limits to flood events
- **Input:** Full list of flood events, filter criteria
- **Output:** Filtered list

**Example:**
```python
Input: 127 flood events (all in county)
Filters: {"max_events": 10, "max_distance_miles": null}

Process:
1. Events already sorted by distance (from Stage 1)
2. Limit to max_events: 127 → 10 events

Output: 10 nearest flood events
```

---

### **Step 2.3: Filter SVI Variables (Semantic Filtering)**

**Function:** `filter_svi_variables(svi_data, query, openai_api_key, threshold)`
- **Location:** `select_function.py:155-238`
- **Purpose:** Keep only SVI variables relevant to the query
- **Technology:** OpenAI Embeddings (text-embedding-3-large) + Cosine Similarity
- **Input:** All 16 SVI variables, user query, threshold (default 0.3)
- **Output:** Filtered SVI variables

**Helper Function 1:** `load_svi_context()`
- **Location:** `select_function.py:18-25`
- **Purpose:** Load SVI description file for semantic understanding
- **File:** `prompts/social_vulnerability_index.txt`
- **Content:** Detailed description of SVI themes and variables

**Helper Function 2:** `get_embeddings(texts, openai_api_key)`
- **Location:** `select_function.py:114-137`
- **Purpose:** Get embeddings using text-embedding-3-large
- **Model:** `text-embedding-3-large` (3072-dimensional vectors)

**Helper Function 3:** `cosine_similarity(vec1, vec2)`
- **Location:** `select_function.py:140-152`
- **Purpose:** Calculate similarity between two embedding vectors
- **Formula:** `dot(v1, v2) / (||v1|| * ||v2||)`

**Process:**

```python
Query: "Why is Tuscaloosa vulnerable to flooding?"

Step 1: Load SVI Context
  → Reads prompts/social_vulnerability_index.txt
  → Contains descriptions of all 16 variables and 4 themes

Step 2: Prepare texts for embedding
  Variables: [
    "Below 150% Poverty: [SVI context description]",
    "Unemployed: [SVI context description]",
    "Housing Cost Burden: [SVI context description]",
    ...all 16 variables...
  ]

  Query: "Query: Why is Tuscaloosa vulnerable to flooding?\n\nContext: [SVI context]"

Step 3: Get embeddings from OpenAI
  → Embeds query + 16 variable descriptions
  → Returns 17 embedding vectors (each 3072-dimensional)

Step 4: Calculate cosine similarity for each variable
  Similarities:
    - "Below 150% Poverty": 0.65 ✓ (above threshold)
    - "Unemployed": 0.42 ✓
    - "Housing Cost Burden": 0.38 ✓
    - "No High School Diploma": 0.51 ✓
    - "No Health Insurance": 0.45 ✓
    - "Aged 65 & Older": 0.28 ✗ (below 0.3 threshold)
    - "Aged 17 & Younger": 0.25 ✗
    - "Civilian with a Disability": 0.47 ✓
    - "Single-Parent Households": 0.39 ✓
    - "English Language Proficiency": 0.18 ✗
    - "Racial & Ethnic Minority Status": 0.55 ✓
    - "Multi-Unit Structures": 0.22 ✗
    - "Mobile Homes": 0.56 ✓
    - "Crowding": 0.33 ✓
    - "No Vehicle": 0.62 ✓
    - "Group Quarters": 0.19 ✗

Step 5: Filter by threshold (0.3)
  Kept: 11/16 variables

Output: {
  "variables": {
    "Below 150% Poverty": 0.78,
    "Unemployed": 0.45,
    "Housing Cost Burden": 0.62,
    "No High School Diploma": 0.71,
    "No Health Insurance": 0.56,
    "Civilian with a Disability": 0.48,
    "Single-Parent Households": 0.68,
    "Racial & Ethnic Minority Status": 0.55,
    "Mobile Homes": 0.59,
    "Crowding": 0.27,
    "No Vehicle": 0.65
  }
}
```

**Why this matters:**
- Original: 16 variables × many tokens = too much context
- Filtered: 11 relevant variables = focused context for LLM
- Removes irrelevant variables like "Aged 17 & Younger" for vulnerability query

---

### **Stage 2 Output: Filtered Context**

```json
{
  "query": "Why is Tuscaloosa vulnerable to flooding?",
  "intent_analysis": {
    "needs_precipitation_forecast": false,
    "needs_precipitation_history": false,
    "needs_flood_history": true,
    "needs_svi_data": true,
    "needs_county_info": true,
    "flood_event_filters": {"max_events": 10, ...},
    "svi_relevance_threshold": 0.3
  },
  "filtered_data": [
    {
      "input_location": {...},
      "county_data": {...},
      "flood_event_history": [ /* Only 10 nearest events */ ],
      "social_vulnerability_index": {
        "variables": { /* Only 11 relevant variables */ }
      }
      // NOTE: No precipitation_history or precipitation_forecast
      // because needs_precipitation_* were false
    }
  ]
}
```

---

## STAGE 3: ANSWER GENERATION (get_flood_context.py)

**Function:** `generate_llm_answer(user_query, filtered_context, openai_api_key)`
- **Location:** `get_flood_context.py:548-597`
- **Purpose:** Generate natural language answer using GPT-4o
- **Technology:** GPT-4o
- **Input:** User query, filtered context
- **Output:** Natural language answer

**System Prompt:**
```
You are an expert flood information assistant. You have access to flood-related data including:
- Precipitation forecasts and historical data
- Historical flood events with locations and dates
- Social Vulnerability Index (SVI) data indicating community risk factors
- County-level geographic information

Your task is to provide clear, accurate, and helpful answers based on the provided data.
If the data doesn't contain enough information to fully answer the question, acknowledge what you can answer and what information is missing.
Always cite specific data points when making claims.
```

**User Prompt:**
```
User Question: Why is Tuscaloosa vulnerable to flooding?

Available Data:
{
  "filtered_data": [
    {
      "county_data": {...},
      "flood_event_history": [10 events],
      "social_vulnerability_index": {
        "variables": {11 relevant variables}
      }
    }
  ]
}

Please provide a comprehensive answer to the user's question based on the available data above.
Structure your response clearly and include specific numbers, dates, and locations when relevant.
```

**Example Output:**
```
Tuscaloosa, Alabama is vulnerable to flooding due to several factors:

Historical Flood Risk:
Tuscaloosa County (FIPS: 01125) has experienced 127 historical flood events. The 10 nearest events to your query location show a pattern of both flash floods and general flooding, with the closest event occurring just 0.52 miles away on March 15, 2021.

Social Vulnerability Factors:
The county shows elevated vulnerability in several areas (2022 SVI data):
- Economic Hardship: 78% ranking for poverty (below 150% poverty line) and 62% for housing cost burden indicate many residents may struggle to prepare for or recover from floods
- Education: 71% ranking for lack of high school diploma may limit awareness and preparedness
- Housing Vulnerability: Mobile homes (59% ranking) are particularly susceptible to flood damage
- Transportation Access: 65% ranking for households without vehicles makes evacuation difficult

These socioeconomic factors mean that even with the same flood risk, Tuscaloosa's population faces greater challenges in flood preparation, evacuation, and recovery compared to less vulnerable communities.
```

---

## FINAL OUTPUT

The system returns a complete result object:

```json
{
  "query": "Why is Tuscaloosa vulnerable to flooding?",
  "answer": "[Natural language answer from GPT-4o]",
  "filtered_context": {
    "intent_analysis": {...},
    "filtered_data": [...]
  },
  "full_retrieval_data": [...]
}
```

The user sees:
```
======================================================================
FINAL ANSWER
======================================================================

Question: Why is Tuscaloosa vulnerable to flooding?

[Natural language answer]

======================================================================

Save detailed results to file? (y/n):
```

---

## Summary Table: Functions by Stage

| Stage | Step | Function Name | File | Lines | Technology |
|-------|------|---------------|------|-------|------------|
| **1** | 1.1 | `extract_precipitation_time_request()` | get_flood_context.py | 93-152 | GPT-4o |
| **1** | 1.2 | `extract_locations()` | get_flood_context.py | 155-203 | GPT-4o |
| **1** | 1.2 | `extract_coordinates()` | get_flood_context.py | 206-247 | Google Geocoding |
| **1** | 1.3 | `get_contextual_data_for_locations()` | get_flood_context.py | 500-542 | Orchestrator |
| **1** | 1.3.1 | `get_county_info()` | get_flood_context.py | 272-292 | PostgreSQL+PostGIS |
| **1** | 1.3.2 | `get_precipitation_history()` | get_flood_context.py | 295-309 | PostgreSQL |
| **1** | 1.3.3 | `get_precipitation_forecast()` | get_flood_context.py | 419-497 | Google Weather API |
| **1** | 1.3.4 | `get_flood_history()` | get_flood_context.py | 312-372 | PostgreSQL+PostGIS+Geocoding |
| **1** | 1.3.5 | `get_svi_data()` | get_flood_context.py | 375-416 | PostgreSQL |
| **2** | 2.1 | `analyze_query_intent()` | select_function.py | 31-111 | GPT-4o |
| **2** | 2.2 | `filter_flood_events()` | select_function.py | 241-278 | Python logic |
| **2** | 2.3 | `filter_svi_variables()` | select_function.py | 155-238 | Embeddings+Cosine |
| **2** | 2.3 | `get_embeddings()` | select_function.py | 114-137 | text-embedding-3-large |
| **2** | 2.3 | `cosine_similarity()` | select_function.py | 140-152 | NumPy |
| **2** | - | `select_relevant_context()` | select_function.py | 281-358 | Orchestrator |
| **3** | 3.1 | `generate_llm_answer()` | get_flood_context.py | 548-597 | GPT-4o |

---

## Key Technologies Used

1. **OpenAI GPT-4o**: Query understanding, intent analysis, answer generation
2. **OpenAI text-embedding-3-large**: Semantic similarity for SVI filtering
3. **Google Maps Geocoding API**: Convert addresses to coordinates
4. **Google Maps Weather API**: Hourly precipitation forecasts
5. **PostgreSQL**: Store flood events, SVI data, precipitation history
6. **PostGIS**: Spatial queries (ST_Intersects, ST_Distance)
7. **NumPy**: Vector similarity calculations
8. **Python**: Orchestration and data processing

---

## Token Efficiency Strategy

**Without filtering (Stage 2):**
- 127 flood events × ~200 tokens each = 25,400 tokens
- 16 SVI variables × ~50 tokens each = 800 tokens
- Monthly precipitation history = ~2,000 tokens
- **Total: ~28,000+ tokens** (exceeds many context windows!)

**With intelligent filtering:**
- 10 flood events × ~200 tokens = 2,000 tokens
- 11 relevant SVI variables × ~50 tokens = 550 tokens
- No precipitation history (not needed for "why vulnerable" query)
- **Total: ~3,000 tokens** (9× reduction!)

This allows the system to handle complex queries efficiently while staying within LLM context limits.

---

## End of Documentation
