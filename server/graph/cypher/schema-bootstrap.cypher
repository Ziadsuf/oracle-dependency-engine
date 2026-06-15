// Graph schema bootstrap — idempotent (IF NOT EXISTS).
// Statements are separated by semicolons and executed sequentially.

CREATE CONSTRAINT oracle_object_id IF NOT EXISTS
FOR (o:OracleObject) REQUIRE o.id IS UNIQUE;

CREATE CONSTRAINT ingestion_run_id IF NOT EXISTS
FOR (r:IngestionRun) REQUIRE r.id IS UNIQUE;

CREATE INDEX oracle_object_type IF NOT EXISTS
FOR (o:OracleObject) ON (o.type);

CREATE INDEX oracle_object_schema IF NOT EXISTS
FOR (o:OracleObject) ON (o.schema);

CREATE FULLTEXT INDEX oracle_object_search IF NOT EXISTS
FOR (o:OracleObject) ON EACH [o.name];
