import React, { useState } from 'react';
import { GitBranch, Check, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import { apiFetch } from '../lib/api';

interface IngestStats {
  nodesUpserted: number;
  edgesUpserted: number;
  unresolvedRefs: number;
}

interface Props {
  /** Returns the artifact to ingest; null disables the button. Ignored for endpoint="discover". */
  getFile?: () => File | null;
  endpoint: 'forms' | 'reports' | 'plsql' | 'schema' | 'discover';
  label?: string;
}

/** Pushes the analyzed artifact into the Neo4j dependency graph via /api/v2/ingest. */
export function IngestButton({ getFile, endpoint, label }: Props) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const ingest = async () => {
    setState('busy');
    setMessage('');
    try {
      let response: Response;
      if (endpoint === 'discover') {
        response = await apiFetch('/api/v2/ingest/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      } else {
        const file = getFile?.() ?? null;
        if (!file) {
          setState('error');
          setMessage('No artifact to ingest');
          return;
        }
        const formData = new FormData();
        formData.append('file', file);
        response = await apiFetch(`/api/v2/ingest/${endpoint}`, { method: 'POST', body: formData });
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || (response.status === 401 ? 'Unauthorized — set your API token' : 'Ingestion failed'));
      const stats: IngestStats | undefined = data.stats;
      setMessage(
        stats
          ? `+${stats.nodesUpserted} nodes · +${stats.edgesUpserted} edges` +
              (stats.unresolvedRefs ? ` · ${stats.unresolvedRefs} unresolved` : '')
          : 'Ingestion complete'
      );
      setState('done');
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={ingest}
        disabled={state === 'busy'}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide border transition-all',
          state === 'done'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : state === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20',
          state === 'busy' && 'opacity-60 cursor-wait'
        )}
      >
        {state === 'done' ? <Check size={14} /> : state === 'error' ? <AlertTriangle size={14} /> : <GitBranch size={14} />}
        {state === 'busy' ? 'Ingesting…' : label ?? 'Ingest into Graph'}
      </button>
      {message && (
        <span className={cn('text-[10px] font-mono', state === 'error' ? 'text-rose-400' : 'text-slate-500')}>
          {message}
        </span>
      )}
    </div>
  );
}
