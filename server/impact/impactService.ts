// Impact analysis over the persisted graph: blast-radius traversals (Cypher
// variable-length, depth interpolated from a clamped integer) + computed risk
// scoring. Replaces the prototype's hardcoded impact responses.

import { loadCypher } from '../graph/neo4jGraphRepository';
import type { CypherRunner } from '../graph/neo4jClient';
import { buildRecommendation, scoreImpact, type RiskLevel } from './riskScoring';

export interface ImpactedObject {
  id: string;
  label: string;
  type: string;
  depth: number;
  confidence: number;
  viaPath: string[];
}

export interface ImpactResultV2 {
  target: { id: string; label: string; type: string };
  upstream: ImpactedObject[]; // who breaks if the target changes
  downstream: ImpactedObject[]; // what the target depends on
  riskLevel: RiskLevel;
  impactScore: number;
  recommendation: string;
  byType: Record<string, number>;
  depthMap: Record<number, number>;
}

const DEFAULT_DEPTH = 5;

function maxDepth(): number {
  const fromEnv = Number(process.env.IMPACT_MAX_DEPTH);
  return Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : 8;
}

const ARROWS = {
  upstream: { left: '-', right: '->' }, // (d)-[…]->(target)
  downstream: { left: '<-', right: '-' }, // (d)<-[…]-(target)
} as const;

export class ImpactAnalysisService {
  constructor(private readonly runner: CypherRunner) {}

  async analyze(
    id: string,
    options: { depth?: number; direction?: 'upstream' | 'downstream' | 'both' } = {}
  ): Promise<ImpactResultV2 | null> {
    const detailRows = await this.runner.run(loadCypher('node-detail'), { id });
    if (detailRows.length === 0) return null;
    const node = detailRows[0].node as Record<string, unknown>;
    const target = { id: String(node.id), label: String(node.name), type: String(node.type) };

    const depth = Math.min(maxDepth(), Math.max(1, Math.floor(options.depth ?? DEFAULT_DEPTH)));
    const direction = options.direction ?? 'both';

    const upstream = direction !== 'downstream' ? await this.traverse(id, depth, 'upstream') : [];
    const downstream = direction !== 'upstream' ? await this.traverse(id, depth, 'downstream') : [];

    const byType: Record<string, number> = {};
    const depthMap: Record<number, number> = {};
    let unresolvedCount = 0;
    for (const obj of upstream) {
      byType[obj.type] = (byType[obj.type] ?? 0) + 1;
      depthMap[obj.depth] = (depthMap[obj.depth] ?? 0) + 1;
      if (obj.type === 'unresolved') unresolvedCount++;
    }
    for (const obj of downstream) {
      if (obj.type === 'unresolved') unresolvedCount++;
    }

    const complexity = Number(node.complexity ?? 0) || 0;
    const { impactScore, riskLevel } = scoreImpact(upstream, complexity);

    return {
      target,
      upstream,
      downstream,
      riskLevel,
      impactScore,
      recommendation: buildRecommendation(`${target.label} (${target.type})`, riskLevel, byType, unresolvedCount),
      byType,
      depthMap,
    };
  }

  async findPaths(fromId: string, toId: string): Promise<{ path: unknown[]; relTypes: string[] }[]> {
    const query = loadCypher('impact-paths').replaceAll('__DEPTH__', String(maxDepth() * 2));
    const rows = await this.runner.run(query, { from: fromId, to: toId });
    return rows.map((r) => ({
      path: r.path as unknown[],
      relTypes: (r.relTypes as unknown[]).map(String),
    }));
  }

  private async traverse(id: string, depth: number, direction: keyof typeof ARROWS): Promise<ImpactedObject[]> {
    const arrows = ARROWS[direction];
    const query = loadCypher('impact')
      .replaceAll('__DEPTH__', String(depth))
      .replaceAll('__ARROW_LEFT__', arrows.left)
      .replaceAll('__ARROW_RIGHT__', arrows.right);
    const rows = await this.runner.run(query, { id });
    return rows.map((r) => ({
      id: String(r.id),
      label: String(r.label),
      type: String(r.type),
      depth: Number(r.depth),
      confidence: Math.round(Number(r.confidence) * 100) / 100,
      viaPath: (r.viaPath as unknown[]).map(String),
    }));
  }
}
