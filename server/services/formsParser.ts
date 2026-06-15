import { XMLParser } from 'fast-xml-parser';
import { FormsAnalysisResult, FormBlock, FormTrigger, FormItem, FormProgramUnit } from '../../src/types';

export class FormsAnalyzerService {
  private parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseAttributeValue: true,
      isArray: (name) => {
        return ['Block', 'Item', 'Trigger', 'Canvas', 'LOV', 'ProgramUnit'].includes(name);
      }
    });
  }

  public analyze(fileName: string, fileBuffer: Buffer, options: { strict?: boolean } = {}): FormsAnalysisResult {
    const isXml = fileName.toLowerCase().endsWith('.xml') || fileName.toLowerCase().endsWith('.fmt');

    if (isXml) {
      try {
        return this.parseXml(fileName, fileBuffer.toString('utf-8'));
      } catch (error) {
        if (options.strict) throw error;
        console.error('XML Parsing Failed, falling back to heuristic/mock analyzer:', error);
        return this.simulateAnalysis(fileName);
      }
    } else {
      if (options.strict) {
        throw new Error(
          `Binary Forms files (${fileName}) cannot be parsed directly. ` +
            `Convert to XML with Oracle's frmf2xml/frmb2xml converter and upload the .xml output.`
        );
      }
      // Simulate binary FMB parsing since we can't do it directly in Node without Oracle tools
      return this.simulateAnalysis(fileName);
    }
  }

  private parseXml(fileName: string, xmlContent: string): FormsAnalysisResult {
    const jsonObj = this.parser.parse(xmlContent);
    const formModule = jsonObj?.Module?.FormModule || jsonObj?.FormModule;

    if (!formModule) {
      throw new Error("Invalid Oracle Forms XML format");
    }

    const formName = formModule.Name || 'UNKNOWN_FORM';
    
    const rawBlocks = formModule.Block || [];
    const rawCanvases = formModule.Canvas || [];
    const rawLovs = formModule.LOV || [];
    const rawProgramUnits = formModule.ProgramUnit || [];
    const rawFormTriggers = formModule.Trigger || [];

    const blocks: FormBlock[] = rawBlocks.map((b: any) => {
      const rawItems = b.Item || [];
      const rawBlockTriggers = b.Trigger || [];

      const items: FormItem[] = rawItems.map((i: any) => {
        const rawItemTriggers = i.Trigger || [];
        return {
          name: i.Name || 'Unnamed Item',
          type: i.ItemType || 'Unknown',
          canvas: i.CanvasName,
          triggers: rawItemTriggers.map((t: any) => ({
            name: t.Name,
            code: t.TriggerText,
            level: 'Item'
          }))
        };
      });

      return {
        name: b.Name || 'Unnamed Block',
        baseTable: b.QueryDataSourceName || undefined,
        items,
        triggers: rawBlockTriggers.map((t: any) => ({
          name: t.Name,
          code: t.TriggerText,
          level: 'Block'
        }))
      };
    });

    const formTriggers: FormTrigger[] = rawFormTriggers.map((t: any) => ({
      name: t.Name,
      code: t.TriggerText,
      level: 'Form'
    }));

    const programUnits: FormProgramUnit[] = rawProgramUnits.map((p: any) => ({
      name: p.Name,
      type: p.ProgramUnitType || 'Unknown',
      code: p.ProgramUnitText || undefined
    }));

    const canvases = rawCanvases.map((c: any) => c.Name);
    const lovs = rawLovs.map((l: any) => l.Name);

    // Calculate metrics
    let totalItems = 0;
    let totalTriggers = formTriggers.length;

    blocks.forEach(b => {
      totalItems += b.items.length;
      totalTriggers += b.triggers.length;
      b.items.forEach(i => {
        totalTriggers += i.triggers.length;
      });
    });

    const impactScore = Math.min(100, Math.floor((totalTriggers * 1.5) + (blocks.length * 5) + (programUnits.length * 3)));
    let complexity: 'Low' | 'Medium' | 'High' | 'Critical' = 'Low';
    
    if (impactScore > 80) complexity = 'Critical';
    else if (impactScore > 50) complexity = 'High';
    else if (impactScore > 25) complexity = 'Medium';

    return {
      fileName,
      type: 'Oracle Forms XML',
      formName,
      blocks,
      canvases,
      lovs,
      programUnits,
      formTriggers,
      impactScore,
      complexity,
      summary: {
        totalBlocks: blocks.length,
        totalItems,
        totalTriggers,
        totalCanvases: canvases.length,
        totalProgramUnits: programUnits.length
      }
    };
  }

  private simulateAnalysis(fileName: string): FormsAnalysisResult {
    // Generate realistic simulated data based on file name or random seeds
    const formName = fileName.replace(/\.[^/.]+$/, "").toUpperCase() || 'EMP_MAINT';
    
    const blocks: FormBlock[] = [
      {
        name: 'CTRL_BLOCK',
        items: [
          { name: 'BTN_SAVE', type: 'Push Button', canvas: 'CV_MAIN', triggers: [{ name: 'WHEN-BUTTON-PRESSED', level: 'Item' }] },
          { name: 'BTN_EXIT', type: 'Push Button', canvas: 'CV_MAIN', triggers: [{ name: 'WHEN-BUTTON-PRESSED', level: 'Item' }] }
        ],
        triggers: []
      },
      {
        name: 'EMPLOYEES',
        baseTable: 'HR_EMPLOYEES',
        items: [
          { name: 'EMP_ID', type: 'Text Item', canvas: 'CV_MAIN', triggers: [] },
          { name: 'FIRST_NAME', type: 'Text Item', canvas: 'CV_MAIN', triggers: [] },
          { name: 'LAST_NAME', type: 'Text Item', canvas: 'CV_MAIN', triggers: [] },
          { name: 'SALARY', type: 'Text Item', canvas: 'CV_MAIN', triggers: [{ name: 'WHEN-VALIDATE-ITEM', level: 'Item' }] },
          { name: 'DEPT_ID', type: 'List Item', canvas: 'CV_MAIN', triggers: [] }
        ],
        triggers: [
          { name: 'PRE-QUERY', level: 'Block' },
          { name: 'POST-QUERY', level: 'Block' }
        ]
      }
    ];

    const formTriggers: FormTrigger[] = [
      { name: 'WHEN-NEW-FORM-INSTANCE', level: 'Form' },
      { name: 'PRE-FORM', level: 'Form' },
      { name: 'POST-FORM', level: 'Form' },
      { name: 'ON-ERROR', level: 'Form' }
    ];

    const programUnits: FormProgramUnit[] = [
      { name: 'VALIDATE_SALARY', type: 'Procedure' },
      { name: 'CALCULATE_BONUS', type: 'Function' }
    ];

    const canvases = ['CV_MAIN', 'CV_DETAILS', 'CV_HIDDEN'];
    const lovs = ['LOV_DEPARTMENTS', 'LOV_JOBS'];

    return {
      fileName,
      type: 'Oracle Forms Binary (Simulated)',
      formName,
      blocks,
      canvases,
      lovs,
      programUnits,
      formTriggers,
      impactScore: 68,
      complexity: 'High',
      summary: {
        totalBlocks: 2,
        totalItems: 7,
        totalTriggers: 9,
        totalCanvases: 3,
        totalProgramUnits: 2
      }
    };
  }
}
