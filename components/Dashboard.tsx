
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile, WarehouseSlot } from '../types';
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
  const [finderStreets, setFinderStreets] = useState<'low' | 'high' | null>(null);
  const [availableSlots, setAvailableSlots] = useState<WarehouseSlot[]>([]);
  const [loadingFinder, setLoadingFinder] = useState(false);

  const slotInputRef = useRef<HTMLInputElement>(null);
  const cartInputRef = useRef<HTMLInputElement>(null);

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
    if (!cartId || !slotCode || !selectedSize) {
      setMessage({ type: 'error', text: 'Faltan datos para guardar' });
      return;
    }

    setLoading(true);
    try {
      const { error: slotError } = await supabase
        .from('warehouse_slots')
        .update({
          quantity: newQuantity,
          size: selectedSize,
          is_scanned_once: true,
          last_updated: new Date().toISOString()
        })
        .eq('code', slotCode.toUpperCase().trim());

      if (slotError) throw slotError;

      const { error: logError } = await supabase
        .from('movement_logs')
        .insert([{
          operator_name: user.full_name,
          operator_email: user.email,
          cart_id: cartId.toUpperCase().trim(),
          slot_code: slotCode.toUpperCase().trim(),
          new_quantity: newQuantity,
          old_quantity: oldQuantity || 0,
          new_status: newQuantity > 0 ? 'occupied' : 'empty'
        }]);

      if (logError) throw logError;

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
    if (cartId.trim()) { 
      setStep('status'); 
    } else { 
      setStep('cart_input'); 
    }
    setShowActionModal(true);
  };

  const fetchAvailableSlots = async (size: string, occupancy: number, streets: 'low' | 'high') => {
    setLoadingFinder(true);
    setFinderSize(size);
    setFinderOccupancy(occupancy);
    setFinderStreets(streets);
    try {
      const startRange = streets === 'low' ? 'U0102' : 'U0113';
      const endRange = streets === 'low' ? 'U0112Z' : 'U0122Z';
      const { data, error } = await supabase.from('warehouse_slots')
        .select('*')
        .eq('size', size)
        .eq('quantity', occupancy)
        .eq('is_scanned_once', true)
        .gte('code', startRange)
        .lte('code', endRange)
        .limit(24);
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
    if (e.key === 'Enter') {
      e.preventDefault();
      if (cartId.trim()) {
        slotInputRef.current?.focus();
      }
    }
  };

  const handleSlotKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
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
          <div className="flex justify-between items-center mb-10">
            <h2 className="text-xl font-semibold text-slate-800 tracking-tight uppercase">Entrada Datos</h2>
            <button onClick={() => { setShowSearchFinder(true); setOrigin('finder'); }} className="bg-indigo-600 text-white px-5 py-3 rounded-2xl text-[10px] font-semibold uppercase tracking-widest shadow-lg shadow-indigo-100 active:scale-95 transition-all">Buscar Hueco</button>
          </div>

          {message && (
            <div className={`p-4 rounded-2xl mb-8 text-[11px] font-semibold text-center animate-fade-in uppercase tracking-widest ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {message.text}
            </div>
          )}

          <div className="space-y-6">
            <div className="relative group">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest ml-1 mb-2 block">ID Carro</label>
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
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Ubicación</label>
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
        </div>
      </div>

      {showHistoryModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl flex flex-col max-h-[85vh] animate-fade-in relative overflow-hidden">
             <div className="absolute -right-8 -top-8 text-slate-50 text-9xl font-medium opacity-10 pointer-events-none">🕒</div>
             <div className="relative z-10 flex flex-col h-full">
                <div className="text-center mb-6">
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

                <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 pr-1">
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
                      <div className="flex flex-col">
                        <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-tight">{log.slot_code}</span>
                      </div>
                      <div className="text-center">
                        <span className="text-[9px] font-bold text-indigo-500 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100">{log.cart_id}</span>
                      </div>
                      <div className="text-right">
                        <span className={`text-[10px] font-bold ${log.new_quantity === 100 ? 'text-rose-500' : log.new_quantity === 50 ? 'text-amber-500' : 'text-emerald-500'}`}>
                          {log.new_quantity}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <button 
                  onClick={() => setShowHistoryModal(false)}
                  className="mt-8 w-full bg-slate-900 text-white py-4 rounded-2xl font-bold uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all"
                >
                  Cerrar Historial
                </button>
             </div>
          </div>
        </div>
      )}

      {showActionModal && (
        <div className="fixed inset-0 z-[150] bg-slate-900/40 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl space-y-8 animate-fade-in border border-white">
            <div className="text-center">
               <h3 className="text-2xl font-semibold text-slate-900 tracking-tighter uppercase">{slotCode}</h3>
               <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mt-1">
                 {step === 'size' ? 'DEFINIR TAMAÑO' : step === 'cart_input' ? 'ID CARRO REQUERIDO' : 'ESTADO DE CARGA'}
               </p>
            </div>

            {step === 'size' && (
              <div className="grid grid-cols-1 gap-2">
                {['Pequeño', 'Mediano', 'Grande'].map(size => (
                  <button key={size} onClick={() => { setSelectedSize(size); setStep(cartId ? 'status' : 'cart_input'); }} className="py-4 rounded-2xl font-semibold border-2 border-slate-100 text-[11px] uppercase tracking-widest hover:border-indigo-500 hover:text-indigo-600 transition-all">{size}</button>
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
                  onKeyDown={e => e.key === 'Enter' && cartId && setStep('status')}
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
                <div className="flex gap-2 animate-fade-in">
                  <button onClick={() => fetchAvailableSlots(finderSize!, finderOccupancy!, 'low')} className={`flex-1 py-3 rounded-xl text-[10px] font-semibold uppercase tracking-widest border-2 transition-all ${finderStreets === 'low' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>Pasillos 2-12</button>
                  <button onClick={() => fetchAvailableSlots(finderSize!, finderOccupancy!, 'high')} className={`flex-1 py-3 rounded-xl text-[10px] font-semibold uppercase tracking-widest border-2 transition-all ${finderStreets === 'high' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>Pasillos 13-22</button>
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
