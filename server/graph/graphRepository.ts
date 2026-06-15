// GraphRepository port (hexagonal boundary). The Neo4j adapter is the only
// implementation today; a Spring Data Neo4j implementation can replace it
// during the Java port without touching the domain or application layers.

import type {
  DependencyEdgeRecord,
  IngestionRunRecord,
  IngestionStats,
  OracleObjectNode,
} from '../domain/model';
import type { CatalogEntry } from '../resolution/catalog';

export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  byType: Record<string, number>;
}

export interface UnresolvedNode {
  id: string;
  name: string;
  kind?: string;
}

export interface ReresolveMapping {
  unresolvedId: string;
  targetId: string;
}

export interface GraphRepository {
  /** Idempotent constraint/index bootstrap. Safe to call on every startup. */
  ensureSchema(): Promise<void>;

  /** Upserts nodes by canonical id, linking provenance to the given run. Returns count upserted. */
  upsertNodes(nodes: OracleObjectNode[], runId: string): Promise<number>;

  /** Upserts edges by (from, to, relType): max confidence wins, evidence unions. Returns count upserted. */
  upsertEdges(edges: DependencyEdgeRecord[]): Promise<number>;

  createIngestionRun(run: IngestionRunRecord): Promise<void>;

  finishIngestionRun(id: string, status: 'COMPLETED' | 'FAILED', stats: IngestionStats): Promise<void>;

  getIngestionRun(id: string): Promise<Record<string, unknown> | null>;

  /** All resolvable objects (id/type/schema/name) for the resolver's catalog. */
  getCatalogEntries(): Promise<CatalogEntry[]>;

  getSynonymTargets(): Promise<{ synonymId: string; targetId: string }[]>;

  getUnresolved(): Promise<UnresolvedNode[]>;

  /** Rewires incoming edges from UnresolvedRef nodes onto resolved targets, then deletes them. */
  reresolveUnresolved(mappings: ReresolveMapping[]): Promise<number>;

  getStats(): Promise<GraphStats>;

  /** Removes all nodes and relationships (keeps constraints/indexes). */
  clearGraph(): Promise<void>;

  close(): Promise<void>;
}
