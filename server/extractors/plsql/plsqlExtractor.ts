// PL/SQL extractor: builds on PlsqlAnalyzerService (subprogram structure,
// complexity) and the shared SQL scanner (table/call/sequence references with
// dynamic-SQL confidence downgrades). Handles package specs/bodies and
// standalone procedures/functions from .pks/.pkb/.sql uploads or ALL_SOURCE.

import { PlsqlAnalyzerService } from '../../services/plsqlParser';
import { CONFIDENCE, type EvidenceRef, type OracleObjectNode } from '../../domain/model';
import { canonicalId } from '../../domain/ids';
import { scanPlsql } from './sqlReferenceExtractor';
import { emptyFragment, type ExtractionFragment, type RawReference } from '../types';

export interface PlsqlExtractOptions {
  defaultSchema?: string | null;
}

const analyzer = new PlsqlAnalyzerService();

export class PlsqlExtractor {
  extract(fileName: string, content: string, options: PlsqlExtractOptions = {}): ExtractionFragment {
    const fragment = emptyFragment();
    const schema = options.defaultSchema ?? null;
    const analysis = analyzer.analyze(fileName, content);
    const isPackage = analysis.packageName !== 'UNKNOWN_PACKAGE';
    const isBody = /CREATE\s+(?:OR\s+REPLACE\s+)?PACKAGE\s+BODY/i.test(content);
    const evidence = (line?: number): EvidenceRef[] => [{ sourceType: 'PLSQL_SOURCE', file: fileName, ...(line ? { line } : {}) }];

    let containerId: string | null = null;
    if (isPackage) {
      containerId = canonicalId('package', schema, analysis.packageName);
      fragment.nodes.push({
        id: containerId,
        type: 'package',
        schema,
        name: analysis.packageName,
        group: 'logic',
        status: 'VALID',
        properties: {
          complexity: analysis.complexity,
          loc: analysis.totalLines,
          riskLevel: analysis.riskLevel,
          hasBody: isBody,
        },
        source: [{ artifact: fileName, runId: '' }],
      });
    }

    const subprograms = [...analysis.procedures, ...analysis.functions];
    const lines = content.split('\n');

    for (const sub of subprograms) {
      const type = sub.type === 'PROCEDURE' ? 'procedure' : 'function';
      const memberName = isPackage ? `${analysis.packageName}.${sub.name}` : sub.name;
      const subId = canonicalId(type, schema, memberName);
      const node: OracleObjectNode = {
        id: subId,
        type,
        schema,
        name: memberName,
        group: 'logic',
        status: 'VALID',
        properties: {
          complexity: sub.complexity,
          startLine: sub.startLine,
          endLine: sub.endLine,
        },
        source: [{ artifact: fileName, runId: '' }],
      };
      fragment.nodes.push(node);
      if (containerId) {
        fragment.edges.push({
          from: containerId,
          to: subId,
          relType: 'CONTAINS',
          confidence: 1.0,
          evidence: evidence(sub.startLine),
        });
      }

      const body = lines.slice(sub.startLine - 1, sub.endLine).join('\n');
      this.collectRefs(fragment.refs, subId, body, fileName, sub.startLine - 1);
    }

    // References outside any subprogram (package-level cursors, init blocks)
    // attach to the package node itself.
    if (containerId) {
      const covered = subprograms.map((s) => [s.startLine, s.endLine] as const);
      const wholeFile = scanPlsql(content);
      const outside = (line: number) => !covered.some(([start, end]) => line >= start && line <= end);
      const ownerRefs: RawReference[] = [];
      this.collectRefs(ownerRefs, containerId, content, fileName, 0);
      for (const ref of ownerRefs) {
        const line = ref.evidence[0]?.line;
        if (line === undefined || outside(line)) fragment.refs.push(ref);
      }
      if (wholeFile.hasDynamicSql) {
        const pkg = fragment.nodes.find((n) => n.id === containerId)!;
        pkg.properties.hasDynamicSql = true;
      }
    }

    return fragment;
  }

  private collectRefs(refs: RawReference[], fromId: string, source: string, fileName: string, lineOffset: number): void {
    const scanned = scanPlsql(source);
    for (const table of scanned.tables) {
      refs.push({
        fromId,
        name: table.name,
        kind: 'TABLE_OR_VIEW',
        relType: 'REFERENCES',
        operation: table.operation,
        confidence: table.dynamic ? CONFIDENCE.DYNAMIC_HEURISTIC : CONFIDENCE.PARSED_STATIC,
        evidence: [{ sourceType: 'PLSQL_SOURCE', file: fileName, line: lineOffset + table.line }],
      });
    }
    for (const call of scanned.calls) {
      refs.push({
        fromId,
        name: call.name,
        kind: 'CALL',
        relType: 'CALLS',
        operation: 'EXECUTE',
        confidence: CONFIDENCE.PARSED_STATIC,
        evidence: [{ sourceType: 'PLSQL_SOURCE', file: fileName, line: lineOffset + call.line }],
      });
    }
    for (const seq of scanned.sequences) {
      refs.push({
        fromId,
        name: seq.name,
        kind: 'SEQUENCE',
        relType: 'USES_SEQUENCE',
        confidence: CONFIDENCE.PARSED_STATIC,
        evidence: [{ sourceType: 'PLSQL_SOURCE', file: fileName, line: lineOffset + seq.line }],
      });
    }
  }
}
