
import React from 'react';
import { UserRole } from '../types';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: 'dashboard' | 'slots' | 'users' | 'admin' | 'expedition' | 'supplies') => void;
  userRole: UserRole;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, userRole, onLogout }) => {
  const menuItems = [
    ...(userRole === UserRole.ADMIN || userRole === UserRole.OPERATOR ? [
      { id: 'dashboard', label: 'Dashboard Captura', icon: '📊' },
      { id: 'slots', label: 'Huecos Almacén', icon: '📦' }
    ] : []),
    ...(userRole === UserRole.ADMIN || userRole === UserRole.EXPEDITION ? [
      { id: 'expedition', label: 'Control Muelles', icon: '🚛' }
    ] : []),
    ...(userRole === UserRole.ADMIN ? [
      { id: 'supplies', label: 'Suministros', icon: '🛠️' }
    ] : []),
    ...(userRole === UserRole.ADMIN ? [
      { id: 'admin', label: 'Administración', icon: '⚙️' }
    ] : []),
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800">
      <div className="p-6">
        <div className="flex flex-col items-start gap-1 mb-8">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-500 p-2 rounded-lg">
              <span className="text-xl">🏭</span>
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">WHControl</h2>
          </div>
          <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest pl-12">by Ilde</p>
        </div>

        <nav className="space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                activeTab === item.id 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' 
                : 'hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-auto p-6 border-t border-slate-800">
        <button 
          onClick={onLogout}
          className="flex items-center gap-3 text-sm text-slate-400 hover:text-red-400 transition-colors w-full px-4"
        >
          <span>🚪</span>
          <span className="font-bold uppercase text-[10px] tracking-widest">Cerrar Sesión</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
