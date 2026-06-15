// Canonical domain model (IR) for the Oracle Dependency Engine.
// Stack-agnostic by design: plain types and pure functions only — no Node.js,
// Express, or driver imports. Mirrored by JSON Schema in ./schema so the
// contract can be ported to Java records (see docs/dependency-engine-architecture.md §3, §5).

export const NODE_TYPE_META = {
  form: { label: 'Form', group: 'presentation' },
  block: { label: 'Block', group: 'presentation' },
  item: { label: 'Item', group: 'presentation' },
  formtrigger: { label: 'FormTrigger', group: 'presentation' },
  programunit: { label: 'ProgramUnit', group: 'logic' },
  report: { label: 'Report', group: 'presentation' },
  reportquery: { label: 'ReportQuery', group: 'presentation' },
  parameter: { label: 'Parameter', group: 'presentation' },
  package: { label: 'Package', group: 'logic' },
  packagebody: { label: 'PackageBody', group: 'logic' },
  procedure: { label: 'Procedure', group: 'logic' },
  function: { label: 'Function', group: 'logic' },
  table: { label: 'Table', group: 'data' },
  column: { label: 'Column', group: 'data' },
  view: { label: 'View', group: 'data' },
  materializedview: { label: 'MaterializedView', group: 'data' },
  dbtrigger: { label: 'DbTrigger', group: 'data' },
  sequence: { label: 'Sequence', group: 'data' },
  synonym: { label: 'Synonym', group: 'data' },
  index: { label: 'Index', group: 'data' },
  constraint: { label: 'Constraint', group: 'data' },
  unresolved: { label: 'UnresolvedRef', group: 'data' },
} as const;

export type NodeType = keyof typeof NODE_TYPE_META;
export type NodeGroup = (typeof NODE_TYPE_META)[NodeType]['group'];
export type NodeLabel = (typeof NODE_TYPE_META)[NodeType]['label'];

export const NODE_TYPES = Object.keys(NODE_TYPE_META) as NodeType[];
export const NODE_LABELS = Object.values(NODE_TYPE_META).map((m) => m.label);

export function labelFor(type: NodeType): NodeLabel {
  return NODE_TYPE_META[type].label;
}

export function groupFor(type: NodeType): NodeGroup {
  return NODE_TYPE_META[type].group;
}

export const REL_TYPES = [
  'CONTAINS',
  'CALLS',
  'REFERENCES',
  'USES_SEQUENCE',
  'QUERIES',
  'DEPENDS_ON',
  'FK_TO',
  'BASED_ON',
  'ATTACHED_TO',
  'SYNONYM_FOR',
] as const;
export type RelType = (typeof REL_TYPES)[number];

export const OPERATIONS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'EXECUTE', 'REFERENCE'] as const;
export type Operation = (typeof OPERATIONS)[number];

export const SOURCE_TYPES = ['DICTIONARY', 'PLSQL_SOURCE', 'FORMS_XML', 'REPORTS_XML', 'DDL_FILE'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

// Edge confidence by evidence quality (architecture §5).
export const CONFIDENCE = {
  DICTIONARY: 1.0,
  PARSED_STATIC: 0.8,
  DYNAMIC_HEURISTIC: 0.4,
} as const;

export interface EvidenceRef {
  sourceType: SourceType;
  file?: string;
  line?: number;
}

export interface SourceRef {
  artifact: string; // file name or 'LIVE_CONNECTION'
  runId: string;
}

export type ObjectStatus = 'VALID' | 'INVALID' | 'UNRESOLVED';

export interface OracleObjectNode {
  id: string; // canonical ID, see ids.ts
  type: NodeType;
  schema: string | null; // null until resolved
  name: string;
  group: NodeGroup;
  status?: ObjectStatus;
  properties: Record<string, string | number | boolean>;
  source: SourceRef[];
}

export interface DependencyEdgeRecord {
  from: string; // canonical ID of the dependent
  to: string; // canonical ID of the dependency
  relType: RelType;
  operation?: Operation;
  confidence: number;
  evidence: EvidenceRef[];
}

export interface IngestionStats {
  nodesUpserted: number;
  edgesUpserted: number;
  unresolvedRefs: number;
}

export interface IngestionRunRecord {
  id: string;
  startedAt: string; // ISO 8601
  finishedAt?: string;
  source: SourceType;
  fileName?: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  stats?: IngestionStats;
}

// Merges duplicate edges (same from/to/relType): max confidence wins, evidence
// is unioned, operation comes from the highest-confidence record that has one.
export function dedupeEdges(edges: DependencyEdgeRecord[]): DependencyEdgeRecord[] {
  const byKey = new Map<string, DependencyEdgeRecord>();
  for (const edge of edges) {
    const key = `${edge.from}|${edge.to}|${edge.relType}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...edge, evidence: [...edge.evidence] });
      continue;
    }
    const strongest = edge.confidence > existing.confidence ? edge : existing;
    existing.operation = strongest.operation ?? existing.operation ?? edge.operation;
    existing.confidence = Math.max(existing.confidence, edge.confidence);
    const seen = new Set(existing.evidence.map((e) => JSON.stringify(e)));
    for (const ev of edge.evidence) {
      const fingerprint = JSON.stringify(ev);
      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        existing.evidence.push(ev);
      }
    }
  }
  return [...byKey.values()];
}
