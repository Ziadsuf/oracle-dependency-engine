MATCH (o:OracleObject {id: $id})
OPTIONAL MATCH (o)-[out]->(:OracleObject)
WHERE type(out) <> 'PRODUCED_BY'
WITH o, count(out) AS outDegree
OPTIONAL MATCH (o)<-[rin]-(:OracleObject)
WHERE type(rin) <> 'PRODUCED_BY'
RETURN o{.*} AS node, outDegree, count(rin) AS inDegree;
