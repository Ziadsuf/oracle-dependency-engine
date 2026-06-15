MATCH (o:OracleObject)
RETURN o.type AS type, count(o) AS count;
