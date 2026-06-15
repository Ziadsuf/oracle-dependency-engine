import { describe, it, expect } from 'vitest';
import { canonicalId, normalizeIdentifier, parseCanonicalId } from './ids';

describe('normalizeIdentifier', () => {
  it('uppercases unquoted identifiers (Oracle folding)', () => {
    expect(normalizeIdentifier('employees')).toBe('EMPLOYEES');
    expect(normalizeIdentifier('  hr_pkg ')).toBe('HR_PKG');
  });

  it('preserves case for quoted identifiers', () => {
    expect(normalizeIdentifier('"MixedCase"')).toBe('MixedCase');
  });
});

describe('canonicalId', () => {
  it('builds the documented examples', () => {
    expect(canonicalId('table', 'hr', 'employees')).toBe('table:HR.EMPLOYEES');
    expect(canonicalId('package', 'HR', 'HR_PKG')).toBe('package:HR.HR_PKG');
    expect(canonicalId('procedure', 'HR', 'HR_PKG.VALIDATE_EMP')).toBe('procedure:HR.HR_PKG.VALIDATE_EMP');
    expect(canonicalId('formtrigger', 'APP', 'EMP_MAINT.EMPLOYEES', 'WHEN-VALIDATE-ITEM')).toBe(
      'formtrigger:APP.EMP_MAINT.EMPLOYEES#WHEN-VALIDATE-ITEM'
    );
  });

  it('uses ? for unknown schema (unresolved refs)', () => {
    expect(canonicalId('unresolved', null, 'some_name')).toBe('unresolved:?.SOME_NAME');
  });

  it('rejects unknown types and empty names', () => {
    expect(() => canonicalId('widget' as never, 'HR', 'X')).toThrow(/Unknown node type/);
    expect(() => canonicalId('table', 'HR', '  ')).toThrow(/non-empty name/);
  });
});

describe('parseCanonicalId', () => {
  it('round-trips build → parse', () => {
    const parsed = parseCanonicalId(canonicalId('formtrigger', 'APP', 'EMP_MAINT.EMPLOYEES', 'WHEN-VALIDATE-ITEM'));
    expect(parsed).toEqual({
      type: 'formtrigger',
      schema: 'APP',
      name: 'EMP_MAINT.EMPLOYEES',
      sub: 'WHEN-VALIDATE-ITEM',
    });
  });

  it('keeps dots inside member names (schema is only the first segment)', () => {
    expect(parseCanonicalId('procedure:HR.HR_PKG.VALIDATE_EMP')).toEqual({
      type: 'procedure',
      schema: 'HR',
      name: 'HR_PKG.VALIDATE_EMP',
    });
  });

  it('maps ? schema back to null', () => {
    expect(parseCanonicalId('unresolved:?.SOME_NAME').schema).toBeNull();
  });

  it('rejects malformed ids', () => {
    expect(() => parseCanonicalId('no-type-separator')).toThrow(/missing type/);
    expect(() => parseCanonicalId('widget:HR.X')).toThrow(/unknown type/);
    expect(() => parseCanonicalId('table:HRONLY')).toThrow(/expected <schema>\.<name>/);
  });
});
