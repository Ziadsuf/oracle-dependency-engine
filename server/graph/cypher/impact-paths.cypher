// Why are these two objects connected? Undirected shortest dependency path.

MATCH (a:OracleObject {id: $from}), (b:OracleObject {id: $to})
MATCH p = shortestPath((a)-[:CONTAINS|CALLS|REFERENCES|DEPENDS_ON|BASED_ON|USES_SEQUENCE|FK_TO|ATTACHED_TO|QUERIES|SYNONYM_FOR*..__DEPTH__]-(b))
RETURN [n IN nodes(p) | {id: n.id, name: n.name, type: n.type}] AS path,
       [r IN relationships(p) | type(r)] AS relTypes;
