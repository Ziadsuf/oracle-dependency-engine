// Canonical ID scheme: <type>:<schema>.<name>[#<sub>]
// Deterministic IDs make Neo4j ingestion idempotent (MERGE on id).
// Examples: table:HR.EMPLOYEES · procedure:HR.HR_PKG.VALIDATE_EMP ·
// formtrigger:APP.EMP_MAINT.EMPLOYEES#WHEN-VALIDATE-ITEM · unresolved:?.SOME_NAME

import { NODE_TYPE_META, type NodeType } from './model';

const UNKNOWN_SCHEMA = '?';

// Oracle semantics: unquoted identifiers fold to uppercase, quoted ones keep case.
export function normalizeIdentifier(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed.toUpperCase();
}

export function canonicalId(type: NodeType, schema: string | null, name: string, sub?: string): string {
  if (!(type in NODE_TYPE_META)) {
    throw new Error(`Unknown node type: ${type}`);
  }
  const normalizedName = normalizeIdentifier(name);
  if (!normalizedName) {
    throw new Error(`Canonical ID requires a non-empty name (type=${type})`);
  }
  const schemaPart = schema ? normalizeIdentifier(schema) : UNKNOWN_SCHEMA;
  const subPart = sub ? `#${normalizeIdentifier(sub)}` : '';
  return `${type}:${schemaPart}.${normalizedName}${subPart}`;
}

export interface ParsedCanonicalId {
  type: NodeType;
  schema: string | null;
  name: string;
  sub?: string;
}

export function parseCanonicalId(id: string): ParsedCanonicalId {
  const colon = id.indexOf(':');
  if (colon <= 0) {
    throw new Error(`Malformed canonical ID (missing type): ${id}`);
  }
  const type = id.slice(0, colon) as NodeType;
  if (!(type in NODE_TYPE_META)) {
    throw new Error(`Malformed canonical ID (unknown type "${type}"): ${id}`);
  }
  const rest = id.slice(colon + 1);
  const dot = rest.indexOf('.');
  if (dot <= 0 || dot === rest.length - 1) {
    throw new Error(`Malformed canonical ID (expected <schema>.<name>): ${id}`);
  }
  const schemaPart = rest.slice(0, dot);
  let namePart = rest.slice(dot + 1);
  let sub: string | undefined;
  const hash = namePart.indexOf('#');
  if (hash >= 0) {
    sub = namePart.slice(hash + 1) || undefined;
    namePart = namePart.slice(0, hash);
  }
  if (!namePart) {
    throw new Error(`Malformed canonical ID (empty name): ${id}`);
  }
  return {
    type,
    schema: schemaPart === UNKNOWN_SCHEMA ? null : schemaPart,
    name: namePart,
    ...(sub ? { sub } : {}),
  };
}
