// Provenance: every ingestion creates a run node; objects link via PRODUCED_BY.

MERGE (r:IngestionRun {id: $id})
SET r.startedAt = $startedAt,
    r.source = $source,
    r.fileName = $fileName,
    r.status = 'RUNNING'
RETURN r.id AS id;
