
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

  // Simulamos un usuario logueado
  const currentUser = {
    full_name: 'Admin Central',
    email: 'admin@almacen.com'
  };

  // Efecto para abrir el modal de acción automáticamente cuando ambos campos están listos
  useEffect(() => {
    if (cartId.trim().length >= 3 && slotCode.trim().length >= 3) {
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
    if (scannerTarget === 'cart') {
      setCartId(result);
      // Tras escanear carro, ponemos el foco en hueco
      setTimeout(() => slotInputRef.current?.focus(), 100);
    } else if (scannerTarget === 'slot') {
      setSlotCode(result);
    }
  };

  const executeUpdate = async (capacity: 'empty' | 'half' | 'full', forceNoCart = false) => {
    setLoading(true);
    setMessage(null);
    setPendingUpdate(null);
    setShowActionModal(false);

    try {
      const statusMap = {
        'empty': 'empty',
        'half': 'occupied',
        'full': 'occupied'
      };
      
      const quantityMap = {
        'empty': 0,
        'half': 50,
        'full': 100
      };

      const newStatus = statusMap[capacity];
      const newQuantity = quantityMap[capacity];

      const { error: slotError } = await supabase
        .from('warehouse_slots')
        .upsert({ 
          code: slotCode, 
          status: newStatus,
          item_name: forceNoCart ? (capacity === 'empty' ? null : 'Ajuste Manual') : (capacity === 'empty' ? null : `Carro: ${cartId}`),
          quantity: newQuantity,
          last_updated: new Date().toISOString()
        }, { onConflict: 'code' });

      if (slotError) throw slotError;

      const { error: logError } = await supabase
        .from('movement_logs')
        .insert({
          operator_name: currentUser.full_name,
          operator_email: currentUser.email,
          cart_id: forceNoCart ? 'MANUAL' : cartId,
          slot_code: slotCode,
          new_status: newStatus,
          new_quantity: newQuantity,
          created_at: new Date().toISOString()
        });

      if (logError) console.error("Error al registrar log:", logError);

      setMessage({ 
        type: forceNoCart ? 'info' : 'success', 
        text: forceNoCart 
          ? `ℹ️ Hueco ${slotCode} actualizado al ${newQuantity}%`
          : `✅ Carro ${cartId} ubicado en ${slotCode} (${newQuantity}%)` 
      });
      
      setCartId('');
      setSlotCode('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al procesar la solicitud' });
    } finally {
      setLoading(false);
    }
  };

  const handleManualConfirm = (capacity: 'empty' | 'half' | 'full') => {
    if (!slotCode.trim()) {
      setMessage({ type: 'error', text: '⚠️ Error: Debe identificar el HUECO.' });
      return;
    }
    setPendingUpdate({ capacity });
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      {/* MODAL DE ACCIÓN FINAL (Carro + Hueco detectados) */}
      {showActionModal && !pendingUpdate && (
        <div className="fixed inset-0 z-[120] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] p-8 w-full max-w-sm shadow-2xl animate-fade-in border border-white/20">
            <div className="text-center space-y-6">
              <div className="flex justify-center gap-4 items-center">
                <div className="bg-amber-100 text-amber-700 px-4 py-2 rounded-2xl font-black text-sm border border-amber-200">
                  {cartId}
                </div>
                <span className="text-slate-300">➔</span>
                <div className="bg-indigo-100 text-indigo-700 px-4 py-2 rounded-2xl font-black text-sm border border-indigo-200">
                  {slotCode}
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-slate-800">¿Ocupación?</h3>
                <p className="text-slate-500 text-sm font-medium">Indica el estado final del hueco</p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <button 
                  onClick={() => executeUpdate('full')}
                  className="bg-indigo-600 text-white font-black py-5 rounded-2xl active:scale-95 transition-all text-lg shadow-lg shadow-indigo-200"
                >
                  LLENO (100%)
                </button>
                <button 
                  onClick={() => executeUpdate('half')}
                  className="bg-amber-500 text-white font-black py-5 rounded-2xl active:scale-95 transition-all text-lg shadow-lg shadow-amber-200"
                >
                  MEDIO (50%)
                </button>
                <button 
                  onClick={() => executeUpdate('empty')}
                  className="bg-emerald-500 text-white font-black py-5 rounded-2xl active:scale-95 transition-all text-lg shadow-lg shadow-emerald-200"
                >
                  VACÍO (0%)
                </button>
                
                <button 
                  onClick={() => { setCartId(''); setSlotCode(''); }}
                  className="mt-4 text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-rose-500 transition-colors"
                >
                  Limpiar y Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación para cambio sin carro (Ajuste Manual) */}
      {pendingUpdate && (
        <div className="fixed inset-0 z-[130] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-2xl animate-fade-in border border-slate-100 text-center space-y-4">
            <div className="text-4xl">❓</div>
            <h3 className="font-black text-slate-800 text-lg leading-tight">Confirmar ajuste</h3>
            <p className="text-slate-500 text-sm">
              ¿Confirmar que el hueco <span className="font-bold text-indigo-600">{slotCode}</span> tiene una ocupacion del <span className="font-bold text-indigo-600">{getQuantityLabel(pendingUpdate.capacity)}%</span>?
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button 
                onClick={() => executeUpdate(pendingUpdate.capacity, true)}
                className="bg-indigo-600 text-white font-bold py-3 rounded-2xl active:scale-95 transition-transform"
              >
                SÍ, CONFIRMAR
              </button>
              <button 
                onClick={() => setPendingUpdate(null)}
                className="bg-slate-100 text-slate-500 font-bold py-3 rounded-2xl active:scale-95 transition-transform"
              >
                CANCELAR
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
          <span className="text-2xl">📲</span> Captura Rápida
        </h2>

        {message && (
          <div className={`p-4 rounded-xl mb-6 text-sm font-bold animate-fade-in border ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
            message.type === 'info' ? 'bg-blue-50 text-blue-700 border-blue-100' : 
            'bg-rose-50 text-rose-700 border-rose-100 animate-[shake_0.4s_ease-in-out]'
          }`}>
            {message.text}
          </div>
        )}

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">ID Carro</label>
            <div className="relative">
              <input
                type="text"
                value={cartId}
                autoFocus
                onChange={(e) => {
                  const val = e.target.value.toUpperCase();
                  setCartId(val);
                  // Auto-focus al hueco si el carro parece completo (ej: 3+ chars)
                  if (val.length >= 4) slotInputRef.current?.focus();
                }}
                placeholder="Escanea carro..."
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-5 focus:border-indigo-500 focus:ring-0 transition-all text-lg font-mono uppercase"
              />
              <button 
                onClick={() => openScanner('cart')}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-white p-2 rounded-xl shadow-sm border border-slate-200 active:scale-90 transition-transform"
              >
                📷
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Hueco Destino</label>
            <div className="relative">
              <input
                ref={slotInputRef}
                type="text"
                value={slotCode}
                onChange={(e) => setSlotCode(e.target.value.toUpperCase())}
                placeholder="Escanea hueco..."
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-5 focus:border-indigo-500 focus:ring-0 transition-all text-lg font-mono uppercase"
              />
              <button 
                onClick={() => openScanner('slot')}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-white p-2 rounded-xl shadow-sm border border-slate-200 active:scale-90 transition-transform"
              >
                📷
              </button>
            </div>
          </div>

          {/* Opciones manuales visibles solo si no hay carro para evitar distracciones */}
          {!cartId && slotCode && (
            <div className="pt-4 space-y-3 animate-fade-in">
              <p className="text-[10px] font-black text-slate-400 uppercase text-center tracking-widest">Ajuste Manual de Hueco</p>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => handleManualConfirm('empty')} className="bg-emerald-50 text-emerald-600 border border-emerald-100 py-3 rounded-xl font-black text-[10px]">VACÍO</button>
                <button onClick={() => handleManualConfirm('half')} className="bg-amber-50 text-amber-600 border border-amber-100 py-3 rounded-xl font-black text-[10px]">MEDIO</button>
                <button onClick={() => handleManualConfirm('full')} className="bg-indigo-50 text-indigo-600 border border-indigo-100 py-3 rounded-xl font-black text-[10px]">LLENO</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ScannerModal 
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScanResult}
        title={scannerTarget === 'cart' ? 'Escaneando Carro' : 'Escaneando Hueco'}
      />
    </div>
  );
};

export default Dashboard;
