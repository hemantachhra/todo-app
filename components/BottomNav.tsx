
import React from 'react';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'routine', label: 'Routine', icon: '⚡' },
    { id: 'list', label: 'List View', icon: '📋' },
    { id: 'ai', label: 'Coach', icon: '🤖' },
    { id: 'analytics', label: 'Reports', icon: '📊' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 glass h-20 flex items-center justify-around px-4 rounded-t-3xl border-t border-blue-500/30 z-50">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`flex flex-col items-center gap-1 transition-all duration-300 relative ${
            activeTab === tab.id ? 'text-blue-400 scale-110 neo-text-glow' : 'text-slate-500'
          }`}
        >
          <span className="text-2xl">{tab.icon}</span>
          <span className="text-[10px] uppercase font-bold tracking-widest">{tab.label}</span>
          {activeTab === tab.id && (
            <div className="absolute -bottom-2 w-1.5 h-1.5 bg-blue-400 rounded-full neo-shadow"></div>
          )}
        </button>
      ))}
    </nav>
  );
};

export default BottomNav;
