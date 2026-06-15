// Forms extractor: strict parsing of Forms XML (frmf2xml/frmb2xml output) into
// IR fragments. Binary .fmb files are rejected with conversion guidance — no
// silent mock fallback in the dependency engine path.

import { FormsAnalyzerService } from '../../services/formsParser';
import { CONFIDENCE, type EvidenceRef } from '../../domain/model';
import { canonicalId } from '../../domain/ids';
import { scanPlsql } from '../plsql/sqlReferenceExtractor';
import { emptyFragment, type ExtractionFragment, type RawReference } from '../types';

export interface FormsExtractOptions {
  defaultSchema?: string | null;
}

const analyzer = new FormsAnalyzerService();

export class FormsExtractor {
  extract(fileName: string, fileBuffer: Buffer, options: FormsExtractOptions = {}): ExtractionFragment {
    const analysis = analyzer.analyze(fileName, fileBuffer, { strict: true });
    const schema = options.defaultSchema ?? null;
    const fragment = emptyFragment();
    const evidence: EvidenceRef[] = [{ sourceType: 'FORMS_XML', file: fileName }];
    const formName = String(analysis.formName).toUpperCase();

    const formId = canonicalId('form', schema, formName);
    fragment.nodes.push({
      id: formId,
      type: 'form',
      schema,
      name: formName,
      group: 'presentation',
      status: 'VALID',
      properties: {
        impactScore: analysis.impactScore,
        complexity: analysis.complexity,
        totalBlocks: analysis.summary.totalBlocks,
        totalItems: analysis.summary.totalItems,
        totalTriggers: analysis.summary.totalTriggers,
      },
      source: [{ artifact: fileName, runId: '' }],
    });

    const contains = (from: string, to: string) =>
      fragment.edges.push({ from, to, relType: 'CONTAINS', confidence: 1.0, evidence });

    const addTrigger = (ownerPath: string, ownerId: string, trigger: { name: string; code?: string }, level: string) => {
      const triggerId = canonicalId('formtrigger', schema, ownerPath, trigger.name);
      fragment.nodes.push({
        id: triggerId,
        type: 'formtrigger',
        schema,
        name: `${ownerPath}#${String(trigger.name).toUpperCase()}`,
        group: 'presentation',
        status: 'VALID',
        properties: { level, trigger: trigger.name },
        source: [{ artifact: fileName, runId: '' }],
      });
      contains(ownerId, triggerId);
      if (trigger.code) {
        this.collectCodeRefs(fragment.refs, triggerId, String(trigger.code), fileName);
      }
    };

    for (const trigger of analysis.formTriggers) {
      addTrigger(formName, formId, trigger, 'Form');
    }

    for (const block of analysis.blocks) {
      const blockPath = `${formName}.${String(block.name).toUpperCase()}`;
      const blockId = canonicalId('block', schema, blockPath);
      fragment.nodes.push({
        id: blockId,
        type: 'block',
        schema,
        name: blockPath,
        group: 'presentation',
        status: 'VALID',
        properties: { ...(block.baseTable ? { baseTable: String(block.baseTable) } : {}) },
        source: [{ artifact: fileName, runId: '' }],
      });
      contains(formId, blockId);

      if (block.baseTable) {
        fragment.refs.push({
          fromId: blockId,
          name: String(block.baseTable).toUpperCase(),
          kind: 'TABLE_OR_VIEW',
          relType: 'BASED_ON',
          operation: 'REFERENCE',
          confidence: CONFIDENCE.DICTIONARY, // declarative block metadata, not heuristics
          evidence,
        });
      }

      for (const trigger of block.triggers) {
        addTrigger(blockPath, blockId, trigger, 'Block');
      }

      for (const item of block.items) {
        const itemPath = `${blockPath}.${String(item.name).toUpperCase()}`;
        const itemId = canonicalId('item', schema, itemPath);
        fragment.nodes.push({
          id: itemId,
          type: 'item',
          schema,
          name: itemPath,
          group: 'presentation',
          status: 'VALID',
          properties: { itemType: item.type, ...(item.canvas ? { canvas: String(item.canvas) } : {}) },
          source: [{ artifact: fileName, runId: '' }],
        });
        contains(blockId, itemId);
        for (const trigger of item.triggers) {
          addTrigger(itemPath, itemId, trigger, 'Item');
        }
      }
    }

    for (const unit of analysis.programUnits) {
      const unitId = canonicalId('programunit', schema, `${formName}.${String(unit.name).toUpperCase()}`);
      fragment.nodes.push({
        id: unitId,
        type: 'programunit',
        schema,
        name: `${formName}.${String(unit.name).toUpperCase()}`,
        group: 'logic',
        status: 'VALID',
        properties: { unitType: unit.type },
        source: [{ artifact: fileName, runId: '' }],
      });
      contains(formId, unitId);
      if (unit.code) {
        this.collectCodeRefs(fragment.refs, unitId, unit.code, fileName);
      }
    }

    return fragment;
  }

  private collectCodeRefs(refs: RawReference[], fromId: string, code: string, fileName: string): void {
    const scanned = scanPlsql(code);
    const evidence = (line: number): EvidenceRef[] => [{ sourceType: 'FORMS_XML', file: fileName, line }];
    for (const table of scanned.tables) {
      refs.push({
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
      refs.push({
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
      refs.push({
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
