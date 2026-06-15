// Neo4j adapter for the GraphRepository port. Executes the .cypher templates
// in ./cypher (kept as plain files so the future Spring Boot port reuses them).

import fs from 'fs';
import path from 'path';
import {
  NODE_LABELS,
  NODE_TYPE_META,
  REL_TYPES,
  labelFor,
  type DependencyEdgeRecord,
  type IngestionRunRecord,
  type IngestionStats,
  type OracleObjectNode,
  type RelType,
} from '../domain/model';
import type { GraphRepository, GraphStats, ReresolveMapping, UnresolvedNode } from './graphRepository';
import type { CatalogEntry } from '../resolution/catalog';
import type { CypherRunner } from './neo4jClient';

const BATCH_SIZE = 1000;

const NODE_LABEL_SET = new Set<string>(NODE_LABELS);
const REL_TYPE_SET = new Set<string>(REL_TYPES);

function cypherDir(): string {
  return process.env.CYPHER_DIR ?? path.resolve(process.cwd(), 'server', 'graph', 'cypher');
}

const templateCache = new Map<string, string>();

export function loadCypher(name: string): string {
  const cached = templateCache.get(name);
  if (cached) return cached;
  const template = fs.readFileSync(path.join(cypherDir(), `${name}.cypher`), 'utf-8');
  templateCache.set(name, template);
  return template;
}

// Labels/relationship types cannot be Cypher parameters; tokens are substituted
// only after validation against the closed taxonomy — never from user input.
function bindLabel(template: string, label: string): string {
  if (!NODE_LABEL_SET.has(label)) {
    throw new Error(`Refusing to bind unknown node label: ${label}`);
  }
  return template.replaceAll('__LABEL__', label);
}

function bindRelType(template: string, relType: string): string {
  if (!REL_TYPE_SET.has(relType)) {
    throw new Error(`Refusing to bind unknown relationship type: ${relType}`);
  }
  return template.replaceAll('__REL_TYPE__', relType);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export class Neo4jGraphRepository implements GraphRepository {
  constructor(private readonly runner: CypherRunner) {}

  async ensureSchema(): Promise<void> {
    // Strip comment lines first — a ';' inside a comment must not split statements
    const statements = loadCypher('schema-bootstrap')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await this.runner.run(statement);
    }
  }

  async upsertNodes(nodes: OracleObjectNode[], runId: string): Promise<number> {
    if (nodes.length === 0) return 0;
    const template = loadCypher('upsert-nodes');
    const byLabel = new Map<string, OracleObjectNode[]>();
    for (const node of nodes) {
      if (!(node.type in NODE_TYPE_META)) {
        throw new Error(`Unknown node type "${node.type}" (id=${node.id})`);
      }
      const label = labelFor(node.type);
      (byLabel.get(label) ?? byLabel.set(label, []).get(label)!).push(node);
    }
    let total = 0;
    for (const [label, group] of byLabel) {
      const query = bindLabel(template, label);
      for (const batch of chunk(group, BATCH_SIZE)) {
        const rows = batch.map((node) => ({
          id: node.id,
          name: node.name,
          schema: node.schema,
          type: node.type,
          group: node.group,
          status: node.status ?? null,
          props: node.properties,
        }));
        const records = await this.runner.run(query, { batch: rows, runId });
        total += Number(records[0]?.upserted ?? rows.length);
      }
    }
    return total;
  }

  async upsertEdges(edges: DependencyEdgeRecord[]): Promise<number> {
    if (edges.length === 0) return 0;
    const template = loadCypher('upsert-edges');
    const byRelType = new Map<RelType, DependencyEdgeRecord[]>();
    for (const edge of edges) {
      (byRelType.get(edge.relType) ?? byRelType.set(edge.relType, []).get(edge.relType)!).push(edge);
    }
    let total = 0;
    for (const [relType, group] of byRelType) {
      const query = bindRelType(template, relType);
      for (const batch of chunk(group, BATCH_SIZE)) {
        const rows = batch.map((edge) => ({
          from: edge.from,
          to: edge.to,
          operation: edge.operation ?? null,
          confidence: edge.confidence,
          // Neo4j properties cannot hold arrays of maps — serialize evidence entries
          evidence: edge.evidence.map((e) => JSON.stringify(e)),
        }));
        const records = await this.runner.run(query, { batch: rows });
        total += Number(records[0]?.upserted ?? 0);
      }
    }
    return total;
  }

  async createIngestionRun(run: IngestionRunRecord): Promise<void> {
    await this.runner.run(loadCypher('create-ingestion-run'), {
      id: run.id,
      startedAt: run.startedAt,
      source: run.source,
      fileName: run.fileName ?? null,
    });
  }

  async finishIngestionRun(id: string, status: 'COMPLETED' | 'FAILED', stats: IngestionStats): Promise<void> {
    await this.runner.run(loadCypher('finish-ingestion-run'), {
      id,
      status,
      finishedAt: new Date().toISOString(),
      nodesUpserted: stats.nodesUpserted,
      edgesUpserted: stats.edgesUpserted,
      unresolvedRefs: stats.unresolvedRefs,
    });
  }

  async getIngestionRun(id: string): Promise<Record<string, unknown> | null> {
    const records = await this.runner.run(loadCypher('get-ingestion-run'), { id });
    return records[0] ?? null;
  }

  async getCatalogEntries(): Promise<CatalogEntry[]> {
    const records = await this.runner.run(loadCypher('catalog-entries'));
    return records.map((r) => ({
      id: String(r.id),
      type: r.type as CatalogEntry['type'],
      schema: r.schema === null || r.schema === undefined ? null : String(r.schema),
      name: String(r.name),
    }));
  }

  async getSynonymTargets(): Promise<{ synonymId: string; targetId: string }[]> {
    const records = await this.runner.run(loadCypher('synonym-targets'));
    return records.map((r) => ({ synonymId: String(r.synonymId), targetId: String(r.targetId) }));
  }

  async getUnresolved(): Promise<UnresolvedNode[]> {
    const records = await this.runner.run(loadCypher('unresolved-nodes'));
    return records.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      ...(r.kind ? { kind: String(r.kind) } : {}),
    }));
  }

  async reresolveUnresolved(mappings: ReresolveMapping[]): Promise<number> {
    if (mappings.length === 0) return 0;
    const moveTemplate = loadCypher('reresolve-unresolved');
    for (const relType of REL_TYPES) {
      await this.runner.run(bindRelType(moveTemplate, relType), { batch: mappings });
    }
    const records = await this.runner.run(loadCypher('delete-unresolved'), { batch: mappings });
    return Number(records[0]?.deleted ?? 0);
  }

  async clearGraph(): Promise<void> {
    await this.runner.run('MATCH (n) DETACH DELETE n');
  }

  async getStats(): Promise<GraphStats> {
    const nodeRecords = await this.runner.run(loadCypher('stats-nodes'));
    const edgeRecords = await this.runner.run(loadCypher('stats-edges'));
    const byType: Record<string, number> = {};
    let totalNodes = 0;
    for (const record of nodeRecords) {
      const type = String(record.type);
      const count = Number(record.count);
      byType[type] = count;
      totalNodes += count;
    }
    return {
      totalNodes,
      totalEdges: Number(edgeRecords[0]?.count ?? 0),
      byType,
    };
  }

  async close(): Promise<void> {
    await this.runner.close();
  }
}
