// Offline schema source: parses DDL scripts into IR fragments. Evolves the
// MetadataDiscovererService regex scan but drops every randomly generated
// mock value — nodes carry only what the DDL actually states.

import { CONFIDENCE, type EvidenceRef, type NodeType, type OracleObjectNode, groupFor } from '../../domain/model';
import { canonicalId, normalizeIdentifier } from '../../domain/ids';
import { scanPlsql, scanSqlTables, stripComments } from '../plsql/sqlReferenceExtractor';
import { emptyFragment, type ExtractionFragment } from '../types';

const DDL_TYPE_MAP: Record<string, NodeType> = {
  'TABLE': 'table',
  'VIEW': 'view',
  'MATERIALIZED VIEW': 'materializedview',
  'PACKAGE BODY': 'packagebody',
  'PACKAGE': 'package',
  'PROCEDURE': 'procedure',
  'FUNCTION': 'function',
  'TRIGGER': 'dbtrigger',
  'SEQUENCE': 'sequence',
  'INDEX': 'index',
  'SYNONYM': 'synonym',
};

const CREATE_PATTERN =
  /CREATE\s+(?:OR\s+REPLACE\s+)?(?:FORCE\s+)?(?:EDITIONABLE\s+)?(?:GLOBAL\s+TEMPORARY\s+)?(?:UNIQUE\s+)?(?:PUBLIC\s+)?(MATERIALIZED\s+VIEW|TABLE|VIEW|PACKAGE\s+BODY|PACKAGE|PROCEDURE|FUNCTION|TRIGGER|SEQUENCE|INDEX|SYNONYM)\s+("?[A-Za-z0-9_$#]+"?(?:\."?[A-Za-z0-9_$#]+"?)?)/gi;

interface DdlStatement {
  ddlType: string;
  rawName: string;
  text: string;
  line: number;
}

function splitStatements(content: string): DdlStatement[] {
  const matches: { index: number; ddlType: string; rawName: string }[] = [];
  let match: RegExpExecArray | null;
  CREATE_PATTERN.lastIndex = 0;
  while ((match = CREATE_PATTERN.exec(content)) !== null) {
    matches.push({
      index: match.index,
      ddlType: match[1].toUpperCase().replace(/\s+/g, ' '),
      rawName: match[2],
    });
  }
  return matches.map((m, i) => ({
    ddlType: m.ddlType,
    rawName: m.rawName,
    text: content.slice(m.index, matches[i + 1]?.index ?? content.length),
    line: content.slice(0, m.index).split('\n').length,
  }));
}

function parseObjectName(rawName: string, defaultSchema: string | null): { schema: string | null; name: string } {
  if (rawName.includes('.')) {
    const [schemaPart, namePart] = rawName.split('.');
    return { schema: normalizeIdentifier(schemaPart), name: normalizeIdentifier(namePart) };
  }
  return { schema: defaultSchema, name: normalizeIdentifier(rawName) };
}

export interface DdlExtractOptions {
  defaultSchema?: string | null;
}

