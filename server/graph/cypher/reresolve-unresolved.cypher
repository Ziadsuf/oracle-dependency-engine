// Moves incoming __REL_TYPE__ edges from an UnresolvedRef onto the newly
// resolved target, merging confidence/evidence like upsert-edges. The node
// itself is deleted afterwards by delete-unresolved.cypher.

UNWIND $batch AS row
MATCH (u:UnresolvedRef {id: row.unresolvedId})<-[r:__REL_TYPE__]-(src:OracleObject)
MATCH (t:OracleObject {id: row.targetId})
MERGE (src)-[nr:__REL_TYPE__]->(t)
SET nr.operation = coalesce(r.operation, nr.operation),
    nr.confidence = CASE
      WHEN nr.confidence IS NULL OR r.confidence > nr.confidence THEN r.confidence
      ELSE nr.confidence
    END,
    nr.evidence = reduce(acc = [], e IN coalesce(nr.evidence, []) + coalesce(r.evidence, []) |
      CASE WHEN e IS NULL OR e IN acc THEN acc ELSE acc + e END
    )
DELETE r
RETURN count(*) AS moved;
