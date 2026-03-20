
import React from 'react';
import { UserRole } from '../types';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: 'dashboard' | 'slots' | 'admin' | 'expedition' | 'supplies' | 'deliveries' | 'messaging') => void;
  userRole: string;
  permissions: string[];
  onLogout: () => void;
  unreadMessagesCount?: number;
  onRequestNotifications?: () => void;
  notificationPermission?: 'default' | 'granted' | 'denied';
}

const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  setActiveTab, 
  userRole, 
  permissions, 
  onLogout, 
  unreadMessagesCount = 0,
  onRequestNotifications,
  notificationPermission = "default"
}) => {
  const allItems = [
    { id: 'dashboard', label: 'Dashboard Captura', icon: '📊' },
    { id: 'slots', label: 'Huecos Almacén', icon: '📦' },
    { id: 'expedition', label: 'Control Muelles', icon: '🚛' },
    { id: 'deliveries', label: 'Repartos', icon: '📅' },
    { id: 'messaging', label: 'Mensajería', icon: '💬' },
    { id: 'supplies', label: 'Suministros', icon: '🛠️' },
    { id: 'admin', label: 'Administración', icon: '⚙️' },
  ];

  // Filtrar items según permisos (si no hay permisos definidos, se muestra vacío o admin ve todo por seguridad)
  const menuItems = allItems.filter(item => {
    if (userRole === 'admin') return true;
    if (userRole === 'distribución' && item.id === 'deliveries') return true;
    return permissions.includes(item.id);
  });

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

        <nav className="space-y-0.5">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                activeTab === item.id 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' 
                : 'hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span className="text-[11px] font-bold uppercase tracking-tight flex-1">{item.label}</span>
              {item.id === 'messaging' && unreadMessagesCount > 0 && (
                <span className="bg-rose-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow-lg shadow-rose-900/20 animate-pulse">
                  {unreadMessagesCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-auto p-6 border-t border-slate-800 space-y-4">
        {onRequestNotifications && (
          <button 
            onClick={onRequestNotifications}
            className={`flex items-center gap-3 text-[10px] font-black transition-colors w-full px-4 uppercase tracking-widest ${
              notificationPermission === 'granted' 
                ? 'text-emerald-400 hover:text-emerald-300' 
                : notificationPermission === 'denied'
                ? 'text-rose-400 hover:text-rose-300'
                : 'text-indigo-400 hover:text-indigo-300'
            }`}
          >
            <span>{notificationPermission === 'granted' ? '🟢' : notificationPermission === 'denied' ? '🔴' : '🔔'}</span>
            <span>
              {notificationPermission === 'granted' 
                ? 'Avisos Activos' 
                : notificationPermission === 'denied' 
                ? 'Avisos Bloqueados' 
                : 'Activar Avisos'}
            </span>
          </button>
        )}
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
