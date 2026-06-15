MATCH (o:OracleObject)
WHERE o.type <> 'unresolved'
  AND ($schema IS NULL OR o.schema = $schema)
RETURN o.type AS type, count(*) AS count,
       sum(CASE WHEN o.status = 'INVALID' THEN 1 ELSE 0 END) AS invalid;
