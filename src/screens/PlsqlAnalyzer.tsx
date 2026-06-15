import React, { useState, useMemo } from 'react';
import { Zap, Code, Layout, ArrowRight, Activity, Database, GitBranch } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { ReactFlow, MiniMap, Controls, Background, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { PlsqlAnalysisResult } from '../types';
import { cn } from '../lib/utils';
import { IngestButton } from '../components/IngestButton';

export function PlsqlAnalyzer() {
  const [code, setCode] = useState<string>("-- Upload or paste your PL/SQL package here\n\nCREATE OR REPLACE PACKAGE BODY HR_PKG AS\n\n  PROCEDURE validate_emp(p_emp_id IN NUMBER) IS\n    v_count NUMBER;\n  BEGIN\n    SELECT COUNT(*) INTO v_count FROM EMPLOYEES WHERE emp_id = p_emp_id;\n    IF v_count = 0 THEN\n      RAISE_APPLICATION_ERROR(-20001, 'Emp not found');\n    END IF;\n  END validate_emp;\n\n  FUNCTION get_salary(p_emp_id IN NUMBER) RETURN NUMBER IS\n    v_sal NUMBER;\n  BEGIN\n    SELECT salary INTO v_sal FROM HR_SALARY WHERE emp_id = p_emp_id;\n    RETURN v_sal;\n  EXCEPTION\n    WHEN NO_DATA_FOUND THEN\n      RETURN 0;\n  END get_salary;\n\nEND HR_PKG;");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<PlsqlAnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'dependencies'>('overview');

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    
    const blob = new Blob([code], { type: 'text/plain' });
    const file = new File([blob], "script.sql");
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/analyze/plsql', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      setResult(data);
      setActiveTab('overview');
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="p-8 h-full flex flex-col gap-6 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <header className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="heading-display text-3xl font-bold">PL/SQL Analyzer</h2>
          <p className="text-slate-400 mt-2">Lexical parsing and dependency extraction for PKS/PKB flows.</p>
        </div>
        <div className="flex items-center gap-4">
          {result && (
            <IngestButton
              getFile={() => new File([new Blob([code], { type: 'text/plain' })], result.fileName || 'script.sql')}
              endpoint="plsql"
            />
          )}
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 px-6 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-all transition-colors disabled:opacity-50 shadow-[0_0_15px_rgba(6,182,212,0.4)]"
          >
            {isAnalyzing ? <div className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" /> : <Zap size={18} />}
            Run Analysis
          </button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-5 gap-6 min-h-[500px] overflow-hidden">
        {/* Editor Pane (takes 2 cols on XL screens) */}
        <div className="xl:col-span-2 glass-panel overflow-hidden flex flex-col shadow-inner">
          <div className="bg-[#080a12] border-b border-glass-border p-3 flex items-center gap-2 text-sm text-slate-400">
            <Code size={16} className="text-cyan-400" />
            <span className="font-mono">PL/SQL Editor</span>
          </div>
          <div className="flex-1 bg-[#1e1e1e]">
            <Editor
              height="100%"
              defaultLanguage="sql"
              theme="vs-dark"
              value={code}
              onChange={(val) => setCode(val || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: 'JetBrains Mono',
                padding: { top: 16 },
                scrollBeyondLastLine: false,
                renderLineHighlight: 'none',
                overviewRulerBorder: false,
                hideCursorInOverviewRuler: true,
              }}
            />
          </div>
        </div>

        {/* Results Pane (takes 3 cols on XL screens) */}
        <div className="xl:col-span-3 glass-panel overflow-hidden flex flex-col border border-glass-border bg-[#0a0c16]/50">
          {!result ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center bg-[radial-gradient(#2dd4bf_1px,transparent_1px)] [background-size:20px_20px] bg-opacity-[0.03]">
              <GitBranch size={48} className="mb-4 opacity-20" />
              <p className="text-sm">Initiate the analysis engine to extract architectural models, cognitive complexity, and specific downstream database interactions.</p>
            </div>
          ) : (
            <>
              {/* Header Info */}
              <div className="p-6 border-b border-glass-border bg-[#02040a]/80 flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex flex-col items-center justify-center">
                    <Database size={20} className="text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="heading-display text-2xl">{result.packageName}</h3>
                    <div className="flex gap-2 mt-1">
                       <span className="text-xs font-mono text-slate-400 px-2 py-0.5 rounded bg-slate-900 border border-slate-800">{result.totalLines} LOC</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-8">
                  <div className="text-right">
                     <div className="text-xs text-slate-500 font-bold uppercase mb-1">Risk Level</div>
                     <div className={cn(
                        "font-bold text-lg",
                        result.riskLevel === 'Critical' ? 'text-rose-500' :
                        result.riskLevel === 'High' ? 'text-amber-500' :
                        result.riskLevel === 'Medium' ? 'text-yellow-400' : 'text-emerald-400'
                     )}>{result.riskLevel}</div>
                  </div>
                  <div className="w-px h-10 bg-slate-800"></div>
                  <div className="text-right">
                     <div className="text-xs text-slate-500 font-bold uppercase mb-1">Complexity Ratio</div>
                     <div className="font-display text-3xl font-bold text-white leading-none">{result.complexity}</div>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-glass-border bg-[#0a0c16]">
                 <button
                   onClick={() => setActiveTab('overview')}
                   className={cn("px-6 py-3 text-sm font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors", 
                     activeTab === 'overview' ? "border-cyan-400 text-cyan-400 bg-cyan-500/5" : "border-transparent text-slate-500 hover:text-slate-300")}
                 >
                   <Activity size={16}/> Overview
                 </button>
                 <button
                   onClick={() => setActiveTab('dependencies')}
                   className={cn("px-6 py-3 text-sm font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors", 
                     activeTab === 'dependencies' ? "border-cyan-400 text-cyan-400 bg-cyan-500/5" : "border-transparent text-slate-500 hover:text-slate-300")}
                 >
                   <ArrowRight size={16}/> Dependency Map
                 </button>
              </div>

              {/* Content Panel */}
              <div className="flex-1 overflow-hidden relative">
                {activeTab === 'overview' ? (
                  <div className="absolute inset-0 p-6 overflow-y-auto space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-900/40 p-5 rounded-lg border border-slate-800">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Export Procedures ({result.procedures.length})</h4>
                        {result.procedures.length === 0 ? <p className="text-sm font-mono text-slate-600">None detected</p> : (
                          <div className="space-y-3">
                            {result.procedures.map((p, i) => (
                              <div key={i} className="flex flex-col bg-slate-800/20 p-3 rounded border border-slate-800/50">
                                <div className="flex justify-between items-center mb-2">
                                  <span className="font-mono text-sm text-cyan-400">{p.name}</span>
                                  <span className="text-xs font-mono text-slate-500 bg-[#0a0c16] px-2 py-0.5 rounded border border-slate-800">V = {p.complexity}</span>
                                </div>
                                <div className="text-[10px] text-slate-500 flex flex-wrap gap-1">
                                  {p.dependencies.map((d, di) => (
                                    <span key={di} className="bg-slate-900 px-1 border border-slate-800 rounded">{d}</span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="bg-slate-900/40 p-5 rounded-lg border border-slate-800">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Export Functions ({result.functions.length})</h4>
                        {result.functions.length === 0 ? <p className="text-sm font-mono text-slate-600">None detected</p> : (
                          <div className="space-y-3">
                            {result.functions.map((f, i) => (
                              <div key={i} className="flex flex-col bg-slate-800/20 p-3 rounded border border-slate-800/50">
                                <div className="flex justify-between items-center mb-2">
                                  <span className="font-mono text-sm text-emerald-400">{f.name}</span>
                                  <span className="text-xs font-mono text-slate-500 bg-[#0a0c16] px-2 py-0.5 rounded border border-slate-800">V = {f.complexity}</span>
                                </div>
                                <div className="text-[10px] text-slate-500 flex flex-wrap gap-1">
                                  {f.dependencies.map((d, di) => (
                                    <span key={di} className="bg-slate-900 px-1 border border-slate-800 rounded">{d}</span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-900/40 p-5 rounded-lg border border-slate-800">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex justify-between items-center">
                        External Entity References 
                        <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-xs">{result.dependencies.length} tables found</span>
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {result.dependencies.map((d, i) => (
                          <span key={i} className="text-xs font-mono text-slate-300 bg-slate-800/50 border border-slate-700 px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-2">
                            <Database size={12} className="text-amber-500"/> {d}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <DependencyMap tabMode result={result} />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DependencyMap({ result }: { tabMode?: boolean, result: PlsqlAnalysisResult }) {
  const { nodes, edges } = useMemo(() => {
    const nds: any[] = [];
    const egs: any[] = [];

    // Package Core
    nds.push({
      id: 'pkg',
      position: { x: 300, y: 50 },
      data: { label: result.packageName },
      style: { background: '#0f172a', color: '#fff', border: '2px solid #0ea5e9', borderRadius: '8px', padding: '10px 20px', fontFamily: 'JetBrains Mono', fontSize: '14px', fontWeight: 'bold' }
    });

    let yOffsetList = 160;
    
    // Process Subprograms
    const allSubs = [...result.procedures, ...result.functions];
    const subprogramNodes: string[] = [];

    allSubs.forEach((sub, idx) => {
      const isProc = sub.type === 'PROCEDURE';
      const color = isProc ? '#06b6d4' : '#10b981'; // cyan vs emerald
      const sId = `sub_${sub.name}`;
      subprogramNodes.push(sId);

      nds.push({
        id: sId,
        position: { x: 100 + (idx * 200), y: yOffsetList },
        data: { label: sub.name },
        style: { background: '#0f172a', color: '#cbd5e1', border: `1px solid ${color}`, borderRadius: '4px', padding: '6px 12px', fontFamily: 'JetBrains Mono', fontSize: '12px' }
      });

      egs.push({
        id: `e_pkg_${sId}`,
        source: 'pkg',
        target: sId,
        style: { stroke: '#334155', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#334155' }
      });

      // Child table connections
      sub.dependencies.forEach((dep, dIdx) => {
        const dId = `dep_${dep}`;
        // If we haven't rendered the table node globally yet, render it
        if (!nds.find(n => n.id === dId)) {
          // find which index global dependency it is to place nicely at the bottom
          const globIdx = result.dependencies.indexOf(dep);
          nds.push({
            id: dId,
            position: { x: 100 + (globIdx * 200), y: yOffsetList + 180 },
            data: { label: dep },
            style: { background: '#1e293b', color: '#cbd5e1', border: '1px solid #f59e0b', borderRadius: '4px', padding: '6px 12px', fontFamily: 'JetBrains Mono', fontSize: '11px' }
          });
        }
        
        egs.push({
          id: `e_${sId}_${dId}`,
          source: sId,
          target: dId,
          animated: true,
          style: { stroke: '#475569', strokeWidth: 1.5, strokeDasharray: '4' },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#475569' }
        });
      });
    });

    return { nodes: nds, edges: egs };
  }, [result]);

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#2dd4bf_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none z-0"></div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        colorMode="dark"
        className="z-10"
        minZoom={0.2}
      >
        <Controls className="bg-slate-900 border-slate-800 fill-white" />
        <Background color="#334155" gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}
