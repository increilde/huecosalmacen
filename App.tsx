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
  const [dbStatus, setDbStatus] = useState<{connected: boolean | null, error: string | null}>({
    connected: null,
    error: null
  });
  
  const [user] = useState<UserProfile>({
    id: '1',
    email: 'admin@almacen.com',
    full_name: 'Admin Central',
    role: UserRole.ADMIN,
    created_at: new Date().toISOString()
  });

  useEffect(() => {
    let isMounted = true;
    const checkConnection = async () => {
      try {
        const { error } = await supabase.from('warehouse_slots').select('id').limit(1);
        
        if (isMounted) {
          if (error) {
            console.error("Supabase Error:", error);
            // IMPORTANTE PARA REACT 19: Convertir el error a string plano para evitar Error #31
            const errorMessage = error.message || (typeof error === 'string' ? error : JSON.stringify(error));
            const isTableMissing = error.code === 'PGRST116' || errorMessage.includes('relation') || errorMessage.includes('not found');
            
            setDbStatus({
              connected: isTableMissing,
              error: isTableMissing ? 'Conectado a Supabase. Falta crear tabla "warehouse_slots".' : errorMessage
            });
          } else {
            setDbStatus({ connected: true, error: null });
          }
        }
      } catch (err: any) {
        if (isMounted) {
          const catchMsg = err?.message || 'Error de red crítico';
          setDbStatus({ 
            connected: false, 
            error: typeof catchMsg === 'string' ? catchMsg : JSON.stringify(catchMsg)
          });
        }
      }
    };
    checkConnection();
    return () => { isMounted = false; };
  }, []);

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50 pb-20 md:pb-0 font-sans">
      <div className="hidden md:block">
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          userRole={user.role} 
        />
      </div>

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <header className="mb-6 flex justify-between items-center bg-white/50 p-3 rounded-2xl backdrop-blur-sm sticky top-0 z-10 border border-white">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-indigo-200">WH</div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">WHCONTROL</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end mr-2 hidden xs:flex">
               <span className="text-[10px] font-bold text-slate-400 uppercase leading-none">Estado DB</span>
               <span className={`text-[10px] font-bold ${dbStatus.connected ? 'text-emerald-500' : 'text-rose-500'}`}>
                 {dbStatus.connected ? 'ONLINE' : dbStatus.error ? 'ERROR' : '...'}
               </span>
            </div>
            <span className={`w-3 h-3 rounded-full border-2 border-white shadow-sm ${dbStatus.connected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
          </div>
        </header>

        {dbStatus.error && !dbStatus.connected && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-800 text-sm animate-fade-in">
            <p className="font-bold flex items-center gap-2">⚠️ Error de Sistema:</p>
            <p className="font-mono text-[11px] mt-1 bg-white/50 p-2 rounded-lg border border-rose-200 break-words leading-tight">
              {dbStatus.error}
            </p>
          </div>
        )}

        <div className="animate-fade-in max-w-4xl mx-auto">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'slots' && <SlotGrid userRole={user.role} />}
          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'admin' && <AdminPanel />}
        </div>
      </main>

      <nav className="md:hidden fixed bottom-4 left-4 right-4 bg-slate-900/95 backdrop-blur-md rounded-3xl shadow-2xl flex items-center justify-around p-3 z-50 border border-slate-800">
        <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1 ${activeTab === 'dashboard' ? 'text-indigo-400' : 'text-slate-500'}`}>
          <span className="text-xl">📊</span>
          <span className="text-[10px] font-bold uppercase tracking-tighter">Captura</span>
        </button>
        <button onClick={() => setActiveTab('slots')} className={`flex flex-col items-center gap-1 ${activeTab === 'slots' ? 'text-indigo-400' : 'text-slate-500'}`}>
          <span className="text-xl">📦</span>
          <span className="text-[10px] font-bold uppercase tracking-tighter">Mapa</span>
        </button>
        {user.role === UserRole.ADMIN && (
          <button onClick={() => setActiveTab('admin')} className={`flex flex-col items-center gap-1 ${activeTab === 'admin' ? 'text-indigo-400' : 'text-slate-500'}`}>
            <span className="text-xl">⚙️</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Admin</span>
          </button>
        )}
      </nav>
    </div>
  );
};

export default App;