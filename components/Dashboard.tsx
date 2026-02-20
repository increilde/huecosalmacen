
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { WarehouseSlot, UserProfile, Task } from '../types';
import ScannerModal from './ScannerModal';
import { GoogleGenAI, Modality } from "@google/genai";

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

// Funciones auxiliares para decodificación de audio PCM de Gemini TTS
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

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
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [taskStartTime, setTaskStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState('00:00');
  const [taskLogId, setTaskLogId] = useState<string | null>(null);

  const slotInputRef = useRef<HTMLInputElement>(null);
  const cartInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);
  
  // Ref para AudioContext persistente
  const audioCtxRef = useRef<AudioContext | null>(null);

  const fetchAvailableTasks = React.useCallback(async () => {
    const { data } = await supabase.from('tasks').select('*');
    if (data) {
      // Filtrar tareas que permiten el rol del usuario actual
      const filtered = data.filter((t: any) => t.allowed_roles.includes(user.role));
      setAvailableTasks(filtered);
    }
  }, [user.role]);

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
      if (activeTask?.is_timed && taskLogId) {
        await supabase.from('task_logs').update({
          end_time: new Date().toISOString()
        }).eq('id', taskLogId);
      }
      
      setActiveTask(null);
      setTaskStartTime(null);
      setTaskLogId(null);
      localStorage.removeItem('wh_active_task');
      if (timerRef.current) clearInterval(timerRef.current);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    return audioCtxRef.current;
  };

  const announceLocation = async (operatorName: string, cartId: string) => {
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') await ctx.resume();

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Notifica por voz de forma clara: El operario ${operatorName} ha ubicado el carro ${cartId}.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.start();
      }
    } catch (err) {
      console.error("Error generating speech notification:", err);
    }
  };

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

    // Inicializar AudioContext ante el gesto del usuario para asegurar la locución posterior
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume().catch(console.error);

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
      announceLocation(user.full_name, finalCartId).catch(console.error);

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
              <button 
                onClick={() => setShowTaskSelection(true)}
                className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border border-indigo-100 active:scale-95 transition-all"
              >
                Cambio de Tarea
              </button>
            </div>
            
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
                  <button 
                    onClick={handleFinishTask}
                    className={`w-full p-5 rounded-2xl border-2 text-left flex items-center justify-between transition-all ${!activeTask ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-800'}`}
                  >
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase tracking-tight">Entrada de Huecos</span>
                      <span className="text-[7px] font-bold uppercase opacity-60">Tarea por defecto</span>
                    </div>
                    <span>📦</span>
                  </button>

                  <div className="h-[1px] bg-slate-100 my-4"></div>

                  {availableTasks.map(task => (
                    <button 
                      key={task.id}
                      onClick={() => handleStartTask(task)}
                      className={`w-full p-5 rounded-2xl border-2 text-left flex items-center justify-between transition-all ${activeTask?.id === task.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-800 hover:border-indigo-200'}`}
                    >
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-tight">{task.name}</span>
                        <span className="text-[7px] font-bold uppercase opacity-60">{task.is_timed ? 'Tarea de tiempo' : 'Registro de huecos'}</span>
                      </div>
                      <span>{task.is_timed ? '⏱️' : '📌'}</span>
                    </button>
                  ))}
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
    </div>
  );
};

export default Dashboard;
