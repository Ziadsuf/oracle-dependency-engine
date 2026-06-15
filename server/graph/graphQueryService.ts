// Read-side queries for the /api/v2 graph endpoints. Returns payloads in the
// proven GraphData wire shape the React Flow UI already consumes.

import { loadCypher } from './neo4jGraphRepository';
import type { CypherRunner } from './neo4jClient';

export interface GraphNodeDto {
  id: string;
  label: string;
  type: string;
  group: string;
}

export interface GraphEdgeDto {
  source: string;
  target: string;
  label: string;
}

export interface GraphDataDto {
  nodes: GraphNodeDto[];
  edges: GraphEdgeDto[];
}

export interface GraphWindowOptions {
  types?: string[];
  schema?: string;
  search?: string;
  limit?: number;
}

export interface ObjectSearchOptions {
  search?: string;
  type?: string;
  schema?: string;
  page?: number;
  pageSize?: number;
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// LIMIT/SKIP/depth cannot be query parameters in all positions and the driver
// would send JS numbers as floats — interpolate validated integers instead.
function bindInt(template: string, token: string, value: number): string {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Refusing to bind non-integer ${token}: ${value}`);
  }
  return template.replaceAll(token, String(value));
}

export type Direction = 'in' | 'out' | 'both';

const ARROWS: Record<Direction, { left: string; right: string }> = {
  out: { left: '-', right: '->' },
  in: { left: '<-', right: '-' },
  both: { left: '-', right: '-' },
};

function bindArrows(template: string, direction: Direction): string {
  const arrows = ARROWS[direction];
  if (!arrows) throw new Error(`Unknown direction: ${direction}`);
  return template.replaceAll('__ARROW_LEFT__', arrows.left).replaceAll('__ARROW_RIGHT__', arrows.right);
}

function edgeLabel(relType: unknown, operation: unknown): string {
  return operation ? String(operation) : String(relType ?? '');
}

export class GraphQueryService {
  constructor(private readonly runner: CypherRunner) {}

  async getGraphWindow(options: GraphWindowOptions = {}): Promise<GraphDataDto> {
    const limit = clampInt(options.limit, 300, 1, 2000);
    const nodeRows = await this.runner.run(bindInt(loadCypher('graph-window'), '__LIMIT__', limit), {
      types: options.types?.length ? options.types : null,
      schema: options.schema ?? null,
      search: options.search ?? null,
    });
    const nodes: GraphNodeDto[] = nodeRows.map((r) => ({
      id: String(r.id),
      label: String(r.label),
      type: String(r.type),
      group: String(r.group ?? 'data'),
    }));
    if (nodes.length === 0) return { nodes: [], edges: [] };

    const edgeRows = await this.runner.run(loadCypher('edges-among'), { ids: nodes.map((n) => n.id) });
    const edges: GraphEdgeDto[] = edgeRows.map((r) => ({
      source: String(r.source),
      target: String(r.target),
      label: edgeLabel(r.relType, r.operation),
    }));
    return { nodes, edges };
  }

  async getNodeDetail(id: string): Promise<Record<string, unknown> | null> {
    const rows = await this.runner.run(loadCypher('node-detail'), { id });
    if (rows.length === 0) return null;
    return {
      node: rows[0].node,
      inDegree: Number(rows[0].inDegree ?? 0),
      outDegree: Number(rows[0].outDegree ?? 0),
    };
  }

  async getNeighbors(id: string, direction: Direction = 'both', depth = 1): Promise<GraphDataDto> {
    const boundDepth = clampInt(depth, 1, 1, 3);
    const query = bindArrows(bindInt(loadCypher('neighbors'), '__DEPTH__', boundDepth), direction);
    const rows = await this.runner.run(query, { id });
    if (rows.length === 0) {
      // No neighbors — return just the origin node so the UI can still render it
      const detail = await this.getNodeDetail(id);
      if (!detail) return { nodes: [], edges: [] };
      const node = detail.node as Record<string, unknown>;
      return {
        nodes: [{ id: String(node.id), label: String(node.name), type: String(node.type), group: String(node.group ?? 'data') }],
        edges: [],
      };
    }
    const nodes = (rows[0].nodes as Record<string, unknown>[]).map((n) => ({
      id: String(n.id),
      label: String(n.label),
      type: String(n.type),
      group: String(n.group ?? 'data'),
    }));
    const edges = (rows[0].edges as Record<string, unknown>[]).map((e) => ({
      source: String(e.source),
      target: String(e.target),
      label: edgeLabel(e.relType, e.operation),
    }));
    return { nodes, edges };
  }

  async searchObjects(options: ObjectSearchOptions = {}) {
    const page = clampInt(options.page, 1, 1, 100000);
    const pageSize = clampInt(options.pageSize, 25, 1, 200);
    const params = {
      search: options.search ?? null,
      type: options.type ?? null,
      schema: options.schema ?? null,
    };
    const query = bindInt(
      bindInt(loadCypher('objects-search'), '__SKIP__', (page - 1) * pageSize),
      '__LIMIT__',
      pageSize
    );
    const [items, countRows] = await Promise.all([
      this.runner.run(query, params),
      this.runner.run(loadCypher('objects-count'), params),
    ]);
    return {
      items,
      total: Number(countRows[0]?.total ?? 0),
      page,
      pageSize,
    };
  }

  // Builds a MetadataDiscoveryResult-shaped summary straight from the graph,
  // so the Metadata Discovery screen shows real objects/dependencies/effort.
  async getDiscoverySummary(schema?: string, limit = 1000) {
    const boundLimit = clampInt(limit, 1000, 1, 5000);
    const params = { schema: schema ?? null };
    const [byTypeRows, schemaRows, objectRows] = await Promise.all([
      this.runner.run(loadCypher('discovery-bytype'), params),
      this.runner.run(loadCypher('discovery-schemas'), params),
      this.runner.run(bindInt(loadCypher('discovery-objects'), '__LIMIT__', boundLimit), params),
    ]);

    const objectsByType: Record<string, number> = {};
    let totalObjects = 0;
    let invalidObjects = 0;
    for (const row of byTypeRows) {
      const type = String(row.type);
      const count = Number(row.count);
      objectsByType[type] = count;
      totalObjects += count;
      invalidObjects += Number(row.invalid ?? 0);
    }

    const objects = objectRows.map((r) => ({
      name: r.schema ? `${r.schema}.${r.name}` : String(r.name),
      type: String(r.type),
      status: r.status === 'INVALID' ? 'INVALID' : 'VALID',
      dependencies: Number(r.deps ?? 0),
      linesOfCode: r.loc === null || r.loc === undefined ? undefined : Number(r.loc),
      lastDdlTime: r.lastDdlTime ? String(r.lastDdlTime) : undefined,
    }));

    const EFFORT: Record<string, number> = {
      package: 24, packagebody: 24, procedure: 8, function: 8,
      dbtrigger: 4, table: 2, view: 3, materializedview: 3,
    };
    let hours = 0;
    for (const [type, count] of Object.entries(objectsByType)) {
      hours += (EFFORT[type] ?? 1) * count;
    }
    let complexity: 'Low' | 'Medium' | 'High' | 'Critical' = 'Low';
    if (hours > 1000 || invalidObjects > 50) complexity = 'Critical';
    else if (hours > 500) complexity = 'High';
    else if (hours > 100) complexity = 'Medium';

    return {
      totalObjects,
      invalidObjects,
      schemas: ((schemaRows[0]?.schemas as unknown[]) ?? []).filter(Boolean).map(String),
      objectsByType,
      objects,
      effortEstimation: { hours, complexity },
    };
  }

  async getEngineStats() {
    const [nodeRows, edgeRows, statusRows, runRows] = await Promise.all([
      this.runner.run(loadCypher('stats-nodes')),
      this.runner.run(loadCypher('stats-edges')),
      this.runner.run(loadCypher('stats-status')),
      this.runner.run(loadCypher('recent-runs')),
    ]);
    const byType: Record<string, number> = {};
    let totalNodes = 0;
    for (const row of nodeRows) {
      byType[String(row.type)] = Number(row.count);
      totalNodes += Number(row.count);
    }
    return {
      totalNodes,
      totalEdges: Number(edgeRows[0]?.count ?? 0),
      byType,
      invalidObjects: Number(statusRows[0]?.invalid ?? 0),
      unresolvedRefs: Number(statusRows[0]?.unresolved ?? 0),
      schemas: Number(statusRows[0]?.schemas ?? 0),
      recentRuns: runRows,
    };
  }
}
