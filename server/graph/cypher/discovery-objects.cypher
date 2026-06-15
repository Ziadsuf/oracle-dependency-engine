// Per-object rows for the Metadata Discovery table, with the REAL outgoing
// dependency count from the graph (no mock values). __LIMIT__ is a validated int.

MATCH (o:OracleObject)
WHERE o.type <> 'unresolved'
  AND ($schema IS NULL OR o.schema = $schema)
RETURN o.name AS name, o.type AS type, o.schema AS schema, o.status AS status,
       o.loc AS loc, o.lastDdlTime AS lastDdlTime,
       COUNT { (o)-[r]->(:OracleObject) WHERE type(r) <> 'PRODUCED_BY' } AS deps
ORDER BY o.schema, o.type, o.name
LIMIT __LIMIT__;
