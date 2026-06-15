import { describe, it, expect } from 'vitest';
import { ObjectCatalog, type CatalogEntry } from './catalog';
import { resolveFragment } from './resolver';
import { CONFIDENCE } from '../domain/model';
import type { ExtractionFragment, RawReference } from '../extractors/types';

const entries: CatalogEntry[] = [
  { id: 'table:HR.EMPLOYEES', type: 'table', schema: 'HR', name: 'EMPLOYEES' },
  { id: 'table:FIN.LEDGER', type: 'table', schema: 'FIN', name: 'LEDGER' },
  { id: 'package:HR.HR_PKG', type: 'package', schema: 'HR', name: 'HR_PKG' },
  { id: 'procedure:HR.HR_PKG.VALIDATE_EMP', type: 'procedure', schema: 'HR', name: 'HR_PKG.VALIDATE_EMP' },
  { id: 'sequence:HR.EMP_SEQ', type: 'sequence', schema: 'HR', name: 'EMP_SEQ' },
  { id: 'synonym:APP.EMP', type: 'synonym', schema: 'APP', name: 'EMP' },
];

function makeRef(overrides: Partial<RawReference>): RawReference {
  return {
    fromId: 'form:APP.EMP_MAINT',
    name: 'EMPLOYEES',
    kind: 'TABLE_OR_VIEW',
    relType: 'REFERENCES',
    operation: 'SELECT',
    confidence: CONFIDENCE.PARSED_STATIC,
    evidence: [{ sourceType: 'FORMS_XML', file: 'emp_maint.xml' }],
    ...overrides,
  };
}

function fragmentWith(...refs: RawReference[]): ExtractionFragment {
  return { nodes: [], edges: [], refs };
}

describe('ObjectCatalog', () => {
  const catalog = new ObjectCatalog(entries, [{ synonymId: 'synonym:APP.EMP', targetId: 'table:HR.EMPLOYEES' }]);

  it('resolves schema-qualified names first', () => {
    expect(catalog.resolve('HR.EMPLOYEES', 'TABLE_OR_VIEW')?.id).toBe('table:HR.EMPLOYEES');
  });

  it('resolves unqualified unique names across schemas', () => {
    expect(catalog.resolve('LEDGER', 'TABLE_OR_VIEW')?.id).toBe('table:FIN.LEDGER');
  });

  it('prefers the default schema', () => {
    expect(catalog.resolve('EMPLOYEES', 'TABLE_OR_VIEW', 'HR')?.id).toBe('table:HR.EMPLOYEES');
  });

  it('chases synonyms to their target', () => {
    expect(catalog.resolve('EMP', 'TABLE_OR_VIEW', 'APP')?.id).toBe('table:HR.EMPLOYEES');
  });

  it('resolves package members for calls', () => {
    expect(catalog.resolve('HR_PKG.VALIDATE_EMP', 'CALL')?.id).toBe('procedure:HR.HR_PKG.VALIDATE_EMP');
  });

  it('returns null for unknown names', () => {
    expect(catalog.resolve('NO_SUCH_TABLE', 'TABLE_OR_VIEW')).toBeNull();
  });
});

describe('resolveFragment', () => {
  const catalog = new ObjectCatalog(entries, [{ synonymId: 'synonym:APP.EMP', targetId: 'table:HR.EMPLOYEES' }]);

  it('creates edges to resolved targets', () => {
    const result = resolveFragment(fragmentWith(makeRef({})), catalog);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({
      from: 'form:APP.EMP_MAINT',
      to: 'table:HR.EMPLOYEES',
      relType: 'REFERENCES',
    });
    expect(result.unresolvedNodes).toHaveLength(0);
  });

  it('falls back from unknown member to the package for calls', () => {
    const result = resolveFragment(
      fragmentWith(makeRef({ name: 'HR_PKG.UNKNOWN_PROC', kind: 'CALL', relType: 'CALLS', operation: 'EXECUTE' })),
      catalog
    );
    expect(result.edges[0].to).toBe('package:HR.HR_PKG');
    expect(result.edges[0].confidence).toBeLessThan(CONFIDENCE.PARSED_STATIC);
  });

  it('creates UnresolvedRef nodes for unknown references — never drops them', () => {
    const result = resolveFragment(fragmentWith(makeRef({ name: 'GHOST_TABLE' })), catalog);
    expect(result.unresolvedNodes).toHaveLength(1);
    expect(result.unresolvedNodes[0]).toMatchObject({
      id: 'unresolved:?.GHOST_TABLE',
      type: 'unresolved',
      status: 'UNRESOLVED',
    });
    expect(result.edges[0].to).toBe('unresolved:?.GHOST_TABLE');
  });

  it('dedupes identical edges from repeated refs', () => {
    const result = resolveFragment(fragmentWith(makeRef({}), makeRef({})), catalog);
    expect(result.edges).toHaveLength(1);
  });
});
