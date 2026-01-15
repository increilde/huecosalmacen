
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
  const [pendingUpdate, setPendingUpdate] = useState<{capacity: 'empty' | 'half' | 'full'} | null>(null);

  const slotInputRef = useRef<HTMLInputElement>(null);

  const currentUser = {
    full_name: 'Admin Central',
    email: 'admin@almacen.com'
  };

  useEffect(() => {
    if (cartId.trim().length >= 4 && slotCode.trim().length >= 4) {
      setShowActionModal(true);
    } else {
      setShowActionModal(false);
    }
  }, [cartId, slotCode]);

  const getQuantityLabel = (capacity: 'empty' | 'half' | 'full') => {
    if (capacity === 'empty') return '0';
    if (capacity === 'half') return '50';
    return '100';
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

  const executeUpdate = async (capacity: 'empty' | 'half' | 'full', forceNoCart = false) => {
    setLoading(true);
    setMessage(null);
    setPendingUpdate(null);
    setShowActionModal(false);

    try {
      const quantityMap = { 'empty': 0, 'half': 50, 'full': 100 };
      const statusMap = { 'empty': 'empty', 'half': 'occupied', 'full': 'occupied' };
      
      const newStatus = statusMap[capacity];
      const newQuantity = quantityMap[capacity];

      // Actualizar el hueco y marcarlo como LEÍDO ALGUNA VEZ
      const { error: slotError } = await supabase
        .from('warehouse_slots')
        .upsert({ 
          code: slotCode, 
          status: newStatus,
          item_name: forceNoCart ? (capacity === 'empty' ? null : 'Ajuste Manual') : (capacity === 'empty' ? null : `Carro: ${cartId}`),
          quantity: newQuantity,
          is_scanned_once: true, // Marcamos como escaneado
          last_updated: new Date().toISOString()
        }, { onConflict: 'code' });

      if (slotError) throw slotError;

      await supabase.from('movement_logs').insert({
        operator_name: currentUser.full_name,
        operator_email: currentUser.email,
        cart_id: forceNoCart ? 'MANUAL' : cartId,
        slot_code: slotCode,
        new_status: newStatus,
        new_quantity: newQuantity
      });

      setMessage({ 
        type: 'success', 
        text: `✅ ${slotCode} actualizado correctamente.` 
      });
      
      setCartId('');
      setSlotCode('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleManualConfirm = (capacity: 'empty' | 'half' | 'full') => {
    if (!slotCode.trim()) {
      setMessage({ type: 'error', text: '⚠️ Identifique el HUECO primero.' });
      return;
    }
    setPendingUpdate({ capacity });
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      {showActionModal && !pendingUpdate && (
        <div className="fixed inset-0 z-[120] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] p-8 w-full max-w-sm shadow-2xl animate-fade-in">
            <div className="text-center space-y-6">
              <div className="flex justify-center gap-4 items-center bg-slate-50 p-4 rounded-3xl border border-slate-100">
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-black text-slate-400 uppercase">Carro</span>
                  <span className="font-black text-amber-600">{cartId}</span>
                </div>
                <span className="text-slate-300">➔</span>
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-black text-slate-400 uppercase">Hueco</span>
                  <span className="font-black text-indigo-600">{slotCode}</span>
                </div>
              </div>
              <h3 className="text-2xl font-black text-slate-800">¿Estado de Carga?</h3>
              <div className="grid grid-cols-1 gap-3">
                <button onClick={() => executeUpdate('full')} className="bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-lg active:scale-95 transition-all">LLENO (100%)</button>
                <button onClick={() => executeUpdate('half')} className="bg-amber-500 text-white font-black py-5 rounded-2xl shadow-lg active:scale-95 transition-all">MEDIO (50%)</button>
                <button onClick={() => executeUpdate('empty')} className="bg-emerald-500 text-white font-black py-5 rounded-2xl shadow-lg active:scale-95 transition-all">VACÍO (0%)</button>
                <button onClick={() => { setCartId(''); setSlotCode(''); }} className="mt-2 text-slate-400 font-bold text-xs uppercase tracking-widest">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingUpdate && (
        <div className="fixed inset-0 z-[130] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-2xl text-center space-y-4">
            <h3 className="font-black text-slate-800 text-lg">Confirmar Ajuste Manual</h3>
            <p className="text-slate-500 text-sm">Hueco <span className="font-bold">{slotCode}</span> al <span className="font-bold">{getQuantityLabel(pendingUpdate.capacity)}%</span></p>
            <div className="flex flex-col gap-2">
              <button onClick={() => executeUpdate(pendingUpdate.capacity, true)} className="bg-indigo-600 text-white font-bold py-3 rounded-2xl">CONFIRMAR</button>
              <button onClick={() => setPendingUpdate(null)} className="bg-slate-100 text-slate-500 font-bold py-3 rounded-2xl">VOLVER</button>
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
          {!cartId && slotCode && (
            <div className="pt-4 grid grid-cols-3 gap-2">
              <button onClick={() => handleManualConfirm('empty')} className="bg-emerald-50 text-emerald-700 py-3 rounded-xl font-black text-[9px]">VACÍO</button>
              <button onClick={() => handleManualConfirm('half')} className="bg-amber-50 text-amber-700 py-3 rounded-xl font-black text-[9px]">MEDIO</button>
              <button onClick={() => handleManualConfirm('full')} className="bg-indigo-50 text-indigo-700 py-3 rounded-xl font-black text-[9px]">LLENO</button>
            </div>
          )}
        </div>
      </div>
      <ScannerModal isOpen={scannerOpen} onClose={() => setScannerOpen(false)} onScan={handleScanResult} title={scannerTarget === 'cart' ? 'Escaneando Carro' : 'Escaneando Hueco'} />
    </div>
  );
};

export default Dashboard;
