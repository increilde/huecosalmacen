
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import ScannerModal from './ScannerModal';

const Dashboard: React.FC = () => {
  const [cartId, setCartId] = useState('');
  const [slotCode, setSlotCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<'cart' | 'slot' | null>(null);
  
  const [pendingUpdate, setPendingUpdate] = useState<{capacity: 'empty' | 'half' | 'full'} | null>(null);

  // Simulamos un usuario logueado
  const currentUser = {
    full_name: 'Admin Central',
    email: 'admin@almacen.com'
  };

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
    } else if (scannerTarget === 'slot') {
      setSlotCode(result);
    }
  };

  const executeUpdate = async (capacity: 'empty' | 'half' | 'full', forceNoCart = false) => {
    setLoading(true);
    setMessage(null);
    setPendingUpdate(null);

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

      // 1. Actualizar el hueco
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

      // 2. Registrar la TRAZABILIDAD
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
          ? `ℹ️ Estado de hueco ${slotCode} actualizado correctamente.`
          : `✅ Ubicación registrada: Carro ${cartId} en ${slotCode} (${newQuantity}%)` 
      });
      
      setCartId('');
      setSlotCode('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al procesar la solicitud' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateClick = (capacity: 'empty' | 'half' | 'full') => {
    if (!slotCode.trim()) {
      setMessage({ type: 'error', text: '⚠️ Error: Debe identificar el HUECO de destino.' });
      return;
    }

    // Si no hay carro, pedimos confirmación con el nuevo mensaje solicitado
    if (!cartId.trim()) {
      setPendingUpdate({ capacity });
      return;
    }

    // Si hay carro y hueco, procedemos directamente
    executeUpdate(capacity);
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      {/* Modal de Confirmación para cambio sin carro */}
      {pendingUpdate && (
        <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-2xl animate-fade-in border border-slate-100">
            <div className="text-center space-y-4">
              <div className="text-4xl">❓</div>
              <h3 className="font-black text-slate-800 text-lg leading-tight">Confirmar cambio</h3>
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
        </div>
      )}

      <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
          <span className="text-2xl">📲</span> Gestión de Almacén
        </h2>

        {message && (
          <div className={`p-4 rounded-xl mb-6 text-sm font-bold animate-fade-in border ${
            message.type === 'success' 
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
              : message.type === 'info'
              ? 'bg-blue-50 text-blue-700 border-blue-100'
              : 'bg-rose-50 text-rose-700 border-rose-100 animate-[shake_0.4s_ease-in-out]'
          }`}>
            {message.text}
          </div>
        )}

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1 flex justify-between">
              <span>ID Carro (Opcional)</span>
              {!cartId && <span className="text-amber-500 lowercase font-medium italic">Modo manual</span>}
            </label>
            <div className="relative">
              <input
                type="text"
                value={cartId}
                onChange={(e) => setCartId(e.target.value.toUpperCase())}
                placeholder="Escanea el carro..."
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
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Hueco de Destino</label>
            <div className="relative">
              <input
                type="text"
                value={slotCode}
                onChange={(e) => setSlotCode(e.target.value.toUpperCase())}
                placeholder="Escanea el hueco..."
                className={`w-full bg-slate-50 border-2 rounded-2xl py-4 px-5 focus:ring-0 transition-all text-lg font-mono uppercase ${
                  !slotCode && message?.type === 'error' ? 'border-rose-200 bg-rose-50/30' : 'border-slate-100 focus:border-indigo-500'
                }`}
              />
              <button 
                onClick={() => openScanner('slot')}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-white p-2 rounded-xl shadow-sm border border-slate-200 active:scale-90 transition-transform"
              >
                📷
              </button>
            </div>
          </div>

          <div className="pt-4 space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase text-center">Definir Capacidad del Hueco</p>
            <div className="grid grid-cols-1 gap-3">
              <button
                disabled={loading}
                onClick={() => handleUpdateClick('empty')}
                className="flex items-center justify-between bg-white border-2 border-emerald-500 text-emerald-600 font-bold py-4 px-6 rounded-2xl active:bg-emerald-500 active:text-white transition-all shadow-md shadow-emerald-100 disabled:opacity-50"
              >
                <span className="text-2xl">⚪</span>
                <span>VACÍO (0%)</span>
                <span className="w-6"></span>
              </button>
              
              <button
                disabled={loading}
                onClick={() => handleUpdateClick('half')}
                className="flex items-center justify-between bg-white border-2 border-amber-500 text-amber-600 font-bold py-4 px-6 rounded-2xl active:bg-amber-500 active:text-white transition-all shadow-md shadow-amber-100 disabled:opacity-50"
              >
                <span className="text-2xl">🌗</span>
                <span>MEDIO (50%)</span>
                <span className="w-6"></span>
              </button>

              <button
                disabled={loading}
                onClick={() => handleUpdateClick('full')}
                className="flex items-center justify-between bg-white border-2 border-indigo-600 text-indigo-600 font-bold py-4 px-6 rounded-2xl active:bg-indigo-600 active:text-white transition-all shadow-md shadow-indigo-100 disabled:opacity-50"
              >
                <span className="text-2xl">⚫</span>
                <span>LLENO (100%)</span>
                <span className="w-6"></span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <ScannerModal 
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScanResult}
        title={scannerTarget === 'cart' ? 'Escaneando Carro' : 'Escaneando Hueco'}
      />

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
};

export default Dashboard;
