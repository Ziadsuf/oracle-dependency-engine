// Wipes all data (objects + ingestion runs) but keeps constraints/indexes.
MATCH (n) DETACH DELETE n
