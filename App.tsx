
import React, { useState, useEffect } from 'react';
import { UserRole, UserProfile } from './types';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import SlotGrid from './components/SlotGrid';
import UserManagement from './components/UserManagement';
import AdminPanel from './components/AdminPanel';
import ExpeditionPanel from './components/ExpeditionPanel';
import SuppliesPanel from './components/SuppliesPanel';
import { supabase } from './supabaseClient';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'slots' | 'users' | 'admin' | 'expedition' | 'supplies'>('dashboard');
  const [dbStatus, setDbStatus] = useState<{connected: boolean | null, error: string | null}>({
    connected: null,
    error: null
  });
  
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('wh_user');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      setUser(parsed);
      if (parsed.role === UserRole.EXPEDITION) {
        setActiveTab('expedition');
      }
    }

    let isMounted = true;
    const checkConnection = async () => {
      try {
        const { error } = await supabase.from('warehouse_slots').select('id').limit(1);
        if (isMounted) {
          if (error) {
            setDbStatus({ connected: false, error: error.message });
          } else {
            setDbStatus({ connected: true, error: null });
          }
        }
      } catch (err: any) {
        if (isMounted) setDbStatus({ connected: false, error: String(err?.message) });
      }
    };
    checkConnection();
    return () => { isMounted = false; };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', loginForm.username.toLowerCase().trim())
        .eq('password_plain', loginForm.password.trim())
        .single();

      if (error || !data) {
        setLoginError('Usuario o contraseña incorrectos');
      } else {
        const profile: UserProfile = {
          id: data.id,
          email: data.email, 
          full_name: data.full_name,
          role: data.role as UserRole,
          created_at: data.created_at
        };
        setUser(profile);
        localStorage.setItem('wh_user', JSON.stringify(profile));
        
        if (profile.role === UserRole.EXPEDITION) {
          setActiveTab('expedition');
        } else {
          setActiveTab('dashboard');
        }
      }
    } catch (err) {
      setLoginError('Error de conexión con la base de datos');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('wh_user');
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-[3rem] p-10 shadow-2xl animate-fade-in text-center">
          <div className="bg-indigo-600 w-16 h-16 rounded-3xl flex items-center justify-center text-white text-2xl mx-auto mb-6 shadow-xl shadow-indigo-500/30 font-black">WH</div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight mb-2">WareHouse Control</h1>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mb-10">by Ilde</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block text-left ml-2">Usuario</label>
              <input 
                type="text" 
                placeholder="Escribe tu usuario" 
                value={loginForm.username}
                onChange={(e) => setLoginForm({...loginForm, username: e.target.value})}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 font-black text-slate-700 outline-none focus:border-indigo-500 transition-all uppercase text-center"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block text-left ml-2">Contraseña</label>
              <input 
                type="password" 
                placeholder="••••" 
                value={loginForm.password}
                onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 font-black text-slate-700 outline-none focus:border-indigo-500 transition-all text-center tracking-widest"
                required
              />
            </div>
            {loginError && <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest bg-rose-50 p-3 rounded-xl border border-rose-100">{loginError}</p>}
            <button 
              disabled={isLoggingIn}
              className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-indigo-200 active:scale-95 transition-all uppercase tracking-widest text-xs mt-4 disabled:opacity-50"
            >
              {isLoggingIn ? 'ENTRANDO...' : 'INICIAR SESIÓN'}
            </button>
          </form>
          <p className="mt-8 text-[9px] font-black text-slate-300 uppercase tracking-widest italic">Acceso restringido a personal autorizado</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50 pb-20 md:pb-0 font-sans">
      <div className="hidden md:block">
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={setActiveTab as any} 
          userRole={user.role} 
          onLogout={logout}
        />
      </div>

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <header className="mb-6 flex justify-between items-center bg-white/50 p-3 rounded-2xl backdrop-blur-sm sticky top-0 z-10 border border-white">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-indigo-200">WH</div>
            <h1 className="text-lg font-black text-slate-800 tracking-tight uppercase">WH Control <span className="text-indigo-600 font-black">by Ilde</span></h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">{user.role}</p>
              <p className="text-[11px] font-black text-slate-800 uppercase leading-none">{user.full_name}</p>
            </div>
            <span className={`w-3 h-3 rounded-full border-2 border-white shadow-sm ${dbStatus.connected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
          </div>
        </header>

        <div className="animate-fade-in max-w-5xl mx-auto">
          {activeTab === 'dashboard' && <Dashboard user={user} />}
          {activeTab === 'slots' && <SlotGrid userRole={user.role} />}
          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'admin' && <AdminPanel />}
          {activeTab === 'expedition' && <ExpeditionPanel user={user} />}
          {activeTab === 'supplies' && <SuppliesPanel />}
        </div>
      </main>

      <nav className="md:hidden fixed bottom-4 left-4 right-4 bg-slate-900/95 backdrop-blur-md rounded-3xl shadow-2xl flex items-center justify-around p-3 z-50 border border-slate-800">
        {(user.role === UserRole.ADMIN || user.role === UserRole.OPERATOR) && (
          <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1 ${activeTab === 'dashboard' ? 'text-indigo-400' : 'text-slate-500'}`}>
            <span className="text-xl">📊</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Captura</span>
          </button>
        )}
        {(user.role === UserRole.ADMIN || user.role === UserRole.OPERATOR) && (
          <button onClick={() => setActiveTab('slots')} className={`flex flex-col items-center gap-1 ${activeTab === 'slots' ? 'text-indigo-400' : 'text-slate-500'}`}>
            <span className="text-xl">📦</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Mapa</span>
          </button>
        )}
        {(user.role === UserRole.ADMIN || user.role === UserRole.EXPEDITION) && (
          <button onClick={() => setActiveTab('expedition')} className={`flex flex-col items-center gap-1 ${activeTab === 'expedition' ? 'text-indigo-400' : 'text-slate-500'}`}>
            <span className="text-xl">🚛</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Muelles</span>
          </button>
        )}
        {user.role === UserRole.ADMIN && (
          <button onClick={() => setActiveTab('supplies')} className={`flex flex-col items-center gap-1 ${activeTab === 'supplies' ? 'text-indigo-400' : 'text-slate-500'}`}>
            <span className="text-xl">🛠️</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Suministros</span>
          </button>
        )}
        {user.role === UserRole.ADMIN && (
          <button onClick={() => setActiveTab('admin')} className={`flex flex-col items-center gap-1 ${activeTab === 'admin' ? 'text-indigo-400' : 'text-slate-500'}`}>
            <span className="text-xl">⚙️</span>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Admin</span>
          </button>
        )}
        <button onClick={logout} className="flex flex-col items-center gap-1 text-rose-400">
          <span className="text-xl">🚪</span>
          <span className="text-[10px] font-bold uppercase tracking-tighter">Salir</span>
        </button>
      </nav>
    </div>
  );
};

export default App;
