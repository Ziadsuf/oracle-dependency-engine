import { describe, it, expect } from 'vitest';
import { scanPlsql, scanSqlTables, stripComments } from './sqlReferenceExtractor';

describe('stripComments', () => {
  it('blanks line and block comments but keeps strings and line numbers', () => {
    const out = stripComments("SELECT 1 -- FROM FAKE_TABLE\n/* FROM OTHER */ FROM REAL_TABLE WHERE x = 'FROM LITERAL'");
    expect(out).not.toContain('FAKE_TABLE');
    expect(out).not.toContain('OTHER');
    expect(out).toContain('REAL_TABLE');
    expect(out).toContain("'FROM LITERAL'");
    expect(out.split('\n').length).toBe(2);
  });
});

describe('scanPlsql', () => {
  it('classifies DML operations per table', () => {
    const refs = scanPlsql(`
      BEGIN
        SELECT 1 INTO v FROM employees e JOIN departments d ON 1=1;
        UPDATE salaries SET amount = 1;
        INSERT INTO audit_log VALUES (1);
        DELETE FROM leave_records;
        MERGE INTO emp_summary USING dual ON (1=1);
      END;
    `);
    const byName = Object.fromEntries(refs.tables.map((t) => [t.name, t.operation]));
    expect(byName.EMPLOYEES).toBe('SELECT');
    expect(byName.DEPARTMENTS).toBe('SELECT');
    expect(byName.SALARIES).toBe('UPDATE');
    expect(byName.AUDIT_LOG).toBe('INSERT');
    expect(byName.LEAVE_RECORDS).toBe('DELETE');
    expect(byName.EMP_SUMMARY).toBe('UPDATE');
    expect(byName.DUAL).toBeUndefined(); // noise filtered
  });

  it('detects qualified calls and sequences', () => {
    const refs = scanPlsql(`
      BEGIN
        v_id := emp_seq.NEXTVAL;
        hr_pkg.validate_emp(p_id);
        result := finance.fin_core.calc_tax(amount);
      END;
    `);
    expect(refs.sequences.map((s) => s.name)).toContain('EMP_SEQ');
    const calls = refs.calls.map((c) => c.name);
    expect(calls).toContain('HR_PKG.VALIDATE_EMP');
    expect(calls).toContain('FINANCE.FIN_CORE.CALC_TAX');
    // NEXTVAL must not appear as a call
    expect(calls.some((c) => c.endsWith('NEXTVAL'))).toBe(false);
  });

  it('flags dynamic SQL and extracts its tables at low confidence', () => {
    const refs = scanPlsql(`BEGIN EXECUTE IMMEDIATE 'DELETE FROM temp_staging WHERE id = 1'; END;`);
    expect(refs.hasDynamicSql).toBe(true);
    const dynamic = refs.tables.find((t) => t.name === 'TEMP_STAGING');
    expect(dynamic?.dynamic).toBe(true);
    expect(dynamic?.operation).toBe('DELETE');
  });

  it('does not treat SELECT ... INTO variables as table references', () => {
    const refs = scanPlsql('SELECT salary INTO v_sal FROM emp_salaries;');
    expect(refs.tables.map((t) => t.name)).toEqual(['EMP_SALARIES']);
  });
});

describe('scanSqlTables', () => {
  it('handles schema-qualified names', () => {
    const refs = scanSqlTables('SELECT * FROM hr.employees JOIN hr.departments USING (dept_id)');
    expect(refs.map((t) => t.name).sort()).toEqual(['HR.DEPARTMENTS', 'HR.EMPLOYEES']);
  });
});
