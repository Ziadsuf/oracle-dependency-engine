// Reports extractor: Reports XML → IR fragment. Binary .rdf is rejected with
// conversion guidance (use rwconverter to produce XML).

import { CONFIDENCE, type EvidenceRef } from '../../domain/model';
import { canonicalId } from '../../domain/ids';
import { scanPlsql, scanSqlTables } from '../plsql/sqlReferenceExtractor';
import { emptyFragment, type ExtractionFragment } from '../types';
import { parseReportsXml } from './reportsXml';

export interface ReportsExtractOptions {
  defaultSchema?: string | null;
}

export class ReportsExtractor {
  extract(fileName: string, fileBuffer: Buffer, options: ReportsExtractOptions = {}): ExtractionFragment {
    if (fileName.toLowerCase().endsWith('.rdf')) {
      throw new Error(
        `Binary Reports files (${fileName}) cannot be parsed directly. ` +
          `Convert to XML with Oracle's rwconverter (DEST_FORMAT=XML) and upload the .xml output.`
      );
    }

    const report = parseReportsXml(fileBuffer.toString('utf-8'));
    const schema = options.defaultSchema ?? null;
    const fragment = emptyFragment();
    const evidence: EvidenceRef[] = [{ sourceType: 'REPORTS_XML', file: fileName }];

    const reportId = canonicalId('report', schema, report.name);
    fragment.nodes.push({
      id: reportId,
      type: 'report',
      schema,
      name: report.name,
      group: 'presentation',
      status: 'VALID',
      properties: {
        totalQueries: report.queries.length,
        totalParameters: report.parameters.length,
        totalProgramUnits: report.programUnits.length,
        totalLayoutObjects: report.layouts.length,
      },
      source: [{ artifact: fileName, runId: '' }],
    });

    const contains = (to: string) =>
      fragment.edges.push({ from: reportId, to, relType: 'CONTAINS', confidence: 1.0, evidence });

    for (const query of report.queries) {
      const queryId = canonicalId('reportquery', schema, `${report.name}.${query.name}`);
      fragment.nodes.push({
        id: queryId,
        type: 'reportquery',
        schema,
        name: `${report.name}.${query.name}`,
        group: 'presentation',
        status: 'VALID',
        properties: { sql: query.sql.slice(0, 2000) },
        source: [{ artifact: fileName, runId: '' }],
      });
      contains(queryId);

      for (const table of scanSqlTables(query.sql)) {
        fragment.refs.push({
          fromId: queryId,
          name: table.name,
          kind: 'TABLE_OR_VIEW',
          relType: 'REFERENCES',
          operation: 'SELECT',
          confidence: CONFIDENCE.PARSED_STATIC,
          evidence,
        });
      }
    }

    for (const param of report.parameters) {
      const paramId = canonicalId('parameter', schema, `${report.name}.${param}`);
      fragment.nodes.push({
        id: paramId,
        type: 'parameter',
        schema,
        name: `${report.name}.${param}`,
        group: 'presentation',
        status: 'VALID',
        properties: {},
        source: [{ artifact: fileName, runId: '' }],
      });
      contains(paramId);
    }

    for (const unit of report.programUnits) {
      const unitId = canonicalId('programunit', schema, `${report.name}.${unit.name}`);
      fragment.nodes.push({
        id: unitId,
        type: 'programunit',
        schema,
        name: `${report.name}.${unit.name}`,
        group: 'logic',
        status: 'VALID',
        properties: { unitType: unit.type },
        source: [{ artifact: fileName, runId: '' }],
      });
      contains(unitId);

      if (!unit.code) continue;
      const scanned = scanPlsql(unit.code);
      for (const table of scanned.tables) {
        fragment.refs.push({
          fromId: unitId,
          name: table.name,
          kind: 'TABLE_OR_VIEW',
          relType: 'REFERENCES',
          operation: table.operation,
          confidence: table.dynamic ? CONFIDENCE.DYNAMIC_HEURISTIC : CONFIDENCE.PARSED_STATIC,
          evidence,
        });
      }
      for (const call of scanned.calls) {
        fragment.refs.push({
          fromId: unitId,
          name: call.name,
          kind: 'CALL',
          relType: 'CALLS',
          operation: 'EXECUTE',
          confidence: CONFIDENCE.PARSED_STATIC,
          evidence,
        });
      }
      for (const seq of scanned.sequences) {
        fragment.refs.push({
          fromId: unitId,
          name: seq.name,
          kind: 'SEQUENCE',
          relType: 'USES_SEQUENCE',
          confidence: CONFIDENCE.PARSED_STATIC,
          evidence,
        });
      }
    }

    return fragment;
  }
}
