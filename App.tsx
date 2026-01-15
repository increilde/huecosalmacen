
import React, { useState, useEffect } from 'react';
import { UserRole, UserProfile } from './types';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import SlotGrid from './components/SlotGrid';
import UserManagement from './components/UserManagement';
import AdminPanel from './components/AdminPanel';
import { supabase } from './supabaseClient';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'slots' | 'users' | 'admin'>('dashboard');
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);
  
  const [user, setUser] = useState<UserProfile | null>({
    id: '1',
    email: 'admin@almacen.com',
    full_name: 'Admin Central',
    role: UserRole.ADMIN, // Configurado como ADMIN para ver el menú
    created_at: new Date().toISOString()
  });

  useEffect(() => {
    async function checkConnection() {
      try {
        const { error } = await supabase.from('warehouse_slots').select('count', { count: 'exact', head: true });
        if (error && error.code !== 'PGRST116') throw error;
        setDbConnected(true);
      } catch (err) {
        setDbConnected(false);
      }
    }
    checkConnection();
  }, []);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50 pb-20 md:pb-0 font-sans">
      <div className="hidden md:block">
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          userRole={user?.role || UserRole.VIEWER} 
        />
      </div>

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <header className="mb-6 flex justify-between items-center bg-white/50 p-3 rounded-2xl backdrop-blur-sm sticky top-0 z-10 border border-white">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs">WH</div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">WHCONTROL</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${dbConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold">
              {user?.full_name[0]}
            </div>
          </div>
        </header>

        <div className="animate-fade-in max-w-4xl mx-auto">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'slots' && <SlotGrid userRole={user?.role || UserRole.VIEWER} />}
          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'admin' && <AdminPanel />}
        </div>
      </main>

      <nav className="md:hidden fixed bottom-4 left-4 right-4 bg-slate-900 rounded-3xl shadow-2xl flex items-center justify-around p-3 z-50 border border-slate-800">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'dashboard' ? 'text-indigo-400 scale-110' : 'text-slate-500'}`}
        >
          <span className="text-xl">📊</span>
          <span className="text-[10px] font-bold uppercase">Captura</span>
        </button>
        <button 
          onClick={() => setActiveTab('slots')}
          className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'slots' ? 'text-indigo-400 scale-110' : 'text-slate-500'}`}
        >
          <span className="text-xl">📦</span>
          <span className="text-[10px] font-bold uppercase">Mapa</span>
        </button>
        {user?.role === UserRole.ADMIN && (
          <button 
            onClick={() => setActiveTab('admin')}
            className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'admin' ? 'text-indigo-400 scale-110' : 'text-slate-500'}`}
          >
            <span className="text-xl">⚙️</span>
            <span className="text-[10px] font-bold uppercase">Admin</span>
          </button>
        )}
      </nav>
    </div>
  );
};

export default App;
