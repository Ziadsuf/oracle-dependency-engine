// Dependency resolver: turns extractors' raw references into edges against the
// known-object catalog. Unresolvable references become UnresolvedRef nodes —
// never dropped — and are re-resolved on later ingestion runs.

import { dedupeEdges, type DependencyEdgeRecord, type OracleObjectNode } from '../domain/model';
import { canonicalId } from '../domain/ids';
import type { ExtractionFragment, RawReference } from '../extractors/types';
import type { ObjectCatalog } from './catalog';

export interface ResolutionResult {
  edges: DependencyEdgeRecord[];
  unresolvedNodes: OracleObjectNode[];
  resolvedCount: number;
  unresolvedCount: number;
}

export interface ResolveOptions {
  defaultSchema?: string | null;
  artifact?: string;
}

export function resolveFragment(
  fragment: ExtractionFragment,
  catalog: ObjectCatalog,
  options: ResolveOptions = {}
): ResolutionResult {
  const defaultSchema = options.defaultSchema ?? null;
  const edges: DependencyEdgeRecord[] = [];
  const unresolvedById = new Map<string, OracleObjectNode>();
  let resolvedCount = 0;

  for (const ref of fragment.refs) {
    const target = catalog.resolve(ref.name, ref.kind, defaultSchema);
    if (target) {
      if (target.id !== ref.fromId) {
        edges.push(toEdge(ref, target.id, ref.confidence));
        resolvedCount++;
      }
      continue;
    }

    // CALL fallback: "PKG.PROC" where the member is unknown → link to the package
    if (ref.kind === 'CALL' && ref.name.includes('.')) {
      const packageName = ref.name.split('.').slice(0, -1).join('.');
      const pkg = catalog.resolve(packageName, 'CALL', defaultSchema);
      if (pkg && pkg.id !== ref.fromId) {
        edges.push(toEdge(ref, pkg.id, ref.confidence * 0.9));
        resolvedCount++;
        continue;
      }
    }

    const unresolvedId = canonicalId('unresolved', null, ref.name);
    if (!unresolvedById.has(unresolvedId)) {
      unresolvedById.set(unresolvedId, {
        id: unresolvedId,
        type: 'unresolved',
        schema: null,
        name: ref.name.toUpperCase(),
        group: 'data',
        status: 'UNRESOLVED',
        properties: { kind: ref.kind },
        source: [{ artifact: options.artifact ?? 'unknown', runId: '' }],
      });
    }
    edges.push(toEdge(ref, unresolvedId, ref.confidence));
  }

  return {
    edges: dedupeEdges(edges),
    unresolvedNodes: [...unresolvedById.values()],
    resolvedCount,
    unresolvedCount: unresolvedById.size,
  };
}

function toEdge(ref: RawReference, targetId: string, confidence: number): DependencyEdgeRecord {
  return {
    from: ref.fromId,
    to: targetId,
    relType: ref.relType,
    ...(ref.operation ? { operation: ref.operation } : {}),
    confidence: Math.round(confidence * 100) / 100,
    evidence: ref.evidence,
  };
}
