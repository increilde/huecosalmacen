
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { WarehouseSlot, UserProfile, Task, CustomerPickup } from '../types';
import ScannerModal from './ScannerModal';

interface DashboardProps {
  user: UserProfile;
}

interface MovementLog {
  id: string;
  cart_id: string;
  slot_code: string;
  new_quantity: number;
  created_at: string;
  operator_name?: string;
}

// Eliminadas funciones auxiliares de Gemini TTS para usar Web Speech API (Gratis)

const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  const [cartId, setCartId] = useState('');
  const [slotCode, setSlotCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<'cart' | 'slot' | null>(null);
  
  const [showActionModal, setShowActionModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyDate, setHistoryDate] = useState(new Date().toISOString().split('T')[0]);
  const [myLogs, setMyLogs] = useState<MovementLog[]>([]);
  
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [oldQuantity, setOldQuantity] = useState<number | null>(null);
  const [step, setStep] = useState<'size' | 'cart_input' | 'status'>('size');
  const [origin, setOrigin] = useState<'manual' | 'finder'>('manual');

  const [showSearchFinder, setShowSearchFinder] = useState(false);
  const [finderSize, setFinderSize] = useState<string | null>(null);
  const [finderOccupancy, setFinderOccupancy] = useState<number | null>(null);
  const [finderStreets, setFinderStreets] = useState<'low' | 'high' | 'u02' | null>(null);
  const [availableSlots, setAvailableSlots] = useState<WarehouseSlot[]>([]);
  const [loadingFinder, setLoadingFinder] = useState(false);

  // Estados para Búsqueda de Carro
  const [showCartFinder, setShowCartFinder] = useState(false);
  const [searchCartId, setSearchCartId] = useState('');
  const [searchCartHistory, setSearchCartHistory] = useState<MovementLog[]>([]);
  const [loadingCartHistory, setLoadingCartHistory] = useState(false);

  // Estados para Tareas
  const [showTaskSelection, setShowTaskSelection] = useState(false);
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [personalTasks, setPersonalTasks] = useState<Task[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [taskStartTime, setTaskStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState('00:00');
  const [taskLogId, setTaskLogId] = useState<string | null>(null);
  
  // Estados para Retira Cliente (Distribución)
  const [activePickups, setActivePickups] = useState<CustomerPickup[]>([]);
  const [myActivePickup, setMyActivePickup] = useState<CustomerPickup | null>(null);
  const [orderNumber, setOrderNumber] = useState('');
  const [showPickupsModal, setShowPickupsModal] = useState(false);
  const [lastPickupId, setLastPickupId] = useState<string | null>(null);
  const [distribTab, setDistribTab] = useState<'active' | 'finished'>('active');
  const [finishedPickups, setFinishedPickups] = useState<CustomerPickup[]>([]);
  const lastWarningRef = useRef<number>(0);

  const slotInputRef = useRef<HTMLInputElement>(null);
  const cartInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);

  const fetchAvailableTasks = React.useCallback(async () => {
    const { data: tasksData } = await supabase.from('tasks').select('*');
    if (tasksData) {
      // 1. Filtrar por asignación directa o por rol (si no hay asignaciones específicas)
      const relevantTasks = tasksData.filter((t: any) => {
        const isDirectlyAssigned = t.assigned_user_emails && t.assigned_user_emails.includes(user.email);
        const hasNoSpecificAssignments = !t.assigned_user_emails || t.assigned_user_emails.length === 0;
        const hasAllowedRole = t.allowed_roles.includes(user.role);
        
        return isDirectlyAssigned || (hasNoSpecificAssignments && hasAllowedRole);
      });

      // 2. Obtener logs del usuario para ver qué ha completado
      const { data: logsData } = await supabase
        .from('task_logs')
        .select('task_id, created_at')
        .eq('operator_email', user.email)
        .not('end_time', 'is', null);

      const today = new Date().toISOString().split('T')[0];

      const filtered = relevantTasks.filter((task: any) => {
        const userLogs = logsData?.filter(l => l.task_id === task.id) || [];
        
        if (task.task_type === 'daily') {
          // Si es diaria, ver si ya la hizo hoy
          const doneToday = userLogs.some(l => l.created_at.startsWith(today));
          return !doneToday;
        } else if (task.task_type === 'once') {
          // Si es puntual, ver si ya la hizo alguna vez
          const doneEver = userLogs.length > 0;
          return !doneEver;
        } else {
          // Si es libre, siempre disponible
          return true;
        }
      });

      // Separar personales de generales
      const personal = filtered.filter(t => t.assigned_user_emails && t.assigned_user_emails.includes(user.email));
      const general = filtered.filter(t => !t.assigned_user_emails || !t.assigned_user_emails.includes(user.email));

      setPersonalTasks(personal);
      setAvailableTasks(general);
    }
  }, [user.role, user.email]);

  useEffect(() => {
    fetchAvailableTasks();
    const savedTask = localStorage.getItem('wh_active_task');
    if (savedTask) {
      const parsed = JSON.parse(savedTask);
      setActiveTask(parsed.task);
      setTaskStartTime(new Date(parsed.startTime));
      setTaskLogId(parsed.logId);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchAvailableTasks]);

  useEffect(() => {
    if (activeTask?.is_timed && taskStartTime) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => {
        const now = new Date();
        const diff = now.getTime() - taskStartTime.getTime();
        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        setElapsedTime(`${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsedTime('00:00');
    }
  }, [activeTask, taskStartTime]);

  const handleStartTask = async (task: Task) => {
    setLoading(true);
    try {
      const startTime = new Date();
      let logId = null;

      if (task.is_timed) {
        const { data, error } = await supabase.from('task_logs').insert([{
          task_id: task.id,
          operator_email: user.email,
          start_time: startTime.toISOString()
        }]).select().single();
        if (error) throw error;
        logId = data.id;
      }

      setActiveTask(task);
      setTaskStartTime(startTime);
      setTaskLogId(logId);
      setShowTaskSelection(false);
      
      if (task.is_timed) {
        localStorage.setItem('wh_active_task', JSON.stringify({ task, startTime, logId }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFinishTask = async () => {
    setLoading(true);
    try {
      if (taskLogId) {
        await supabase.from('task_logs').update({
          end_time: new Date().toISOString()
        }).eq('id', taskLogId);
      } else if (activeTask && !activeTask.is_timed) {
        // Si no es de tiempo, creamos el log directamente al finalizar
        await supabase.from('task_logs').insert([{
          task_id: activeTask.id,
          operator_email: user.email,
          start_time: taskStartTime?.toISOString() || new Date().toISOString(),
          end_time: new Date().toISOString()
        }]);
      }
      
      setActiveTask(null);
      setTaskStartTime(null);
      setTaskLogId(null);
      localStorage.removeItem('wh_active_task');
      if (timerRef.current) clearInterval(timerRef.current);
      fetchAvailableTasks(); // Refrescar lista de tareas
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const speak = React.useCallback((text: string) => {
    console.log("📢 Intentando anunciar:", text);
    if (!window.speechSynthesis) {
      console.error("❌ El navegador no soporta SpeechSynthesis");
      return;
    }

    // Cancelar cualquier anuncio previo para evitar cola infinita
    window.speechSynthesis.cancel();

    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = 0.9; 
    utterance.pitch = 1.0;
    
    // Intentar encontrar una voz en español si está disponible
    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find(v => v.lang.startsWith('es'));
    if (spanishVoice) {
      utterance.voice = spanishVoice;
    }

    utterance.onstart = () => console.log("🎙️ Empezando a hablar:", text);
    utterance.onend = () => console.log("✅ Fin del anuncio");
    utterance.onerror = (e) => console.error("❌ Error en SpeechSynthesis:", e);

    window.speechSynthesis.speak(utterance);
  }, []);

  const announceLocation = (operatorName: string, cartId: string) => {
    speak(`El operario ${operatorName} ha ubicado el carro ${cartId}.`);
  };

  const announcePickupEvent = React.useCallback((text: string) => {
    speak(text);
  }, [speak]);

  const testAudio = () => {
    console.log("🧪 Ejecutando test de audio...");
    speak("Prueba de audio del sistema de almacén. Si escuchas esto, las notificaciones están activas.");
  };

  // Efecto para "desbloquear" y preparar el sistema de voz
  useEffect(() => {
    const primeVoices = () => {
      window.speechSynthesis.getVoices();
    };
    
    const unlockSpeech = () => {
      console.log("🔓 Desbloqueando SpeechSynthesis por interacción del usuario");
      const utterance = new window.SpeechSynthesisUtterance("");
      window.speechSynthesis.speak(utterance);
      window.removeEventListener('click', unlockSpeech);
      window.removeEventListener('touchstart', unlockSpeech);
    };

    window.speechSynthesis.addEventListener('voiceschanged', primeVoices);
    window.addEventListener('click', unlockSpeech);
    window.addEventListener('touchstart', unlockSpeech);
    
    primeVoices();

    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', primeVoices);
      window.removeEventListener('click', unlockSpeech);
      window.removeEventListener('touchstart', unlockSpeech);
    };
  }, []);

  useEffect(() => {
    const fetchPickups = async () => {
      console.log("Fetching pickups...");
      const today = new Date().toISOString().split('T')[0];

      // Activos
      const { data: activeData } = await supabase
        .from('customer_pickups')
        .select('*')
        .neq('status', 'completed')
        .order('created_at', { ascending: true });
      
      if (activeData) {
        setActivePickups(activeData);
        const mine = activeData.find(p => p.operator_email === user.email && p.status === 'in_progress');
        if (mine) setMyActivePickup(mine);
      }

      // Finalizados de hoy
      const { data: finishedData } = await supabase
        .from('customer_pickups')
        .select('*')
        .eq('status', 'completed')
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`)
        .order('completed_at', { ascending: false });
      
      if (finishedData) {
        setFinishedPickups(finishedData);
      }
    };

    fetchPickups();
    const interval = setInterval(fetchPickups, 10000);

    const channel = supabase
      .channel('customer_pickups_realtime')
      .on('postgres_changes', { event: '*', table: 'customer_pickups', schema: 'public' }, (payload) => {
        console.log("Realtime event received:", payload);
        const newPickup = payload.new as CustomerPickup;
        const oldPickup = payload.old as CustomerPickup;

        if (payload.eventType === 'INSERT') {
          setActivePickups(prev => {
            const exists = prev.find(p => p.id === newPickup.id);
            if (exists) return prev;
            return [...prev, newPickup];
          });
          if (user.role !== 'distribución') {
            announcePickupEvent("Retira Cliente a la espera");
          }
        } else if (payload.eventType === 'UPDATE') {
          if (newPickup.status === 'completed') {
            setActivePickups(prev => prev.filter(p => p.id !== newPickup.id));
            setFinishedPickups(prev => {
              const exists = prev.find(p => p.id === newPickup.id);
              if (exists) return prev;
              return [newPickup, ...prev];
            });
            if (newPickup.operator_email === user.email) setMyActivePickup(null);
            
            // Notificar a distribución que se ha finalizado
            if (user.role === 'distribución') {
              announcePickupEvent("Retira cliente Finalizado");
            }
          } else {
            setActivePickups(prev => {
              const exists = prev.find(p => p.id === newPickup.id);
              if (exists) {
                return prev.map(p => p.id === newPickup.id ? newPickup : p);
              } else {
                return [...prev, newPickup];
              }
            });
            
            // Si alguien aceptó el pedido
            if (newPickup.status === 'in_progress') {
              if (newPickup.operator_email === user.email) {
                setMyActivePickup(newPickup);
              } else {
                // Anunciar si el estado cambió a in_progress y no somos nosotros
                // Usamos una comprobación simple para evitar anuncios duplicados si el evento se repite
                if (!oldPickup || oldPickup.status !== 'in_progress') {
                  announcePickupEvent(`Retira cliente aceptado por ${newPickup.operator_name}`);
                }
              }
            }
          }
        }
      })
      .subscribe((status) => {
        console.log("Subscription status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [user.email, user.role, user.full_name, announcePickupEvent]);

  // Efecto para avisar de esperas prolongadas
  useEffect(() => {
    const checkWaitingPickups = () => {
      // Solo avisar a operarios, no a distribución
      if (user.role === 'distribución') return;
      
      const now = Date.now();
      // Evitar spam: máximo un aviso cada 2 minutos
      if (now - lastWarningRef.current < 120000) return;

      const hasLongWaiting = activePickups.some(p => {
        if (p.status !== 'waiting') return false;
        const createdAt = new Date(p.created_at).getTime();
        const diffMinutes = (now - createdAt) / (1000 * 60);
        return diffMinutes >= 3;
      });

      if (hasLongWaiting) {
        console.log("⚠️ Detectada espera prolongada, lanzando aviso...");
        announcePickupEvent("Retira Cliente con tiempo de espera de 5 minutos");
        lastWarningRef.current = now;
      }
    };

    const interval = setInterval(checkWaitingPickups, 30000); // Revisar cada 30 segundos
    return () => clearInterval(interval);
  }, [activePickups, user.role, announcePickupEvent]);

  const handleCreatePickup = async () => {
    if (!orderNumber.trim()) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('customer_pickups').insert([{
        order_number: orderNumber.trim(),
        status: 'waiting'
      }]);
      if (error) throw error;
      setOrderNumber('');
      setMessage({ type: 'success', text: 'PEDIDO LANZADO CORRECTAMENTE' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptPickup = async (pickup: CustomerPickup) => {
    if (myActivePickup) {
      alert("Ya tienes un pedido en curso. Finalízalo antes de aceptar otro.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('customer_pickups')
        .update({
          status: 'in_progress',
          operator_email: user.email,
          operator_name: user.full_name,
          accepted_at: new Date().toISOString()
        })
        .eq('id', pickup.id)
        .eq('status', 'waiting')
        .select();

      if (error) throw error;
      
      if (!data || data.length === 0) {
        alert("Este pedido ya ha sido aceptado por otro operario o ya no está disponible.");
        setShowPickupsModal(false);
        return;
      }

      const updated = data[0];
      setActivePickups(prev => prev.map(p => p.id === updated.id ? updated : p));
      setMyActivePickup(updated);
      setShowPickupsModal(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFinishPickup = async () => {
    if (!myActivePickup) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('customer_pickups')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', myActivePickup.id);
      if (error) throw error;
      const finishedId = myActivePickup.id;
      setActivePickups(prev => prev.filter(p => p.id !== finishedId));
      setMyActivePickup(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getWaitTime = (createdAt: string) => {
    const start = new Date(createdAt).getTime();
    const now = new Date().getTime();
    const diff = now - start;
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getWorkTime = (acceptedAt: string) => {
    const start = new Date(acceptedAt).getTime();
    const now = new Date().getTime();
    const diff = now - start;
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const waitingPickups = activePickups.filter(p => p.status === 'waiting');
  const totalWaitTime = waitingPickups.reduce((acc, p) => {
    const diff = new Date().getTime() - new Date(p.created_at).getTime();
    return acc + diff;
  }, 0);
  const avgWaitMins = waitingPickups.length > 0 ? Math.floor((totalWaitTime / waitingPickups.length) / 60000) : 0;

  const todayStr = new Date().toISOString().split('T')[0];
  const activeToday = activePickups.filter(p => p.created_at.startsWith(todayStr));

  if (user.role === 'distribución') {
    return (
      <div className="max-w-md mx-auto space-y-6 animate-fade-in">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 relative overflow-hidden">
          <div className="absolute -right-8 -top-8 text-slate-50 text-9xl font-medium opacity-10 pointer-events-none">📦</div>
          <div className="relative z-10">
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-8">Distribución</h2>
            
            <div className="space-y-4">
              <div className="relative">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Número de Pedido</label>
                <input 
                  type="text" 
                  value={orderNumber}
                  onChange={e => setOrderNumber(e.target.value)}
                  placeholder="EJ: 123456"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-5 px-6 focus:border-indigo-500 font-black text-2xl outline-none uppercase transition-all text-center"
                />
              </div>
              <button 
                onClick={handleCreatePickup}
                disabled={loading || !orderNumber.trim()}
                className="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-xl uppercase tracking-widest text-xs active:scale-95 transition-all disabled:opacity-50"
              >
                {loading ? 'ENVIANDO...' : 'ENVIAR PEDIDO'}
              </button>
            </div>

            {message && (
              <div className={`mt-6 p-4 rounded-2xl text-[10px] font-black text-center uppercase tracking-widest ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {message.text}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
          <div className="flex items-center justify-between mb-6 px-2">
            <div className="flex space-x-4">
              <button 
                onClick={() => setDistribTab('active')}
                className={`text-xs font-black uppercase tracking-widest transition-all ${distribTab === 'active' ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-400'}`}
              >
                En Curso ({activeToday.length})
              </button>
              <button 
                onClick={() => setDistribTab('finished')}
                className={`text-xs font-black uppercase tracking-widest transition-all ${distribTab === 'finished' ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-400'}`}
              >
                Finalizados ({finishedPickups.length})
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {distribTab === 'active' ? (
              activeToday.length === 0 ? (
                <p className="text-center py-10 text-slate-300 font-black text-[10px] uppercase tracking-widest">No hay pedidos activos de hoy</p>
              ) : activeToday.map(pickup => (
                <div key={pickup.id} className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="text-lg font-black text-slate-800 tracking-tighter">#{pickup.order_number}</p>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">
                      {pickup.status === 'waiting' ? '⌛ ESPERANDO' : `👷 ${pickup.operator_name}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-indigo-600">
                      {pickup.status === 'waiting' ? getWaitTime(pickup.created_at) : getWorkTime(pickup.accepted_at!)}
                    </p>
                    <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">
                      {pickup.status === 'waiting' ? 'TIEMPO ESPERA' : 'TIEMPO TRABAJO'}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              finishedPickups.length === 0 ? (
                <p className="text-center py-10 text-slate-300 font-black text-[10px] uppercase tracking-widest">No hay pedidos finalizados hoy</p>
              ) : finishedPickups.map(pickup => (
                <div key={pickup.id} className="bg-emerald-50/30 p-5 rounded-2xl border border-emerald-100 flex items-center justify-between">
                  <div>
                    <p className="text-lg font-black text-slate-800 tracking-tighter">#{pickup.order_number}</p>
                    <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mt-1">
                      ✅ FINALIZADO POR {pickup.operator_name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-slate-400">
                      {pickup.completed_at ? new Date(pickup.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </p>
                    <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">
                      HORA CIERRE
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  const checkSlotAndPrepare = async () => {
    const codeToSearch = slotCode.trim().toUpperCase();
    if (!codeToSearch) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('warehouse_slots')
        .select('is_scanned_once, size, quantity')
        .eq('code', codeToSearch)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (!data || !data.is_scanned_once) {
        setStep('size');
        setSelectedSize(null);
        setOldQuantity(0);
      } else {
        setSelectedSize(data.size);
        setOldQuantity(data.quantity ?? 0);
        setStep('status');
      }
      setShowActionModal(true);
    } catch (err) {
      console.error("Error checking slot:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyLogs = async (dateStr: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('movement_logs')
        .select('id, cart_id, slot_code, new_quantity, created_at')
        .eq('operator_email', user.email)
        .gte('created_at', `${dateStr}T00:00:00`)
        .lte('created_at', `${dateStr}T23:59:59`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMyLogs(data || []);
    } catch (err) {
      console.error("Error fetching logs:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCartHistory = async () => {
    if (!searchCartId.trim()) return;
    setLoadingCartHistory(true);
    try {
      const { data, error } = await supabase
        .from('movement_logs')
        .select('id, cart_id, slot_code, new_quantity, created_at, operator_name')
        .eq('cart_id', searchCartId.toUpperCase().trim())
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setSearchCartHistory(data || []);
    } catch (err) {
      console.error("Error fetching cart history:", err);
    } finally {
      setLoadingCartHistory(false);
    }
  };

  const handleOpenHistory = () => {
    const today = new Date().toISOString().split('T')[0];
    setHistoryDate(today);
    fetchMyLogs(today);
    setShowHistoryModal(true);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setHistoryDate(newDate);
    fetchMyLogs(newDate);
  };

  const handleFinalSave = async (newQuantity: number) => {
    if (!slotCode || !selectedSize) {
      setMessage({ type: 'error', text: 'Faltan datos para guardar' });
      return;
    }

    setLoading(true);
    try {
      const { error: slotError } = await supabase
        .from('warehouse_slots')
        .upsert({
          code: slotCode.toUpperCase().trim(),
          quantity: newQuantity,
          size: selectedSize,
          is_scanned_once: true,
          last_updated: new Date().toISOString()
        }, { onConflict: 'code' });

      if (slotError) throw slotError;

      const finalCartId = cartId.trim() ? cartId.toUpperCase().trim() : 'S/C';

      const { error: logError } = await supabase
        .from('movement_logs')
        .insert([{
          operator_name: user.full_name,
          operator_email: user.email,
          cart_id: finalCartId,
          slot_code: slotCode.toUpperCase().trim(),
          new_quantity: newQuantity,
          old_quantity: oldQuantity || 0,
          new_status: newQuantity > 0 ? 'occupied' : 'empty'
        }]);

      if (logError) throw logError;

      // Disparar locución inmediatamente tras el éxito del guardado
      announceLocation(user.full_name, finalCartId);

      setMessage({ type: 'success', text: `UBICACIÓN ${slotCode} ACTUALIZADA AL ${newQuantity}%` });
      setCartId('');
      setSlotCode('');
      setShowActionModal(false);
      
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Error al guardar: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleFinderSelection = async (slot: WarehouseSlot) => {
    setSlotCode(slot.code);
    setOldQuantity(slot.quantity ?? 0);
    setSelectedSize(slot.size);
    setOrigin('finder');
    setShowSearchFinder(false);
    setStep('status');
    setShowActionModal(true);
  };

  const fetchAvailableSlots = async (size: string, occupancy: number, streets: 'low' | 'high' | 'u02') => {
    setLoadingFinder(true);
    setFinderSize(size);
    setFinderOccupancy(occupancy);
    setFinderStreets(streets);
    try {
      let query = supabase.from('warehouse_slots')
        .select('*')
        .eq('size', size)
        .eq('quantity', occupancy)
        .eq('is_scanned_once', true);

      if (streets === 'low') {
        query = query.or('code.ilike.U010%,code.ilike.U0110%,code.ilike.U0111%,code.ilike.U0112%');
      } else if (streets === 'high') {
        query = query.or('code.ilike.U0113%,code.ilike.U0114%,code.ilike.U0115%,code.ilike.U0116%,code.ilike.U0117%,code.ilike.U0118%,code.ilike.U0119%,code.ilike.U012%');
      } else if (streets === 'u02') {
        query = query.ilike('code', 'U02%');
      }

      const { data, error } = await query.limit(40);
      if (error) throw error;
      setAvailableSlots(data || []);
    } catch (err) { console.error(err); } finally { setLoadingFinder(false); }
  };

  const handleScanResult = (result: string) => {
    const formatted = result.toUpperCase().trim();
    if (scannerTarget === 'cart') { 
      setCartId(formatted); 
      setTimeout(() => slotInputRef.current?.focus(), 150); 
    } 
    else if (scannerTarget === 'slot') { 
      setSlotCode(formatted); 
      setOrigin('manual');
      setTimeout(() => checkSlotAndPrepare(), 200);
    }
  };

  const handleCartKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (cartId.trim()) {
        slotInputRef.current?.focus();
      }
    }
  };

  const handleSlotKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (slotCode.trim()) {
        checkSlotAndPrepare();
      }
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 animate-fade-in relative overflow-hidden">
        <div className="absolute -right-8 -top-8 text-slate-50 text-9xl font-medium opacity-10 pointer-events-none">📦</div>
        <div className="relative z-10">
          
          <div className="flex flex-col gap-3 mb-10">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-slate-800 tracking-tight uppercase">Entrada Datos</h2>
              <div className="flex gap-2">
                <button 
                  onClick={testAudio}
                  className="bg-slate-50 text-slate-400 border border-slate-100 px-3 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all flex items-center gap-2"
                  title="Probar Audio"
                >
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                  🔊 TEST
                </button>
                {user.role === 'carretillero' && (
                  <button 
                    onClick={() => setShowPickupsModal(true)}
                    className={`relative px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all active:scale-95 ${waitingPickups.length > 0 ? 'bg-amber-500 text-white border-amber-600 animate-pulse' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
                  >
                    Retira Cliente
                    {waitingPickups.length > 0 && (
                      <span className="absolute -top-2 -right-2 bg-rose-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shadow-lg">
                        {waitingPickups.length}
                      </span>
                    )}
                  </button>
                )}
                <button 
                  onClick={() => setShowTaskSelection(true)}
                  className="relative bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border border-indigo-100 active:scale-95 transition-all"
                >
                  Cambio de Tarea
                  {availableTasks.length + personalTasks.length > 0 && (
                    <span className="absolute -top-2 -right-2 bg-rose-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shadow-lg animate-bounce">
                      {availableTasks.length + personalTasks.length}
                    </span>
                  )}
                </button>
              </div>
            </div>
            
            {myActivePickup && (
              <div className="bg-indigo-600 p-6 rounded-3xl mb-4 text-white shadow-xl shadow-indigo-200 animate-fade-in">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Pedido en Curso</p>
                    <h3 className="text-2xl font-black tracking-tighter">#{myActivePickup.order_number}</h3>
                  </div>
                  <div className="bg-white/20 px-3 py-1 rounded-full">
                    <p className="text-[10px] font-black">{getWorkTime(myActivePickup.accepted_at!)}</p>
                  </div>
                </div>
                <button 
                  onClick={handleFinishPickup}
                  className="w-full bg-white text-indigo-600 font-black py-3 rounded-2xl uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all"
                >
                  Finalizar Retira Cliente
                </button>
              </div>
            )}
            
            {availableTasks.length + personalTasks.length > 0 && !activeTask && (
              <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl mb-2 animate-pulse cursor-pointer" onClick={() => setShowTaskSelection(true)}>
                <div className="flex items-center gap-3">
                  <span className="text-xl">🔔</span>
                  <div>
                    <p className="text-[10px] font-black text-amber-800 uppercase tracking-tight">Tareas Pendientes</p>
                    <p className="text-[8px] font-bold text-amber-600 uppercase">Tienes {availableTasks.length + personalTasks.length} tareas asignadas esperando</p>
                  </div>
                </div>
              </div>
            )}
            
            {!activeTask?.is_timed ? (
              <div className="flex gap-2">
                <button onClick={() => { setShowSearchFinder(true); setOrigin('finder'); }} className="flex-1 bg-indigo-600 text-white px-5 py-3 rounded-2xl text-[10px] font-semibold uppercase tracking-widest shadow-lg shadow-indigo-100 active:scale-95 transition-all">Buscar Hueco</button>
                <button onClick={() => { setShowCartFinder(true); setSearchCartHistory([]); setSearchCartId(''); }} className="flex-1 bg-slate-900 text-white px-5 py-3 rounded-2xl text-[10px] font-semibold uppercase tracking-widest shadow-lg shadow-slate-200 active:scale-95 transition-all">Buscar Carro</button>
              </div>
            ) : null}
          </div>

          {activeTask?.is_timed ? (
            <div className="py-10 text-center space-y-8 animate-fade-in">
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse"></span>
                  <p className="text-[10px] font-black text-rose-500 uppercase tracking-[0.3em]">TAREA ACTIVA</p>
                </div>
                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{activeTask.name}</h3>
              </div>
              
              <div className="relative inline-block">
                <div className="w-48 h-48 rounded-full border-4 border-indigo-600 flex items-center justify-center shadow-2xl shadow-indigo-100 bg-white">
                   <p className="text-4xl font-black text-indigo-600 tracking-tighter">{elapsedTime}</p>
                </div>
                <div className="absolute -top-2 -right-2 w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center animate-pulse shadow-lg">
                  <span className="text-sm text-white">⏱️</span>
                </div>
              </div>

              <button 
                onClick={handleFinishTask}
                className="w-full bg-slate-900 text-white font-black py-5 rounded-[2rem] shadow-xl uppercase tracking-widest text-xs active:scale-95 transition-all"
              >
                Finalizar Tarea
              </button>
            </div>
          ) : (
            <>
              {message && (
                <div className={`p-4 rounded-2xl mb-8 text-[11px] font-semibold text-center animate-fade-in uppercase tracking-widest ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {message.text}
                </div>
              )}

              <div className="space-y-6">
                <div className="relative group">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest ml-1 mb-2 block">ID Carro (Opcional)</label>
                  <input 
                    ref={cartInputRef}
                    type="text" 
                    value={cartId} 
                    onChange={(e) => setCartId(e.target.value.toUpperCase())} 
                    onKeyDown={handleCartKeyDown}
                    placeholder="ESCANEAR CARRO" 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-5 px-6 focus:border-indigo-500 font-semibold text-lg outline-none uppercase transition-all text-center" 
                  />
                  <button onClick={() => { setScannerTarget('cart'); setScannerOpen(true); }} className="absolute right-4 top-[44px] bg-white shadow-sm border border-slate-100 p-2.5 rounded-xl active:scale-90 transition-all">📷</button>
                </div>
                <div className="relative group">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Ubicación {activeTask ? <span className="text-indigo-500">[{activeTask.name}]</span> : ''}</label>
                  <input 
                    ref={slotInputRef} 
                    type="text" 
                    value={slotCode} 
                    onChange={(e) => { setSlotCode(e.target.value.toUpperCase()); setOrigin('manual'); }} 
                    onKeyDown={handleSlotKeyDown}
                    placeholder="ESCANEAR HUECO" 
                    className={`w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-5 px-6 focus:border-indigo-500 font-semibold text-lg outline-none uppercase transition-all text-center ${loading ? 'opacity-50' : ''}`}
                    disabled={loading}
                  />
                  <button onClick={() => { setScannerTarget('slot'); setScannerOpen(true); }} className="absolute right-4 top-[44px] bg-white shadow-sm border border-slate-100 p-2.5 rounded-xl active:scale-90 transition-all">📷</button>
                </div>

                <button 
                  onClick={handleOpenHistory}
                  className="w-full mt-4 flex items-center justify-center gap-2 text-slate-400 hover:text-indigo-600 transition-colors py-2 group"
                >
                  <span className="text-lg group-hover:scale-110 transition-transform">🕒</span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Ver mis últimos movimientos</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showTaskSelection && (
        <div className="fixed inset-0 z-[200] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-sm rounded-[3rem] p-8 shadow-2xl flex flex-col max-h-[85vh] animate-fade-in relative overflow-hidden">
             <div className="absolute -right-8 -top-8 text-slate-50 text-9xl font-medium opacity-10 pointer-events-none">📌</div>
             <div className="relative z-10 flex flex-col h-full min-h-0">
                <div className="text-center mb-8 shrink-0">
                  <h3 className="text-xl font-semibold text-slate-800 uppercase tracking-tighter">Seleccionar Tarea</h3>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Actividad actual</p>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
                  {/* Tareas Personales (Asignadas directamente) */}
                  {personalTasks.length > 0 && (
                    <div className="space-y-2 mb-6">
                      <p className="text-[8px] font-black text-indigo-500 uppercase tracking-widest ml-2">Mis Tareas Asignadas</p>
                      {personalTasks.map(task => (
                        <button 
                          key={task.id}
                          onClick={() => handleStartTask(task)}
                          className={`w-full p-5 rounded-2xl border-2 text-left flex items-center justify-between transition-all ${activeTask?.id === task.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-indigo-50/50 border-indigo-100 text-slate-800 hover:border-indigo-300'}`}
                        >
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-tight">{task.name}</span>
                            <span className="text-[7px] font-bold uppercase opacity-60">
                              {task.task_type === 'daily' ? '📅 Diaria' : task.task_type === 'once' ? '🎯 Puntual' : '🔓 Libre'}
                              {task.is_timed ? ' • ⏱️ Tiempo' : ''}
                            </span>
                          </div>
                          <span className="text-xl">⭐</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Tareas Generales</p>
                  <button 
                    onClick={handleFinishTask}
                    className={`w-full p-5 rounded-2xl border-2 text-left flex items-center justify-between transition-all ${!activeTask ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-800'}`}
                  >
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase tracking-tight">Entrada de Huecos</span>
                      <span className="text-[7px] font-bold uppercase opacity-60">Tarea por defecto</span>
                    </div>
                    <span>📦</span>
                  </button>

                  {availableTasks.length > 0 && (
                    <div className="space-y-2 mt-4">
                      {availableTasks.map(task => (
                        <button 
                          key={task.id}
                          onClick={() => handleStartTask(task)}
                          className={`w-full p-5 rounded-2xl border-2 text-left flex items-center justify-between transition-all ${activeTask?.id === task.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-800 hover:border-indigo-200'}`}
                        >
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-tight">{task.name}</span>
                            <span className="text-[7px] font-bold uppercase opacity-60">
                              {task.task_type === 'daily' ? '📅 Diaria' : task.task_type === 'once' ? '🎯 Puntual' : '🔓 Libre'}
                              {task.is_timed ? ' • ⏱️ Tiempo' : ''}
                            </span>
                          </div>
                          <span>{task.is_timed ? '⏱️' : '📌'}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button 
                  onClick={() => setShowTaskSelection(false)}
                  className="mt-8 shrink-0 w-full bg-slate-900 text-white py-4 rounded-2xl font-bold uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all"
                >
                  Cerrar
                </button>
             </div>
          </div>
        </div>
      )}

      {showHistoryModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-sm rounded-[3rem] p-8 shadow-2xl flex flex-col max-h-[85vh] animate-fade-in relative overflow-hidden">
             <div className="absolute -right-8 -top-8 text-slate-50 text-9xl font-medium opacity-10 pointer-events-none">🕒</div>
             <div className="relative z-10 flex flex-col h-full min-h-0">
                <div className="text-center mb-6 shrink-0">
                  <h3 className="text-xl font-semibold text-slate-800 uppercase tracking-tighter">Mis Movimientos</h3>
                  <div className="mt-3 inline-flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Fecha:</span>
                    <input 
                      type="date" 
                      value={historyDate} 
                      onChange={handleDateChange}
                      className="bg-transparent text-[11px] font-bold text-slate-700 outline-none"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
                  {loading ? (
                    <div className="py-20 text-center animate-pulse">
                      <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-widest">Cargando...</p>
                    </div>
                  ) : myLogs.length === 0 ? (
                    <div className="py-20 text-center">
                      <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-widest">Sin registros este día</p>
                    </div>
                  ) : myLogs.map(log => (
                    <div key={log.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between">
                      <div className="flex flex-col flex-1">
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[9px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100 uppercase">{log.cart_id}</span>
                          <span className="text-slate-300 text-xs">→</span>
                          <span className="text-xs font-bold text-slate-800 uppercase tracking-tight">{log.slot_code}</span>
                        </div>
                      </div>
                      <div className="text-right ml-2">
                        <span className={`text-[10px] font-bold ${log.new_quantity === 100 ? 'text-rose-500' : log.new_quantity === 50 ? 'text-amber-500' : 'text-emerald-500'}`}>
                          {log.new_quantity}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <button 
                  onClick={() => setShowHistoryModal(false)}
                  className="mt-8 shrink-0 w-full bg-slate-900 text-white py-4 rounded-2xl font-bold uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all"
                >
                  Cerrar Historial
                </button>
             </div>
          </div>
        </div>
      )}

      {showCartFinder && (
        <div className="fixed inset-0 z-[200] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-sm rounded-[3rem] p-8 shadow-2xl flex flex-col max-h-[85vh] animate-fade-in relative overflow-hidden">
             <div className="absolute -right-8 -top-8 text-slate-50 text-9xl font-medium opacity-10 pointer-events-none">🚛</div>
             <div className="relative z-10 flex flex-col h-full min-h-0">
                <div className="text-center mb-6 shrink-0">
                  <h3 className="text-xl font-semibold text-slate-800 uppercase tracking-tighter">Rastreador de Carro</h3>
                  <div className="mt-4 flex gap-2">
                    <input 
                      autoFocus
                      type="text" 
                      placeholder="IDENTIFICADOR..." 
                      className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-2xl py-3 px-4 font-bold text-sm text-center uppercase outline-none focus:border-slate-900 transition-all"
                      value={searchCartId}
                      onChange={e => setSearchCartId(e.target.value.toUpperCase())}
                      onKeyDown={e => (e.key === 'Enter') && fetchCartHistory()}
                    />
                    <button onClick={fetchCartHistory} className="bg-slate-900 text-white w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all">🔍</button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
                  {loadingCartHistory ? (
                    <div className="py-20 text-center animate-pulse">
                      <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-widest">Buscando carro...</p>
                    </div>
                  ) : searchCartHistory.length === 0 ? (
                    <div className="py-20 text-center">
                      <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-widest">Introduce ID para buscar</p>
                    </div>
                  ) : searchCartHistory.map(log => (
                    <div key={log.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between relative overflow-hidden">
                      <div className="absolute top-0 left-0 bottom-0 w-1 bg-indigo-500"></div>
                      <div className="flex flex-col flex-1 pl-2">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">
                            {new Date(log.created_at).toLocaleDateString()} @ {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-[7px] font-black text-indigo-500 uppercase">{log.operator_name || 'Personal'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-800 uppercase tracking-tight">UBICADO EN: {log.slot_code}</span>
                        </div>
                      </div>
                      <div className="text-right ml-2 shrink-0">
                        <span className={`text-[9px] font-black ${log.new_quantity === 100 ? 'text-rose-500' : log.new_quantity === 50 ? 'text-amber-500' : 'text-emerald-500'}`}>
                          {log.new_quantity}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <button 
                  onClick={() => setShowCartFinder(false)}
                  className="mt-8 shrink-0 w-full bg-slate-900 text-white py-4 rounded-2xl font-bold uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all"
                >
                  Cerrar Buscador
                </button>
             </div>
          </div>
        </div>
      )}

      {showActionModal && (
        <div className="fixed inset-0 z-[150] bg-slate-900/40 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-sm rounded-[3rem] p-10 shadow-2xl space-y-8 animate-fade-in border border-white">
            <div className="text-center">
               <h3 className="text-2xl font-semibold text-slate-900 tracking-tighter uppercase">{slotCode}</h3>
               <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mt-1">
                 {step === 'size' ? 'DEFINIR TAMAÑO' : step === 'cart_input' ? 'ID CARRO REQUERIDO' : 'ESTADO DE CARGA'}
               </p>
            </div>

            {step === 'size' && (
              <div className="grid grid-cols-1 gap-2">
                {['Pequeño', 'Mediano', 'Grande'].map(size => (
                  <button key={size} onClick={() => { setSelectedSize(size); setStep('status'); }} className="py-4 rounded-2xl font-semibold border-2 border-slate-100 text-[11px] uppercase tracking-widest hover:border-indigo-500 hover:text-indigo-600 transition-all">{size}</button>
                ))}
              </div>
            )}

            {step === 'cart_input' && (
              <div className="space-y-4">
                <input 
                  autoFocus
                  type="text" 
                  value={cartId} 
                  onChange={e => setCartId(e.target.value.toUpperCase())}
                  onKeyDown={e => (e.key === 'Enter' || e.key === 'Tab') && cartId && setStep('status')}
                  placeholder="ID CARRO" 
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 font-semibold text-center uppercase outline-none focus:border-indigo-500"
                />
                <button onClick={() => cartId && setStep('status')} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-semibold uppercase text-[11px] tracking-widest">Siguiente</button>
              </div>
            )}

            {step === 'status' && (
              <div className="grid grid-cols-1 gap-3">
                <button onClick={() => handleFinalSave(0)} className="py-5 rounded-2xl font-bold bg-emerald-50 text-emerald-600 border-2 border-emerald-100 text-[11px] uppercase tracking-widest hover:bg-emerald-100 transition-all">Vacío (0%)</button>
                <button onClick={() => handleFinalSave(50)} className="py-5 rounded-2xl font-bold bg-amber-50 text-amber-600 border-2 border-amber-100 text-[11px] uppercase tracking-widest hover:bg-amber-100 transition-all">Medio (50%)</button>
                <button onClick={() => handleFinalSave(100)} className="py-5 rounded-2xl font-bold bg-rose-50 text-rose-600 border-2 border-rose-100 text-[11px] uppercase tracking-widest hover:bg-rose-100 transition-all">Lleno (100%)</button>
              </div>
            )}

            <button onClick={() => setShowActionModal(false)} className="w-full py-4 text-slate-400 font-semibold text-[10px] uppercase tracking-widest hover:text-slate-800">Cancelar</button>
          </div>
        </div>
      )}

      {showSearchFinder && (
        <div className="fixed inset-0 z-[120] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] p-8 w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] animate-fade-in">
            <h3 className="text-xl font-semibold text-slate-800 uppercase text-center mb-8 tracking-tighter">Localizador de Huecos</h3>
            
            <div className="space-y-4">
              <div className="flex gap-2">
                {['Pequeño', 'Mediano', 'Grande'].map(size => (
                  <button key={size} onClick={() => setFinderSize(size)} className={`flex-1 py-3 rounded-xl text-[10px] font-semibold uppercase tracking-widest border-2 transition-all ${finderSize === size ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>{size}</button>
                ))}
              </div>
              
              {finderSize && (
                <div className="flex gap-2">
                  <button onClick={() => setFinderOccupancy(0)} className={`flex-1 py-4 rounded-xl text-[10px] font-semibold uppercase tracking-widest border-2 transition-all shadow-md active:scale-95 bg-emerald-600 text-white border-emerald-600 ${finderOccupancy === 0 ? 'ring-4 ring-emerald-200' : 'opacity-80'}`}>Libre (0%)</button>
                  <button onClick={() => setFinderOccupancy(50)} className={`flex-1 py-4 rounded-xl text-[10px] font-semibold uppercase tracking-widest border-2 transition-all shadow-md active:scale-95 bg-amber-400 text-white border-amber-400 ${finderOccupancy === 50 ? 'ring-4 ring-amber-200' : 'opacity-80'}`}>Medio (50%)</button>
                </div>
              )}

              {finderSize && finderOccupancy !== null && (
                <div className="flex flex-wrap gap-2 animate-fade-in">
                  <button onClick={() => fetchAvailableSlots(finderSize!, finderOccupancy!, 'low')} className={`flex-1 min-w-[100px] py-3 rounded-xl text-[10px] font-semibold uppercase tracking-widest border-2 transition-all ${finderStreets === 'low' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>Pasillos 2-12</button>
                  <button onClick={() => fetchAvailableSlots(finderSize!, finderOccupancy!, 'high')} className={`flex-1 min-w-[100px] py-3 rounded-xl text-[10px] font-semibold uppercase tracking-widest border-2 transition-all ${finderStreets === 'high' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>Pasillos 13-22</button>
                  <button onClick={() => fetchAvailableSlots(finderSize!, finderOccupancy!, 'u02')} className={`flex-1 min-w-[100px] py-3 rounded-xl text-[10px] font-semibold uppercase tracking-widest border-2 transition-all ${finderStreets === 'u02' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>Planta U02</button>
                </div>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto mt-6 grid grid-cols-2 gap-3 pr-1">
              {loadingFinder ? (
                <div className="col-span-2 py-10 text-center text-slate-400 animate-pulse text-[10px] font-semibold uppercase tracking-[0.2em]">Buscando...</div>
              ) : availableSlots.length > 0 ? availableSlots.map(slot => (
                <button 
                  key={slot.id} 
                  onClick={() => handleFinderSelection(slot)} 
                  className={`p-5 rounded-[2.5rem] text-center transition-all active:scale-95 group relative overflow-hidden border-2 flex flex-col items-center justify-center ${
                    slot.quantity === 0 
                    ? 'border-emerald-500 text-emerald-600' 
                    : 'border-amber-400 text-amber-600'
                  }`}
                >
                  <div className="relative z-10">
                    <p className="text-lg font-medium tracking-tighter uppercase">{slot.code}</p>
                    <p className="text-[9px] font-medium uppercase tracking-[0.2em] mt-1 opacity-90">
                      {slot.quantity === 0 ? 'LIBRE' : '50% LLENO'}
                    </p>
                  </div>
                </button>
              )) : finderStreets ? (
                <div className="col-span-2 py-10 text-center text-slate-300 font-semibold uppercase text-[10px] tracking-widest">Sin resultados</div>
              ) : null}
            </div>
            <button onClick={() => setShowSearchFinder(false)} className="mt-6 w-full py-4 text-slate-400 font-semibold text-[10px] uppercase tracking-widest hover:text-slate-800">Cerrar</button>
          </div>
        </div>
      )}
      <ScannerModal isOpen={scannerOpen} onClose={() => setScannerOpen(false)} onScan={handleScanResult} title="Escáner" />

      {showPickupsModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl flex flex-col max-h-[85vh] animate-fade-in relative overflow-hidden">
             <div className="absolute -right-8 -top-8 text-slate-50 text-9xl font-medium opacity-10 pointer-events-none">🚛</div>
             <div className="relative z-10 flex flex-col h-full min-h-0">
                <div className="text-center mb-8 shrink-0">
                  <h3 className="text-xl font-semibold text-slate-800 uppercase tracking-tighter">Retira Cliente</h3>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Pedidos esperando ser atendidos</p>
                  {waitingPickups.length > 0 && (
                    <div className="mt-4 bg-amber-50 p-3 rounded-2xl border border-amber-100">
                      <p className="text-[8px] font-black text-amber-600 uppercase">Tiempo medio de espera: {avgWaitMins} min</p>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
                  {waitingPickups.length === 0 ? (
                    <p className="text-center py-20 text-slate-300 font-black text-[10px] uppercase tracking-widest">No hay pedidos esperando</p>
                  ) : waitingPickups.map(pickup => (
                    <div key={pickup.id} className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex items-center justify-between">
                      <div>
                        <p className="text-lg font-black text-slate-800 tracking-tighter">#{pickup.order_number}</p>
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Lanzado hace {getWaitTime(pickup.created_at)}</p>
                      </div>
                      <button 
                        onClick={() => handleAcceptPickup(pickup)}
                        disabled={loading || !!myActivePickup}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all disabled:opacity-50"
                      >
                        {loading ? '...' : 'Aceptar'}
                      </button>
                    </div>
                  ))}
                </div>

                <button 
                  onClick={() => setShowPickupsModal(false)}
                  className="mt-8 shrink-0 w-full bg-slate-900 text-white py-4 rounded-2xl font-bold uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all"
                >
                  Cerrar
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
