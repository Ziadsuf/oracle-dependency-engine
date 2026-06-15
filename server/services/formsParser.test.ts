import { describe, it, expect } from 'vitest';
import { FormsAnalyzerService } from './formsParser';

describe('FormsAnalyzerService', () => {
  const analyzer = new FormsAnalyzerService();

  it('should fallback to simulated binary parse for .fmb files', () => {
    const result = analyzer.analyze('TEST_FORM.fmb', Buffer.from('binary-data'));
    expect(result.type).toBe('Oracle Forms Binary (Simulated)');
    expect(result.formName).toBe('TEST_FORM');
    expect(result.blocks.length).toBeGreaterThan(0);
    expect(result.summary.totalBlocks).toBe(2);
  });

  it('should correctly parse valid Forms XML format', () => {
    const validXml = `
      <Module version="10.1.2.0.2">
        <FormModule Name="HR_DEPT">
          <Block Name="DEPARTMENTS">
            <Item Name="DEPT_ID" ItemType="Text Item" CanvasName="CV_MAIN">
              <Trigger Name="WHEN-VALIDATE-ITEM" TriggerText="BEGIN NULL; END;" />
            </Item>
            <Item Name="DEPT_NAME" ItemType="Text Item" CanvasName="CV_MAIN" />
            <Trigger Name="PRE-QUERY" TriggerText="BEGIN NULL; END;" />
          </Block>
          <Canvas Name="CV_MAIN" />
          <Trigger Name="WHEN-NEW-FORM-INSTANCE" TriggerText="BEGIN INIT; END;" />
          <ProgramUnit Name="INIT_DEPT" ProgramUnitType="Procedure" />
        </FormModule>
      </Module>
    `;

    const result = analyzer.analyze('HR_DEPT.xml', Buffer.from(validXml));
    
    expect(result.type).toBe('Oracle Forms XML');
    expect(result.formName).toBe('HR_DEPT');
    expect(result.blocks.length).toBe(1);
    expect(result.blocks[0].name).toBe('DEPARTMENTS');
    expect(result.blocks[0].items.length).toBe(2);
    expect(result.summary.totalTriggers).toBe(3); // 1 Item, 1 Block, 1 Form
    expect(result.canvases).toContain('CV_MAIN');
    expect(result.programUnits.length).toBe(1);
  });

  it('should fallback securely on invalid XML', () => {
    const result = analyzer.analyze('BROKEN.xml', Buffer.from('<Module><Invalid'));
    expect(result.type).toBe('Oracle Forms Binary (Simulated)'); // falls back to simulated
  });
});
