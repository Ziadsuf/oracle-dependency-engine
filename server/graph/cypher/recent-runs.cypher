MATCH (r:IngestionRun)
RETURN r.id AS id, r.startedAt AS startedAt, r.finishedAt AS finishedAt,
       r.source AS source, r.fileName AS fileName, r.status AS status,
       r.nodesUpserted AS nodesUpserted, r.edgesUpserted AS edgesUpserted,
       r.unresolvedRefs AS unresolvedRefs
ORDER BY r.startedAt DESC
LIMIT 10;
