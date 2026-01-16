
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile } from '../types';
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
  const [step, setStep] = useState<'size' | 'status'>('size');

  const slotInputRef = useRef<HTMLInputElement>(null);

  // Efecto para detectar cuando el código del hueco está listo para procesar
  useEffect(() => {
    if (slotCode.trim().length >= 4) {
      checkSlotAndPrepare();
    } else {
      setShowActionModal(false);
      setStep('size');
      setSelectedSize(null);
    }
  }, [slotCode]);

  const checkSlotAndPrepare = async () => {
    try {
      const { data, error } = await supabase
        .from('warehouse_slots')
        .select('is_scanned_once, size')
        .eq('code', slotCode.toUpperCase().trim())
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (!data || !data.is_scanned_once) {
        setStep('size');
        setSelectedSize(null);
      } else {
        setStep('status');
        setSelectedSize(data.size);
      }
      setShowActionModal(true);
    } catch (err) {
      console.error("Error checking slot:", err);
      setStep('size');
      setShowActionModal(true);
    }
  };

  const executeUpdate = async (capacity: 'empty' | 'half' | 'full') => {
    setLoading(true);
    setMessage(null);
    setShowActionModal(false);

    try {
      const quantityMap = { 'empty': 0, 'half': 50, 'full': 100 };
      const statusMap = { 'empty': 'empty', 'half': 'occupied', 'full': 'occupied' };
      
      const newStatus = statusMap[capacity];
      const newQuantity = quantityMap[capacity];

      const updateData: any = { 
        code: slotCode.toUpperCase().trim(), 
        status: newStatus,
        item_name: cartId.trim() ? `Carro: ${cartId.toUpperCase()}` : 'Ajuste Manual',
        quantity: newQuantity,
        is_scanned_once: true,
        last_updated: new Date().toISOString()
      };

      if (selectedSize) {
        updateData.size = selectedSize;
      }

      const { error: slotError } = await supabase
        .from('warehouse_slots')
        .upsert(updateData, { onConflict: 'code' });

      if (slotError) throw slotError;

      // Registrar movimiento con el usuario real
      await supabase.from('movement_logs').insert({
        operator_name: user.full_name,
        operator_email: user.email, // Aquí guardamos el username/email del login
        cart_id: cartId.trim() || 'MANUAL',
        slot_code: slotCode.toUpperCase().trim(),
        new_status: newStatus,
        new_quantity: newQuantity
      });

      setMessage({ 
        type: 'success', 
        text: `✅ ${slotCode.toUpperCase()} actualizado - ${newQuantity}%` 
      });
      
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

  const cancelOperation = () => {
    setShowActionModal(false);
    setSlotCode('');
    setCartId('');
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      {showActionModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] p-8 w-full max-w-sm shadow-2xl animate-fade-in border border-white/20">
            <div className="text-center space-y-6">
              <div className="flex justify-center gap-4 items-center bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <span className="font-black text-amber-600 text-[10px] tracking-widest uppercase">{cartId || 'MANUAL'}</span>
                <span className="text-slate-300">➔</span>
                <span className="font-black text-indigo-600 text-[10px] tracking-widest uppercase">{slotCode}</span>
              </div>

              {step === 'size' ? (
                <div className="space-y-4">
                  <h3 className="text-xl font-black text-slate-800 uppercase">Tamaño del Hueco</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {['Pequeño', 'Mediano', 'Grande', 'Palet'].map(size => (
                      <button 
                        key={size}
                        onClick={() => { setSelectedSize(size); setStep('status'); }}
                        className="bg-slate-50 border-2 border-slate-100 py-4 rounded-2xl font-black text-slate-700 transition-all uppercase text-[11px] tracking-widest"
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-2xl font-black text-slate-800 uppercase">Ocupación</h3>
                  <div className="grid grid-cols-1 gap-3">
                    <button onClick={() => executeUpdate('full')} className="bg-indigo-600 text-white font-black py-5 rounded-2xl shadow-lg active:scale-95 transition-all uppercase tracking-widest text-xs">Lleno (100%)</button>
                    <button onClick={() => executeUpdate('half')} className="bg-amber-500 text-white font-black py-5 rounded-2xl shadow-lg active:scale-95 transition-all uppercase tracking-widest text-xs">Medio (50%)</button>
                    <button onClick={() => executeUpdate('empty')} className="bg-emerald-500 text-white font-black py-5 rounded-2xl shadow-lg active:scale-95 transition-all uppercase tracking-widest text-xs">Vacío (0%)</button>
                  </div>
                </div>
              )}
              <button onClick={cancelOperation} className="text-slate-400 font-bold text-[10px] uppercase tracking-widest pt-2">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
        <h2 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-3">
          <span className="bg-indigo-600 text-white w-8 h-8 rounded-xl flex items-center justify-center text-sm">📲</span> 
          Captura
        </h2>
        {message && (
          <div className={`p-4 rounded-2xl mb-8 text-xs font-black animate-fade-in ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
            {message.text}
          </div>
        )}
        <div className="space-y-6">
          <div className="relative group">
            <input 
              type="text" 
              value={cartId} 
              autoFocus 
              onChange={(e) => setCartId(e.target.value.toUpperCase())} 
              placeholder="ID CARRO" 
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-5 px-6 focus:border-indigo-500 font-mono text-xl transition-all outline-none" 
            />
            <button onClick={() => openScanner('cart')} className="absolute right-4 top-1/2 -translate-y-1/2 bg-white text-lg p-2.5 rounded-xl shadow-md">📷</button>
          </div>
          <div className="relative group">
            <input 
              ref={slotInputRef} 
              type="text" 
              value={slotCode} 
              onChange={(e) => setSlotCode(e.target.value.toUpperCase())} 
              placeholder="CÓDIGO HUECO" 
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-5 px-6 focus:border-indigo-500 font-mono text-xl transition-all outline-none" 
            />
            <button onClick={() => openScanner('slot')} className="absolute right-4 top-1/2 -translate-y-1/2 bg-white text-lg p-2.5 rounded-xl shadow-md">📷</button>
          </div>
        </div>
      </div>
      <ScannerModal isOpen={scannerOpen} onClose={() => setScannerOpen(false)} onScan={handleScanResult} title="Escanear" />
    </div>
  );
};

export default Dashboard;
