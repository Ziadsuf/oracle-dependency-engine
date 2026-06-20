// Live schema source: queries the Oracle data dictionary (read-only) via the
// oracledb thin driver (pure JS, no Instant Client; Oracle 12.1+).
// ALL_DEPENDENCIES is the authoritative backbone (confidence 1.0); ALL_SOURCE
// rows are fed through the PL/SQL extractor for call/table references the
// dictionary can't see.

import { CONFIDENCE, type NodeType, type OracleObjectNode, groupFor } from '../../domain/model';
import { canonicalId } from '../../domain/ids';
import { PlsqlExtractor } from '../plsql/plsqlExtractor';
import { emptyFragment, mergeFragments, type ExtractionFragment } from '../types';
import type { DiscoverOptions, MetadataSource } from './metadataSource';

export interface OracleConfig {
  user: string;
  password: string;
  connectString: string;
}

export function oracleConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OracleConfig | null {
  if (!env.ORACLE_CONNECT_STRING) return null;
  return {
    user: env.ORACLE_USER ?? '',
    password: env.ORACLE_PASSWORD ?? '',
    connectString: env.ORACLE_CONNECT_STRING,
  };
}

const OBJECT_TYPE_MAP: Record<string, NodeType> = {
  'TABLE': 'table',
  'VIEW': 'view',
  'MATERIALIZED VIEW': 'materializedview',
  'PACKAGE': 'package',
  'PACKAGE BODY': 'packagebody',
  'PROCEDURE': 'procedure',
  'FUNCTION': 'function',
  'TRIGGER': 'dbtrigger',
  'SEQUENCE': 'sequence',
  'SYNONYM': 'synonym',
  'INDEX': 'index',
};

const SYSTEM_OWNER_LIST = [
  'SYS', 'SYSTEM', 'PUBLIC', 'XDB', 'CTXSYS', 'MDSYS', 'ORDSYS', 'OUTLN',
  'DBSNMP', 'APPQOSSYS', 'WMSYS', 'OLAPSYS', 'LBACSYS', 'DVSYS', 'AUDSYS', 'GSMADMIN_INTERNAL',
];
const SYSTEM_OWNERS = new Set(SYSTEM_OWNER_LIST);
// SQL exclusion used when discovering all schemas, so the entire SYS data
// dictionary isn't pulled into memory just to be dropped in JS afterwards.
const SYSTEM_OWNERS_SQL = SYSTEM_OWNER_LIST.map((o) => `'${o}'`).join(',');

export interface DictionaryRows {
  artifact: string;
  objects: { owner: string; name: string; type: string; status: string; lastDdl?: string }[];
  dependencies: {
    owner: string; name: string; type: string;
    refOwner: string; refName: string; refType: string;
  }[];
  foreignKeys: { owner: string; table: string; refOwner: string; refTable: string }[];
  triggers: { owner: string; name: string; tableOwner: string; tableName: string }[];
  synonyms: { owner: string; name: string; tableOwner: string; tableName: string }[];
  source: { owner: string; name: string; type: string; text: string }[];
}

/**
 * Pure mapper: dictionary rows → IR fragment (unit-testable without a DB).
 * `allowedOwners` are schemas the caller requested explicitly; they override
 * the SYSTEM_OWNERS skip list so e.g. requesting DVSYS by name is honored even
 * though it's an Oracle-internal schema normally excluded from bulk discovery.
 */
