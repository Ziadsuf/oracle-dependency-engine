import React, { useState } from 'react';
import { Navigation } from './components/Navigation';
import { Dashboard } from './screens/Dashboard';
import { FormsAnalyzer } from './screens/FormsAnalyzer';
import { PlsqlAnalyzer } from './screens/PlsqlAnalyzer';
import { ReportsAnalyzer } from './screens/ReportsAnalyzer';
import { KnowledgeGraph } from './screens/KnowledgeGraph';
import { MetadataDiscovery } from './screens/MetadataDiscovery';
import { ReactGenerator } from './screens/ReactGenerator';
import { SpringBootGenerator } from './screens/SpringBootGenerator';
import { ImpactAnalyzer } from './screens/ImpactAnalyzer';

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard');

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'forms':
        return <FormsAnalyzer />;
      case 'reports':
        return <ReportsAnalyzer />;
      case 'plsql':
        return <PlsqlAnalyzer />;
      case 'metadata':
        return <MetadataDiscovery />;
      case 'react-gen':
        return <ReactGenerator />;
      case 'springboot-gen':
        return <SpringBootGenerator />;
      case 'graph':
        return <KnowledgeGraph />;
      case 'impact':
        return <ImpactAnalyzer />;
      default:
        return (
          <div className="flex-1 flex items-center justify-center p-8 text-center text-gray-500 max-w-md mx-auto">
            <h3 className="text-xl mb-4 heading-display text-gray-300">Feature in Development</h3>
            <p className="text-sm">This module is currently being provisioned in the Enterprise architecture roadmap.</p>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-dark-bg text-slate-300 font-sans selection:bg-cyan-500/30">
      <Navigation currentView={currentView} onViewChange={setCurrentView} />
      
      <main className="flex-1 h-full flex flex-col relative z-10">
        {renderView()}
      </main>
      
      {/* Background ambient lighting effects to enforce Enterprise glassmorphism */}
      <div className="fixed top-0 left-1/4 w-[50vw] h-[50vw] bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none -z-0" />
      <div className="fixed bottom-0 right-0 w-[40vw] h-[40vw] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none -z-0" />
    </div>
  );
}
