MATCH (r:IngestionRun {id: $id})
SET r.finishedAt = $finishedAt,
    r.status = $status,
    r.nodesUpserted = $nodesUpserted,
    r.edgesUpserted = $edgesUpserted,
    r.unresolvedRefs = $unresolvedRefs
RETURN r.id AS id;
