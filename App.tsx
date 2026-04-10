
import React, { useState, useEffect } from 'react';
import { UserRole, UserProfile, Machinery, Role } from './types';
import Sidebar from './components/Sidebar';
import ProfileModal from './components/ProfileModal';
import Dashboard from './components/Dashboard';
import SlotGrid from './components/SlotGrid';
import AdminPanel from './components/AdminPanel';
import ExpeditionPanel from './components/ExpeditionPanel';
import SuppliesPanel from './components/SuppliesPanel';
import DeliveriesPanel from './components/DeliveriesPanel';
import InstallationsPanel from './components/InstallationsPanel';
import AiresPanel from './components/AiresPanel';
import MessagingPanel from './components/MessagingPanel';
import RTCPanel from './components/RTCPanel';
import InventoryPanel from './components/InventoryPanel';
import LiveMapView from './components/LiveMapView';
import { supabase } from './supabaseClient';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'slots' | 'admin' | 'expedition' | 'supplies' | 'deliveries' | 'installations' | 'messaging' | 'rtc' | 'inventory' | 'aires'>('dashboard');
  const [dbStatus, setDbStatus] = useState<{connected: boolean | null, error: string | null}>({
    connected: null,
    error: null
  });
  
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [lastNotification, setLastNotification] = useState<{sender: string, text: string, conversationId: string} | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<'default' | 'granted' | 'denied'>("default");
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [targetConversationId, setTargetConversationId] = useState<string | null>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [sessionMachinery, setSessionMachinery] = useState<{ forklift: string, pda: string } | null>(null);
  const [allMachinery, setAllMachinery] = useState<Machinery[]>([]);
  const [selectionForm, setSelectionForm] = useState({ forklift: '', pda: '' });

  // Request notification permission on mount and setup audio
  useEffect(() => {
    const checkPermission = () => {
      if ("Notification" in window) {
        setNotificationPermission(window.Notification.permission);
      }
    };

    checkPermission();
    
    // Re-check when user returns to the tab
    window.addEventListener('focus', checkPermission);

    const requestPermission = async () => {
      if ("Notification" in window) {
        if (window.Notification.permission === "default") {
          const permission = await window.Notification.requestPermission();
          setNotificationPermission(permission);
        }
      }
    };
    requestPermission();

    // Register a simple service worker for better notification support
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW registration failed', err));
    }

    return () => window.removeEventListener('focus', checkPermission);
  }, []);

  const playNotificationSound = () => {
    try {
      const audio = new window.Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
      audio.volume = 0.5;
      audio.play();
    } catch (e) {
      console.error("Error playing sound:", e);
    }
  };

  // Update document title when unread count changes
  useEffect(() => {
    const originalTitle = "WHControl - Warehouse Slot Control";
    
    if (unreadMessagesCount > 0) {
      document.title = `(${unreadMessagesCount}) Nuevo Mensaje - WHControl`;
    } else {
      document.title = originalTitle;
    }

    return () => {
      document.title = originalTitle;
    };
  }, [unreadMessagesCount]);

  const requestNotificationPermission = async () => {
    if ("Notification" in window) {
      // Force a re-check of the current state first
      setNotificationPermission(window.Notification.permission);
      
      const permission = await window.Notification.requestPermission();
      setNotificationPermission(permission);
      
      if (permission === "granted") {
        sendTestNotification();
      } else if (permission === "denied") {
        // If it's denied but user thinks it's enabled, it's likely an iframe issue
        alert("El navegador sigue reportando las notificaciones como bloqueadas. \n\nSi ya las has activado en el candado 🔒, intenta abrir la aplicación en una PESTAÑA NUEVA usando el botón de la esquina superior derecha para saltar las restricciones del marco de seguridad.");
      }
    }
  };

  const sendTestNotification = () => {
    if ("Notification" in window && window.Notification.permission === "granted") {
      playNotificationSound();
      const options = {
        body: "Esta es una notificación de prueba de WHControl.",
        icon: "/favicon.ico",
        tag: "test-notification",
        requireInteraction: true // Keep it on screen longer
      };
      
      console.log("🚀 Enviando notificación de prueba...");
      
      // Try Service Worker notification first (more robust)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification("Prueba de WHControl", options);
          console.log("✅ Notificación enviada vía Service Worker");
        }).catch(err => {
          console.warn("⚠️ Error en SW, usando fallback:", err);
          new window.Notification("Prueba de WHControl", options);
        });
      } else {
        new window.Notification("Prueba de WHControl", options);
        console.log("✅ Notificación enviada vía API estándar");
      }
    } else {
      alert("No hay permiso para notificaciones. Estado actual: " + (window.Notification?.permission || 'no soportado'));
    }
  };

  const fetchRolePermissions = React.useCallback(async (roleName: string) => {
    try {
      const { data } = await supabase.from('roles').select('permissions').eq('name', roleName).single();
      if (data && data.permissions) {
        let perms = Array.isArray(data.permissions) ? data.permissions : JSON.parse(data.permissions || '[]');
        
        const role = roleName.toLowerCase();
        const isDistri = role === 'admin' || role === 'distribución' || role === 'distribucion' || role === 'supervisor_distri';

        // Asegurar que el nuevo tab de repartos esté disponible para admin, distribución y supervisor_distri
        if (isDistri) {
          if (!perms.includes('deliveries')) perms.push('deliveries');
          if (!perms.includes('installations')) perms.push('installations');
          if (!perms.includes('aires')) perms.push('aires');
          if (!perms.includes('rtc')) perms.push('rtc');
        }

        setUserPermissions(perms);
      }
    } catch (e) {
      console.error("Error al obtener permisos:", e);
    }
  }, []); // No dependencies, fetch once

  // Efecto para validar permisos de la pestaña activa
  useEffect(() => {
    if (user && userPermissions.length > 0) {
      const role = user.role.toLowerCase();
      const isDistri = role === 'admin' || role === 'distribución' || role === 'distribucion' || role === 'supervisor_distri';

      const hasAccess = userPermissions.some(p => p.toLowerCase() === activeTab.toLowerCase()) || 
                       (activeTab === 'deliveries' && isDistri) ||
                       (activeTab === 'installations' && isDistri) ||
                       (activeTab === 'aires' && isDistri) ||
                       (activeTab === 'rtc' && isDistri) ||
                       (activeTab === 'inventory' && role === 'admin') ||
                       (activeTab === 'admin' && role === 'supervisor_distri') ||
                       (activeTab === 'messaging' && (user.has_messaging_access || role === 'admin' || userPermissions.some(p => p.toLowerCase() === 'messaging')));
      
      if (!hasAccess) {
        if (userPermissions.some(p => p.toLowerCase() === 'dashboard')) setActiveTab('dashboard');
        else if (userPermissions.some(p => p.toLowerCase() === 'expedition')) setActiveTab('expedition');
        else if (userPermissions.length > 0) setActiveTab(userPermissions[0] as any);
      }
    }
  }, [user, userPermissions, activeTab]);

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
        
        // Refresh profile from DB to get latest permissions and data
        supabase.from('profiles')
          .select('*')
          .eq('id', parsed.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data) {
              setUser(data);
              localStorage.setItem('wh_user', JSON.stringify(data));
              fetchRolePermissions(data.role);
            }
          });
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
  }, [fetchRolePermissions]);

  useEffect(() => {
    if (user && !sessionMachinery && user.prompt_machinery) {
      fetchMachinery();
    }
  }, [user, sessionMachinery]);

  useEffect(() => {
    if (!user) return;

    let watchId: number | null = null;

    const startTracking = () => {
      if ("geolocation" in navigator) {
        watchId = navigator.geolocation.watchPosition(
          async (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            // Solo enviar a Supabase si hay maquinaria asignada O si es admin (para pruebas)
            if (sessionMachinery || user.role.toLowerCase() === 'admin') {
              try {
                await supabase.from('operator_locations').insert([{
                  operator_email: user.email,
                  latitude,
                  longitude,
                  accuracy,
                  machinery_id: sessionMachinery?.forklift || 'ADMIN_TEST'
                }]);
              } catch (err) {
                console.error("Error al enviar ubicación:", err);
              }
            }
          },
          (error) => {
            console.error("Error de geolocalización:", error);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          }
        );
      }
    };

    startTracking();

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
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
          has_messaging_access: !!data.has_messaging_access,
          avatar_url: data.avatar_url,
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
    setUnreadMessagesCount(0);
    localStorage.removeItem('wh_user');
    localStorage.removeItem('wh_session_machinery');
  };

  // Fetch unread messages count
  const fetchUnreadCount = React.useCallback(async () => {
    if (!user) return;
    try {
      // 1. Get user's conversations
      const { data: memberData } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', user.id);
      
      if (!memberData || memberData.length === 0) {
        setUnreadMessagesCount(0);
        return;
      }

      const conversationIds = memberData.map(m => m.conversation_id);

      // 2. Count unread messages in those conversations not sent by user
      const { count, error } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .in('conversation_id', conversationIds)
        .eq('is_read', false)
        .neq('sender_id', user.id);

      if (!error) {
        setUnreadMessagesCount(count || 0);
      }
    } catch (err) {
      console.error("Error fetching unread count:", err);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchUnreadCount();

      // Subscribe to new messages for notifications
      const channel = supabase
        .channel('global-messages')
        .on('postgres_changes', { event: 'INSERT', table: 'messages' }, async (payload) => {
          const newMessage = payload.new;
          
          if (newMessage.sender_id === user.id) return;

          // Check if user is in this conversation
          const { data: isMember } = await supabase
            .from('conversation_members')
            .select('id')
            .eq('conversation_id', newMessage.conversation_id)
            .eq('user_id', user.id)
            .maybeSingle();

          if (isMember) {
            fetchUnreadCount();
            
            // Show notification if not in messaging tab OR if the document is hidden
            if (activeTab !== 'messaging' || document.hidden) {
              const senderName = newMessage.sender_name || 'Alguien';
              const messageText = newMessage.content || '📷 Imagen';

              setLastNotification({
                sender: senderName,
                text: messageText,
                conversationId: newMessage.conversation_id
              });

              // Trigger System Notification immediately if hidden
              if (document.hidden) {
                playNotificationSound();

                if ("Notification" in window && window.Notification.permission === "granted") {
                  const options = {
                    body: messageText,
                    icon: "/favicon.ico",
                    tag: "new-message",
                    renotify: true,
                    silent: false // We play our own sound but let system know
                  };

                  // Try Service Worker notification first (more robust)
                  if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.ready.then(registration => {
                      registration.showNotification(`Nuevo mensaje de ${senderName}`, options);
                    }).catch(() => {
                      // Fallback to standard Notification
                      new window.Notification(`Nuevo mensaje de ${senderName}`, options);
                    });
                  } else {
                    // Standard Notification fallback
                    new window.Notification(`Nuevo mensaje de ${senderName}`, options);
                  }
                }
              }

              // Clear notification after 8 seconds
              setTimeout(() => setLastNotification(null), 8000);
            }
          }
        })
        .on('postgres_changes', { event: 'UPDATE', table: 'messages' }, (payload) => {
          // If a message was marked as read, update count
          if (payload.new.is_read !== payload.old.is_read) {
            fetchUnreadCount();
          }
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, fetchUnreadCount, activeTab]);

  // Verificar si estamos en modo "Mapa en Vivo" (Ventana Nueva)
  const isLiveMapView = typeof window !== 'undefined' && new window.URLSearchParams(window.location.search).get('view') === 'live-map';

  if (isLiveMapView) {
    return <LiveMapView />;
  }

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
          hasMessagingAccess={user.has_messaging_access || user.role.toLowerCase() === 'admin'}
          onLogout={logout}
          unreadMessagesCount={unreadMessagesCount}
          onRequestNotifications={requestNotificationPermission}
          onTestNotification={sendTestNotification}
          notificationPermission={notificationPermission}
        />
      </div>

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <header className="mb-6 flex justify-between items-center bg-white/50 p-3 rounded-2xl backdrop-blur-sm sticky top-0 z-10 border border-white">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-lg">WH</div>
            <h1 className="text-lg font-black text-slate-800 uppercase tracking-tight">WH Control <span className="text-indigo-600">by Ilde</span></h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">{user.role.toUpperCase()}</p>
              <p className="text-[11px] font-black text-slate-800 uppercase leading-none">{user.full_name}</p>
            </div>
            <button 
              onClick={() => setIsProfileModalOpen(true)}
              className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 hover:text-indigo-600 transition-all border border-slate-200 shadow-sm overflow-hidden"
              title="Editar Perfil"
            >
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              )}
            </button>
          </div>
        </header>

        <ProfileModal 
          user={user} 
          isOpen={isProfileModalOpen} 
          onClose={() => setIsProfileModalOpen(false)} 
          onUpdate={(updatedUser) => setUser(updatedUser)}
        />

        <div className="animate-fade-in max-w-5xl mx-auto">
          {activeTab === 'dashboard' && <Dashboard user={user} />}
          {activeTab === 'slots' && <SlotGrid userRole={user.role as any} />}
          {activeTab === 'admin' && <AdminPanel user={user} />}
          {activeTab === 'expedition' && <ExpeditionPanel user={user} />}
          {activeTab === 'supplies' && <SuppliesPanel />}
          {activeTab === 'deliveries' && <DeliveriesPanel user={user} />}
          {activeTab === 'installations' && <InstallationsPanel user={user} />}
          {activeTab === 'aires' && <AiresPanel user={user} />}
          {activeTab === 'rtc' && <RTCPanel user={user} />}
          {activeTab === 'inventory' && <InventoryPanel user={user} />}
          {activeTab === 'messaging' && (
            <MessagingPanel 
              user={user} 
              targetConversationId={targetConversationId} 
              onConversationSelected={() => setTargetConversationId(null)}
            />
          )}
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
        {(userPermissions.includes('deliveries') || user.role.toLowerCase() === 'admin' || user.role.toLowerCase() === 'distribución' || user.role.toLowerCase() === 'distribucion') && (
          <button onClick={() => setActiveTab('deliveries')} className={`flex flex-col items-center gap-1 ${activeTab === 'deliveries' ? 'text-indigo-400' : 'text-slate-500'}`}>
            <span className="text-xl">📅</span>
          </button>
        )}
        {(userPermissions.includes('installations') || user.role.toLowerCase() === 'admin' || user.role.toLowerCase() === 'distribución' || user.role.toLowerCase() === 'distribucion') && (
          <button onClick={() => setActiveTab('installations')} className={`flex flex-col items-center gap-1 ${activeTab === 'installations' ? 'text-indigo-400' : 'text-slate-500'}`}>
            <span className="text-xl">🛠️</span>
          </button>
        )}
        {(userPermissions.includes('aires') || user.role.toLowerCase() === 'admin' || user.role.toLowerCase() === 'distribución' || user.role.toLowerCase() === 'distribucion') && (
          <button onClick={() => setActiveTab('aires')} className={`flex flex-col items-center gap-1 ${activeTab === 'aires' ? 'text-indigo-400' : 'text-slate-500'}`}>
            <span className="text-xl">❄️</span>
          </button>
        )}
        {(userPermissions.includes('rtc') || user.role.toLowerCase() === 'admin' || user.role.toLowerCase() === 'distribución' || user.role.toLowerCase() === 'distribucion') && (
          <button onClick={() => setActiveTab('rtc')} className={`flex flex-col items-center gap-1 ${activeTab === 'rtc' ? 'text-indigo-400' : 'text-slate-500'}`}>
            <span className="text-xl">🚛</span>
          </button>
        )}
        {(userPermissions.includes('inventory') || user.role.toLowerCase() === 'admin') && (
          <button onClick={() => setActiveTab('inventory')} className={`flex flex-col items-center gap-1 ${activeTab === 'inventory' ? 'text-indigo-400' : 'text-slate-500'}`}>
            <span className="text-xl">📋</span>
          </button>
        )}
        {(userPermissions.some(p => p.toLowerCase() === 'messaging') || user.has_messaging_access || user.role.toLowerCase() === 'admin') && (
          <button onClick={() => setActiveTab('messaging')} className={`flex flex-col items-center gap-1 relative ${activeTab === 'messaging' ? 'text-indigo-400' : 'text-slate-500'}`}>
            <span className="text-xl">💬</span>
            {unreadMessagesCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-slate-900 animate-pulse">
                {unreadMessagesCount > 9 ? '+9' : unreadMessagesCount}
              </span>
            )}
          </button>
        )}
        {userPermissions.includes('admin') && (
          <button onClick={() => setActiveTab('admin')} className={`flex flex-col items-center gap-1 ${activeTab === 'admin' ? 'text-indigo-400' : 'text-slate-500'}`}>
            <span className="text-xl">⚙️</span>
          </button>
        )}
        <button onClick={logout} className="text-rose-400 text-xl">🚪</button>
      </nav>

      {/* Global Notification Toast */}
      {lastNotification && (
        <div 
          className="fixed top-20 right-4 left-4 md:left-auto md:w-80 z-[100] bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border border-slate-800 animate-fade-in cursor-pointer"
          onClick={() => { 
            setTargetConversationId(lastNotification.conversationId);
            setActiveTab('messaging'); 
            setLastNotification(null); 
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-xl">💬</div>
            <div className="flex-1 overflow-hidden">
              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-0.5">Nuevo mensaje</p>
              <p className="text-xs font-bold truncate">
                <span className="text-indigo-300">{lastNotification.sender}:</span> {lastNotification.text}
              </p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); setLastNotification(null); }} className="text-slate-500 hover:text-white">✕</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
