MATCH (o:OracleObject)
WHERE ($search IS NULL OR toUpper(o.name) CONTAINS toUpper($search))
  AND ($type IS NULL OR o.type = $type)
  AND ($schema IS NULL OR o.schema = $schema)
RETURN count(o) AS total;
