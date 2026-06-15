import { describe, it, expect } from 'vitest';
import { Neo4jClient, neo4jConfigFromEnv } from '../graph/neo4jClient';
import { Neo4jGraphRepository } from '../graph/neo4jGraphRepository';
import { GraphQueryService } from '../graph/graphQueryService';
import { ImpactAnalysisService } from '../impact/impactService';
import { IngestionPipeline } from './ingestionPipeline';
import { PlsqlExtractor } from '../extractors/plsql/plsqlExtractor';
import { DdlFileSource } from '../extractors/schema/ddlFileSource';

const PLSQL = `CREATE OR REPLACE PACKAGE BODY ZZITEST_PKG AS
  PROCEDURE sync_emp IS
  BEGIN
    UPDATE zzitest_employees SET status = 'SYNCED';
  END sync_emp;
END ZZITEST_PKG;`;

const DDL = `CREATE TABLE zzitest.zzitest_employees (id NUMBER PRIMARY KEY, status VARCHAR2(20));`;

// Full extract → resolve → persist → re-resolve round trip against live Neo4j.
describe.runIf(!!process.env.NEO4J_URI)('IngestionPipeline (live Neo4j)', () => {
  it('ingests PL/SQL, leaves an unresolved ref, then re-resolves it when the DDL arrives', async () => {
    const client = new Neo4jClient(neo4jConfigFromEnv()!);
    const repo = new Neo4jGraphRepository(client);
    const pipeline = new IngestionPipeline(repo);
    const runIds: string[] = [];

    try {
      await client.verifyConnectivity();
      await repo.ensureSchema();

      // Run 1: package references a table that is not in the graph yet
      const run1 = await pipeline.run({
        artifact: 'zzitest_pkg.pkb',
        source: 'PLSQL_SOURCE',
        defaultSchema: 'ZZITEST',
        extract: () => new PlsqlExtractor().extract('zzitest_pkg.pkb', PLSQL, { defaultSchema: 'ZZITEST' }),
      });
      runIds.push(run1.runId);
      expect(run1.status).toBe('COMPLETED');
      expect(run1.stats.unresolvedRefs).toBeGreaterThan(0);

      const unresolvedBefore = await repo.getUnresolved();
      expect(unresolvedBefore.some((u) => u.name === 'ZZITEST_EMPLOYEES')).toBe(true);

      // Run 2: the DDL arrives — re-resolution must rewire the unresolved ref
      const run2 = await pipeline.run({
        artifact: 'zzitest_schema.sql',
        source: 'DDL_FILE',
        defaultSchema: 'ZZITEST',
        extract: () => new DdlFileSource().extract('zzitest_schema.sql', DDL, { defaultSchema: 'ZZITEST' }),
      });
      runIds.push(run2.runId);
      expect(run2.stats.reresolved).toBeGreaterThan(0);

      const unresolvedAfter = await repo.getUnresolved();
      expect(unresolvedAfter.some((u) => u.name === 'ZZITEST_EMPLOYEES')).toBe(false);

      // The rewired edge now points procedure → table
      const edges = await client.run(
        `MATCH (p:OracleObject {id: 'procedure:ZZITEST.ZZITEST_PKG.SYNC_EMP'})-[r:REFERENCES]->(t:OracleObject {id: 'table:ZZITEST.ZZITEST_EMPLOYEES'})
         RETURN r.operation AS operation, r.confidence AS confidence`
      );
      expect(edges).toHaveLength(1);
      expect(edges[0].operation).toBe('UPDATE');

      // Impact analysis: changing the table impacts the procedure and its package
      const impact = new ImpactAnalysisService(client);
      const result = await impact.analyze('table:ZZITEST.ZZITEST_EMPLOYEES');
      expect(result).not.toBeNull();
      const upstreamIds = result!.upstream.map((o) => o.id);
      expect(upstreamIds).toContain('procedure:ZZITEST.ZZITEST_PKG.SYNC_EMP');
      expect(upstreamIds).toContain('package:ZZITEST.ZZITEST_PKG');
      expect(result!.impactScore).toBeGreaterThan(0);
      expect(result!.recommendation.length).toBeGreaterThan(10);

      // Graph window serves the React Flow wire shape
      const graphQuery = new GraphQueryService(client);
      const window = await graphQuery.getGraphWindow({ schema: 'ZZITEST' });
      expect(window.nodes.length).toBeGreaterThanOrEqual(3);
      expect(window.edges.length).toBeGreaterThanOrEqual(2);
      expect(window.nodes[0]).toHaveProperty('label');
      expect(window.nodes[0]).toHaveProperty('group');
    } finally {
      await client.run(`MATCH (o:OracleObject) WHERE o.schema = 'ZZITEST' OR o.id STARTS WITH 'unresolved:?.ZZITEST' DETACH DELETE o`);
      await client.run(`MATCH (r:IngestionRun) WHERE r.id IN $runIds DETACH DELETE r`, { runIds });
      await client.close();
    }
  }, 60000);
});
