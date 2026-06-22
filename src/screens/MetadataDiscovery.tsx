import React, { useState } from 'react';
import { Database, Search, Upload, RefreshCw, Layers, ShieldAlert, Code2, Play, Plus, Server } from 'lucide-react';
import { cn } from '../lib/utils';
import type { MetadataDiscoveryResult } from '../types';
import { apiFetch } from '../lib/api';

export function MetadataDiscovery() {
  const [result, setResult] = useState<MetadataDiscoveryResult | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'connect'>('connect');
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [schemasInput, setSchemasInput] = useState('DVSYS, LBACSYS, DVF, DBSFWUSER, REMOTE_SCHEDULER_AGENT');
  const [error, setError] = useState<string | null>(null);
  // When on, the graph is wiped before ingesting so the result reflects exactly this source.
  const [replaceGraph, setReplaceGraph] = useState(true);

  // After any ingestion, load the real summary from the graph and show it.
  const loadSummary = async () => {
    const res = await fetch('/api/v2/discovery/summary');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load discovery summary');
    setResult(data);
  };

  const clearIfReplacing = async () => {
    if (!replaceGraph) return;
    const res = await apiFetch('/api/v2/graph', { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || (res.status === 401 ? 'Unauthorized — set your API token' : 'Failed to clear graph'));
    }
  };

  // Live Oracle discovery: hits ALL_OBJECTS / ALL_DEPENDENCIES via the engine.
  const handleLiveDiscover = async () => {
    setIsDiscovering(true);
    setError(null);
    try {
      await clearIfReplacing();
      const schemas = schemasInput.split(',').map(s => s.trim()).filter(Boolean);
      const res = await apiFetch('/api/v2/ingest/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schemas }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || (res.status === 401 ? 'Unauthorized — set your API token' : 'Live discovery failed'));
      await loadSummary();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsDiscovering(false);
    }
  };

  // DDL upload: parses real CREATE statements into the graph, then summarizes.
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsDiscovering(true);
    setError(null);
    try {
      await clearIfReplacing();
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetch('/api/v2/ingest/schema', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || (res.status === 401 ? 'Unauthorized — set your API token' : 'DDL ingestion failed'));
      await loadSummary();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsDiscovering(false);
      e.target.value = ''; // allow re-uploading the same file
    }
  };

  const filteredObjects = result?.objects?.filter(o =>
    (!selectedType || o.type === selectedType) &&
    (o.name.toLowerCase().includes(search.toLowerCase()) || o.type.toLowerCase().includes(search.toLowerCase()))
  ) || [];

  return (
    <div className="p-8 h-full flex flex-col gap-6 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <header className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="heading-display text-3xl font-bold flex items-center gap-3">
             <Database className="text-cyan-400" size={28}/>
             Metadata Discovery Engine
          </h2>
          <p className="text-slate-400 mt-2">Connect to the live Oracle Data Dictionary or upload DDL — objects land in the dependency graph.</p>
        </div>
        {result && (
          <button
            onClick={() => { setResult(null); setSelectedType(null); setSearch(''); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
          >
            <RefreshCw size={14} /> New Discovery
          </button>
        )}
      </header>

      {!result ? (
        <div className="flex-1 flex items-center justify-center">
           <div className="glass-panel p-8 w-full max-w-xl mx-auto flex flex-col pt-10 pb-12 items-center">
               <div className="flex bg-[#0a0c16] rounded-lg p-1.5 mb-8 border border-slate-800">
                  <button 
                    onClick={() => setActiveTab('connect')}
                    className={cn("px-6 py-2 rounded-md text-sm font-bold transition-all", activeTab === 'connect' ? 'bg-cyan-500/20 text-cyan-400 shadow-sm' : 'text-slate-500 hover:text-slate-300')}
                  >
                    Live Connection
                  </button>
                  <button 
                    onClick={() => setActiveTab('upload')}
                    className={cn("px-6 py-2 rounded-md text-sm font-bold transition-all", activeTab === 'upload' ? 'bg-cyan-500/20 text-cyan-400 shadow-sm' : 'text-slate-500 hover:text-slate-300')}
                  >
                    DDL Upload
                  </button>
               </div>

               {activeTab === 'connect' ? (
                 <div className="w-full flex flex-col items-center">
                    <div className="w-16 h-16 bg-slate-900 rounded-full border border-slate-800 flex items-center justify-center mb-6">
                      <Server className="text-cyan-400" size={24} />
                    </div>
                    <p className="text-sm text-slate-400 text-center mb-6 max-w-sm">
                      Reads the live Oracle data dictionary (<span className="font-mono text-slate-300">ALL_OBJECTS</span>, <span className="font-mono text-slate-300">ALL_DEPENDENCIES</span>) for the schemas below and loads them into the graph.
                    </p>
                    <div className="w-full max-w-sm mb-6">
                      <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-2 block">Schemas (comma-separated)</label>
                      <input
                        type="text"
                        value={schemasInput}
                        onChange={(e) => setSchemasInput(e.target.value)}
                        placeholder="DVSYS, LBACSYS, DVF"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-200 focus:outline-none focus:border-cyan-500/50 transition-colors"
                      />
                    </div>
                    <button
                      onClick={handleLiveDiscover}
                      disabled={isDiscovering}
                      className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 px-8 py-3 rounded-lg font-bold flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(6,182,212,0.4)] disabled:opacity-50"
                    >
                      {isDiscovering ? <RefreshCw size={18} className="animate-spin" /> : <Play size={18} />}
                      {isDiscovering ? 'Discovering…' : 'Connect & Discover'}
                    </button>
                    {error && <p className="text-xs text-rose-400 mt-4 max-w-sm text-center font-mono">{error}</p>}
                 </div>
               ) : (
                 <div className="w-full">
                    <label className={cn(
                      "flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-300",
                      isDiscovering ? "border-slate-700 bg-slate-900/50" : "border-slate-700 hover:border-cyan-500/50 hover:bg-slate-800/30 bg-[#0a0c16]/50"
                    )}>
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        {isDiscovering ? (
                          <RefreshCw className="w-10 h-10 text-cyan-500 animate-spin mb-4" />
                        ) : (
                          <Upload className="w-10 h-10 text-slate-500 mb-4" />
                        )}
                        <p className="mb-2 text-sm text-slate-400">
                          <span className="font-bold text-slate-300">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs font-mono text-slate-500">Oracle DDL SQL File (.sql)</p>
                      </div>
                      <input type="file" className="hidden" accept=".sql" onChange={handleFileUpload} disabled={isDiscovering} />
                    </label>
                    {error && <p className="text-xs text-rose-400 mt-4 text-center font-mono">{error}</p>}
                 </div>
               )}

               <label className="flex items-center gap-2 mt-8 cursor-pointer select-none group">
                 <input
                   type="checkbox"
                   checked={replaceGraph}
                   onChange={(e) => setReplaceGraph(e.target.checked)}
                   className="w-4 h-4 accent-cyan-500"
                 />
                 <span className="text-xs text-slate-400 group-hover:text-slate-300">
                   Replace graph — wipe existing data so the result is <span className="text-cyan-400 font-bold">exactly</span> this source
                 </span>
               </label>
           </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 flex-1 min-h-[500px] overflow-hidden">
          
          <div className="xl:col-span-1 flex flex-col gap-6 overflow-y-auto pr-2">
            
            <div className="glass-panel p-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">Discovery Summary</h3>
              <div className="grid grid-cols-2 gap-3 mb-4">
                 <div className="bg-[#0a0c16] rounded-lg p-3 border border-slate-800">
                   <div className="text-[10px] text-slate-500 font-bold uppercase">Total Objects</div>
                   <div className="text-2xl font-mono text-white mt-1">{result.totalObjects}</div>
                 </div>
                 <div className="bg-rose-500/10 rounded-lg p-3 border border-rose-500/20">
                   <div className="text-[10px] text-rose-500 font-bold uppercase">Invalid</div>
                   <div className="text-2xl font-mono text-rose-400 mt-1">{result.invalidObjects}</div>
                 </div>
              </div>
              
              <div className="text-xs text-slate-400 border-t border-slate-800/50 pt-4 flex justify-between">
                <span>Migration Est.</span>
                <span className="font-mono text-cyan-400 font-bold">{result.effortEstimation.hours} hrs</span>
              </div>
            </div>

            <div className="glass-panel p-5 flex flex-col gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Object Types</h3>
              
              <button
                onClick={() => setSelectedType(null)}
                className={cn("flex justify-between items-center text-sm px-3 py-2 rounded transition-colors text-left", 
                   selectedType === null ? "bg-cyan-500/10 text-cyan-400 font-bold" : "text-slate-400 hover:bg-slate-800/50")}
              >
                <span>All Types</span>
                <span className="bg-[#0a0c16] px-1.5 py-0.5 rounded text-xs">{result.totalObjects}</span>
              </button>

              {Object.entries(result.objectsByType).map(([type, count]) => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={cn("flex justify-between items-center text-sm px-3 py-2 rounded transition-colors text-left", 
                    selectedType === type ? "bg-cyan-500/10 text-cyan-400 font-bold" : "text-slate-400 hover:bg-slate-800/50")}
                >
                  <span className="capitalize">{type.toLowerCase()}</span>
                  <span className="bg-[#0a0c16] border border-slate-800/50 px-1.5 py-0.5 rounded text-xs">{count}</span>
                </button>
              ))}
            </div>

            <div className="glass-panel p-5">
               <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Detected Schemas</h3>
               <div className="flex flex-wrap gap-2">
                  {result.schemas.map(schema => (
                    <span key={schema} className="bg-slate-800/50 border border-slate-700 text-slate-300 px-2 py-1 rounded text-[10px] font-mono">
                      {schema}
                    </span>
                  ))}
               </div>
            </div>

          </div>

          <div className="xl:col-span-3 glass-panel overflow-hidden flex flex-col">
            <div className="p-4 border-b border-glass-border bg-[#0a0c16] flex justify-between items-center">
               <div className="relative w-72">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input 
                    type="text" 
                    placeholder="Search objects..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-full pl-9 pr-4 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-cyan-500/50 transition-colors"
                  />
               </div>
               
               <div className="text-xs font-mono text-slate-500">
                  Showing {filteredObjects.length} / {result.objects.length}
               </div>
            </div>
            
            <div className="flex-1 overflow-auto p-0">
               <table className="w-full text-left border-collapse min-w-[800px]">
                 <thead className="bg-[#0f172a] sticky top-0 z-10 shadow-sm border-b border-slate-800/80">
                   <tr>
                     <th className="py-3 px-6 text-[10px] uppercase font-bold text-slate-500 tracking-wider">Object Name</th>
                     <th className="py-3 px-6 text-[10px] uppercase font-bold text-slate-500 tracking-wider">Type</th>
                     <th className="py-3 px-6 text-[10px] uppercase font-bold text-slate-500 tracking-wider">Status</th>
                     <th className="py-3 px-6 text-[10px] uppercase font-bold text-slate-500 tracking-wider">Dependencies</th>
                     <th className="py-3 px-6 text-[10px] uppercase font-bold text-slate-500 tracking-wider">LOC</th>
                     <th className="py-3 px-6 text-[10px] uppercase font-bold text-slate-500 tracking-wider">Last DDL Time</th>
                   </tr>
                 </thead>
                 <tbody>
                   {filteredObjects.length === 0 ? (
                     <tr><td colSpan={6} className="text-center py-12 text-slate-500 font-mono text-sm">No objects found matching criteria.</td></tr>
                   ) : (
                     filteredObjects.map((obj, i) => (
                       <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors group">
                          <td className="py-3 px-6">
                            <div className="flex items-center gap-2">
                               {obj.type.toLowerCase() === 'table' ? <Database size={14} className="text-emerald-500/70" /> :
                                obj.type.toLowerCase().startsWith('package') ? <Code2 size={14} className="text-amber-500/70" /> :
                                obj.type.toLowerCase().includes('view') ? <Layers size={14} className="text-cyan-500/70" /> :
                                <Plus size={14} className="text-slate-500/70" />}
                               <span className="font-mono text-sm text-slate-200">{obj.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-6">
                            <span className="text-xs bg-slate-900 border border-slate-800 px-2 py-0.5 rounded text-slate-400 capitalize">{obj.type.toLowerCase()}</span>
                          </td>
                          <td className="py-3 px-6">
                            {obj.status === 'VALID' ? 
                              <span className="text-xs text-emerald-400 font-mono">VALID</span> : 
                              <span className="text-xs text-rose-400 font-mono font-bold flex items-center gap-1"><ShieldAlert size={12}/> INVALID</span>
                            }
                          </td>
                          <td className="py-3 px-6 text-sm text-slate-400 font-mono">
                            {obj.dependencies > 0 ? obj.dependencies : '-'}
                          </td>
                          <td className="py-3 px-6 text-sm text-slate-400 font-mono">
                            {obj.linesOfCode ? obj.linesOfCode.toLocaleString() : '-'}
                          </td>
                          <td className="py-3 px-6 text-xs text-slate-500 font-mono">
                            {obj.lastDdlTime}
                          </td>
                       </tr>
                     ))
                   )}
                 </tbody>
               </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
