import React, { useState, useRef, useMemo } from 'react';
import { UploadCloud, Database, Layout, Code2, ArrowRight, Layers, FileJson, Activity, FileText } from 'lucide-react';
import { ReactFlow, Controls, Background, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { ReportsAnalysisResult } from '../types';
import { cn } from '../lib/utils';
import { IngestButton } from '../components/IngestButton';

export function ReportsAnalyzer() {
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ReportsAnalysisResult | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'queries' | 'layouts'>('overview');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLastFile(file);
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/analyze/reports', {
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
        <h2 className="heading-display text-3xl font-bold flex items-center gap-3">
          <FileText className="text-indigo-400" size={32} />
          Reports Migration Engine
        </h2>
        <p className="text-slate-400 mt-2">Upload Oracle Reports (RDF/XML) for deep structural extraction.</p>
      </header>

      {!result ? (
        <div 
          className={cn(
            "glass-panel border-dashed border-2 flex flex-col items-center justify-center p-16 text-center transition-all cursor-pointer h-96",
            isUploading ? "border-indigo-500/50 bg-indigo-500/5" : "border-slate-800 hover:border-slate-600 hover:bg-white-[0.02]"
          )}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".rdf,.xml,.jsp" 
            onChange={handleFileUpload} 
          />
          {isUploading ? (
            <div className="animate-pulse flex flex-col items-center">
              <div className="w-12 h-12 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin mb-4" />
              <p className="text-indigo-500 font-medium tracking-wide">Extracting Report Data Model...</p>
            </div>
          ) : (
            <>
              <div className="w-20 h-20 rounded-full bg-dark-surface flex items-center justify-center mb-6 shadow-inner border border-slate-800">
                <UploadCloud size={40} className="text-slate-400" />
              </div>
              <h3 className="heading-display text-2xl mb-3 text-white">Drag & Drop RDF/XML</h3>
              <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed">
                Upload your Oracle Reports binaries to extract data models, layout structures, program units, and calculate migration complexity to React/Jasper.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden glass-panel border border-glass-border">
          <div className="p-6 border-b border-glass-border bg-[#0a0c16]/50 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <FileJson size={24} className="text-indigo-400" />
              </div>
              <div>
                <h3 className="heading-display text-2xl">{result.reportName}</h3>
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
              <IngestButton getFile={() => lastFile} endpoint="reports" />
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

          <div className="flex px-6 border-b border-glass-border bg-[#0a0c16]/80 flex-shrink-0">
            <TabButton 
              active={activeTab === 'overview'} 
              onClick={() => setActiveTab('overview')}
              icon={<Activity size={16} />}
              label="Overview"
            />
            <TabButton 
              active={activeTab === 'queries'} 
              onClick={() => setActiveTab('queries')}
              icon={<Database size={16} />}
              label="Data Model"
            />
            <TabButton 
              active={activeTab === 'layouts'} 
              onClick={() => setActiveTab('layouts')}
              icon={<Layout size={16} />}
              label="Layouts"
            />
          </div>

          <div className="flex-1 overflow-hidden relative bg-[#02040a]/50">
            {activeTab === 'overview' && <OverviewTab result={result} />}
            {activeTab === 'queries' && <DataModelTab result={result} />}
            {activeTab === 'layouts' && <LayoutTab result={result} />}
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
          ? "border-indigo-400 text-indigo-400 bg-indigo-400/5" 
          : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function OverviewTab({ result }: { result: ReportsAnalysisResult }) {
  return (
    <div className="p-6 overflow-y-auto h-full space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard label="Queries" value={result.summary.totalQueries} icon={<Database size={18}/>} />
        <SummaryCard label="Layout Objects" value={result.summary.totalLayoutObjects} icon={<Layout size={18}/>} />
        <SummaryCard label="Parameters" value={result.summary.totalParameters} icon={<Layers size={18}/>} />
        <SummaryCard label="Program Units" value={result.summary.totalProgramUnits} icon={<Code2 size={18}/>} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-slate-900/50 rounded-xl border border-slate-800/50 p-5">
          <h4 className="text-sm font-bold text-slate-300 uppercase tracking-widest mb-4 flex items-center gap-2">
            Parameters
          </h4>
          {result.parameters.length === 0 ? (
            <p className="text-sm text-slate-500 font-mono">No parameters found.</p>
          ) : (
            <ul className="space-y-2">
              {result.parameters.map((p, idx) => (
                <li key={idx} className="flex justify-between items-center text-sm py-2 border-b border-slate-800/50 last:border-0">
                  <span className="font-mono text-indigo-400 text-xs">{p}</span>
                  <span className="text-[10px] text-slate-500 uppercase">Input Param</span>
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

function DataModelTab({ result }: { result: ReportsAnalysisResult }) {
  return (
    <div className="p-6 overflow-y-auto h-full space-y-4">
      {result.queries.map((q, idx) => (
        <div key={idx} className="bg-slate-900/40 rounded-lg border border-slate-800 overflow-hidden">
          <div className="px-4 py-3 bg-slate-800/30 border-b border-slate-800 flex items-center justify-between">
            <span className="font-bold text-slate-200 uppercase flex items-center gap-2">
              <Database size={14} className="text-indigo-400" />
              {q.name}
            </span>
            <div className="flex gap-2">
              {q.tables.map((t, i) => (
                <span key={i} className="text-xs text-slate-400 font-mono bg-slate-900 px-2 py-1 rounded border border-slate-700">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="p-4 bg-[#0a0c16]">
             <pre className="text-xs text-emerald-400 font-mono whitespace-pre-wrap">{q.sqlStatement}</pre>
          </div>
        </div>
      ))}
    </div>
  );
}

function LayoutTab({ result }: { result: ReportsAnalysisResult }) {
  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="bg-slate-900/40 rounded-lg border border-slate-800 overflow-hidden max-w-4xl">
         <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/50 text-slate-400 border-b border-slate-800 text-xs uppercase tracking-wider">
                <th className="p-4 font-medium">Layout Name</th>
                <th className="p-4 font-medium">Type</th>
                <th className="p-4 font-medium">Source Column / Query</th>
              </tr>
            </thead>
            <tbody className="text-sm">
               {result.layouts.map((l, idx) => (
                 <tr key={idx} className="border-b border-slate-800/50 last:border-0">
                   <td className="p-4 font-mono text-slate-200">{l.name}</td>
                   <td className="p-4">
                     <span className="px-2 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] uppercase rounded">
                       {l.type}
                     </span>
                   </td>
                   <td className="p-4 font-mono text-slate-500">{l.source || '-'}</td>
                 </tr>
               ))}
            </tbody>
         </table>
      </div>
    </div>
  );
}
