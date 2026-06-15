MATCH (s:Synonym)-[:SYNONYM_FOR]->(t:OracleObject)
RETURN s.id AS synonymId, t.id AS targetId;
