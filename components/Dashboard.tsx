
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import ScannerModal from './ScannerModal';

const Dashboard: React.FC = () => {
  const [cartId, setCartId] = useState('');
  const [slotCode, setSlotCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<'cart' | 'slot' | null>(null);
  
  const [showActionModal, setShowActionModal] = useState(false);
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [step, setStep] = useState<'size' | 'status'>('status');

  const slotInputRef = useRef<HTMLInputElement>(null);

  const currentUser = {
    full_name: 'Admin Central',
    email: 'admin@almacen.com'
  };

  useEffect(() => {
    if (cartId.trim().length >= 4 && slotCode.trim().length >= 4) {
      checkIfFirstTime();
    } else {
      setShowActionModal(false);
      setStep('status');
      setSelectedSize(null);
    }
  }, [cartId, slotCode]);

  const checkIfFirstTime = async () => {
    const { data } = await supabase.from('warehouse_slots').select('is_scanned_once, size').eq('code', slotCode).single();
    if (data && !data.is_scanned_once) {
      setIsFirstTime(true);
      setStep('size');
    } else {
      setIsFirstTime(false);
      setStep('status');
      if (data) setSelectedSize(data.size);
    }
    setShowActionModal(true);
  };

  const executeUpdate = async (capacity: 'empty' | 'half' | 'full', forceNoCart = false) => {
    setLoading(true);
    setMessage(null);
    setShowActionModal(false);

    try {
      const quantityMap = { 'empty': 0, 'half': 50, 'full': 100 };
      const statusMap = { 'empty': 'empty', 'half': 'occupied', 'full': 'occupied' };
      
      const newStatus = statusMap[capacity];
      const newQuantity = quantityMap[capacity];

      // Construimos el objeto de actualización asegurando el flag is_scanned_once
      const updateData: any = { 
        code: slotCode, 
        status: newStatus,
        item_name: forceNoCart ? (capacity === 'empty' ? null : 'Ajuste Manual') : (capacity === 'empty' ? null : `Carro: ${cartId}`),
        quantity: newQuantity,
        is_scanned_once: true, // Siempre true al realizar una acción
        last_updated: new Date().toISOString()
      };

      if (selectedSize) {
        updateData.size = selectedSize;
      }

      const { error: slotError } = await supabase
        .from('warehouse_slots')
        .upsert(updateData, { onConflict: 'code' });

      if (slotError) throw slotError;

      await supabase.from('movement_logs').insert({
        operator_name: currentUser.full_name,
        operator_email: currentUser.email,
        cart_id: forceNoCart ? 'MANUAL' : cartId,
        slot_code: slotCode,
        new_status: newStatus,
        new_quantity: newQuantity
      });

      setMessage({ type: 'success', text: `✅ ${slotCode} actualizado y marcado como LEÍDO.` });
      setCartId('');
      setSlotCode('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const openScanner = (target: 'cart' | 'slot') => {
    setScannerTarget(target);
    setScannerOpen(true);
  };

  const handleScanResult = (result: string) => {
    const formatted = result.toUpperCase().trim();
    if (scannerTarget === 'cart') {
      setCartId(formatted);
      setTimeout(() => slotInputRef.current?.focus(), 150);
    } else if (scannerTarget === 'slot') {
      setSlotCode(formatted);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      {showActionModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] p-8 w-full max-w-sm shadow-2xl animate-fade-in">
            <div className="text-center space-y-6">
              <div className="flex justify-center gap-4 items-center bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <span className="font-black text-amber-600 text-xs">{cartId}</span>
                <span className="text-slate-300">➔</span>
                <span className="font-black text-indigo-600 text-xs">{slotCode}</span>
              </div>

              {step === 'size' ? (
                <div className="space-y-4">
                  <h3 className="text-xl font-black text-slate-800">Ubicación Nueva:<br/><span className="text-indigo-600">Selecciona Tamaño</span></h3>
                  <div className="grid grid-cols-1 gap-2">
                    {['Pequeño', 'Mediano', 'Grande', 'Palet'].map(size => (
                      <button 
                        key={size}
                        onClick={() => { setSelectedSize(size); setStep('status'); }}
                        className="bg-slate-50 hover:bg-indigo-50 border-2 border-slate-100 hover:border-indigo-200 py-4 rounded-2xl font-black text-slate-700 transition-all uppercase text-xs"
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-2xl font-black text-slate-800">Estado de Carga</h3>
                  <div className="grid grid-cols-1 gap-3">
                    <button onClick={() => executeUpdate('full')} className="bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-lg active:scale-95 transition-all">LLENO (100%)</button>
                    <button onClick={() => executeUpdate('half')} className="bg-amber-500 text-white font-black py-5 rounded-2xl shadow-lg active:scale-95 transition-all">MEDIO (50%)</button>
                    <button onClick={() => executeUpdate('empty')} className="bg-emerald-500 text-white font-black py-5 rounded-2xl shadow-lg active:scale-95 transition-all">VACÍO (0%)</button>
                  </div>
                </div>
              )}
              
              <button onClick={() => { setCartId(''); setSlotCode(''); }} className="text-slate-400 font-bold text-[10px] uppercase tracking-widest pt-2">Cancelar Operación</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><span>📲</span> Captura de Datos</h2>
        {message && (
          <div className={`p-4 rounded-xl mb-6 text-xs font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
            {message.text}
          </div>
        )}
        <div className="space-y-5">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">ID Carro</label>
            <div className="relative">
              <input type="text" value={cartId} autoFocus onChange={(e) => setCartId(e.target.value.toUpperCase())} placeholder="C-0000" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-5 focus:border-indigo-500 font-mono text-lg" />
              <button onClick={() => openScanner('cart')} className="absolute right-3 top-1/2 -translate-y-1/2 bg-white p-2 rounded-xl shadow-sm border border-slate-100">📷</button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Hueco Destino</label>
            <div className="relative">
              <input ref={slotInputRef} type="text" value={slotCode} onChange={(e) => setSlotCode(e.target.value.toUpperCase())} placeholder="U000000" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-5 focus:border-indigo-500 font-mono text-lg" />
              <button onClick={() => openScanner('slot')} className="absolute right-3 top-1/2 -translate-y-1/2 bg-white p-2 rounded-xl shadow-sm border border-slate-100">📷</button>
            </div>
          </div>
        </div>
      </div>
      <ScannerModal isOpen={scannerOpen} onClose={() => setScannerOpen(false)} onScan={handleScanResult} title={scannerTarget === 'cart' ? 'Escaneando Carro' : 'Escaneando Hueco'} />
    </div>
  );
};

export default Dashboard;
