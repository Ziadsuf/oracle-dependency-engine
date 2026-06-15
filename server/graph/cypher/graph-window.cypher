// Filtered, windowed node selection for the React Flow knowledge graph.
// __LIMIT__ is a validated integer interpolated by the service.

MATCH (o:OracleObject)
WHERE ($types IS NULL OR o.type IN $types)
  AND ($schema IS NULL OR o.schema = $schema)
  AND ($search IS NULL OR toUpper(o.name) CONTAINS toUpper($search))
RETURN o.id AS id, o.name AS label, o.type AS type, o.group AS group
ORDER BY o.group, o.type, o.name
LIMIT __LIMIT__;
