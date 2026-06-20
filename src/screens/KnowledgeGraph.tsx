import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  ReactFlow, 
  MiniMap, 
  Controls, 
  Background, 
  useNodesState, 
  useEdgesState, 
  MarkerType,
  Handle,
  Position,
  NodeProps
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Layout,
  FileBarChart,
  Code2,
  Database,
  Eye,
  Zap,
  ListOrdered,
  Search,
  Filter,
  Activity,
  Layers,
  Type,
  Braces,
  FileText,
  Hash,
  Cog,
  Box,
  Link2,
  Key,
  HelpCircle
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { GraphData } from '../types';

import dagre from 'dagre';

const getLayoutedElements = (nodes: any[], edges: any[], direction = 'TB') => {
  const isHorizontal = direction === 'LR';
  // Fresh graph per call — a module-level singleton would retain stale nodes
  // across re-layouts and component remounts, drifting the layout and leaking memory.
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, ranksep: 80, nodesep: 40 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 180, height: 80 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const newNode = {
      ...node,
      targetPosition: isHorizontal ? 'left' : 'top',
      sourcePosition: isHorizontal ? 'right' : 'bottom',
      position: {
        x: nodeWithPosition.x - 180 / 2,
        y: nodeWithPosition.y - 80 / 2,
      },
    };

    return newNode;
  });

  return { nodes: newNodes, edges };
};

const TYPE_CONFIG: Record<string, { color: string, icon: any, label: string }> = {
  form: { color: '#0ea5e9', icon: Layout, label: 'Form' }, // cyan-500
  block: { color: '#38bdf8', icon: Layers, label: 'Block' }, // sky-400
  item: { color: '#7dd3fc', icon: Type, label: 'Item' }, // sky-300
  formtrigger: { color: '#fb7185', icon: Zap, label: 'Form Trigger' }, // rose-400
  programunit: { color: '#fbbf24', icon: Braces, label: 'Program Unit' }, // amber-400
  report: { color: '#a855f7', icon: FileBarChart, label: 'Report' }, // purple-500
  reportquery: { color: '#c084fc', icon: FileText, label: 'Report Query' }, // purple-400
  parameter: { color: '#d8b4fe', icon: Hash, label: 'Parameter' }, // purple-300
  package: { color: '#f59e0b', icon: Code2, label: 'Package' }, // amber-500
  packagebody: { color: '#d97706', icon: Code2, label: 'Package Body' }, // amber-600
  procedure: { color: '#fb923c', icon: Cog, label: 'Procedure' }, // orange-400
  function: { color: '#fdba74', icon: Cog, label: 'Function' }, // orange-300
  table: { color: '#10b981', icon: Database, label: 'Table' }, // emerald-500
  column: { color: '#6ee7b7', icon: Box, label: 'Column' }, // emerald-300
  view: { color: '#06b6d4', icon: Eye, label: 'View' }, // cyan-400
  materializedview: { color: '#22d3ee', icon: Eye, label: 'MView' }, // cyan-300
  trigger: { color: '#e11d48', icon: Zap, label: 'Trigger' }, // rose-600 (legacy)
  dbtrigger: { color: '#e11d48', icon: Zap, label: 'DB Trigger' }, // rose-600
  sequence: { color: '#6366f1', icon: ListOrdered, label: 'Sequence' }, // indigo-500
  synonym: { color: '#818cf8', icon: Link2, label: 'Synonym' }, // indigo-400
  index: { color: '#94a3b8', icon: Key, label: 'Index' }, // slate-400
  constraint: { color: '#64748b', icon: Key, label: 'Constraint' }, // slate-500
  unresolved: { color: '#ef4444', icon: HelpCircle, label: 'Unresolved' } // red-500
};

