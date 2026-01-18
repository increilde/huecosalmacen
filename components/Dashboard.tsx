
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile, WarehouseSlot } from '../types';
import ScannerModal from './ScannerModal';

interface DashboardProps {
  user: UserProfile;
}

const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  const [cartId, setCartId] = useState('');
  const [slotCode, setSlotCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<'cart' | 'slot' | null>(null);
  
  const [showActionModal, setShowActionModal] = useState(false);
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

  useEffect(() => {
    if (slotCode.trim().length >= 4 && origin === 'manual') {
      checkSlotAndPrepare();
    }
  }, [slotCode]);

  const checkSlotAndPrepare = async () => {
    try {
      const { data, error } = await supabase
        .from('warehouse_slots')
        .select('is_scanned_once, size, quantity')
        .eq('code', slotCode.toUpperCase().trim())
        .single();

      if (error && error.code !== 'PGRST116') throw error;

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
    }
  };

  const handleFinderSelection = async (slot: WarehouseSlot) => {
    setSlotCode(slot.code);
    setOldQuantity(slot.quantity ?? 0);
    setSelectedSize(slot.size);
    setOrigin('finder');
    setShowSearchFinder(false);
    if (cartId.trim()) { setStep('status'); } else { setStep('cart_input'); }
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
                placeholder="ESCANEAR" 
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-5 px-6 focus:border-indigo-500 font-semibold text-lg outline-none uppercase transition-all text-center" 
              />
              <button onClick={() => { setScannerTarget('cart'); setScannerOpen(true); }} className="absolute right-4 top-[44px] bg-white shadow-sm border border-slate-100 p-2.5 rounded-xl active:scale-90 transition-all">📷</button>
            </div>
            <div className="relative group">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Ubicación</label>
              <input ref={slotInputRef} type="text" value={slotCode} onChange={(e) => { setSlotCode(e.target.value.toUpperCase()); setOrigin('manual'); }} placeholder="ESCRIBE O ESCANEA" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-5 px-6 focus:border-indigo-500 font-semibold text-lg outline-none uppercase transition-all text-center" />
              <button onClick={() => { setScannerTarget('slot'); setScannerOpen(true); }} className="absolute right-4 top-[44px] bg-white shadow-sm border border-slate-100 p-2.5 rounded-xl active:scale-90 transition-all">📷</button>
            </div>
          </div>
        </div>
      </div>

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
