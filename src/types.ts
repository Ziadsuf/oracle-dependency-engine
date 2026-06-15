export interface DashboardStats {
  totalForms: number;
  totalReports: number;
  totalPackages: number;
  totalTables: number;
  migrationReadiness: number;
  technicalDebt: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  group: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface FormTrigger {
  name: string;
  code?: string;
  level: 'Form' | 'Block' | 'Item';
}

export interface FormItem {
  name: string;
  type: string;
  canvas?: string;
  triggers: FormTrigger[];
}

export interface FormBlock {
  name: string;
  baseTable?: string;
  items: FormItem[];
  triggers: FormTrigger[];
}

export interface FormProgramUnit {
  name: string;
  type: 'Procedure' | 'Function' | 'Package Spec' | 'Package Body';
  code?: string;
}

export interface FormsAnalysisResult {
  fileName: string;
  type: string;
  formName: string;
  blocks: FormBlock[];
  canvases: string[];
  lovs: string[];
  programUnits: FormProgramUnit[];
  formTriggers: FormTrigger[];
  impactScore: number;
  complexity: 'Low' | 'Medium' | 'High' | 'Critical';
  summary: {
    totalBlocks: number;
    totalItems: number;
    totalTriggers: number;
    totalCanvases: number;
    totalProgramUnits: number;
  }
}

export interface PlsqlSubprogram {
  name: string;
  type: 'PROCEDURE' | 'FUNCTION';
  startLine: number;
  endLine: number;
  complexity: number;
  dependencies: string[];
}

export interface PlsqlAnalysisResult {
  fileName: string;
  packageName: string;
  procedures: PlsqlSubprogram[];
  functions: PlsqlSubprogram[];
  dependencies: string[];
  totalLines: number;
  complexity: number;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
}

export interface DbObject {
  name: string;
  type: string;
  linesOfCode?: number;
  dependencies: number;
  status: 'VALID' | 'INVALID';
  lastDdlTime?: string;
}

export interface MetadataDiscoveryResult {
  fileName?: string;
  totalObjects: number;
  invalidObjects: number;
  schemas: string[];
  objectsByType: Record<string, number>;
  objects: DbObject[];
  effortEstimation: {
    hours: number;
    complexity: 'Low' | 'Medium' | 'High' | 'Critical';
  };
}

export interface ReportQuery {
  name: string;
  sqlStatement?: string;
  tables: string[];
}

export interface ReportLayoutObject {
  name: string;
  type: 'Frame' | 'Repeating Frame' | 'Field' | 'Boilerplate';
  source?: string;
}

export interface ReportsAnalysisResult {
  fileName: string;
  type: string;
  reportName: string;
  queries: ReportQuery[];
  layouts: ReportLayoutObject[];
  parameters: string[];
  programUnits: FormProgramUnit[];
  impactScore: number;
  complexity: 'Low' | 'Medium' | 'High' | 'Critical';
  summary: {
    totalQueries: number;
    totalLayoutObjects: number;
    totalParameters: number;
    totalProgramUnits: number;
  }
}
