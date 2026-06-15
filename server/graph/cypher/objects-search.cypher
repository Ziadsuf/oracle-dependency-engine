MATCH (o:OracleObject)
WHERE ($search IS NULL OR toUpper(o.name) CONTAINS toUpper($search))
  AND ($type IS NULL OR o.type = $type)
  AND ($schema IS NULL OR o.schema = $schema)
RETURN o.id AS id, o.name AS name, o.type AS type, o.schema AS schema,
       o.status AS status, o.group AS group
ORDER BY o.name
SKIP __SKIP__
LIMIT __LIMIT__;
