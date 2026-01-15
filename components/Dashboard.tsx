
import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import ScannerModal from './ScannerModal';

const Dashboard: React.FC = () => {
  const [cartId, setCartId] = useState('');
  const [slotCode, setSlotCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<'cart' | 'slot' | null>(null);

  // Simulamos un usuario logueado (En una app real vendría de supabase.auth)
  const currentUser = {
    full_name: 'Admin Central',
    email: 'admin@almacen.com'
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

  const handleUpdate = async (capacity: 'empty' | 'half' | 'full') => {
    if (!cartId || !slotCode) {
      setMessage({ type: 'error', text: 'Por favor, introduce Carro y Hueco' });
      return;
    }

    setLoading(true);
    setMessage(null);

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
          item_name: `Carro: ${cartId}`,
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
          cart_id: cartId,
          slot_code: slotCode,
          new_status: newStatus,
          new_quantity: newQuantity,
          created_at: new Date().toISOString()
        });

      if (logError) console.error("Error al registrar log:", logError);

      setMessage({ type: 'success', text: `Movimiento registrado: ${slotCode} ahora está al ${newQuantity}%` });
      setCartId('');
      setSlotCode('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Error al guardar' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="bg-white p-6 rounded-3xl shadow-xl border border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
          <span className="text-2xl">📲</span> Captura de Movimiento
        </h2>

        {message && (
          <div className={`p-4 rounded-xl mb-6 text-sm font-medium animate-fade-in ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
          }`}>
            {message.type === 'success' ? '✅' : '❌'} {message.text}
          </div>
        )}

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">ID Carro / Lote</label>
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

          <div className="pt-4 space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase text-center">Indicar Capacidad Final</p>
            <div className="grid grid-cols-1 gap-3">
              <button
                disabled={loading}
                onClick={() => handleUpdate('empty')}
                className="flex items-center justify-between bg-white border-2 border-emerald-500 text-emerald-600 font-bold py-4 px-6 rounded-2xl active:bg-emerald-500 active:text-white transition-all shadow-md shadow-emerald-100 disabled:opacity-50"
              >
                <span className="text-2xl">⚪</span>
                <span>VACÍO (0%)</span>
                <span className="w-6"></span>
              </button>
              
              <button
                disabled={loading}
                onClick={() => handleUpdate('half')}
                className="flex items-center justify-between bg-white border-2 border-amber-500 text-amber-600 font-bold py-4 px-6 rounded-2xl active:bg-amber-500 active:text-white transition-all shadow-md shadow-amber-100 disabled:opacity-50"
              >
                <span className="text-2xl">🌗</span>
                <span>MEDIO (50%)</span>
                <span className="w-6"></span>
              </button>

              <button
                disabled={loading}
                onClick={() => handleUpdate('full')}
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
    </div>
  );
};

export default Dashboard;
