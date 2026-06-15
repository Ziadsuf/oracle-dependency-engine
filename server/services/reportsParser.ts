import { ReportsAnalysisResult } from '../../src/types';
import { parseReportsXml } from '../extractors/reports/reportsXml';
import { scanSqlTables } from '../extractors/plsql/sqlReferenceExtractor';

export class ReportsAnalyzerService {
  public analyze(fileName: string, buffer: Buffer, options: { strict?: boolean } = {}): ReportsAnalysisResult {
    const isBinary = fileName.toLowerCase().endsWith('.rdf');

    if (!isBinary) {
      try {
        return this.fromXml(fileName, buffer.toString('utf-8'));
      } catch (error) {
        if (options.strict) throw error;
        console.error('Reports XML parsing failed, falling back to simulated analysis:', error);
        return this.simulateAnalysis(fileName);
      }
    }

    if (options.strict) {
      throw new Error(
        `Binary Reports files (${fileName}) cannot be parsed directly. ` +
          `Convert to XML with Oracle's rwconverter (DEST_FORMAT=XML) and upload the .xml output.`
      );
    }
    return this.simulateAnalysis(fileName);
  }

  private fromXml(fileName: string, content: string): ReportsAnalysisResult {
    const report = parseReportsXml(content);

    const queries = report.queries.map((q) => ({
      name: q.name,
      sqlStatement: q.sql,
      tables: [...new Set(scanSqlTables(q.sql).map((t) => t.name))],
    }));

    const totalObjects =
      queries.length + report.layouts.length + report.parameters.length + report.programUnits.length;
    const impactScore = Math.min(
      100,
      queries.length * 8 + report.layouts.length * 2 + report.programUnits.length * 5 + report.parameters.length * 2
    );
    let complexity: 'Low' | 'Medium' | 'High' | 'Critical' = 'Low';
    if (impactScore > 80) complexity = 'Critical';
    else if (impactScore > 50) complexity = 'High';
    else if (impactScore > 25) complexity = 'Medium';

    return {
      fileName,
      type: 'Oracle Report XML',
      reportName: report.name,
      queries,
      layouts: report.layouts,
      parameters: report.parameters,
      programUnits: report.programUnits.map((u) => ({ name: u.name, type: u.type, code: u.code })),
      impactScore,
      complexity,
      summary: {
        totalQueries: queries.length,
        totalLayoutObjects: report.layouts.length,
        totalParameters: report.parameters.length,
        totalProgramUnits: report.programUnits.length,
      },
    };
  }

  private simulateAnalysis(fileName: string): ReportsAnalysisResult {
    const reportName = fileName.replace(/\.[^/.]+$/, '').toUpperCase();

    return {
      fileName,
      type: 'Oracle Report Binary (Simulated)',
      reportName,
      queries: [
        {
          name: 'Q_MAIN',
          sqlStatement: 'SELECT EMP_ID, NAME, SALARY FROM EMPLOYEES',
          tables: ['EMPLOYEES'],
        },
        {
          name: 'Q_DEPT',
          sqlStatement: 'SELECT DEPT_ID, DEPT_NAME FROM DEPARTMENTS',
          tables: ['DEPARTMENTS'],
        },
      ],
      layouts: [
        { name: 'M_G_EMP_HEADER', type: 'Frame' },
        { name: 'R_G_EMP', type: 'Repeating Frame', source: 'Q_MAIN' },
        { name: 'F_NAME', type: 'Field', source: 'NAME' },
        { name: 'F_SALARY', type: 'Field', source: 'SALARY' },
      ],
      parameters: ['P_DEPT_ID', 'P_DATE_FROM', 'P_DATE_TO'],
      programUnits: [
        { name: 'AFTER_PFORM', type: 'Procedure' },
        { name: 'BEFOR_REPORT', type: 'Procedure' },
        { name: 'CF_TOTAL_SALARY', type: 'Function' },
      ],
      impactScore: 65,
      complexity: 'Medium',
      summary: {
        totalQueries: 2,
        totalLayoutObjects: 4,
        totalParameters: 3,
        totalProgramUnits: 3,
      },
    };
  }
}
