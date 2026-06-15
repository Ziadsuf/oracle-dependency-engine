import { describe, it, expect } from 'vitest';
import { CONFIDENCE, dedupeEdges, groupFor, labelFor, type DependencyEdgeRecord } from './model';

describe('node taxonomy', () => {
  it('maps types to Neo4j labels and UI groups', () => {
    expect(labelFor('table')).toBe('Table');
    expect(labelFor('unresolved')).toBe('UnresolvedRef');
    expect(groupFor('form')).toBe('presentation');
    expect(groupFor('package')).toBe('logic');
    expect(groupFor('sequence')).toBe('data');
  });
});

describe('dedupeEdges', () => {
  const base: DependencyEdgeRecord = {
    from: 'procedure:HR.HR_PKG.VALIDATE_EMP',
    to: 'table:HR.EMPLOYEES',
    relType: 'REFERENCES',
    operation: 'SELECT',
    confidence: CONFIDENCE.PARSED_STATIC,
    evidence: [{ sourceType: 'PLSQL_SOURCE', file: 'hr_pkg.pkb', line: 12 }],
  };

  it('merges duplicates keeping max confidence and unioned evidence', () => {
    const dictionary: DependencyEdgeRecord = {
      ...base,
      operation: 'UPDATE',
      confidence: CONFIDENCE.DICTIONARY,
      evidence: [{ sourceType: 'DICTIONARY' }],
    };
    const merged = dedupeEdges([base, dictionary]);
    expect(merged).toHaveLength(1);
    expect(merged[0].confidence).toBe(CONFIDENCE.DICTIONARY);
    expect(merged[0].operation).toBe('UPDATE'); // from the higher-confidence record
    expect(merged[0].evidence).toEqual([
      { sourceType: 'PLSQL_SOURCE', file: 'hr_pkg.pkb', line: 12 },
      { sourceType: 'DICTIONARY' },
    ]);
  });

  it('does not duplicate identical evidence entries', () => {
    const merged = dedupeEdges([base, { ...base, evidence: [{ ...base.evidence[0] }] }]);
    expect(merged[0].evidence).toHaveLength(1);
  });

  it('keeps distinct edges (different relType) separate', () => {
    const calls: DependencyEdgeRecord = { ...base, relType: 'CALLS' };
    expect(dedupeEdges([base, calls])).toHaveLength(2);
  });

  it('does not mutate its input', () => {
    const input = [base, { ...base, confidence: CONFIDENCE.DICTIONARY, evidence: [{ sourceType: 'DICTIONARY' as const }] }];
    dedupeEdges(input);
    expect(base.evidence).toHaveLength(1);
    expect(base.confidence).toBe(CONFIDENCE.PARSED_STATIC);
  });
});
