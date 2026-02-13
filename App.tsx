
import React, { useState, useEffect } from 'react';
import { UserRole, UserProfile, Machinery, Role } from './types';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import SlotGrid from './components/SlotGrid';
import AdminPanel from './components/AdminPanel';
import ExpeditionPanel from './components/ExpeditionPanel';
import SuppliesPanel from './components/SuppliesPanel';
import { supabase } from './supabaseClient';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'slots' | 'admin' | 'expedition' | 'supplies'>('dashboard');
  const [dbStatus, setDbStatus] = useState<{connected: boolean | null, error: string | null}>({
    connected: null,
    error: null
  });
  
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [sessionMachinery, setSessionMachinery] = useState<{ forklift: string, pda: string } | null>(null);
  const [allMachinery, setAllMachinery] = useState<Machinery[]>([]);
  const [selectionForm, setSelectionForm] = useState({ forklift: '', pda: '' });

  // Efecto para cierre de sesión automático a las 23:59
  useEffect(() => {
    const checkMidnight = setInterval(() => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      
      // Cerramos sesión justo en el último minuto del día
      if (hours === 23 && minutes === 59 && user) {
        logout();
      }
    }, 60000); // Revisar cada minuto

    return () => clearInterval(checkMidnight);
  }, [user]);

  useEffect(() => {
    const savedUser = localStorage.getItem('wh_user');
    const savedMachinery = localStorage.getItem('wh_session_machinery');
    
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setUser(parsed);
        fetchRolePermissions(parsed.role);
      } catch (e) {
        localStorage.removeItem('wh_user');
      }
    }

    if (savedMachinery) {
      try {
        setSessionMachinery(JSON.parse(savedMachinery));
      } catch (e) {
        localStorage.removeItem('wh_session_machinery');
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

  const fetchRolePermissions = async (roleName: string) => {
    try {
      const { data } = await supabase.from('roles').select('permissions').eq('name', roleName).single();
      if (data && data.permissions) {
        const perms = Array.isArray(data.permissions) ? data.permissions : JSON.parse(data.permissions || '[]');
        setUserPermissions(perms);
        
        if (perms.length > 0 && !perms.includes(activeTab)) {
          if (perms.includes('dashboard')) setActiveTab('dashboard');
          else if (perms.includes('expedition')) setActiveTab('expedition');
          else setActiveTab(perms[0] as any);
        }
      }
    } catch (e) {
      console.error("Error al obtener permisos:", e);
    }
  };

  useEffect(() => {
    if (user && !sessionMachinery && user.prompt_machinery) {
      fetchMachinery();
    }
  }, [user, sessionMachinery]);

  const fetchMachinery = async () => {
    const { data } = await supabase.from('machinery').select('*').order('identifier');
    if (data) setAllMachinery(data);
  };

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
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setLoginError('Usuario o contraseña incorrectos');
      } else {
        const profile: UserProfile = {
          id: data.id,
          email: data.email, 
          full_name: data.full_name,
          role: data.role,
          // Si la columna no existe en el DB por falta de SQL, data.prompt_machinery será undefined
          prompt_machinery: !!data.prompt_machinery,
          created_at: data.created_at
        };
        setUser(profile);
        localStorage.setItem('wh_user', JSON.stringify(profile));
        await fetchRolePermissions(profile.role);
      }
    } catch (err: any) {
      setLoginError('Error de acceso: ' + (err.message || 'Error de conexión'));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSelectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectionForm.forklift || !selectionForm.pda) {
      alert("Debes seleccionar carretilla y PDA");
      return;
    }
    const selection = { forklift: selectionForm.forklift, pda: selectionForm.pda };
    setSessionMachinery(selection);
    localStorage.setItem('wh_session_machinery', JSON.stringify(selection));
  };

  const logout = () => {
    setUser(null);
    setUserPermissions([]);
    setSessionMachinery(null);
    localStorage.removeItem('wh_user');
    localStorage.removeItem('wh_session_machinery');
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-[3rem] p-10 shadow-2xl animate-fade-in text-center border border-white">
          <div className="bg-indigo-600 w-16 h-16 rounded-3xl flex items-center justify-center text-white text-2xl mx-auto mb-6 shadow-xl shadow-indigo-500/30 font-black">WH</div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight mb-2 uppercase">WareHouse Control</h1>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mb-10">by Ilde</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <input 
              type="text" 
              placeholder="USUARIO" 
              value={loginForm.username}
              onChange={(e) => setLoginForm({...loginForm, username: e.target.value})}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 font-black text-slate-700 outline-none focus:border-indigo-500 transition-all uppercase text-center"
              required
            />
            <input 
              type="password" 
              placeholder="CONTRASEÑA" 
              value={loginForm.password}
              onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 font-black text-slate-700 outline-none focus:border-indigo-500 transition-all text-center"
              required
            />
            {loginError && <p className="text-rose-500 text-[10px] font-black uppercase bg-rose-50 p-3 rounded-xl">{loginError}</p>}
            <button disabled={isLoggingIn} className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl uppercase tracking-widest text-xs disabled:opacity-50">
              {isLoggingIn ? 'ENTRANDO...' : 'INICIAR SESIÓN'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!sessionMachinery && user.prompt_machinery) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-[3rem] p-10 shadow-2xl text-center border border-white">
          <div className="bg-amber-500 w-16 h-16 rounded-3xl flex items-center justify-center text-white text-2xl mx-auto mb-6 font-black">🛠️</div>
          <h1 className="text-xl font-black text-slate-800 uppercase">Configuración Jornada</h1>
          <form onSubmit={handleSelectionSubmit} className="space-y-6 mt-8">
            <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 font-black uppercase text-center" value={selectionForm.forklift} onChange={e => setSelectionForm({...selectionForm, forklift: e.target.value})} required>
              <option value="">-- ELIGE CARRETILLA --</option>
              {allMachinery.filter(m => m.type === 'carretilla').map(m => <option key={m.id} value={m.identifier}>{m.identifier}</option>)}
            </select>
            <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 font-black uppercase text-center" value={selectionForm.pda} onChange={e => setSelectionForm({...selectionForm, pda: e.target.value})} required>
              <option value="">-- ELIGE PDA --</option>
              {allMachinery.filter(m => m.type === 'pda').map(m => <option key={m.id} value={m.identifier}>{m.identifier}</option>)}
            </select>
            <button className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl uppercase tracking-widest text-xs">COMENZAR JORNADA</button>
            <button type="button" onClick={logout} className="w-full py-2 text-slate-400 font-black text-[9px] uppercase">SALIR</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-slate-50 pb-20 md:pb-0 font-sans">
      <div className="hidden md:block">
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          userRole={user.role} 
          permissions={userPermissions}
          onLogout={logout}
        />
      </div>

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <header className="mb-6 flex justify-between items-center bg-white/50 p-3 rounded-2xl backdrop-blur-sm sticky top-0 z-10 border border-white">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-lg">WH</div>
            <h1 className="text-lg font-black text-slate-800 uppercase tracking-tight">WH Control <span className="text-indigo-600">by Ilde</span></h1>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">{user.role.toUpperCase()}</p>
            <p className="text-[11px] font-black text-slate-800 uppercase leading-none">{user.full_name}</p>
          </div>
        </header>

        <div className="animate-fade-in max-w-5xl mx-auto">
          {activeTab === 'dashboard' && <Dashboard user={user} />}
          {activeTab === 'slots' && <SlotGrid userRole={user.role as any} />}
          {activeTab === 'admin' && <AdminPanel user={user} />}
          {activeTab === 'expedition' && <ExpeditionPanel user={user} />}
          {activeTab === 'supplies' && <SuppliesPanel />}
        </div>
      </main>

      <nav className="md:hidden fixed bottom-4 left-4 right-4 bg-slate-900/95 backdrop-blur-md rounded-3xl shadow-2xl flex items-center justify-around p-3 z-50 border border-slate-800">
        {userPermissions.includes('dashboard') && (
          <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1 ${activeTab === 'dashboard' ? 'text-indigo-400' : 'text-slate-500'}`}>
            <span className="text-xl">📊</span>
          </button>
        )}
        {userPermissions.includes('slots') && (
          <button onClick={() => setActiveTab('slots')} className={`flex flex-col items-center gap-1 ${activeTab === 'slots' ? 'text-indigo-400' : 'text-slate-500'}`}>
            <span className="text-xl">📦</span>
          </button>
        )}
        {userPermissions.includes('expedition') && (
          <button onClick={() => setActiveTab('expedition')} className={`flex flex-col items-center gap-1 ${activeTab === 'expedition' ? 'text-indigo-400' : 'text-slate-500'}`}>
            <span className="text-xl">🚛</span>
          </button>
        )}
        {userPermissions.includes('supplies') && (
          <button onClick={() => setActiveTab('supplies')} className={`flex flex-col items-center gap-1 ${activeTab === 'supplies' ? 'text-indigo-400' : 'text-slate-500'}`}>
            <span className="text-xl">🛠️</span>
          </button>
        )}
        {userPermissions.includes('admin') && (
          <button onClick={() => setActiveTab('admin')} className={`flex flex-col items-center gap-1 ${activeTab === 'admin' ? 'text-indigo-400' : 'text-slate-500'}`}>
            <span className="text-xl">⚙️</span>
          </button>
        )}
        <button onClick={logout} className="text-rose-400 text-xl">🚪</button>
      </nav>
    </div>
  );
};

export default App;
