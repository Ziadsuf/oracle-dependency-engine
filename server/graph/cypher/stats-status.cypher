MATCH (o:OracleObject)
RETURN count(CASE WHEN o.status = 'INVALID' THEN 1 END) AS invalid,
       count(CASE WHEN o.type = 'unresolved' THEN 1 END) AS unresolved,
       count(DISTINCT o.schema) AS schemas;