export function mapDictionaryRows(rows: DictionaryRows, allowedOwners: Iterable<string> = []): ExtractionFragment {
  const fragment = emptyFragment();
  const evidence = [{ sourceType: 'DICTIONARY' as const }];
  const seen = new Set<string>();
  const allowed = new Set([...allowedOwners].map((o) => o.toUpperCase()));
  const isSkipped = (owner: string): boolean => {
    const up = owner.toUpperCase();
    return SYSTEM_OWNERS.has(up) && !allowed.has(up);
  };

  const addNode = (type: NodeType, owner: string, name: string, props: Record<string, string | number | boolean> = {}, status?: 'VALID' | 'INVALID') => {
    const id = canonicalId(type, owner, name);
    if (seen.has(id)) return id;
    seen.add(id);
    const node: OracleObjectNode = {
      id,
      type,
      schema: owner.toUpperCase(),
      name: name.toUpperCase(),
      group: groupFor(type),
      status: status ?? 'VALID',
      properties: props,
      source: [{ artifact: rows.artifact, runId: '' }],
    };
    fragment.nodes.push(node);
    return id;
  };

  for (const obj of rows.objects) {
    const type = OBJECT_TYPE_MAP[obj.type.toUpperCase()];
    if (!type || isSkipped(obj.owner)) continue;
    addNode(type, obj.owner, obj.name, obj.lastDdl ? { lastDdlTime: obj.lastDdl } : {}, obj.status === 'INVALID' ? 'INVALID' : 'VALID');
  }

  for (const dep of rows.dependencies) {
    const fromType = OBJECT_TYPE_MAP[dep.type.toUpperCase()];
    const toType = OBJECT_TYPE_MAP[dep.refType.toUpperCase()];
    if (!fromType || !toType) continue;
    if (isSkipped(dep.owner) || isSkipped(dep.refOwner)) continue;
    const fromId = addNode(fromType, dep.owner, dep.name);
    const toId = addNode(toType, dep.refOwner, dep.refName);
    fragment.edges.push({
      from: fromId,
      to: toId,
      relType: 'DEPENDS_ON',
      operation: 'REFERENCE',
      confidence: CONFIDENCE.DICTIONARY,
      evidence,
    });
  }

  for (const fk of rows.foreignKeys) {
    if (isSkipped(fk.owner)) continue;
    const fromId = addNode('table', fk.owner, fk.table);
    const toId = addNode('table', fk.refOwner, fk.refTable);
    fragment.edges.push({
      from: fromId,
      to: toId,
      relType: 'FK_TO',
      operation: 'REFERENCE',
      confidence: CONFIDENCE.DICTIONARY,
      evidence,
    });
  }

  for (const trigger of rows.triggers) {
    if (isSkipped(trigger.owner)) continue;
    const fromId = addNode('dbtrigger', trigger.owner, trigger.name);
    const toId = addNode('table', trigger.tableOwner, trigger.tableName);
    fragment.edges.push({
      from: fromId,
      to: toId,
      relType: 'ATTACHED_TO',
      operation: 'REFERENCE',
      confidence: CONFIDENCE.DICTIONARY,
      evidence,
    });
  }

  for (const synonym of rows.synonyms) {
    if (isSkipped(synonym.owner)) continue;
    const fromId = addNode('synonym', synonym.owner, synonym.name);
    fragment.refs.push({
      fromId,
      name: `${synonym.tableOwner}.${synonym.tableName}`.toUpperCase(),
      kind: 'ANY',
      relType: 'SYNONYM_FOR',
      confidence: CONFIDENCE.DICTIONARY,
      evidence,
    });
  }

  // PL/SQL source through the shared extractor (per object)
  const plsql = new PlsqlExtractor();
  const fragments: ExtractionFragment[] = [fragment];
  for (const src of rows.source) {
    if (isSkipped(src.owner)) continue;
    fragments.push(
      plsql.extract(`${src.owner}.${src.name} (ALL_SOURCE)`, src.text, { defaultSchema: src.owner })
    );
  }
  return mergeFragments(...fragments);
}

export class LiveOracleSource implements MetadataSource {
  constructor(private readonly config: OracleConfig) {}

