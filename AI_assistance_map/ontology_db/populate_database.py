import psycopg2
import rdflib
from rdflib import Graph, RDFS, OWL, RDF, URIRef
from rdflib.term import BNode

def populate_database(ttl_file_path, db_config):
    """
    Parses the TTL file and populates the structured PostgreSQL database.
    """
    # 1. Connect and Parse
    try:
        conn = psycopg2.connect(**db_config)
        cur = conn.cursor()
        print("Database connection established.")
    except psycopg2.Error as e:
        print(f"Database connection error: {e}")
        return

    g = Graph()
    try:
        g.parse(ttl_file_path, format="ttl")
        print(f"TTL file parsed. Triples found: {len(g)}")
    except Exception as e:
        print(f"Error parsing TTL file: {e}")
        return

    # Helper function to safely extract label and comment
    def get_details(subject):
        label = g.value(subject, RDFS.label)
        comment = g.value(subject, RDFS.comment)
        return (str(label) if label else None, str(comment) if comment else None)

    # 2. Insert Classes
    class_uri_to_id = {}
    print("Inserting classes...")
    classes_to_process = []
    
    # Identify classes, skipping blank nodes (e.g., complex restrictions)
    for s in g.subjects(RDF.type, OWL.Class):
        if isinstance(s, BNode): continue
        uri = str(s)
        label, comment = get_details(s)
        classes_to_process.append((uri, label, comment))

    # Insert classes and retrieve their generated IDs
    for uri, label, comment in classes_to_process:
        try:
            cur.execute(
                "INSERT INTO classes (uri, label, comment) VALUES (%s, %s, %s) "
                "ON CONFLICT (uri) DO UPDATE SET label = EXCLUDED.label, comment = EXCLUDED.comment "
                "RETURNING id;",
                (uri, label, comment)
            )
            class_id = cur.fetchone()[0]
            class_uri_to_id[uri] = class_id
        except psycopg2.Error as e:
            conn.rollback() # Rollback on error
            print(f"Error inserting class {uri}: {e}")
            
    conn.commit() # Commit after the stage is complete

    # 3. Insert Properties
    property_uri_to_id = {}
    property_types = {
        OWL.ObjectProperty: "ObjectProperty",
        OWL.DatatypeProperty: "DatatypeProperty",
    }
    print("Inserting properties...")
    properties_to_process = []
    
    # Identify properties
    for prop_type_uri, prop_type_name in property_types.items():
        for s in g.subjects(RDF.type, prop_type_uri):
            if isinstance(s, BNode): continue
            uri = str(s)
            label, comment = get_details(s)
            properties_to_process.append((uri, label, comment, prop_type_name))

    # Insert properties and retrieve their generated IDs
    for uri, label, comment, prop_type_name in properties_to_process:
        try:
            cur.execute(
                "INSERT INTO properties (uri, label, comment, type) VALUES (%s, %s, %s, %s) "
                "ON CONFLICT (uri) DO UPDATE SET label = EXCLUDED.label, comment = EXCLUDED.comment, type = EXCLUDED.type "
                "RETURNING id;",
                (uri, label, comment, prop_type_name)
            )
            prop_id = cur.fetchone()[0]
            property_uri_to_id[uri] = prop_id
        except psycopg2.Error as e:
            conn.rollback()
            print(f"Error inserting property {uri}: {e}")
            
    conn.commit()

    # 4. Insert Relationships (Hierarchy, Domains, Ranges)
    print("Inserting relationships...")
    
    # Prepare data for bulk insertion
    hierarchy_data = []
    for s, o in g.subject_objects(RDFS.subClassOf):
        sub_id = class_uri_to_id.get(str(s))
        super_id = class_uri_to_id.get(str(o))
        # Ensure both are defined, named classes we imported
        if sub_id and super_id:
            hierarchy_data.append((sub_id, super_id))
    
    domain_data = []
    range_data = []
    for prop_uri, prop_id in property_uri_to_id.items():
        prop_ref = URIRef(prop_uri)
        
        # Domains (rdfs:domain) - Robustly iterate over all defined domains
        for domain in g.objects(prop_ref, RDFS.domain):
            domain_id = class_uri_to_id.get(str(domain))
            if domain_id:
                domain_data.append((prop_id, domain_id))

        # Ranges (rdfs:range) - Robustly iterate over all defined ranges
        for range_obj in g.objects(prop_ref, RDFS.range):
            range_id = class_uri_to_id.get(str(range_obj)) # Look up the ID
            if range_id: # Only add if the range is a known class
                range_data.append((prop_id, range_id))

    # Use executemany for efficient bulk insertion
    try:
        cur.executemany("INSERT INTO class_hierarchy (subclass_id, superclass_id) VALUES (%s, %s) ON CONFLICT DO NOTHING;", hierarchy_data)
        cur.executemany("INSERT INTO property_domains (property_id, domain_class_id) VALUES (%s, %s) ON CONFLICT DO NOTHING;", domain_data)
        cur.executemany("INSERT INTO property_ranges (property_id, range_class_id) VALUES (%s, %s) ON CONFLICT DO NOTHING;", range_data)
        conn.commit()
    except psycopg2.Error as e:
        conn.rollback()
        print(f"Error during bulk insertion of relationships: {e}")

    # Cleanup
    cur.close()
    conn.close()
    print("Database population complete.")

# --- Example Usage ---
if __name__ == '__main__':
    # Replace with your actual file path
    ttl_file = 'Flood_ontology_construction/output/Protege/final_ontology.ttl'

    # !! REPLACE WITH YOUR POSTGRESQL CONNECTION DETAILS !!
    db_config = {
        'dbname': 'map_ontology_db',
        'user': 'postgres',
        'password': 'Lsl198806',
        'host': 'localhost',
        'port': '5432'
    }
    
    # Uncomment the line below to run the import
    populate_database(ttl_file, db_config)