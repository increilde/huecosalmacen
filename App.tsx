
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
        // Intento simple de lectura para verificar conectividad y existencia de tabla
        const { error } = await supabase.from('warehouse_slots').select('id').limit(1);
        
        if (isMounted) {
          if (error) {
            console.warn("Aviso de Supabase:", error.message);
            // Si el error es que la tabla no existe, pero hay conexión a la URL
            if (error.code === 'PGRST116' || error.message.includes('not found')) {
              setDbConnected(true); // La DB responde, falta la tabla
            } else {
              setDbConnected(false);
            }
          } else {
            setDbConnected(true);
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error("Fallo crítico de conexión:", err);
          setDbConnected(false);
        }
      }
    };
    checkConnection();
    return () => { isMounted = false; };
  }, []);

  const userInitial = String(user.full_name || '?').charAt(0);

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
               <span className="text-[10px] font-bold text-slate-400 uppercase leading-none">Conectividad</span>
               <span className={`text-[10px] font-bold ${dbConnected === true ? 'text-emerald-500' : dbConnected === false ? 'text-rose-500' : 'text-amber-500'}`}>
                 {dbConnected === true ? 'LISTO' : dbConnected === false ? 'ERROR DB' : 'CONECTANDO...'}
               </span>
            </div>
            <span className={`w-3 h-3 rounded-full border-2 border-white shadow-sm ${dbConnected === true ? 'bg-emerald-500' : dbConnected === false ? 'bg-rose-500' : 'bg-amber-500'}`}></span>
            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 border border-indigo-200 ml-2">
              {userInitial}
            </div>
          </div>
        </header>

        <div className="animate-fade-in max-w-4xl mx-auto">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'slots' && <SlotGrid userRole={user.role} />}
          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'admin' && <AdminPanel />}
        </div>
      </main>

      <nav className="md:hidden fixed bottom-4 left-4 right-4 bg-slate-900/95 backdrop-blur-md rounded-3xl shadow-2xl flex items-center justify-around p-3 z-50 border border-slate-800">
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
        {user.role === UserRole.ADMIN && (
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
