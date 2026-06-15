import { describe, it, expect } from 'vitest';
import { ReportsExtractor } from './reportsExtractor';
import { parseReportsXml } from './reportsXml';

const SAMPLE_REPORT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<report name="PAYROLL_SUM" DTDVersion="9.0.2.0.0">
  <data>
    <userParameter name="P_DEPT_ID" datatype="number"/>
    <userParameter name="P_DATE_FROM" datatype="date"/>
    <dataSource name="Q_MAIN">
      <select>SELECT emp_id, name, salary FROM employees WHERE dept_id = :P_DEPT_ID</select>
    </dataSource>
    <dataSource name="Q_DEPT">
      <select>SELECT dept_id, dept_name FROM departments</select>
    </dataSource>
  </data>
  <layout>
    <section name="main">
      <body>
        <frame name="M_G_EMP_HEADER"/>
        <repeatingFrame name="R_G_EMP" source="Q_MAIN"/>
        <field name="F_SALARY" source="salary"/>
      </body>
    </section>
  </layout>
  <programUnits>
    <function name="CF_TOTAL_SALARY">
      <textSource>function CF_TOTAL_SALARY return number is v number; begin select sum(salary) into v from emp_salaries; return v; end;</textSource>
    </function>
  </programUnits>
</report>`;

describe('parseReportsXml', () => {
  it('extracts queries, parameters, program units and layout objects', () => {
    const report = parseReportsXml(SAMPLE_REPORT_XML);
    expect(report.name).toBe('PAYROLL_SUM');
    expect(report.queries.map((q) => q.name)).toEqual(['Q_MAIN', 'Q_DEPT']);
    expect(report.queries[0].sql).toContain('FROM employees');
    expect(report.parameters).toEqual(['P_DEPT_ID', 'P_DATE_FROM']);
    expect(report.programUnits[0]).toMatchObject({ name: 'CF_TOTAL_SALARY', type: 'Function' });
    expect(report.layouts.map((l) => l.type)).toEqual(['Frame', 'Repeating Frame', 'Field']);
  });

  it('rejects XML without a report element', () => {
    expect(() => parseReportsXml('<html><body>nope</body></html>')).toThrow(/Invalid Oracle Reports XML/);
  });
});

describe('ReportsExtractor', () => {
  const extractor = new ReportsExtractor();

  it('rejects binary .rdf with conversion guidance', () => {
    expect(() => extractor.extract('PAYROLL.rdf', Buffer.from('binary'))).toThrow(/rwconverter/);
  });

  it('emits report, query, parameter and program unit nodes with refs', () => {
    const fragment = extractor.extract('payroll_sum.xml', Buffer.from(SAMPLE_REPORT_XML), { defaultSchema: 'HR' });

    const ids = fragment.nodes.map((n) => n.id);
    expect(ids).toContain('report:HR.PAYROLL_SUM');
    expect(ids).toContain('reportquery:HR.PAYROLL_SUM.Q_MAIN');
    expect(ids).toContain('parameter:HR.PAYROLL_SUM.P_DEPT_ID');
    expect(ids).toContain('programunit:HR.PAYROLL_SUM.CF_TOTAL_SALARY');

    // structural containment
    expect(fragment.edges.every((e) => e.relType === 'CONTAINS' && e.from === 'report:HR.PAYROLL_SUM')).toBe(true);

    // query SQL produced table refs
    const queryRef = fragment.refs.find((r) => r.fromId === 'reportquery:HR.PAYROLL_SUM.Q_MAIN');
    expect(queryRef).toMatchObject({ name: 'EMPLOYEES', relType: 'REFERENCES', operation: 'SELECT' });

    // program unit code scanned too
    const unitRef = fragment.refs.find((r) => r.fromId === 'programunit:HR.PAYROLL_SUM.CF_TOTAL_SALARY');
    expect(unitRef?.name).toBe('EMP_SALARIES');
  });
});
