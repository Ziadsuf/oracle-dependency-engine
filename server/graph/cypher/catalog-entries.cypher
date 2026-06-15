MATCH (o:OracleObject)
WHERE o.type <> 'unresolved'
RETURN o.id AS id, o.type AS type, o.schema AS schema, o.name AS name;
