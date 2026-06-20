import React, { useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, ArrowDown, ArrowUp, Database, FileCode2, Package, Search } from 'lucide-react';
import { cn } from '../lib/utils';

interface ImpactedObject {
  id: string;
  label: string;
  type: string;
  depth: number;
  confidence: number;
  viaPath: string[];
}

interface ImpactResult {
  target: { id: string; label: string; type: string };
  upstream: ImpactedObject[];
  downstream: ImpactedObject[];
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  impactScore: number;
  recommendation: string;
  byType: Record<string, number>;
}

interface CatalogObject {
  id: string;
  name: string;
  type: string;
  schema?: string | null;
}

export function ImpactAnalyzer() {
  const [search, setSearch] = useState('');
  const [objects, setObjects] = useState<CatalogObject[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedObj, setSelectedObj] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImpactResult | null>(null);

  // Server-side object search (replaces the prototype's hardcoded list)
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ pageSize: '50' });
      if (search.trim()) params.set('search', search.trim());
      fetch(`/api/v2/objects?${params}`, { signal: controller.signal })
        .then(async res => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || 'Dependency Engine unavailable');
          }
          return res.json();
        })
        .then(data => {
          setObjects(data.items ?? []);
          setListError(null);
        })
        .catch(err => {
          if (err.name !== 'AbortError') setListError(err.message);
        });
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [search]);

  // Monotonic request id so a slow earlier response can't overwrite a newer one.
  const analyzeSeq = useRef(0);
  const handleAnalyze = async (id: string) => {
    const seq = ++analyzeSeq.current;
    setSelectedObj(id);
    setLoading(true);
    try {
      const response = await fetch(`/api/v2/impact/${encodeURIComponent(id)}`);
      const data = await response.json();
      if (seq !== analyzeSeq.current) return; // a newer selection won — drop this result
      if (!response.ok) throw new Error(data.error || 'Impact analysis failed');
      setResult(data);
    } catch (err) {
      if (seq !== analyzeSeq.current) return;
      console.error('Failed to fetch impact details', err);
      setResult(null);
    } finally {
      if (seq === analyzeSeq.current) setLoading(false);
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'Critical': return 'text-rose-500 border-rose-500/20 bg-rose-500/10';
      case 'High': return 'text-amber-500 border-amber-500/20 bg-amber-500/10';
      case 'Medium': return 'text-yellow-500 border-yellow-500/20 bg-yellow-500/10';
      default: return 'text-emerald-500 border-emerald-500/20 bg-emerald-500/10';
    }
  };

  const objectIcon = (type: string, active: boolean) => {
    const cls = active ? 'text-cyan-400' : undefined;
    if (type === 'table' || type === 'view' || type === 'materializedview')
      return <Database size={16} className={cls ?? 'text-emerald-500'} />;
    if (type === 'package' || type === 'packagebody' || type === 'procedure' || type === 'function')
      return <Package size={16} className={cls ?? 'text-amber-500'} />;
    if (type === 'report' || type === 'reportquery')
      return <FileCode2 size={16} className={cls ?? 'text-purple-500'} />;
    return <FileCode2 size={16} className={cls ?? 'text-blue-500'} />;
  };

  const renderImpactedList = (items: ImpactedObject[]) =>
    items.length === 0 ? (
      <li className="text-xs text-slate-600 font-mono p-3">None found in the graph.</li>
    ) : (
      items.map((item) => (
        <li key={item.id} className="bg-slate-900/50 p-3 rounded border border-slate-800 font-mono text-sm text-slate-300 flex items-center justify-between gap-2">
          <span className="truncate" title={item.id}>{item.label} <span className="text-slate-500">({item.type})</span></span>
          <span className="text-[10px] text-slate-500 whitespace-nowrap">
            d{item.depth} · {(item.confidence * 100).toFixed(0)}%
          </span>
        </li>
      ))
    );

  return (
    <div className="p-8 space-y-6 flex flex-col h-full overflow-hidden max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <header className="flex-shrink-0">
        <h2 className="heading-display text-3xl font-bold flex items-center gap-3">
          <Activity className="text-cyan-400" size={32} />
          Impact Analysis Engine
        </h2>
        <p className="text-slate-400 mt-2">
          Blast radius and risk computed live from the Neo4j dependency graph.
        </p>
      </header>

      <div className="flex gap-8 h-[calc(100%-100px)]">
        {/* Left Sidebar: Object Selection */}
        <div className="w-1/3 glass-panel border border-glass-border flex flex-col overflow-hidden">
          <div className="p-4 border-b border-glass-border bg-[#0a0c16]/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type="text"
                placeholder="Search graph objects..."
                className="w-full bg-slate-900/50 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {listError ? (
              <div className="p-4 text-xs text-amber-400 leading-relaxed">{listError}</div>
            ) : objects.length === 0 ? (
              <div className="p-4 text-xs text-slate-500 leading-relaxed">
                No objects in the graph yet. Ingest Forms XML, Reports XML, PL/SQL or DDL via the analyzer screens.
              </div>
            ) : (
              objects.map((obj) => (
                <button
                  key={obj.id}
                  onClick={() => handleAnalyze(obj.id)}
                  className={cn(
                    'w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 transition-colors',
                    selectedObj === obj.id
                      ? 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400'
                      : 'hover:bg-slate-800/50 text-slate-300 border border-transparent'
                  )}
                >
                  {objectIcon(obj.type, selectedObj === obj.id)}
                  <span className="font-mono text-sm truncate" title={obj.id}>{obj.name}</span>
                  <span className="ml-auto text-[10px] uppercase text-slate-600">{obj.type}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Content: Analysis Results */}
        <div className="flex-1 glass-panel border border-glass-border overflow-y-auto relative bg-[#02040a]/30">
          {!selectedObj ? (
             <div className="flex flex-col items-center justify-center h-full text-slate-500 text-center p-8">
                <Activity size={48} className="mb-4 opacity-50" />
                <h3 className="text-xl heading-display mb-2">Select an Object</h3>
                <p className="max-w-md">Choose any object from the knowledge graph to compute its structural impact radius.</p>
             </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center h-full text-cyan-500">
               <div className="w-12 h-12 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin mb-4" />
               <p className="font-medium tracking-wide animate-pulse">Running Graph Algorithms...</p>
            </div>
          ) : result ? (
            <div className="p-8 space-y-8 animate-in slide-in-from-right-8 duration-500">

               <header className="flex justify-between items-start">
                 <div>
                   <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-2">Target Object</h3>
                   <div className="text-4xl heading-display text-white break-all">{result.target.label}</div>
                   <div className="text-xs font-mono text-slate-500 mt-1 uppercase">{result.target.type}</div>
                 </div>

                 <div className="flex items-center gap-6 text-right">
                   <div>
                     <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mb-1">Impact Score</p>
                     <p className="text-4xl font-light font-display text-white">{result.impactScore}<span className="text-lg text-slate-600">/100</span></p>
                   </div>
                   <div className={cn('px-4 py-2 rounded-lg border', getRiskColor(result.riskLevel))}>
                     <p className="text-[10px] uppercase font-bold tracking-widest opacity-80 mb-1 flex items-center gap-1">
                       {result.riskLevel === 'Critical' && <AlertTriangle size={12}/>}
                       Risk Level
                     </p>
                     <p className="text-xl font-bold">{result.riskLevel}</p>
                   </div>
                 </div>
               </header>

               <div className="p-5 rounded-xl border border-indigo-500/20 bg-indigo-500/5 text-slate-300 leading-relaxed text-sm">
                 <span className="font-bold text-indigo-400 mr-2 uppercase tracking-wide text-xs">Recommendation:</span>
                 {result.recommendation}
               </div>

               <div className="grid grid-cols-2 gap-8">
                 <div className="space-y-4">
                   <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 pb-2 border-b border-slate-800">
                     <ArrowUp size={16} className="text-amber-400" />
                     Impacted Consumers ({result.upstream.length})
                   </h4>
                   <p className="text-xs text-slate-500 mb-2 leading-relaxed">
                     Objects that depend on <strong>{result.target.label}</strong> — changing it may break these.
                   </p>
                   <ul className="space-y-2">{renderImpactedList(result.upstream)}</ul>
                 </div>

                 <div className="space-y-4">
                   <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 pb-2 border-b border-slate-800">
                     <ArrowDown size={16} className="text-emerald-400" />
                     Dependencies ({result.downstream.length})
                   </h4>
                   <p className="text-xs text-slate-500 mb-2 leading-relaxed">
                     Objects <strong>{result.target.label}</strong> relies on — migrate or shim these first.
                   </p>
                   <ul className="space-y-2">{renderImpactedList(result.downstream)}</ul>
                 </div>
               </div>

            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
