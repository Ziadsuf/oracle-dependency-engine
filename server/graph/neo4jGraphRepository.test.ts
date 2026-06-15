import { describe, it, expect } from 'vitest';
import { CONFIDENCE, type OracleObjectNode, type DependencyEdgeRecord } from '../domain/model';
import { Neo4jGraphRepository } from './neo4jGraphRepository';
import { Neo4jClient, neo4jConfigFromEnv, type CypherRunner } from './neo4jClient';

function makeNode(overrides: Partial<OracleObjectNode> = {}): OracleObjectNode {
  return {
    id: 'table:HR.EMPLOYEES',
    type: 'table',
    schema: 'HR',
    name: 'EMPLOYEES',
    group: 'data',
    properties: {},
    source: [{ artifact: 'hr_schema.sql', runId: 'run-1' }],
    ...overrides,
  };
}

class RecordingRunner implements CypherRunner {
  calls: { query: string; params?: Record<string, unknown> }[] = [];
  async run(query: string, params?: Record<string, unknown>) {
    this.calls.push({ query, params });
    const batch = params?.batch as unknown[] | undefined;
    return [{ upserted: batch?.length ?? 0, count: 0 }];
  }
  async close() {}
}

describe('Neo4jGraphRepository (mocked runner)', () => {
  it('binds node labels from the closed taxonomy into the template', async () => {
    const runner = new RecordingRunner();
    const repo = new Neo4jGraphRepository(runner);
    await repo.upsertNodes([makeNode(), makeNode({ id: 'package:HR.HR_PKG', type: 'package', name: 'HR_PKG', group: 'logic' })], 'run-1');

    expect(runner.calls).toHaveLength(2);
    const queries = runner.calls.map((c) => c.query).join('\n');
    expect(queries).toContain(':OracleObject:Table');
    expect(queries).toContain(':OracleObject:Package');
    expect(queries).not.toContain('__LABEL__');
    expect(runner.calls[0].params?.runId).toBe('run-1');
  });

  it('splits large node sets into batches of 1000', async () => {
    const runner = new RecordingRunner();
    const repo = new Neo4jGraphRepository(runner);
    const nodes = Array.from({ length: 2500 }, (_, i) =>
      makeNode({ id: `table:HR.T_${i}`, name: `T_${i}` })
    );
    const upserted = await repo.upsertNodes(nodes, 'run-1');
    expect(runner.calls).toHaveLength(3);
    expect((runner.calls[0].params?.batch as unknown[]).length).toBe(1000);
    expect((runner.calls[2].params?.batch as unknown[]).length).toBe(500);
    expect(upserted).toBe(2500);
  });

  it('rejects node types outside the taxonomy', async () => {
    const repo = new Neo4jGraphRepository(new RecordingRunner());
    await expect(
      repo.upsertNodes([makeNode({ type: 'widget' as never })], 'run-1')
    ).rejects.toThrow(/Unknown node type/);
  });

  it('binds relationship types and serializes evidence to JSON strings', async () => {
    const runner = new RecordingRunner();
    const repo = new Neo4jGraphRepository(runner);
    const edge: DependencyEdgeRecord = {
      from: 'package:HR.HR_PKG',
      to: 'table:HR.EMPLOYEES',
      relType: 'REFERENCES',
      operation: 'SELECT',
      confidence: CONFIDENCE.PARSED_STATIC,
      evidence: [{ sourceType: 'PLSQL_SOURCE', file: 'hr_pkg.pkb', line: 12 }],
    };
    await repo.upsertEdges([edge]);

    expect(runner.calls[0].query).toContain('[rel:REFERENCES]');
    expect(runner.calls[0].query).not.toContain('__REL_TYPE__');
    const row = (runner.calls[0].params?.batch as Record<string, unknown>[])[0];
    expect(row.evidence).toEqual(['{"sourceType":"PLSQL_SOURCE","file":"hr_pkg.pkb","line":12}']);
  });

  it('runs every schema bootstrap statement', async () => {
    const runner = new RecordingRunner();
    const repo = new Neo4jGraphRepository(runner);
    await repo.ensureSchema();
    expect(runner.calls.length).toBeGreaterThanOrEqual(5);
    expect(runner.calls.map((c) => c.query).join('\n')).toContain('CREATE CONSTRAINT oracle_object_id');
  });

  it('clearGraph detaches and deletes every node', async () => {
    const runner = new RecordingRunner();
    const repo = new Neo4jGraphRepository(runner);
    await repo.clearGraph();
    expect(runner.calls[0].query).toBe('MATCH (n) DETACH DELETE n');
  });
});

// Integration suite: runs only when NEO4J_URI is configured (e.g. docker compose up -d).
describe.runIf(!!process.env.NEO4J_URI)('Neo4jGraphRepository (live Neo4j)', () => {
  it('bootstraps schema, ingests a sample, and reports stats', async () => {
    const client = new Neo4jClient(neo4jConfigFromEnv()!);
    const repo = new Neo4jGraphRepository(client);
    const runId = `test-run-${Date.now()}`;
    try {
      await client.verifyConnectivity();
      await repo.ensureSchema();
      await repo.createIngestionRun({
        id: runId,
        startedAt: new Date().toISOString(),
        source: 'DDL_FILE',
        fileName: 'integration-test.sql',
        status: 'RUNNING',
      });

      const nodes: OracleObjectNode[] = [
        makeNode({ id: `table:ITEST.EMPLOYEES`, schema: 'ITEST' }),
        makeNode({ id: `package:ITEST.HR_PKG`, type: 'package', name: 'HR_PKG', group: 'logic', schema: 'ITEST' }),
      ];
      const nodesUpserted = await repo.upsertNodes(nodes, runId);
      expect(nodesUpserted).toBe(2);

      const edgesUpserted = await repo.upsertEdges([
        {
          from: 'package:ITEST.HR_PKG',
          to: 'table:ITEST.EMPLOYEES',
          relType: 'REFERENCES',
          operation: 'SELECT',
          confidence: CONFIDENCE.PARSED_STATIC,
          evidence: [{ sourceType: 'PLSQL_SOURCE', file: 'integration-test.sql' }],
        },
      ]);
      expect(edgesUpserted).toBe(1);

      // Idempotency: re-ingesting must not duplicate
      await repo.upsertNodes(nodes, runId);
      const stats = await repo.getStats();
      expect(stats.byType.table).toBeGreaterThanOrEqual(1);
      expect(stats.totalEdges).toBeGreaterThanOrEqual(1);

      await repo.finishIngestionRun(runId, 'COMPLETED', {
        nodesUpserted,
        edgesUpserted,
        unresolvedRefs: 0,
      });
    } finally {
      // Clean up test data so repeated runs stay deterministic
      await client.run('MATCH (o:OracleObject) WHERE o.schema = "ITEST" DETACH DELETE o');
      await client.run('MATCH (r:IngestionRun {id: $runId}) DETACH DELETE r', { runId });
      await client.close();
    }
  }, 30000);
});
