import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile, InventoryReading, InventoryItem, WarehouseSlot } from '../types';

interface InventoryPanelProps {
  user: UserProfile;
}

const InventoryPanel: React.FC<InventoryPanelProps> = ({ user }) => {
  const [mode, setMode] = useState<'scan' | 'admin'>(user.role === 'admin' ? 'admin' : 'scan');
  const [step, setStep] = useState<'location' | 'items'>('location');
  const [location, setLocation] = useState('');
  const [items, setItems] = useState<{ code: string, quantity: number }[]>([]);
  const [currentItemCode, setCurrentItemCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' | 'info' } | null>(null);
  
  // Admin states
  const [pendingReadings, setPendingReadings] = useState<(InventoryReading & { items: InventoryItem[] })[]>([]);
  const [completedReadings, setCompletedReadings] = useState<(InventoryReading & { items: InventoryItem[] })[]>([]);
  const [missingSlots, setMissingSlots] = useState<WarehouseSlot[]>([]);
  const [adminTab, setAdminTab] = useState<'pending' | 'completed' | 'missing'>('pending');
  const [adminSearch, setAdminSearch] = useState('');
  
  const [showCapacityModal, setShowCapacityModal] = useState(false);
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [capacity, setCapacity] = useState<number>(100);
  const [selectedSize, setSelectedSize] = useState<string>('Mediano');

  const locationInputRef = useRef<HTMLInputElement>(null);
  const itemInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'scan') {
      if (step === 'location') locationInputRef.current?.focus();
      else itemInputRef.current?.focus();
    } else {
      fetchAdminData();
    }
  }, [mode, step, adminTab]);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      // 1. Fetch Readings
      const { data: readings, error: readingsError } = await supabase
        .from('inventory_readings')
        .select('*, items:inventory_items(*)')
        .gte('created_at', `${today}T00:00:00`)
        .order('created_at', { ascending: false });

      if (readingsError) throw readingsError;
      
      const pending = (readings || []).filter(r => r.status === 'pending');
      const completed = (readings || []).filter(r => r.status === 'completed');
      
      setPendingReadings(pending);
      setCompletedReadings(completed);

      // 2. Fetch Missing Slots
      const { data: allSlots, error: slotsError } = await supabase
        .from('warehouse_slots')
        .select('*');
      
      if (slotsError) throw slotsError;

      const readSlotCodes = new Set((readings || []).map(r => r.slot_code));
      const missing = (allSlots || []).filter(s => !readSlotCodes.has(s.code));
      setMissingSlots(missing);

    } catch (err: any) {
      console.error('Error fetching admin data:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location) return;

    setLoading(true);
    try {
      // Check if location exists in warehouse_slots
      const { data: slot, error: slotError } = await supabase
        .from('warehouse_slots')
        .select('*')
        .eq('code', location.toUpperCase())
        .single();

      if (slotError || !slot) {
        setMessage({ text: 'UBICACIÓN NO ENCONTRADA EN EL SISTEMA', type: 'error' });
        setLocation('');
        return;
      }

      // Check if already read (pending or completed today)
      const today = new Date().toISOString().split('T')[0];
      const { data: existing, error: existingError } = await supabase
        .from('inventory_readings')
        .select('*')
        .eq('slot_code', location.toUpperCase())
        .gte('created_at', `${today}T00:00:00`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (existing && existing.length > 0) {
        setMessage({ text: `ESTA UBICACIÓN YA HA SIDO LEÍDA HOY (${existing[0].status.toUpperCase()})`, type: 'info' });
        setLocation('');
        return;
      }

      // Ask for size
      setSelectedSize(slot.size || 'Mediano');
      setShowSizeModal(true);
      setMessage(null);
    } catch (err: any) {
      setMessage({ text: 'ERROR AL VALIDAR UBICACIÓN', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const confirmSize = async () => {
    setLoading(true);
    try {
      await supabase
        .from('warehouse_slots')
        .update({ size: selectedSize })
        .eq('code', location.toUpperCase());
      
      setShowSizeModal(false);
      setStep('items');
    } catch (err: any) {
      setMessage({ text: 'ERROR AL GUARDAR TAMAÑO', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleItemSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentItemCode) return;

    const code = currentItemCode.toUpperCase();
    setItems(prev => {
      const existing = prev.find(i => i.code === code);
      if (existing) {
        return prev.map(i => i.code === code ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { code, quantity: 1 }];
    });
    setCurrentItemCode('');
    itemInputRef.current?.focus();
  };

  const handleFinishSlot = () => {
    if (items.length === 0) {
      setMessage({ text: 'DEBES ESCANEAR AL MENOS UN ARTÍCULO', type: 'error' });
      return;
    }
    setShowCapacityModal(true);
  };

  const saveReading = async () => {
    setLoading(true);
    try {
      // 1. Create reading
      const { data: reading, error: readingError } = await supabase
        .from('inventory_readings')
        .insert([{
          slot_code: location.toUpperCase(),
          operator_email: user.email,
          operator_name: user.full_name,
          status: 'pending',
          capacity_percent: capacity
        }])
        .select()
        .single();

      if (readingError) throw readingError;

      // 2. Create items
      const itemsToInsert = items.map(i => ({
        reading_id: reading.id,
        item_code: i.code,
        quantity: i.quantity
      }));

      const { error: itemsError } = await supabase
        .from('inventory_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      // 3. Update warehouse_slot status (optional, user said "actualizar el estado como en el dashboard")
      // In dashboard, it updates quantity and status.
      // Here we might just mark it as scanned or update with first item? 
      // User said "actualizar el estado como en el dashboard", which usually means occupied/empty based on quantity.
      const totalQty = items.reduce((acc, curr) => acc + curr.quantity, 0);
      await supabase
        .from('warehouse_slots')
        .update({
          status: totalQty > 0 ? 'occupied' : 'empty',
          quantity: capacity, // Or maybe sum of items? Dashboard uses capacity for the slot itself usually.
          item_name: items.length > 0 ? items[0].code : '', // Just first item as reference
          is_scanned_once: true,
          last_updated: new Date().toISOString()
        })
        .eq('code', location.toUpperCase());

      setMessage({ text: 'HUECO TERMINADO Y GUARDADO CORRECTAMENTE', type: 'success' });
      resetScan();
    } catch (err: any) {
      setMessage({ text: 'ERROR AL GUARDAR INVENTARIO: ' + err.message, type: 'error' });
    } finally {
      setLoading(false);
      setShowCapacityModal(false);
    }
  };

  const resetScan = () => {
    setStep('location');
    setLocation('');
    setItems([]);
    setCurrentItemCode('');
    setCapacity(100);
  };

  const markAsCompleted = async (readingId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('inventory_readings')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by_name: user.full_name
        })
        .eq('id', readingId);

      if (error) throw error;
      fetchAdminData();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredPending = pendingReadings.filter(r => r.slot_code.includes(adminSearch.toUpperCase()));
  const filteredCompleted = completedReadings.filter(r => r.slot_code.includes(adminSearch.toUpperCase()));
  const filteredMissing = missingSlots.filter(s => s.code.includes(adminSearch.toUpperCase()));

  return (
    <div className="p-4 md:p-8 space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Inventario Real</h2>
        <div className="flex gap-2">
          {user.role === 'admin' && (
            <button 
              onClick={() => setMode(mode === 'scan' ? 'admin' : 'scan')}
              className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${mode === 'admin' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {mode === 'admin' ? 'Modo Escaneo' : `Admin (${pendingReadings.length})`}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-2xl font-bold text-xs uppercase text-center animate-bounce ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
          message.type === 'error' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
          'bg-amber-50 text-amber-600 border border-amber-100'
        }`}>
          {message.text}
        </div>
      )}

      {mode === 'scan' ? (
        <div className="max-w-md mx-auto space-y-6">
          {step === 'location' ? (
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl space-y-6">
              <div className="text-center space-y-2">
                <div className="text-4xl">📍</div>
                <h3 className="text-lg font-black text-slate-800 uppercase">Escanear Ubicación</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lee el código de barras del hueco</p>
              </div>
              <form onSubmit={handleLocationSubmit} className="space-y-4">
                <input 
                  ref={locationInputRef}
                  type="text"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="UBICACIÓN..."
                  className="w-full bg-slate-50 p-6 rounded-3xl text-center text-2xl font-black outline-none border-2 border-transparent focus:border-indigo-500 transition-all uppercase"
                  autoFocus
                />
                <button 
                  type="submit"
                  disabled={loading || !location}
                  className="w-full bg-slate-900 text-white py-5 rounded-3xl font-black uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all disabled:opacity-50"
                >
                  {loading ? 'VALIDANDO...' : 'CONTINUAR'}
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-indigo-600 p-6 rounded-[2.5rem] text-white shadow-xl flex justify-between items-center">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[0.3em] opacity-60">Ubicación Actual</p>
                  <h3 className="text-2xl font-black tracking-tighter">{location.toUpperCase()}</h3>
                </div>
                <button onClick={resetScan} className="bg-white/20 p-3 rounded-2xl hover:bg-white/30 transition-all">✕</button>
              </div>

              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl space-y-6">
                <div className="text-center space-y-2">
                  <div className="text-4xl">📦</div>
                  <h3 className="text-lg font-black text-slate-800 uppercase">Escanear Artículos</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lee los códigos de los productos</p>
                </div>
                <form onSubmit={handleItemSubmit} className="space-y-4">
                  <input 
                    ref={itemInputRef}
                    type="text"
                    value={currentItemCode}
                    onChange={e => currentItemCode(e.target.value)}
                    placeholder="CÓDIGO ARTÍCULO..."
                    className="w-full bg-slate-50 p-6 rounded-3xl text-center text-xl font-black outline-none border-2 border-transparent focus:border-indigo-500 transition-all uppercase"
                    autoFocus
                  />
                </form>

                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                  {items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 animate-slide-in">
                      <span className="font-black text-slate-700 uppercase">{item.code}</span>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => setItems(prev => prev.map(i => i.code === item.code ? { ...i, quantity: Math.max(0, i.quantity - 1) } : i).filter(i => i.quantity > 0))}
                          className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-all"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-black text-indigo-600">{item.quantity}</span>
                        <button 
                          onClick={() => setItems(prev => prev.map(i => i.code === item.code ? { ...i, quantity: i.quantity + 1 } : i))}
                          className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-emerald-500 transition-all"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <p className="text-center py-8 text-slate-300 font-black uppercase text-[10px] tracking-widest">Esperando lecturas...</p>
                  )}
                </div>

                <button 
                  onClick={handleFinishSlot}
                  disabled={items.length === 0}
                  className="w-full bg-emerald-600 text-white py-5 rounded-3xl font-black uppercase tracking-[0.2em] shadow-lg shadow-emerald-100 active:scale-95 transition-all disabled:opacity-50"
                >
                  TERMINAR HUECO
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl w-full md:w-auto">
              <button 
                onClick={() => setAdminTab('pending')}
                className={`flex-1 md:flex-none px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${adminTab === 'pending' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Pendientes ({pendingReadings.length})
              </button>
              <button 
                onClick={() => setAdminTab('completed')}
                className={`flex-1 md:flex-none px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${adminTab === 'completed' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Validados ({completedReadings.length})
              </button>
              <button 
                onClick={() => setAdminTab('missing')}
                className={`flex-1 md:flex-none px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${adminTab === 'missing' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Faltan ({missingSlots.length})
              </button>
            </div>
            <div className="relative w-full md:w-64">
              <input 
                type="text"
                placeholder="BUSCAR HUECO..."
                value={adminSearch}
                onChange={e => setAdminSearch(e.target.value)}
                className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          {adminTab === 'missing' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {filteredMissing.map(slot => (
                <div key={slot.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm text-center space-y-2">
                  <span className="text-xs font-black text-slate-800 tracking-tighter">{slot.code}</span>
                  <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{slot.size || 'S/T'}</div>
                </div>
              ))}
              {filteredMissing.length === 0 && (
                <div className="col-span-full py-20 text-center">
                  <p className="text-slate-300 font-black uppercase text-xs tracking-widest">No hay huecos pendientes de lectura</p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(adminTab === 'pending' ? filteredPending : filteredCompleted).map(reading => (
                <div key={reading.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-all space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Ubicación</p>
                      <h4 className="text-xl font-black text-slate-800 tracking-tighter">{reading.slot_code}</h4>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Capacidad</p>
                      <span className="text-xs font-black text-indigo-600">{reading.capacity_percent}%</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Artículos Leídos</p>
                    <div className="space-y-1">
                      {reading.items.map(item => (
                        <div key={item.id} className="flex justify-between text-[10px] font-bold uppercase">
                          <span className="text-slate-600">{item.item_code}</span>
                          <span className="text-slate-900">x{item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-50 flex justify-between items-center">
                    <div className="text-[8px] font-bold text-slate-400 uppercase">
                      Por: {reading.operator_name}
                      <br/>
                      {new Date(reading.created_at).toLocaleString()}
                    </div>
                    {adminTab === 'pending' && (
                      <button 
                        onClick={() => markAsCompleted(reading.id)}
                        className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all"
                      >
                        Validar
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {(adminTab === 'pending' ? filteredPending : filteredCompleted).length === 0 && (
                <div className="col-span-full py-20 text-center">
                  <p className="text-slate-300 font-black uppercase text-xs tracking-widest">No hay lecturas en esta sección</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Size Modal */}
      {showSizeModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl animate-scale-in">
            <div className="text-center space-y-4 mb-8">
              <div className="text-4xl">📏</div>
              <h3 className="text-xl font-black text-slate-800 uppercase">Tamaño del Hueco</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Selecciona el tamaño físico del hueco {location}</p>
            </div>

            <div className="grid grid-cols-1 gap-3 mb-8">
              {['Grande', 'Mediano', 'Pequeño'].map(size => (
                <button 
                  key={size}
                  onClick={() => setSelectedSize(size)}
                  className={`py-5 rounded-3xl font-black text-sm uppercase tracking-widest transition-all ${
                    selectedSize === size ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 scale-105' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => { setShowSizeModal(false); setLocation(''); }}
                className="flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmSize}
                disabled={loading}
                className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all"
              >
                {loading ? 'GUARDANDO...' : 'CONFIRMAR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Capacity Modal */}
      {showCapacityModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl animate-scale-in">
            <div className="text-center space-y-4 mb-8">
              <div className="text-4xl">📊</div>
              <h3 className="text-xl font-black text-slate-800 uppercase">Capacidad del Hueco</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">¿Cómo de lleno está el hueco {location}?</p>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-8">
              {[100, 50, 0].map(val => (
                <button 
                  key={val}
                  onClick={() => setCapacity(val)}
                  className={`py-6 rounded-3xl font-black text-lg transition-all ${
                    capacity === val ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 scale-105' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                  }`}
                >
                  {val}%
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setShowCapacityModal(false)}
                className="flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={saveReading}
                disabled={loading}
                className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all"
              >
                {loading ? 'GUARDANDO...' : 'CONFIRMAR'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryPanel;
