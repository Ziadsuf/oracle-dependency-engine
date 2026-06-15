MATCH (:OracleObject)-[rel]->(:OracleObject)
WHERE type(rel) <> 'PRODUCED_BY'
RETURN count(rel) AS count;
