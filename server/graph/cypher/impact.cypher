// Blast radius / dependency closure for a target object.
// Upstream (who breaks if target changes):  ARROW_LEFT='-',  ARROW_RIGHT='->'
//   → matches (d)-[…]->(target), i.e. dependents reaching the target.
// Downstream (what the target depends on):  ARROW_LEFT='<-', ARROW_RIGHT='-'
//   → matches (d)<-[…]-(target), i.e. dependencies reached from the target.
// __DEPTH__ is a validated integer (Cypher cannot parameterize *1..$depth).

MATCH (target:OracleObject {id: $id})
MATCH p = (d:OracleObject)__ARROW_LEFT__[:CONTAINS|CALLS|REFERENCES|DEPENDS_ON|BASED_ON|USES_SEQUENCE|FK_TO|ATTACHED_TO|QUERIES|SYNONYM_FOR*1..__DEPTH__]__ARROW_RIGHT__(target)
WHERE d <> target
WITH d, min(length(p)) AS depth,
     max(reduce(c = 1.0, r IN relationships(p) | c * coalesce(r.confidence, 1.0))) AS confidence,
     collect(p)[0] AS sample
RETURN d.id AS id, d.name AS label, d.type AS type, depth, confidence,
       [n IN nodes(sample) | n.id] AS viaPath
ORDER BY depth ASC, label ASC
LIMIT 500;
