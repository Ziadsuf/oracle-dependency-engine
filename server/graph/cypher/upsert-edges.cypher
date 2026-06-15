// Idempotent edge upsert, one statement per relationship type (__REL_TYPE__
// is substituted from the closed taxonomy in server/domain/model.ts).
// $batch rows: { from, to, operation, confidence, evidence }
// evidence is an array of JSON strings — Neo4j properties cannot store
// arrays of maps, so EvidenceRef entries are serialized by the repository.
// Merge semantics: max confidence wins, evidence is unioned (deduped).

UNWIND $batch AS row
MATCH (a:OracleObject {id: row.from})
MATCH (b:OracleObject {id: row.to})
MERGE (a)-[rel:__REL_TYPE__]->(b)
SET rel.operation = coalesce(row.operation, rel.operation),
    rel.confidence = CASE
      WHEN rel.confidence IS NULL OR row.confidence > rel.confidence THEN row.confidence
      ELSE rel.confidence
    END,
    rel.evidence = reduce(acc = [], e IN coalesce(rel.evidence, []) + row.evidence |
      CASE WHEN e IS NULL OR e IN acc THEN acc ELSE acc + e END
    )
RETURN count(rel) AS upserted;
