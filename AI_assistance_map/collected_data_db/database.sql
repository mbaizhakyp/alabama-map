CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_raster; 
CREATE SCHEMA IF NOT EXISTS flai AUTHORIZATION margulanbaizhakyp;
SET search_path = flai, public;

SELECT postgis_full_version();

CREATE TYPE unit_precip AS ENUM ('mm', 'in');

-- 1) TCLStates 
CREATE TABLE IF NOT EXISTS flai.TCLStates (
  idState    CHAR(2) PRIMARY KEY,                      -- State Abbr
  State      TEXT NOT NULL,                            -- State name
  geometry   geometry(MultiPolygon, 5070)              -- optional
);
CREATE INDEX IF NOT EXISTS tclstates_gix ON flai.TCLStates USING GIST (geometry);

-- 2) TCLCounties
CREATE TABLE IF NOT EXISTS flai.TCLCounties (
  fips_county_code CHAR(5) PRIMARY KEY,               -- County FIPS (state+county)
  County           TEXT NOT NULL,
  idState          CHAR(2) NOT NULL REFERENCES flai.TCLStates(idState) ON UPDATE CASCADE,
  areaSQMI         NUMERIC,                           -- optional (it can be calculated)
  geometry         geometry(MultiPolygon, 5070) NOT NULL
);
CREATE INDEX IF NOT EXISTS tclcounties_gix       ON flai.TCLCounties USING GIST (geometry);
CREATE INDEX IF NOT EXISTS tclcounties_state_idx ON flai.TCLCounties(idState);

-- 3) TCLEventTypes
CREATE TABLE IF NOT EXISTS flai.TCLEventTypes (
  idEventType SMALLSERIAL PRIMARY KEY,
  EventType   TEXT UNIQUE NOT NULL                    -- 'Flash Flood', 'Flood'
);
INSERT INTO flai.TCLEventTypes(EventType)
VALUES ('Flash Flood'), ('Flood')
ON CONFLICT (EventType) DO NOTHING;

-- 4) TBLFloodEvents 
CREATE TABLE IF NOT EXISTS flai.TBLFloodEvents (
  idFloodEvent      BIGSERIAL PRIMARY KEY,
  idEventType       SMALLINT NOT NULL REFERENCES flai.TCLEventTypes(idEventType) ON UPDATE CASCADE,
  beginDate         DATE NOT NULL,
  fips_county_code  CHAR(5) REFERENCES flai.TCLCounties(fips_county_code) ON UPDATE CASCADE,
  warning_zone		TEXT NOT NULL,
  geometry          geometry(Point, 4326) NOT NULL,   -- lat/lon of the event
  CHECK (fips_county_code IS NULL OR char_length(fips_county_code) = 5)
);
CREATE INDEX IF NOT EXISTS tblfloodevents_gix       ON flai.TBLFloodEvents USING GIST (geometry);
CREATE INDEX IF NOT EXISTS tblfloodevents_date_idx  ON flai.TBLFloodEvents(beginDate);
CREATE INDEX IF NOT EXISTS tblfloodevents_type_idx  ON flai.TBLFloodEvents(idEventType);

-- Trigger to autocomplete fips_county_code by spatial intersection
CREATE OR REPLACE FUNCTION flai._set_event_county_from_point()
RETURNS trigger AS $$
BEGIN
  IF NEW.fips_county_code IS NULL THEN
    SELECT c.fips_county_code INTO NEW.fips_county_code
    FROM flai.TCLCounties c
    WHERE ST_Intersects(c.geometry, ST_Transform(NEW.geometry, 5070))
    LIMIT 1;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_event_county ON flai.TBLFloodEvents;
CREATE TRIGGER trg_set_event_county
BEFORE INSERT OR UPDATE OF geometry
ON flai.TBLFloodEvents
FOR EACH ROW EXECUTE FUNCTION flai._set_event_county_from_point();

-- 5) TBLMonthlyPrecipitation  (precipitación mensual por condado)
CREATE TABLE IF NOT EXISTS flai.TBLMonthlyPrecipitation (
  fips_county_code       CHAR(5)  NOT NULL REFERENCES flai.TCLCounties(fips_county_code) ON UPDATE CASCADE,
  year                   INTEGER  NOT NULL,
  month                  INTEGER  NOT NULL CHECK (month BETWEEN 1 AND 12),
  totalPrecipitation_mm  NUMERIC  NOT NULL CHECK (totalPrecipitation_mm >= 0),
  -- calculate inches
  totalPrecipitation_in  NUMERIC  GENERATED ALWAYS AS (totalPrecipitation_mm / 25.4) STORED,
  PRIMARY KEY (fips_county_code, year, month)
);

