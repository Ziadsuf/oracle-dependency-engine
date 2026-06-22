import React, { useState } from 'react';
import {
  LayoutDashboard,
  FileCode2,
  Database,
  Network,
  Settings,
  Activity,
  Server,
  FileText
} from 'lucide-react';
import { cn } from '../lib/utils';
import { getApiToken, setApiToken } from '../lib/api';

interface NavigationProps {
  currentView: string;
  onViewChange: (view: string) => void;
}

export function Navigation({ currentView, onViewChange }: NavigationProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [token, setToken] = useState(getApiToken());

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'forms', label: 'Forms Analyzer', icon: FileCode2 },
    { id: 'reports', label: 'Reports Analyzer', icon: FileText },
    { id: 'plsql', label: 'PL/SQL Analyzer', icon: FileCode2 },
    { id: 'metadata', label: 'Metadata Discovery', icon: Database },
    { id: 'graph', label: 'Knowledge Graph', icon: Network },
    { id: 'react-gen', label: 'React Generator', icon: FileCode2 },
    { id: 'springboot-gen', label: 'Spring Boot Generator', icon: Server },
    { id: 'impact', label: 'Impact Analysis', icon: Activity },
  ];

  return (
    <aside className="w-64 border-r border-slate-800/50 bg-[#080a12] backdrop-blur-xl h-screen flex flex-col pt-6">
      <div className="px-6 mb-8 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-[0_0_15px_rgba(6,182,212,0.4)]">
          O
        </div>
        <div>
          <h1 className="heading-display text-sm font-bold uppercase tracking-wider text-slate-200">Impact Analyzer</h1>
          <p className="text-xs text-slate-500 font-mono">Enterprise Edition</p>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                isActive 
                  ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.1)]" 
                  : "text-slate-500 hover:text-cyan-400 hover:bg-slate-800/50 border border-transparent"
              )}
            >
              <Icon size={18} className={isActive ? "text-cyan-400" : "text-slate-500"} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800/50 mt-auto">
        <button
          onClick={() => setShowSettings((s) => !s)}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
            showSettings ? "text-cyan-400 bg-slate-800/50" : "text-slate-500 hover:text-cyan-400 hover:bg-slate-800/50"
          )}
        >
          <Settings size={18} />
          Settings
        </button>

        {showSettings && (
          <div className="mt-3 px-1">
            <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 block mb-1">API Token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => { setToken(e.target.value); setApiToken(e.target.value); }}
              placeholder="for protected servers"
              autoComplete="off"
              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs font-mono text-slate-300 focus:outline-none focus:border-cyan-500/50"
            />
            <p className="text-[10px] text-slate-600 mt-1.5 leading-snug">
              Sent as <span className="font-mono">X-API-Key</span> for ingest / discover / clear. Leave blank if the server has no <span className="font-mono">API_TOKEN</span>.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