// Custom Node Component
const CustomNode = ({ data }: NodeProps) => {
  const config = TYPE_CONFIG[data.nodeType as string] || TYPE_CONFIG['table'];
  const Icon = config.icon;
  const isSelected = data.selected || data.highlighted;
  const isDimmed = data.dimmed;

  return (
    <div 
      className={cn(
        "px-4 py-2 rounded-lg border-2 shadow-xl flex flex-col min-w-[160px] bg-[#0f172a] transition-all", // slate-900
        isSelected ? "shadow-[0_0_20px_rgba(34,211,238,0.3)] scale-105 z-50" : "",
        isDimmed ? "opacity-30 grayscale saturate-0" : "opacity-100"
      )}
      style={{ borderColor: isSelected ? '#22d3ee' : config.color }}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-500 !w-2 !h-2 !border-none" />
      <div className="flex justify-between items-center mb-1">
        <span className="text-[9px] uppercase tracking-wider font-bold" style={{ color: config.color }}>{config.label}</span>
        <Icon size={12} style={{ color: config.color }} />
      </div>
      <div className="font-mono text-xs text-white font-semibold truncate" title={data.label as string}>
        {data.label as string}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-500 !w-2 !h-2 !border-none" />
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

export function KnowledgeGraph() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<string[]>(Object.keys(TYPE_CONFIG));
  const [impactMode, setImpactMode] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [rawNodes, setRawNodes] = useState<any[]>([]);
  const [rawEdges, setRawEdges] = useState<any[]>([]);
  const [engineError, setEngineError] = useState<string | null>(null);

  const toFlowNode = (n: { id: string; label: string; type: string }) => ({
    id: n.id,
    type: 'custom',
    position: { x: 0, y: 0 },
    data: { label: n.label, nodeType: n.type, highlighted: false, dimmed: false },
  });

  const toFlowEdge = (e: { source: string; target: string; label: string }) => ({
    // Include the label so two relationship types between the same pair don't collide.
    id: `e_${e.source}_${e.target}_${e.label}`,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: true,
    style: { stroke: '#475569', strokeWidth: 1.5, opacity: 1 }, // slate-600
    labelStyle: { fill: '#94a3b8', fontWeight: 600, fontSize: 10, fontFamily: 'JetBrains Mono' },
    labelBgStyle: { fill: '#0f172a', fillOpacity: 0.8 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#475569' },
    data: { dimmed: false, highlighted: false }
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v2/graph?limit=400', { signal: controller.signal })
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Dependency Engine unavailable');
        }
        return res.json();
      })
      .then((data: GraphData) => {
        const layouted = getLayoutedElements(data.nodes.map(toFlowNode), data.edges.map(toFlowEdge), 'TB');
        setRawNodes(layouted.nodes);
        setRawEdges(layouted.edges);
        setLoading(false);
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        setEngineError(err.message);
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  // Progressive expansion: double-click fetches the node's neighbors server-side
  const onNodeDoubleClick = useCallback((_: any, node: any) => {
    fetch(`/api/v2/graph/nodes/${encodeURIComponent(node.id)}/neighbors?direction=both&depth=1`)
      .then(res => res.ok ? res.json() : Promise.reject(new Error('expand failed')))
      .then((data: GraphData) => {
        const known = new Set(rawNodes.map(n => n.id));
        const added = data.nodes.filter(n => !known.has(n.id)).map(toFlowNode);
        const knownEdges = new Set(rawEdges.map(e => e.id));
        const addedEdges = data.edges.map(toFlowEdge).filter(e => !knownEdges.has(e.id));
        if (added.length === 0 && addedEdges.length === 0) return;
        const layouted = getLayoutedElements([...rawNodes, ...added], [...rawEdges, ...addedEdges], 'TB');
        setRawNodes(layouted.nodes);
        setRawEdges(layouted.edges);
      })
      .catch(() => { /* expansion is best-effort */ });
  }, [rawNodes, rawEdges]);

  // Compute Impact Graph and search highlighting
  useEffect(() => {
    if (loading) return;

    let highlightedNodes = new Set<string>();
    let highlightedEdges = new Set<string>();

    if (impactMode && selectedNodeId) {
      highlightedNodes.add(selectedNodeId);
      
      // Compute downstream impact recursively
      const traverseDownstream = (nId: string) => {
        rawEdges.forEach(e => {
          if (e.source === nId) {
            highlightedEdges.add(e.id);
            if (!highlightedNodes.has(e.target)) {
              highlightedNodes.add(e.target);
              traverseDownstream(e.target);
            }
          }
        });
      };
      
      // Compute upstream dependencies recursively
      const traverseUpstream = (nId: string) => {
         rawEdges.forEach(e => {
            if (e.target === nId) {
               highlightedEdges.add(e.id);
               if (!highlightedNodes.has(e.source)) {
                  highlightedNodes.add(e.source);
                  traverseUpstream(e.source);
               }
            }
         });
      };

      traverseDownstream(selectedNodeId);
      traverseUpstream(selectedNodeId);
    } else if (search.trim()) {
      rawNodes.forEach(n => {
        if ((n.data.label as string).toLowerCase().includes(search.toLowerCase())) {
          highlightedNodes.add(n.id);
        }
      });
    }

    const filteredNodes = rawNodes
      .filter(n => activeFilters.includes(n.data.nodeType))
      .map(n => {
        const isTargeted = highlightedNodes.has(n.id);
        const shouldDim = (impactMode && selectedNodeId || search.trim()) ? !isTargeted : false;
        const isSelected = n.id === selectedNodeId;
        
        return {
          ...n,
          data: { 
            ...n.data, 
            highlighted: isTargeted, 
            dimmed: shouldDim,
            selected: isSelected
          }
        };
      });

    const activeNodeIds = new Set(filteredNodes.map(n => n.id));

    const processedEdges = rawEdges
      .filter(e => activeNodeIds.has(e.source) && activeNodeIds.has(e.target))
      .map(e => {
        const isTargeted = highlightedEdges.has(e.id);
        const shouldDim = (impactMode && selectedNodeId || search.trim()) ? !isTargeted : false;
        
        return {
          ...e,
          style: { 
            stroke: isTargeted ? '#e11d48' : '#475569', 
            strokeWidth: isTargeted ? 2.5 : 1.5,
            opacity: shouldDim ? 0.1 : 1 
          },
          markerEnd: { 
            type: MarkerType.ArrowClosed, 
            color: isTargeted ? '#e11d48' : '#475569' 
          },
          animated: isTargeted ? true : (!shouldDim)
        };
      });

    setNodes(filteredNodes);
    setEdges(processedEdges);

  }, [rawNodes, rawEdges, search, activeFilters, impactMode, selectedNodeId, setNodes, setEdges, loading]);


  const toggleFilter = (type: string) => {
    setActiveFilters(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const onNodeClick = useCallback((_: any, node: any) => {
    setSelectedNodeId(node.id === selectedNodeId ? null : node.id);
  }, [selectedNodeId]);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const selectedNodeData = useMemo(() => {
     if (!selectedNodeId) return null;
     return rawNodes.find(n => n.id === selectedNodeId);
  }, [selectedNodeId, rawNodes]);

  if (loading) return <div className="p-8 text-slate-400 font-mono text-sm">Initializing Neural Graph Engine...</div>;

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 relative">
      {/* Top Banner Toolbar */}
      <div className="bg-[#0a0c16] border-b border-glass-border px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 z-20 shadow-xl">
        <div>
          <h2 className="heading-display text-2xl font-bold flex items-center gap-2">
            <Activity className="text-cyan-400"/> Knowledge Graph
          </h2>
          <p className="text-slate-400 text-xs mt-1">Cross-system architecture relationship tracing.</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search Objects..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-full pl-9 pr-4 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-cyan-500/50 w-64 font-mono transition-colors"
            />
          </div>
          <button 
            onClick={() => setImpactMode(!impactMode)}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold transition-all border",
              impactMode 
               ? "bg-rose-500/20 text-rose-400 border-rose-500/50 shadow-[0_0_10px_rgba(225,29,72,0.3)]" 
               : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
            )}
          >
            <Zap size={14} />
            Impact Mode
          </button>
        </div>
      </div>

      {/* Filter Ribbon */}
      <div className="bg-[#02040a]/80 backdrop-blur-md px-6 py-2 border-b border-glass-border flex flex-wrap gap-2 z-20">
         <span className="text-xs text-slate-500 font-bold uppercase flex items-center mr-2"><Filter size={12} className="mr-1"/> Filters:</span>
         {Object.entries(TYPE_CONFIG).map(([key, config]) => {
           const isActive = activeFilters.includes(key);
           return (
             <button
               key={key}
               onClick={() => toggleFilter(key)}
               className={cn(
                 "px-2 py-1 flex items-center gap-1.5 rounded text-[10px] font-mono border transition-colors",
                 isActive ? "bg-slate-800 border-slate-600 text-slate-200" : "bg-transparent border-slate-800 text-slate-600 hover:border-slate-700"
               )}
             >
               <div className="w-2 h-2 rounded-full" style={{ backgroundColor: isActive ? config.color : '#334155' }} />
               {config.label}
             </button>
           );
         })}
      </div>

      {/* Graph Area */}
      <div className="flex-1 relative overflow-hidden bg-[#02040a]">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#2dd4bf_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none z-0"></div>

        {(engineError || rawNodes.length === 0) && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center text-center p-8 pointer-events-none">
            <Activity size={48} className="mb-4 text-slate-700" />
            {engineError ? (
              <>
                <h3 className="text-lg heading-display text-slate-400 mb-2">Dependency Engine Offline</h3>
                <p className="text-xs text-slate-500 font-mono max-w-md">{engineError}</p>
              </>
            ) : (
              <>
                <h3 className="text-lg heading-display text-slate-400 mb-2">Knowledge Graph is Empty</h3>
                <p className="text-xs text-slate-500 font-mono max-w-md">
                  Ingest artifacts from the Forms / Reports / PL/SQL / Discovery screens, then revisit.
                  Double-click any node to expand its neighbors.
                </p>
              </>
            )}
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          colorMode="dark"
          minZoom={0.1}
          maxZoom={1.5}
          className="z-10"
        >
          <Controls className="bg-slate-900 border-slate-800 fill-white" />
          <MiniMap 
            nodeColor={(n: any) => TYPE_CONFIG[n.data.nodeType]?.color || '#475569'} 
            maskColor="rgba(2, 4, 10, 0.8)" 
            className="bg-[#0f172a] border border-slate-800 rounded shadow-xl"
          />
          <Background color="#1e293b" gap={30} size={1.5} />
        </ReactFlow>

        {/* Selected Node Inspector Overlay */}
        {selectedNodeData && (
          <div className="absolute bottom-6 right-6 w-80 glass-panel p-5 animate-in slide-in-from-bottom-5 z-50">
             <div className="flex items-center justify-between mb-4 border-b border-glass-border pb-3">
               <div>
                 <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: TYPE_CONFIG[selectedNodeData.data.nodeType].color }}>
                   {TYPE_CONFIG[selectedNodeData.data.nodeType].label}
                 </span>
                 <h4 className="text-lg font-mono font-bold text-white mt-1 break-all">{selectedNodeData.data.label}</h4>
               </div>
             </div>
             
             {impactMode ? (
               <div className="space-y-3">
                 <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg">
                   <p className="text-xs text-rose-300 font-bold mb-1 flex items-center"><AlertTriangle size={14} className="mr-1"/> Critical Impact Scope</p>
                   <p className="text-[10px] text-rose-500/80">Modification will force cascading invalidations across highlighted dependencies.</p>
                 </div>
                 <div className="text-xs font-mono text-slate-400 space-y-1">
                   <div className="flex justify-between"><span>Direct dependents:</span> <span className="text-white font-bold">{
                     rawEdges.filter(e => e.target === selectedNodeId || e.source === selectedNodeId).length
                   }</span></div>
                   <div className="flex justify-between"><span>Propagation depth:</span> <span className="text-white font-bold">Max</span></div>
                 </div>
               </div>
             ) : (
               <div className="text-xs text-slate-400 font-mono">
                 <p>Select Impact Mode (⚡) above to compute risk vectors and highlight full downstream/upstream lineage for this object.</p>
               </div>
             )}
             
             <button 
                onClick={() => setSelectedNodeId(null)}
                className="w-full mt-4 py-2 border border-slate-700 bg-slate-800 text-slate-300 text-xs font-bold uppercase rounded hover:bg-slate-700 transition-colors"
             >
               Deselect
             </button>
          </div>
        )}
      </div>
    </div>
  );
}

const AlertTriangle = ({ size, className }: { size: number, className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
);