  async discover(options: DiscoverOptions = {}): Promise<ExtractionFragment> {
    // Dynamic import keeps oracledb optional at startup.
    const oracledb = (await import('oracledb')).default;
    oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
    const connection = await oracledb.getConnection({
      user: this.config.user,
      password: this.config.password,
      connectString: this.config.connectString,
    });

    try {
      const schemas = (options.schemas ?? []).map((s) => s.toUpperCase());
      // With explicit schemas: filter to them. Without: exclude Oracle-internal
      // owners in SQL so "discover all" doesn't drag the whole SYS dictionary
      // into memory. (System-owner names are hardcoded constants, not user input.)
      const schemaFilter =
        schemas.length > 0
          ? `AND owner IN (${schemas.map((_, i) => `:s${i}`).join(',')})`
          : `AND owner NOT IN (${SYSTEM_OWNERS_SQL})`;
      const binds = Object.fromEntries(schemas.map((s, i) => [`s${i}`, s]));

      const query = async (sql: string): Promise<Record<string, unknown>[]> => {
        const result = await connection.execute(sql, binds);
        return (result.rows ?? []) as Record<string, unknown>[];
      };

      const objects = await query(
        `SELECT owner, object_name, object_type, status, TO_CHAR(last_ddl_time, 'YYYY-MM-DD') AS last_ddl
           FROM all_objects
          WHERE object_type IN ('TABLE','VIEW','MATERIALIZED VIEW','PACKAGE','PACKAGE BODY','PROCEDURE','FUNCTION','TRIGGER','SEQUENCE','SYNONYM','INDEX')
            ${schemaFilter}`
      );
      const dependencies = await query(
        `SELECT owner, name, type, referenced_owner, referenced_name, referenced_type
           FROM all_dependencies
          WHERE referenced_type <> 'NON-EXISTENT' ${schemaFilter}`
      );
      const foreignKeys = await query(
        `SELECT c.owner, c.table_name, r.owner AS r_owner, r.table_name AS r_table
           FROM all_constraints c
           JOIN all_constraints r ON c.r_owner = r.owner AND c.r_constraint_name = r.constraint_name
          WHERE c.constraint_type = 'R' ${schemaFilter.replace(/owner/g, 'c.owner')}`
      );
      const triggers = await query(
        `SELECT owner, trigger_name, table_owner, table_name
           FROM all_triggers WHERE table_name IS NOT NULL ${schemaFilter}`
      );
      const synonyms = await query(
        `SELECT owner, synonym_name, table_owner, table_name
           FROM all_synonyms WHERE table_owner IS NOT NULL ${schemaFilter}`
      );
      const sourceRows = await query(
        `SELECT owner, name, type, text
           FROM all_source
          WHERE type IN ('PACKAGE','PACKAGE BODY','PROCEDURE','FUNCTION')
            ${schemaFilter}
          ORDER BY owner, name, type, line`
      );

      // Reassemble ALL_SOURCE lines per object
      const sourceByKey = new Map<string, { owner: string; name: string; type: string; text: string }>();
      for (const row of sourceRows) {
        const key = `${row.OWNER}|${row.NAME}|${row.TYPE}`;
        const entry = sourceByKey.get(key);
        if (entry) {
          entry.text += String(row.TEXT ?? '');
        } else {
          sourceByKey.set(key, {
            owner: String(row.OWNER),
            name: String(row.NAME),
            type: String(row.TYPE),
            text: `CREATE OR REPLACE ${String(row.TYPE)} ${String(row.NAME)} ` + String(row.TEXT ?? ''),
          });
        }
      }

      return mapDictionaryRows({
        artifact: 'LIVE_CONNECTION',
        objects: objects.map((r) => ({
          owner: String(r.OWNER),
          name: String(r.OBJECT_NAME),
          type: String(r.OBJECT_TYPE),
          status: String(r.STATUS ?? 'VALID'),
          lastDdl: r.LAST_DDL ? String(r.LAST_DDL) : undefined,
        })),
        dependencies: dependencies.map((r) => ({
          owner: String(r.OWNER),
          name: String(r.NAME),
          type: String(r.TYPE),
          refOwner: String(r.REFERENCED_OWNER),
          refName: String(r.REFERENCED_NAME),
          refType: String(r.REFERENCED_TYPE),
        })),
        foreignKeys: foreignKeys.map((r) => ({
          owner: String(r.OWNER),
          table: String(r.TABLE_NAME),
          refOwner: String(r.R_OWNER),
          refTable: String(r.R_TABLE),
        })),
        triggers: triggers.map((r) => ({
          owner: String(r.OWNER),
          name: String(r.TRIGGER_NAME),
          tableOwner: String(r.TABLE_OWNER ?? r.OWNER),
          tableName: String(r.TABLE_NAME),
        })),
        synonyms: synonyms.map((r) => ({
          owner: String(r.OWNER),
          name: String(r.SYNONYM_NAME),
          tableOwner: String(r.TABLE_OWNER),
          tableName: String(r.TABLE_NAME),
        })),
        source: [...sourceByKey.values()],
      }, schemas); // explicitly requested schemas override the system-owner skip list
    } finally {
      await connection.close();
    }
  }
}