export class DdlFileSource {
  extract(fileName: string, content: string, options: DdlExtractOptions = {}): ExtractionFragment {
    const fragment = emptyFragment();
    const defaultSchema = options.defaultSchema ?? null;
    // Blank out comments first (keeps offsets/line numbers) so a commented-out
    // CREATE / REFERENCES / ON clause doesn't produce phantom objects or edges.
    const cleaned = stripComments(content);
    const statements = splitStatements(cleaned);
    const evidence = (line: number): EvidenceRef[] => [{ sourceType: 'DDL_FILE', file: fileName, line }];

    for (const statement of statements) {
      const type = DDL_TYPE_MAP[statement.ddlType];
      if (!type) continue;
      const { schema, name } = parseObjectName(statement.rawName, defaultSchema);
      const id = canonicalId(type, schema, name);
      const loc = statement.text.split('\n').length;

      const node: OracleObjectNode = {
        id,
        type,
        schema,
        name,
        group: groupFor(type),
        status: 'VALID',
        properties: { loc },
        source: [{ artifact: fileName, runId: '' }],
      };
      fragment.nodes.push(node);

      if (type === 'view' || type === 'materializedview') {
        const asIndex = statement.text.search(/\bAS\b/i);
        const body = asIndex >= 0 ? statement.text.slice(asIndex) : statement.text;
        for (const table of scanSqlTables(body)) {
          fragment.refs.push({
            fromId: id,
            name: table.name,
            kind: 'TABLE_OR_VIEW',
            relType: 'BASED_ON',
            operation: 'SELECT',
            confidence: CONFIDENCE.PARSED_STATIC,
            evidence: evidence(statement.line),
          });
        }
      } else if (type === 'dbtrigger') {
        const onMatch = statement.text.match(/\bON\s+("?[A-Za-z0-9_$#]+"?(?:\."?[A-Za-z0-9_$#]+"?)?)/i);
        if (onMatch) {
          fragment.refs.push({
            fromId: id,
            name: onMatch[1].replace(/"/g, '').toUpperCase(),
            kind: 'TABLE_OR_VIEW',
            relType: 'ATTACHED_TO',
            operation: 'REFERENCE',
            confidence: CONFIDENCE.DICTIONARY, // declarative ON clause
            evidence: evidence(statement.line),
          });
        }
        this.collectPlsqlRefs(fragment, id, statement, fileName);
      } else if (type === 'package' || type === 'packagebody' || type === 'procedure' || type === 'function') {
        this.collectPlsqlRefs(fragment, id, statement, fileName);
      } else if (type === 'synonym') {
        const forMatch = statement.text.match(/\bFOR\s+("?[A-Za-z0-9_$#]+"?(?:\."?[A-Za-z0-9_$#]+"?)?)/i);
        if (forMatch) {
          fragment.refs.push({
            fromId: id,
            name: forMatch[1].replace(/"/g, '').toUpperCase(),
            kind: 'ANY',
            relType: 'SYNONYM_FOR',
            confidence: CONFIDENCE.DICTIONARY,
            evidence: evidence(statement.line),
          });
        }
      } else if (type === 'index') {
        const onMatch = statement.text.match(/\bON\s+("?[A-Za-z0-9_$#]+"?(?:\."?[A-Za-z0-9_$#]+"?)?)/i);
        if (onMatch) {
          fragment.refs.push({
            fromId: id,
            name: onMatch[1].replace(/"/g, '').toUpperCase(),
            kind: 'TABLE_OR_VIEW',
            relType: 'DEPENDS_ON',
            operation: 'REFERENCE',
            confidence: CONFIDENCE.DICTIONARY,
            evidence: evidence(statement.line),
          });
        }
      } else if (type === 'table') {
        // Inline foreign keys: ... REFERENCES <table>(<cols>)
        const fkRegex = /\bREFERENCES\s+("?[A-Za-z0-9_$#]+"?(?:\."?[A-Za-z0-9_$#]+"?)?)/gi;
        let fkMatch: RegExpExecArray | null;
        while ((fkMatch = fkRegex.exec(statement.text)) !== null) {
          fragment.refs.push({
            fromId: id,
            name: fkMatch[1].replace(/"/g, '').toUpperCase(),
            kind: 'TABLE_OR_VIEW',
            relType: 'FK_TO',
            operation: 'REFERENCE',
            confidence: CONFIDENCE.DICTIONARY,
            evidence: evidence(statement.line),
          });
        }
      }
    }

    // ALTER TABLE ... FOREIGN KEY ... REFERENCES <target>
    const alterFkRegex =
      /ALTER\s+TABLE\s+("?[A-Za-z0-9_$#]+"?(?:\."?[A-Za-z0-9_$#]+"?)?)[\s\S]{0,300}?FOREIGN\s+KEY[\s\S]{0,200}?REFERENCES\s+("?[A-Za-z0-9_$#]+"?(?:\."?[A-Za-z0-9_$#]+"?)?)/gi;
    let alterMatch: RegExpExecArray | null;
    while ((alterMatch = alterFkRegex.exec(cleaned)) !== null) {
      const { schema, name } = parseObjectName(alterMatch[1].replace(/"/g, ''), defaultSchema);
      fragment.refs.push({
        fromId: canonicalId('table', schema, name),
        name: alterMatch[2].replace(/"/g, '').toUpperCase(),
        kind: 'TABLE_OR_VIEW',
        relType: 'FK_TO',
        operation: 'REFERENCE',
        confidence: CONFIDENCE.DICTIONARY,
        evidence: [{ sourceType: 'DDL_FILE', file: fileName }],
      });
    }

    return fragment;
  }

  private collectPlsqlRefs(fragment: ExtractionFragment, fromId: string, statement: DdlStatement, fileName: string): void {
    const scanned = scanPlsql(statement.text);
    const evidence = (line: number): EvidenceRef[] => [
      { sourceType: 'DDL_FILE', file: fileName, line: statement.line + line - 1 },
    ];
    for (const table of scanned.tables) {
      fragment.refs.push({
        fromId,
        name: table.name,
        kind: 'TABLE_OR_VIEW',
        relType: 'REFERENCES',
        operation: table.operation,
        confidence: table.dynamic ? CONFIDENCE.DYNAMIC_HEURISTIC : CONFIDENCE.PARSED_STATIC,
        evidence: evidence(table.line),
      });
    }
    for (const call of scanned.calls) {
      fragment.refs.push({
        fromId,
        name: call.name,
        kind: 'CALL',
        relType: 'CALLS',
        operation: 'EXECUTE',
        confidence: CONFIDENCE.PARSED_STATIC,
        evidence: evidence(call.line),
      });
    }
    for (const seq of scanned.sequences) {
      fragment.refs.push({
        fromId,
        name: seq.name,
        kind: 'SEQUENCE',
        relType: 'USES_SEQUENCE',
        confidence: CONFIDENCE.PARSED_STATIC,
        evidence: evidence(seq.line),
      });
    }
  }
}
