import { describe, it, expect } from 'vitest';
import { FormsExtractor } from './formsExtractor';

const FORM_XML = `
<Module version="10.1.2.0.2">
  <FormModule Name="EMP_MAINT">
    <Block Name="EMPLOYEES" QueryDataSourceName="HR_EMPLOYEES">
      <Item Name="EMP_ID" ItemType="Text Item" CanvasName="CV_MAIN">
        <Trigger Name="WHEN-VALIDATE-ITEM" TriggerText="BEGIN hr_pkg.validate_emp(:EMPLOYEES.EMP_ID); END;" />
      </Item>
      <Trigger Name="PRE-QUERY" TriggerText="BEGIN SELECT 1 INTO v FROM departments; END;" />
    </Block>
    <Trigger Name="WHEN-NEW-FORM-INSTANCE" TriggerText="BEGIN v_id := emp_seq.NEXTVAL; END;" />
    <ProgramUnit Name="INIT_FORM" ProgramUnitType="Procedure" ProgramUnitText="PROCEDURE init_form IS BEGIN UPDATE system_log SET x = 1; END;" />
  </FormModule>
</Module>`;

describe('FormsExtractor', () => {
  const extractor = new FormsExtractor();

  it('rejects binary .fmb with conversion guidance (no silent mock)', () => {
    expect(() => extractor.extract('EMP_MAINT.fmb', Buffer.from('binary'))).toThrow(/frmf2xml/);
  });

  it('rejects invalid XML instead of simulating', () => {
    expect(() => extractor.extract('BROKEN.xml', Buffer.from('<Module><nope/></Module>'))).toThrow();
  });

  it('builds form/block/item/trigger/programunit nodes with structural edges', () => {
    const fragment = extractor.extract('emp_maint.xml', Buffer.from(FORM_XML), { defaultSchema: 'APP' });
    const ids = fragment.nodes.map((n) => n.id);

    expect(ids).toContain('form:APP.EMP_MAINT');
    expect(ids).toContain('block:APP.EMP_MAINT.EMPLOYEES');
    expect(ids).toContain('item:APP.EMP_MAINT.EMPLOYEES.EMP_ID');
    expect(ids).toContain('formtrigger:APP.EMP_MAINT.EMPLOYEES.EMP_ID#WHEN-VALIDATE-ITEM');
    expect(ids).toContain('formtrigger:APP.EMP_MAINT#WHEN-NEW-FORM-INSTANCE');
    expect(ids).toContain('programunit:APP.EMP_MAINT.INIT_FORM');

    // CONTAINS chain: form → block → item → trigger
    const contains = fragment.edges.filter((e) => e.relType === 'CONTAINS');
    expect(contains).toContainEqual(expect.objectContaining({ from: 'form:APP.EMP_MAINT', to: 'block:APP.EMP_MAINT.EMPLOYEES' }));
    expect(contains).toContainEqual(expect.objectContaining({ from: 'block:APP.EMP_MAINT.EMPLOYEES', to: 'item:APP.EMP_MAINT.EMPLOYEES.EMP_ID' }));
  });

  it('emits declarative BASED_ON ref and code-derived refs', () => {
    const fragment = extractor.extract('emp_maint.xml', Buffer.from(FORM_XML), { defaultSchema: 'APP' });

    const basedOn = fragment.refs.find((r) => r.relType === 'BASED_ON');
    expect(basedOn).toMatchObject({ fromId: 'block:APP.EMP_MAINT.EMPLOYEES', name: 'HR_EMPLOYEES', confidence: 1.0 });

    const call = fragment.refs.find((r) => r.relType === 'CALLS');
    expect(call).toMatchObject({ name: 'HR_PKG.VALIDATE_EMP' });

    const seq = fragment.refs.find((r) => r.relType === 'USES_SEQUENCE');
    expect(seq?.name).toBe('EMP_SEQ');

    const tableRefs = fragment.refs.filter((r) => r.relType === 'REFERENCES').map((r) => r.name);
    expect(tableRefs).toContain('DEPARTMENTS'); // block trigger
    expect(tableRefs).toContain('SYSTEM_LOG'); // program unit code
  });
});
