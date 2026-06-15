// Idempotent node upsert, one statement per node label (Cypher cannot
// parameterize labels; __LABEL__ is substituted from the closed taxonomy
// in server/domain/model.ts — never from user input).
// $batch rows: { id, name, schema, type, group, status, props }
// $runId: IngestionRun id for provenance (PRODUCED_BY).

UNWIND $batch AS row
MERGE (o:OracleObject:__LABEL__ {id: row.id})
SET o.name = row.name,
    o.schema = row.schema,
    o.type = row.type,
    o.group = row.group,
    o.status = row.status,
    o += row.props
WITH o
OPTIONAL MATCH (r:IngestionRun {id: $runId})
FOREACH (_ IN CASE WHEN r IS NULL THEN [] ELSE [1] END |
  MERGE (o)-[:PRODUCED_BY]->(r)
)
RETURN count(o) AS upserted;
