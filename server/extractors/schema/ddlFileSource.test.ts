import { describe, it, expect } from 'vitest';
import { DdlFileSource } from './ddlFileSource';

const DDL = `
CREATE TABLE hr.employees (
  emp_id NUMBER PRIMARY KEY,
  dept_id NUMBER REFERENCES hr.departments(dept_id)
);

CREATE TABLE hr.departments (dept_id NUMBER PRIMARY KEY);

CREATE OR REPLACE VIEW hr.emp_dept_v AS
  SELECT e.emp_id, d.dept_name FROM hr.employees e JOIN hr.departments d ON e.dept_id = d.dept_id;

CREATE OR REPLACE TRIGGER hr.trg_emp_audit
  AFTER UPDATE ON hr.employees
BEGIN
  INSERT INTO hr.audit_log VALUES (1);
END;

CREATE SEQUENCE hr.emp_seq;

CREATE SYNONYM emp FOR hr.employees;

ALTER TABLE hr.employees ADD CONSTRAINT fk_emp_dept FOREIGN KEY (dept_id) REFERENCES hr.departments (dept_id);
`;

describe('DdlFileSource', () => {
  const source = new DdlFileSource();

  it('creates nodes for every DDL object without mock values', () => {
    const fragment = source.extract('hr_schema.sql', DDL);
    const ids = fragment.nodes.map((n) => n.id);
    expect(ids).toContain('table:HR.EMPLOYEES');
    expect(ids).toContain('table:HR.DEPARTMENTS');
    expect(ids).toContain('view:HR.EMP_DEPT_V');
    expect(ids).toContain('dbtrigger:HR.TRG_EMP_AUDIT');
    expect(ids).toContain('sequence:HR.EMP_SEQ');
    expect(ids.some((id) => id.startsWith('synonym:'))).toBe(true);

    // every node has deterministic status, no randomness
    expect(fragment.nodes.every((n) => n.status === 'VALID')).toBe(true);
  });

  it('emits view BASED_ON, trigger ATTACHED_TO, synonym and FK refs', () => {
    const fragment = source.extract('hr_schema.sql', DDL);

    const viewRefs = fragment.refs.filter((r) => r.fromId === 'view:HR.EMP_DEPT_V' && r.relType === 'BASED_ON');
    expect(viewRefs.map((r) => r.name).sort()).toEqual(['HR.DEPARTMENTS', 'HR.EMPLOYEES']);

    const attached = fragment.refs.find((r) => r.fromId === 'dbtrigger:HR.TRG_EMP_AUDIT' && r.relType === 'ATTACHED_TO');
    expect(attached?.name).toBe('HR.EMPLOYEES');

    const triggerInsert = fragment.refs.find((r) => r.fromId === 'dbtrigger:HR.TRG_EMP_AUDIT' && r.relType === 'REFERENCES');
    expect(triggerInsert).toMatchObject({ name: 'HR.AUDIT_LOG', operation: 'INSERT' });

    const synonymRef = fragment.refs.find((r) => r.relType === 'SYNONYM_FOR');
    expect(synonymRef?.name).toBe('HR.EMPLOYEES');

    const fkRefs = fragment.refs.filter((r) => r.relType === 'FK_TO');
    expect(fkRefs.length).toBeGreaterThanOrEqual(2); // inline + ALTER TABLE
    expect(fkRefs.every((r) => r.name === 'HR.DEPARTMENTS')).toBe(true);
  });

  it('applies the default schema to unqualified names', () => {
    const fragment = source.extract('x.sql', 'CREATE TABLE widgets (id NUMBER);', { defaultSchema: 'APP' });
    expect(fragment.nodes[0].id).toBe('table:APP.WIDGETS');
  });
});
