// Extraction layer contracts. Extractors consume raw artifacts and emit
// canonical-model fragments: fully-formed nodes for objects the artifact owns,
// structural edges between them, and *raw references* that the resolver
// (server/resolution) turns into edges against the known-object catalog.
// Extractors never write to Neo4j.

import type {
  DependencyEdgeRecord,
  EvidenceRef,
  Operation,
  OracleObjectNode,
  RelType,
} from '../domain/model';

export type ReferenceKind = 'TABLE_OR_VIEW' | 'CALL' | 'SEQUENCE' | 'ANY';

export interface RawReference {
  fromId: string; // canonical ID of the dependent node (already in this fragment or the graph)
  name: string; // possibly qualified: "EMPLOYEES", "HR.EMPLOYEES", "HR_PKG.VALIDATE_EMP"
  kind: ReferenceKind;
  relType: RelType;
  operation?: Operation;
  confidence: number;
  evidence: EvidenceRef[];
}

export interface ExtractionFragment {
  nodes: OracleObjectNode[];
  edges: DependencyEdgeRecord[]; // structural edges between owned nodes (CONTAINS, …)
  refs: RawReference[]; // unresolved references, resolved in Phase C
}

export function emptyFragment(): ExtractionFragment {
  return { nodes: [], edges: [], refs: [] };
}

export function mergeFragments(...fragments: ExtractionFragment[]): ExtractionFragment {
  return {
    nodes: fragments.flatMap((f) => f.nodes),
    edges: fragments.flatMap((f) => f.edges),
    refs: fragments.flatMap((f) => f.refs),
  };
}
