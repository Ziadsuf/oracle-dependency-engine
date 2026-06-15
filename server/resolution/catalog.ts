// Known-object catalog: resolves raw reference names against everything the
// graph (and the current ingestion) knows about, in priority order:
// schema-qualified exact match → default-schema match → unique any-schema
// match → synonym expansion (chased recursively, depth-capped).

import type { NodeType } from '../domain/model';
import type { ReferenceKind } from '../extractors/types';

export interface CatalogEntry {
  id: string;
  type: NodeType;
  schema: string | null;
  name: string;
}

const KIND_TYPES: Record<ReferenceKind, NodeType[]> = {
  TABLE_OR_VIEW: ['table', 'view', 'materializedview', 'synonym'],
  CALL: ['procedure', 'function', 'package', 'packagebody', 'programunit', 'synonym'],
  SEQUENCE: ['sequence', 'synonym'],
  ANY: [
    'table', 'view', 'materializedview', 'sequence', 'synonym',
    'package', 'packagebody', 'procedure', 'function', 'programunit',
    'form', 'report', 'dbtrigger', 'index', 'constraint',
  ],
};

const MAX_SYNONYM_DEPTH = 5;

export class ObjectCatalog {
  private readonly byId = new Map<string, CatalogEntry>();
  private readonly bySchemaName = new Map<string, CatalogEntry>(); // type|schema|name
  private readonly byName = new Map<string, CatalogEntry[]>(); // type|name → entries (any schema)
  private readonly synonymTargets = new Map<string, string>(); // synonym id → target id

  constructor(entries: CatalogEntry[], synonymTargets: { synonymId: string; targetId: string }[] = []) {
    for (const entry of entries) this.add(entry);
    for (const { synonymId, targetId } of synonymTargets) {
      this.synonymTargets.set(synonymId, targetId);
    }
  }

  add(entry: CatalogEntry): void {
    this.byId.set(entry.id, entry);
    this.bySchemaName.set(`${entry.type}|${entry.schema ?? '?'}|${entry.name}`, entry);
    const nameKey = `${entry.type}|${entry.name}`;
    const list = this.byName.get(nameKey);
    if (list) {
      if (!list.some((e) => e.id === entry.id)) list.push(entry);
    } else {
      this.byName.set(nameKey, [entry]);
    }
  }

  addSynonymTarget(synonymId: string, targetId: string): void {
    this.synonymTargets.set(synonymId, targetId);
  }

  get(id: string): CatalogEntry | undefined {
    return this.byId.get(id);
  }

  /**
   * Resolves a (possibly qualified) reference name to a catalog entry.
   * Returns the entry after synonym expansion, or null when unresolvable.
   */
  resolve(name: string, kind: ReferenceKind, defaultSchema: string | null = null): CatalogEntry | null {
    const types = KIND_TYPES[kind];
    const upper = name.toUpperCase();
    const parts = upper.split('.');

    const candidates: { schema: string | null; objectName: string }[] = [];
    if (parts.length >= 2) {
      // "A.B" → schema A, object B (or A.B.C → schema A, member B.C)
      candidates.push({ schema: parts[0], objectName: parts.slice(1).join('.') });
      // "PKG.PROC" → member name in the default schema / any schema
      candidates.push({ schema: defaultSchema, objectName: upper });
    } else {
      candidates.push({ schema: defaultSchema, objectName: upper });
    }

    for (const { schema, objectName } of candidates) {
      for (const type of types) {
        // exact schema match (including '?' for schemaless ingests)
        if (schema !== undefined) {
          const exact =
            this.bySchemaName.get(`${type}|${schema ?? '?'}|${objectName}`) ??
            (schema === null ? undefined : this.bySchemaName.get(`${type}|?|${objectName}`));
          if (exact) return this.chaseSynonym(exact);
        }
      }
      // unique match across schemas
      for (const type of types) {
        const matches = this.byName.get(`${type}|${objectName}`);
        if (matches && matches.length === 1) return this.chaseSynonym(matches[0]);
      }
    }
    return null;
  }

  private chaseSynonym(entry: CatalogEntry, depth = 0): CatalogEntry {
    if (entry.type !== 'synonym' || depth >= MAX_SYNONYM_DEPTH) return entry;
    const targetId = this.synonymTargets.get(entry.id);
    if (!targetId) return entry; // synonym with unknown target: keep the synonym
    const target = this.byId.get(targetId);
    if (!target) return entry;
    return this.chaseSynonym(target, depth + 1);
  }
}
