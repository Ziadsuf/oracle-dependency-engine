// Real Oracle Reports XML parsing (rwconverter output). The XML nesting varies
// across Reports versions, so elements are collected recursively by tag name
// rather than by fixed paths.

import { XMLParser } from 'fast-xml-parser';

export interface ParsedReportQuery {
  name: string;
  sql: string;
}

export interface ParsedReportProgramUnit {
  name: string;
  type: 'Procedure' | 'Function' | 'Package Spec' | 'Package Body';
  code?: string;
}

export interface ParsedReportLayoutObject {
  name: string;
  type: 'Frame' | 'Repeating Frame' | 'Field' | 'Boilerplate';
  source?: string;
}

export interface ParsedReport {
  name: string;
  queries: ParsedReportQuery[];
  parameters: string[];
  programUnits: ParsedReportProgramUnit[];
  layouts: ParsedReportLayoutObject[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  trimValues: true,
});

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && '#text' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)['#text']);
  }
  return '';
}

// Depth-first collection of every element with the given tag name.
function collect(tree: unknown, tagName: string, found: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(tree)) {
    for (const entry of tree) collect(entry, tagName, found);
    return found;
  }
  if (!tree || typeof tree !== 'object') return found;
  for (const [key, value] of Object.entries(tree as Record<string, unknown>)) {
    if (key.toLowerCase() === tagName.toLowerCase()) {
      for (const entry of Array.isArray(value) ? value : [value]) {
        if (entry && typeof entry === 'object') found.push(entry as Record<string, unknown>);
      }
    }
    collect(value, tagName, found);
  }
  return found;
}

export function parseReportsXml(content: string): ParsedReport {
  const tree = parser.parse(content);
  const report = collect(tree, 'report')[0];
  if (!report) {
    throw new Error('Invalid Oracle Reports XML: no <report> element found');
  }

  const name = String(report.name ?? 'UNKNOWN_REPORT').toUpperCase();

  const queries: ParsedReportQuery[] = collect(report, 'dataSource').flatMap((source, index) => {
    const sql = textOf(source.select).trim();
    if (!sql) return [];
    return [{ name: String(source.name ?? `Q_${index + 1}`).toUpperCase(), sql }];
  });

  const parameters = collect(report, 'userParameter')
    .map((p) => String(p.name ?? '').toUpperCase())
    .filter(Boolean);

  const programUnits: ParsedReportProgramUnit[] = [
    ...collect(report, 'function').map((f) => ({ raw: f, type: 'Function' as const })),
    ...collect(report, 'procedure').map((p) => ({ raw: p, type: 'Procedure' as const })),
  ].flatMap(({ raw, type }) => {
    const unitName = String(raw.name ?? '').toUpperCase();
    if (!unitName) return [];
    const code = textOf(raw.textSource).trim() || undefined;
    return [{ name: unitName, type, code }];
  });

  const layouts: ParsedReportLayoutObject[] = [
    ...collect(report, 'frame').map((f) => ({ raw: f, type: 'Frame' as const })),
    ...collect(report, 'repeatingFrame').map((f) => ({ raw: f, type: 'Repeating Frame' as const })),
    ...collect(report, 'field').map((f) => ({ raw: f, type: 'Field' as const })),
  ].flatMap(({ raw, type }) => {
    const layoutName = String(raw.name ?? '').toUpperCase();
    if (!layoutName) return [];
    const source = raw.source ? String(raw.source) : undefined;
    return [{ name: layoutName, type, source }];
  });

  return { name, queries, parameters, programUnits, layouts };
}
