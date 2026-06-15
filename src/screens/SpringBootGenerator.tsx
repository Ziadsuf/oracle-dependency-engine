import React, { useState } from 'react';
import { Database, Zap, Copy, CheckCircle2, Send, Layers, Server, Box, Codepen, Download } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { cn } from '../lib/utils';

export function SpringBootGenerator() {
  const [sourceData, setSourceData] = useState<string>('EMPLOYEES');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<{
    controller: string;
    service: string;
    repository: string;
    entity: string;
    dto: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<'controller' | 'service' | 'repository' | 'entity' | 'dto'>('controller');
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!sourceData.trim()) return;
    setIsGenerating(true);

    try {
      const response = await fetch('/api/generate/springboot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityName: sourceData })
      });
      const data = await response.json();
      setGeneratedContent(data);
      setActiveTab('controller');
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
             <Server className="text-emerald-400" size={28}/> 
             Spring Boot Generator
          </h2>
          <p className="text-slate-400 mt-2">Generate production-grade Spring Boot 3 REST APIs from Oracle Database tables.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 flex-1 min-h-[500px]">
        {/* Left column: Input */}
        <div className="xl:col-span-3 flex flex-col gap-6">
           <div className="glass-panel p-5 flex flex-col h-full border border-slate-800/60 bg-[#0a0c16]/50">
             <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
               <Database size={14} className="text-emerald-500"/>
               Oracle Source Definition
             </h3>
             
             <div className="space-y-4 flex-1">
               <div>
                  <label className="text-xs text-slate-500 font-mono mb-2 block">Table Name (e.g. EMPLOYEES)</label>
                  <input 
                    type="text"
                    value={sourceData}
                    onChange={(e) => setSourceData(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                    placeholder="Enter table name..."
                  />
               </div>
               
               <div className="pt-4 border-t border-slate-800/50">
                  <div className="text-xs text-slate-500 font-mono mb-3 block">Generation Scope</div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input type="checkbox" checked readOnly className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500" />
                      JPA Entity
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input type="checkbox" checked readOnly className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500" />
                      Spring Data Repository
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input type="checkbox" checked readOnly className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500" />
                      Data Transfer Object (DTO)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input type="checkbox" checked readOnly className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500" />
                      Business Service Layer
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input type="checkbox" checked readOnly className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500" />
                      REST Controller
                    </label>
                  </div>
               </div>
             </div>

             <button 
                onClick={handleGenerate}
                disabled={isGenerating || !sourceData.trim()}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all mt-6 shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:opacity-50"
             >
                {isGenerating ? <div className="w-5 h-5 border-2 border-emerald-900/30 border-t-emerald-900 rounded-full animate-spin" /> : <Zap size={18} />}
                Generate API Base
             </button>
           </div>
        </div>

        {/* Right column: Output */}
        <div className="xl:col-span-9 glass-panel flex flex-col border border-slate-800/60 overflow-hidden bg-[#05070e]">
          {!generatedContent ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:20px_20px] bg-opacity-[0.02]">
              <Codepen size={48} className="mb-4 opacity-20 text-emerald-500" />
              <p className="text-sm">Enter a table name to orchestrate the Java architecture layout.</p>
            </div>
          ) : (
            <>
              {/* Output Header */}
              <div className="flex border-b border-glass-border bg-[#0a0c16] items-center justify-between pr-4">
                 <div className="flex flex-1 overflow-x-auto no-scrollbar">
                   <button
                     onClick={() => setActiveTab('controller')}
                     className={cn("px-5 py-3 text-sm font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap", 
                       activeTab === 'controller' ? "border-emerald-400 text-emerald-400 bg-emerald-500/5" : "border-transparent text-slate-500 hover:text-slate-300")}
                   >
                     <Send size={16}/> Controller.java
                   </button>
                   <button
                     onClick={() => setActiveTab('service')}
                     className={cn("px-5 py-3 text-sm font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap", 
                       activeTab === 'service' ? "border-emerald-400 text-emerald-400 bg-emerald-500/5" : "border-transparent text-slate-500 hover:text-slate-300")}
                   >
                     <Layers size={16}/> Service.java
                   </button>
                   <button
                     onClick={() => setActiveTab('repository')}
                     className={cn("px-5 py-3 text-sm font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap", 
                       activeTab === 'repository' ? "border-emerald-400 text-emerald-400 bg-emerald-500/5" : "border-transparent text-slate-500 hover:text-slate-300")}
                   >
                     <Database size={16}/> Repository.java
                   </button>
                   <button
                     onClick={() => setActiveTab('entity')}
                     className={cn("px-5 py-3 text-sm font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap", 
                       activeTab === 'entity' ? "border-emerald-400 text-emerald-400 bg-emerald-500/5" : "border-transparent text-slate-500 hover:text-slate-300")}
                   >
                     <Box size={16}/> Entity.java
                   </button>
                   <button
                     onClick={() => setActiveTab('dto')}
                     className={cn("px-5 py-3 text-sm font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap", 
                       activeTab === 'dto' ? "border-emerald-400 text-emerald-400 bg-emerald-500/5" : "border-transparent text-slate-500 hover:text-slate-300")}
                   >
                     <Codepen size={16}/> DTO.java
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
                  language="java"
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
