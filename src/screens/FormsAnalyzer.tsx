import React, { useState, useRef, useMemo } from 'react';
import { UploadCloud, FileCode, CheckCircle, Database, Layout, Code2, AlertTriangle, ArrowRight, Layers, FileJson, Activity } from 'lucide-react';
import { ReactFlow, MiniMap, Controls, Background, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { FormsAnalysisResult, FormBlock, FormTrigger, FormItem } from '../types';
import { cn } from '../lib/utils';
import { IngestButton } from '../components/IngestButton';

export function FormsAnalyzer() {
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<FormsAnalysisResult | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'tree' | 'map'>('overview');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLastFile(file);
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/analyze/forms', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      setResult(data);
      setActiveTab('overview');
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="p-8 space-y-6 flex flex-col h-full overflow-hidden max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <header className="flex-shrink-0">
        <h2 className="heading-display text-3xl font-bold">Forms Analyzer</h2>
        <p className="text-slate-400 mt-2">Upload Oracle Forms (FMB/XML) for deep component extraction.</p>
      </header>

      {!result ? (
        <div 
          className={cn(
            "glass-panel border-dashed border-2 flex flex-col items-center justify-center p-16 text-center transition-all cursor-pointer h-96",
            isUploading ? "border-cyan-500/50 bg-cyan-500/5" : "border-slate-800 hover:border-slate-600 hover:bg-white-[0.02]"
          )}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".fmb,.xml,.fmt" 
            onChange={handleFileUpload} 
          />
          {isUploading ? (
            <div className="animate-pulse flex flex-col items-center">
              <div className="w-12 h-12 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin mb-4" />
              <p className="text-cyan-500 font-medium tracking-wide">Extracting Binary Metadata Engine...</p>
            </div>
          ) : (
            <>
              <div className="w-20 h-20 rounded-full bg-dark-surface flex items-center justify-center mb-6 shadow-inner border border-slate-800">
                <UploadCloud size={40} className="text-slate-400" />
              </div>
              <h3 className="heading-display text-2xl mb-3 text-white">Drag & Drop FMB/XML</h3>
              <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed">
                Upload your Oracle Forms binaries to extract blocks, items, triggers, and calculate deterministic migration complexity.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden glass-panel border border-glass-border">
          {/* Result Header */}
          <div className="p-6 border-b border-glass-border bg-[#0a0c16]/50 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <FileJson size={24} className="text-cyan-400" />
              </div>
              <div>
                <h3 className="heading-display text-2xl">{result.formName}</h3>
                <div className="flex items-center gap-3 mt-1 text-xs">
                  <span className="font-mono text-slate-400">{result.fileName}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono border border-slate-700">{result.type}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-8">
              <div className="text-right">
                <div className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-1">Complexity</div>
                <div className={cn(
                  "font-bold text-lg",
                  result.complexity === 'Critical' ? "text-rose-400" :
                  result.complexity === 'High' ? "text-amber-400" :
                  "text-emerald-400"
                )}>
                  {result.complexity}
                </div>
              </div>
              <div className="w-px h-10 bg-slate-800"></div>
              <IngestButton getFile={() => lastFile} endpoint="forms" />
              <div className="w-px h-10 bg-slate-800"></div>
              <div className="text-right">
                <div className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-1">Impact Score</div>
                <div className="font-display text-3xl font-bold text-white leading-none">
                  {result.impactScore}
                </div>
              </div>
              <button 
                onClick={() => setResult(null)}
                className="px-4 py-2 rounded border border-slate-700 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                Close Analysis
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex px-6 border-b border-glass-border bg-[#0a0c16]/80 flex-shrink-0">
            <TabButton 
              active={activeTab === 'overview'} 
              onClick={() => setActiveTab('overview')}
              icon={<Activity size={16} />}
              label="Overview"
            />
            <TabButton 
              active={activeTab === 'tree'} 
              onClick={() => setActiveTab('tree')}
              icon={<Layers size={16} />}
              label="Object Tree"
            />
            <TabButton 
              active={activeTab === 'map'} 
              onClick={() => setActiveTab('map')}
              icon={<ArrowRight size={16} />}
              label="Dependency Map"
            />
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden relative bg-[#02040a]/50">
            {activeTab === 'overview' && <OverviewTab result={result} />}
            {activeTab === 'tree' && <ObjectTreeTab result={result} />}
            {activeTab === 'map' && <DependencyMapTab result={result} />}
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors",
        active 
          ? "border-cyan-400 text-cyan-400 bg-cyan-400/5" 
          : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function OverviewTab({ result }: { result: FormsAnalysisResult }) {
  return (
    <div className="p-6 overflow-y-auto h-full space-y-6">
      <div className="grid grid-cols-5 gap-4">
        <SummaryCard label="Data Blocks" value={result.summary.totalBlocks} icon={<Database size={18}/>} />
        <SummaryCard label="Items" value={result.summary.totalItems} icon={<Layout size={18}/>} />
        <SummaryCard label="Triggers" value={result.summary.totalTriggers} icon={<Activity size={18}/>} />
        <SummaryCard label="Canvases" value={result.summary.totalCanvases} icon={<Layers size={18}/>} />
        <SummaryCard label="Program Units" value={result.summary.totalProgramUnits} icon={<Code2 size={18}/>} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-slate-900/50 rounded-xl border border-slate-800/50 p-5">
          <h4 className="text-sm font-bold text-slate-300 uppercase tracking-widest mb-4 flex items-center gap-2">
            Form-Level Triggers
          </h4>
          {result.formTriggers.length === 0 ? (
            <p className="text-sm text-slate-500 font-mono">No form-level triggers found.</p>
          ) : (
            <ul className="space-y-2">
              {result.formTriggers.map((t, idx) => (
                <li key={idx} className="flex justify-between items-center text-sm py-2 border-b border-slate-800/50 last:border-0">
                  <span className="font-mono text-emerald-400 text-xs">{t.name}</span>
                  <span className="text-xs text-slate-500">Form Event</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-slate-900/50 rounded-xl border border-slate-800/50 p-5">
          <h4 className="text-sm font-bold text-slate-300 uppercase tracking-widest mb-4 flex items-center gap-2">
            Program Units
          </h4>
          {result.programUnits.length === 0 ? (
            <p className="text-sm text-slate-500 font-mono">No program units found.</p>
          ) : (
            <ul className="space-y-2">
              {result.programUnits.map((p, idx) => (
                <li key={idx} className="flex justify-between items-center text-sm py-2 border-b border-slate-800/50 last:border-0">
                  <span className="font-mono text-cyan-400 text-xs">{p.name}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 font-mono border border-slate-700">{p.type}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string, value: number, icon: React.ReactNode }) {
  return (
    <div className="bg-slate-900/40 rounded-xl border border-slate-800 p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between text-slate-500 mb-2">
        <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="text-3xl font-light text-white">{value}</div>
    </div>
  );
}

function ObjectTreeTab({ result }: { result: FormsAnalysisResult }) {
  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="space-y-4 max-w-4xl">
        {result.blocks.map((block, bIdx) => (
          <div key={bIdx} className="bg-slate-900/40 rounded-lg border border-slate-800 overflow-hidden">
            <div className="px-4 py-3 bg-slate-800/20 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Database size={16} className="text-cyan-500" />
                <span className="font-bold text-slate-200">BLOCK: {block.name}</span>
              </div>
              {block.baseTable && (
                <span className="text-xs text-slate-500 font-mono bg-slate-900 px-2 py-1 rounded border border-slate-800">
                  Base Table: <span className="text-cyan-400">{block.baseTable}</span>
                </span>
              )}
            </div>
            
            <div className="p-4 pl-10 space-y-4">
              {block.triggers.length > 0 && (
                <div>
                  <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Block Triggers</h5>
                  <div className="flex flex-wrap gap-2">
                    {block.triggers.map((t, i) => (
                      <span key={i} className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-mono">
                        {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <Layout size={12}/> Items ({block.items.length})
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {block.items.map((item, iIdx) => (
                    <div key={iIdx} className="flex flex-col p-2 rounded bg-slate-800/20 border border-slate-800/50">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-mono text-xs text-slate-300">{item.name}</span>
                        <span className="text-[10px] text-slate-500">{item.type}</span>
                      </div>
                      {item.triggers.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.triggers.map((t, ti) => (
                            <span key={ti} className="text-[9px] text-emerald-400 font-mono before:content-['⚡'] before:mr-1">
                              {t.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DependencyMapTab({ result }: { result: FormsAnalysisResult }) {
  const { nodes, edges } = useMemo(() => {
    const nds: any[] = [];
    const egs: any[] = [];

    // Form Node
    nds.push({
      id: 'form',
      position: { x: 400, y: 50 },
      data: { label: result.formName },
      style: { background: '#0f172a', color: '#fff', border: '2px solid #0ea5e9', borderRadius: '8px', padding: '10px 20px', fontFamily: 'JetBrains Mono', fontSize: '14px', fontWeight: 'bold' }
    });

    let yOffset = 180;
    let xOffset = 100;

    // Blocks
    result.blocks.forEach((block, idx) => {
      const bId = `blk_${block.name}`;
      nds.push({
        id: bId,
        position: { x: xOffset, y: yOffset },
        data: { label: `BLOCK: ${block.name}` },
        style: { background: '#0f172a', color: '#fff', border: '2px solid #10b981', borderRadius: '4px', padding: '8px 16px', fontFamily: 'JetBrains Mono', fontSize: '12px' }
      });
      egs.push({
        id: `e_form_${bId}`,
        source: 'form',
        target: bId,
        animated: true,
        style: { stroke: '#475569', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#475569' }
      });

      // Show first 3 items maximum to avoid massive graph
      block.items.slice(0, 3).forEach((item, i) => {
        const iId = `${bId}_item_${item.name}`;
        nds.push({
          id: iId,
          position: { x: xOffset + (i * 120) - 100, y: yOffset + 100 },
          data: { label: item.name },
          style: { background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '4px', padding: '4px 8px', fontFamily: 'JetBrains Mono', fontSize: '10px' }
        });
        egs.push({
          id: `e_${bId}_${iId}`,
          source: bId,
          target: iId,
          style: { stroke: '#334155', strokeWidth: 1 },
        });
      });

      xOffset += 350;
    });

    return { nodes: nds, edges: egs };
  }, [result]);

  return (
    <div className="w-full h-full relative">
      <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none z-0"></div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        colorMode="dark"
        className="z-10 absolute inset-0"
        minZoom={0.2}
      >
        <Controls className="bg-slate-900 border-slate-800 fill-white" />
        <Background color="#334155" gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}
