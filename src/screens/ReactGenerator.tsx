import React, { useState } from 'react';
import { Code2, MonitorPlay, Zap, Copy, FileCode, CheckCircle2, Box, Send, Cpu, Download, Layers, Database } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { cn } from '../lib/utils';

export function ReactGenerator() {
  const [sourceData, setSourceData] = useState<string>('EMPLOYEES');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<{
    component: string;
    hook: string;
    types: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<'component' | 'hook' | 'types'>('component');
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!sourceData.trim()) return;
    setIsGenerating(true);

    try {
      const response = await fetch('/api/generate/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityName: sourceData })
      });
      const data = await response.json();
      setGeneratedContent(data);
      setActiveTab('component');
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (generatedContent) {
      navigator.clipboard.writeText(generatedContent[activeTab]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-8 h-full flex flex-col gap-6 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <header className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="heading-display text-3xl font-bold flex items-center gap-3">
             <Code2 className="text-cyan-400" size={28}/> 
             React Code Generator
          </h2>
          <p className="text-slate-400 mt-2">Generate React 19 (Material UI) architecture boilerplate from Oracle tables/forms.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 flex-1 min-h-[500px]">
        {/* Left column: Input */}
        <div className="xl:col-span-3 flex flex-col gap-6">
           <div className="glass-panel p-5 flex flex-col h-full border border-slate-800/60 bg-[#0a0c16]/50">
             <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
               <Cpu size={14} className="text-cyan-500"/>
               Source Configuration
             </h3>
             
             <div className="space-y-4 flex-1">
               <div>
                  <label className="text-xs text-slate-500 font-mono mb-2 block">Source Entity / Form block (e.g. EMPLOYEES)</label>
                  <input 
                    type="text"
                    value={sourceData}
                    onChange={(e) => setSourceData(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all font-mono"
                    placeholder="Enter table or block name..."
                  />
               </div>
               
               <div className="pt-4 border-t border-slate-800/50">
                  <div className="text-xs text-slate-500 font-mono mb-3 block">Generation Targets</div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input type="checkbox" checked readOnly className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500" />
                      React 19 Components (MUI)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input type="checkbox" checked readOnly className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500" />
                      React Hooks (Data Fetching)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input type="checkbox" checked readOnly className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500" />
                      TypeScript Interfaces
                    </label>
                  </div>
               </div>
             </div>

             <button 
                onClick={handleGenerate}
                disabled={isGenerating || !sourceData.trim()}
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-900 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all mt-6 shadow-[0_0_15px_rgba(6,182,212,0.3)] disabled:opacity-50"
             >
                {isGenerating ? <div className="w-5 h-5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" /> : <Zap size={18} />}
                Generate Code
             </button>
           </div>
        </div>

        {/* Right column: Output */}
        <div className="xl:col-span-9 glass-panel flex flex-col border border-slate-800/60 overflow-hidden bg-[#05070e]">
          {!generatedContent ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 bg-[radial-gradient(#2dd4bf_1px,transparent_1px)] [background-size:20px_20px] bg-opacity-[0.02]">
              <MonitorPlay size={48} className="mb-4 opacity-20" />
              <p className="text-sm">Provide a source entity configuration to generate scaffolding.</p>
            </div>
          ) : (
            <>
              {/* Output Header */}
              <div className="flex border-b border-glass-border bg-[#0a0c16] items-center justify-between pr-4">
                 <div className="flex flex-1 overflow-x-auto no-scrollbar">
                   <button
                     onClick={() => setActiveTab('component')}
                     className={cn("px-5 py-3 text-sm font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap", 
                       activeTab === 'component' ? "border-cyan-400 text-cyan-400 bg-cyan-500/5" : "border-transparent text-slate-500 hover:text-slate-300")}
                   >
                     <FileCode size={16}/> Component.tsx
                   </button>
                   <button
                     onClick={() => setActiveTab('hook')}
                     className={cn("px-5 py-3 text-sm font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap", 
                       activeTab === 'hook' ? "border-cyan-400 text-cyan-400 bg-cyan-500/5" : "border-transparent text-slate-500 hover:text-slate-300")}
                   >
                     <Box size={16}/> useFeature.ts
                   </button>
                   <button
                     onClick={() => setActiveTab('types')}
                     className={cn("px-5 py-3 text-sm font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap", 
                       activeTab === 'types' ? "border-cyan-400 text-cyan-400 bg-cyan-500/5" : "border-transparent text-slate-500 hover:text-slate-300")}
                   >
                     <Code2 size={16}/> types.ts
                   </button>
                 </div>
                 
                 <div className="flex gap-2">
                   <button 
                     onClick={handleCopy}
                     className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-lg transition-colors flex items-center justify-center shrink-0"
                     title="Copy Code"
                   >
                     {copied ? <CheckCircle2 size={16} className="text-emerald-400" /> : <Copy size={16} />}
                   </button>
                 </div>
              </div>

              {/* Editor Panel */}
              <div className="flex-1 bg-[#1e1e1e] relative">
                <Editor
                  height="100%"
                  language="typescript"
                  theme="vs-dark"
                  value={generatedContent[activeTab]}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: 'JetBrains Mono',
                    padding: { top: 16 },
                    scrollBeyondLastLine: false,
                    readOnly: true,
                    renderLineHighlight: 'none',
                    overviewRulerBorder: false,
                    hideCursorInOverviewRuler: true,
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
