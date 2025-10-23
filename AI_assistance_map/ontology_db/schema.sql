-- 1. Classes Table
-- Stores definitions of OWL Classes (e.g., FloodEvent, Community).
CREATE TABLE classes (
    id SERIAL PRIMARY KEY,
    uri TEXT UNIQUE NOT NULL,
    label TEXT,
    comment TEXT
);

-- 2. Properties Table
-- Stores definitions of OWL Properties (e.g., accessibleTo).
CREATE TABLE properties (
    id SERIAL PRIMARY KEY,
    uri TEXT UNIQUE NOT NULL,
    label TEXT,
    comment TEXT,
    -- Distinguishes between 'ObjectProperty', 'DatatypeProperty', etc.
    type TEXT NOT NULL
);

-- 3. Class Hierarchy Table (rdfs:subClassOf)
-- This junction table supports multiple inheritance.
CREATE TABLE class_hierarchy (
    subclass_id INT REFERENCES classes(id) ON DELETE CASCADE,
    superclass_id INT REFERENCES classes(id) ON DELETE CASCADE,
    PRIMARY KEY (subclass_id, superclass_id)
);

-- 4. Property Domains Table (rdfs:domain)
CREATE TABLE property_domains (
    property_id INT REFERENCES properties(id) ON DELETE CASCADE,
    domain_class_id INT REFERENCES classes(id) ON DELETE CASCADE,
    PRIMARY KEY (property_id, domain_class_id)
);

-- 5. Property Ranges Table (rdfs:range)
CREATE TABLE property_ranges (
    property_id INT REFERENCES properties(id) ON DELETE CASCADE,
    range_class_id INT REFERENCES classes(id) ON DELETE CASCADE,
    PRIMARY KEY (property_id, range_class_id)
);