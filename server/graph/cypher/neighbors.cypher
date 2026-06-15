// Progressive expansion: subgraph around a node. __DEPTH__ is a validated
// integer; __ARROW_LEFT__/__ARROW_RIGHT__ are '-'/'->' (out), '<-'/'-' (in)
// or '-'/'-' (both) — all interpolated from a safelist by the service.

MATCH (o:OracleObject {id: $id})
MATCH p = (o)__ARROW_LEFT__[:CONTAINS|CALLS|REFERENCES|DEPENDS_ON|BASED_ON|USES_SEQUENCE|FK_TO|ATTACHED_TO|QUERIES|SYNONYM_FOR*1..__DEPTH__]__ARROW_RIGHT__(n:OracleObject)
UNWIND nodes(p) AS pn
UNWIND relationships(p) AS pr
RETURN collect(DISTINCT {id: pn.id, label: pn.name, type: pn.type, group: pn.group}) AS nodes,
       collect(DISTINCT {source: startNode(pr).id, target: endNode(pr).id, relType: type(pr), operation: pr.operation}) AS edges;
