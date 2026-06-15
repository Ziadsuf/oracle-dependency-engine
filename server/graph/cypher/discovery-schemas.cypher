MATCH (o:OracleObject)
WHERE o.type <> 'unresolved'
  AND ($schema IS NULL OR o.schema = $schema)
RETURN collect(DISTINCT o.schema) AS schemas;