-- 6) TCLSVIThemes  (SVI Themes)
CREATE TABLE IF NOT EXISTS flai.TCLSVIThemes (
  idSVITheme SMALLSERIAL PRIMARY KEY,
  Theme      TEXT UNIQUE NOT NULL                  -- 'Socioeconomic Status', etc.
);

-- 7) TCLSVIVariables  (SVI Variables: 16 core)
CREATE TABLE IF NOT EXISTS flai.TCLSVIVariables (
  idSVIVariable SMALLSERIAL PRIMARY KEY,
  idSVITheme    SMALLINT NOT NULL REFERENCES flai.TCLSVIThemes(idSVITheme) ON UPDATE CASCADE,
  Code          TEXT UNIQUE NOT NULL,              -- EP_POV150, EP_UNEMP, ...
  SVIVariable   TEXT NOT NULL,                     -- SVI Variable Name
  IsCore        BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS tclsvivars_code_uidx  ON flai.TCLSVIVariables(Code);
CREATE INDEX        IF NOT EXISTS tclsvivars_theme_idx  ON flai.TCLSVIVariables(idSVITheme);

-- Insert SVI themes
INSERT INTO flai.TCLSVIThemes(Theme) VALUES
  ('Socioeconomic Status'),
  ('Household Characteristics'),
  ('Racial & Ethnic Minority Status'),
  ('Housing Type & Transportation')
ON CONFLICT (Theme) DO NOTHING;

-- Map SVI Variables to their themes
WITH themes AS (
  SELECT idSVITheme,Theme FROM flai.TCLSVIThemes
)
INSERT INTO flai.TCLSVIVariables(idSVITheme,Code,SVIVariable,IsCore)
SELECT t.idSVITheme, v.code, v.label, TRUE
FROM themes t
JOIN (VALUES
  -- T1 Socioeconomic Status (5)
  ('Socioeconomic Status','EPL_POV150_state','Below 150% Poverty'),
  ('Socioeconomic Status','EPL_UNEMP_state','Unemployed'),
  ('Socioeconomic Status','EPL_HBURD_state','Housing Cost Burden'),
  ('Socioeconomic Status','EPL_NOHSDP_state','No High School Diploma'),
  ('Socioeconomic Status','EPL_UNINSUR_state','No Health Insurance'),
  -- T2 Household Characteristics (5) 
  ('Household Characteristics','EPL_AGE65_state','Aged 65 & Older'),
  ('Household Characteristics','EPL_AGE17_state','Aged 17 & Younger'),
  ('Household Characteristics','EPL_DISABL_state','Civilian with a Disability'),
  ('Household Characteristics','EPL_SNGPNT_state','Single-Parent Households'),
  ('Household Characteristics','EPL_LIMENG_state','English Language Proficiency (limited)'),
  -- T3 Racial & Ethnic Minority Status (1)
  ('Racial & Ethnic Minority Status','EPL_MINRTY_state','Minority (all except white, non-Hispanic)'),
  -- T4 Housing Type & Transportation (5)
  ('Housing Type & Transportation','EPL_MUNIT_state','Multi-Unit Structures (10+)'),
  ('Housing Type & Transportation','EPL_MOBILE_state','Mobile Homes'),
  ('Housing Type & Transportation','EPL_CROWD_state','Crowding (>1 person/room)'),
  ('Housing Type & Transportation','EPL_NOVEH_state','No Vehicle'),
  ('Housing Type & Transportation','EPL_GROUPQ_state','Group Quarters')
) AS v(theme_name, code, label)
  ON t.Theme = v.theme_name
ON CONFLICT (Code) DO NOTHING;

-- 8) TBLSVI 
CREATE TABLE flai.TBLSVI (
  idSVIRecord      BIGSERIAL PRIMARY KEY,
  fips_county_code CHAR(5)  NOT NULL
      REFERENCES flai.TCLCounties(fips_county_code) ON UPDATE CASCADE,
  release_year     INTEGER  NOT NULL,
  idSVITheme       SMALLINT NOT NULL
      REFERENCES flai.TCLSVIThemes(idSVITheme) ON UPDATE CASCADE,
  idSVIVariable    SMALLINT NULL
      REFERENCES flai.TCLSVIVariables(idSVIVariable) ON UPDATE CASCADE,
  overallNational  NUMERIC,
  overallState     NUMERIC,
  SVIValue         NUMERIC
);

CREATE INDEX tb_svi_fips_year_idx ON flai.TBLSVI (fips_county_code,release_year);
CREATE INDEX tb_svi_theme_idx     ON flai.TBLSVI (idSVITheme);
CREATE INDEX tb_svi_var_idx       ON flai.TBLSVI (idSVIVariable);