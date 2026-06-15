UNWIND $batch AS row
MATCH (u:UnresolvedRef {id: row.unresolvedId})
DETACH DELETE u
RETURN count(*) AS deleted;
