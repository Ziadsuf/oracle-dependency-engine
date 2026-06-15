MATCH (a:OracleObject)-[r]->(b:OracleObject)
WHERE a.id IN $ids AND b.id IN $ids AND type(r) <> 'PRODUCED_BY'
RETURN a.id AS source, b.id AS target, type(r) AS relType, r.operation AS operation;
