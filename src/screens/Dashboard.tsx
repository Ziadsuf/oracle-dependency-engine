import React, { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, ShieldAlert, Cpu, Database } from 'lucide-react';
import type { DashboardStats } from '../types';

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [offline, setOffline] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v2/stats')
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Dependency Engine unavailable');
        }
        return res.json();
      })
      .then(data => setStats(data))
      .catch(err => {
        setOffline(err.message);
        setStats({ totalForms: 0, totalReports: 0, totalPackages: 0, totalTables: 0, migrationReadiness: 0, technicalDebt: 'Unknown' });
      });
  }, []);

  const chartData = [
    { name: 'Jan', debt: 80, readiness: 20 },
    { name: 'Feb', debt: 75, readiness: 25 },
    { name: 'Mar', debt: 65, readiness: 35 },
    { name: 'Apr', debt: 60, readiness: 40 },
    { name: 'May', debt: 50, readiness: 55 },
    { name: 'Jun', debt: 45, readiness: 68 },
  ];

  if (!stats) {
    return <div className="p-8 text-slate-400 font-mono animate-pulse">Loading engine telemetry...</div>;
  }

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto">
      <header>
        <h2 className="heading-display text-3xl font-bold">Platform Telemetry</h2>
        <p className="text-slate-400 mt-2">Live counts from the dependency knowledge graph.</p>
      </header>

      {offline && (
        <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-sm">
          {offline} — ingest artifacts via the analyzer screens once Neo4j is running (docker compose up -d).
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Forms" value={stats.totalForms} icon={Activity} trend="" />
        <StatCard title="Total Reports" value={stats.totalReports} icon={Database} trend="" />
        <StatCard title="PL/SQL Packages" value={stats.totalPackages} icon={Cpu} trend="" />
        <StatCard title="Migration Readiness" value={`${stats.migrationReadiness}%`} icon={ShieldAlert} trend="" />
      </div>

      <div className="glass-panel p-6">
        <h3 className="heading-display text-lg mb-6">Modernization Trajectory</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorReadiness" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorDebt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
              <XAxis dataKey="name" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip 
                contentStyle={{ backgroundColor: 'rgba(20,20,25,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                itemStyle={{ color: '#e5e7eb' }}
              />
              <Area type="monotone" dataKey="readiness" stroke="#10b981" fillOpacity={1} fill="url(#colorReadiness)" />
              <Area type="monotone" dataKey="debt" stroke="#ef4444" fillOpacity={1} fill="url(#colorDebt)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, trend }: { title: string, value: string | number, icon: any, trend: string }) {
  return (
    <div className="glass-card p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between text-slate-400">
        <span className="font-medium text-sm">{title}</span>
        <Icon size={18} />
      </div>
      <div className="flex items-end justify-between">
        <span className="text-3xl font-display font-bold text-white">{value}</span>
        <span className="text-xs font-mono text-emerald-400">{trend}</span>
      </div>
    </div>
  );
}
