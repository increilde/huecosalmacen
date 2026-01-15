
import React, { useState, useEffect, useRef } from 'react';
import { UserRole, WarehouseSlot } from '../types';
import { supabase } from '../supabaseClient';
import ScannerModal from './ScannerModal';

interface SlotGridProps {
  userRole: UserRole;
}

const SlotGrid: React.FC<SlotGridProps> = ({ userRole }) => {
  const [slots, setSlots] = useState<WarehouseSlot[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<WarehouseSlot | null>(null);
  const [updating, setUpdating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  useEffect(() => {
    fetchSlots();
    const channel = supabase.channel('grid-updates').on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_slots' }, () => {
      fetchSlots();
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchSlots = async () => {
    const { data } = await supabase.from('warehouse_slots').select('*').order('code');
    if (data) setSlots(data);
    setLoading(false);
  };

  const updateSlotSize = async (newSize: string) => {
    if (!selectedSlot) return;
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('warehouse_slots')
        .update({ size: newSize })
        .eq('id', selectedSlot.id);
      
      if (error) throw error;
      
      setSlots(slots.map(s => s.id === selectedSlot.id ? { ...s, size: newSize } : s));
      setSelectedSlot(null);
      setSearchQuery(''); // Limpiamos búsqueda tras editar
    } catch (err: any) {
      alert("Error al actualizar tamaño: " + err.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleSearch = (val: string) => {
    const code = val.toUpperCase().trim();
    setSearchQuery(code);
    
    // Si hay una coincidencia exacta, abrimos la ficha automáticamente
    const match = slots.find(s => s.code === code);
    if (match) {
      setSelectedSlot(match);
    }
  };

  const handleScanResult = (result: string) => {
    handleSearch(result);
  };

  const filteredSlots = slots.filter(s => {
    const matchesSearch = s.code.includes(searchQuery);
    if (!matchesSearch) return false;
    
    if (filter === 'all') return true;
    if (filter === 'new') return !s.is_scanned_once;
    return s.status === filter;
  });

  if (loading) return <div className="p-20 text-center font-black text-slate-300 animate-pulse text-sm uppercase tracking-widest">Sincronizando Almacén...</div>;

  return (
    <div className="space-y-6">
      {/* MODAL DE EDICIÓN DE TAMAÑO (FICHA DEL HUECO) */}
      {selectedSlot && (
        <div className="fixed inset-0 z-[150] bg-slate-900/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl animate-fade-in border border-slate-100">
            <div className="text-center space-y-6">
              <div className="inline-block p-4 bg-indigo-50 rounded-3xl mb-2">
                <span className="text-3xl">📐</span>
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">Hueco {selectedSlot.code}</h3>
                <div className="flex justify-center gap-2 mt-2">
                  <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${selectedSlot.status === 'empty' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                    {selectedSlot.status === 'empty' ? 'Libre' : 'Ocupado'}
                  </span>
                  {!selectedSlot.is_scanned_once && (
                    <span className="px-2 py-1 rounded-lg text-[9px] font-black uppercase bg-rose-100 text-rose-600">No escaneado</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left ml-2">Asignar Tamaño</p>
                {['Pequeño', 'Mediano', 'Grande', 'Palet'].map((size) => (
                  <button
                    key={size}
                    disabled={updating}
                    onClick={() => updateSlotSize(size)}
                    className={`py-4 rounded-2xl font-black transition-all border-2 text-sm flex justify-between px-6 items-center ${
                      selectedSlot.size === size 
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' 
                      : 'bg-slate-50 text-slate-600 border-slate-100 hover:border-indigo-200 shadow-sm'
                    }`}
                  >
                    <span>{size.toUpperCase()}</span>
                    {selectedSlot.size === size && <span>✓</span>}
                  </button>
                ))}
              </div>

              <button 
                onClick={() => { setSelectedSlot(null); setSearchQuery(''); }}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all"
              >
                Cerrar Ficha
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BUSCADOR Y ESCÁNER */}
      <div className="relative group">
        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
          🔍
        </div>
        <input 
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="BUSCAR O ESCANEAR HUECO..."
          className="w-full bg-white border-2 border-slate-100 rounded-[2rem] py-5 px-14 font-black text-slate-700 placeholder:text-slate-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none shadow-xl shadow-slate-200/50 transition-all uppercase tracking-widest text-sm"
        />
        <button 
          onClick={() => setIsScannerOpen(true)}
          className="absolute right-4 top-1/2 -translate-y-1/2 bg-indigo-600 text-white w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200 active:scale-90 transition-all"
        >
          📷
        </button>
      </div>

      {/* FILTROS */}
      <div className="overflow-x-auto pb-2 -mx-4 px-4 no-scrollbar">
        <div className="flex gap-2">
          {['all', 'new', 'occupied', 'empty'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase transition-all whitespace-nowrap shadow-sm border ${
                filter === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-100'
              }`}
            >
              {f === 'all' ? 'Ver Todo' : f === 'new' ? 'Nuevos' : f === 'occupied' ? 'Ocupados' : 'Libres'}
            </button>
          ))}
        </div>
      </div>

      {/* GRID DE HUECOS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {filteredSlots.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white rounded-[2.5rem] border-2 border-dashed border-slate-100 text-slate-400 font-bold italic animate-fade-in">
            No se encontraron huecos
          </div>
        ) : (
          filteredSlots.map((slot) => (
            <button 
              key={slot.id} 
              onClick={() => setSelectedSlot(slot)}
              className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group text-left active:scale-95 transition-all hover:border-indigo-400 hover:shadow-xl"
            >
              {!slot.is_scanned_once && (
                <div className="absolute top-0 right-0 bg-rose-500 text-white text-[7px] font-black px-2 py-1 rounded-bl-xl uppercase tracking-tighter">NUEVO</div>
              )}
              
              <div className="flex justify-between items-start mb-3">
                <span className="text-xs font-black text-slate-800 tracking-tight">{slot.code}</span>
                <span className={`text-[7px] font-black uppercase px-2 py-1 rounded-lg ${
                  slot.size === 'Grande' ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'
                }`}>
                  {slot.size}
                </span>
              </div>
              
              <div className="mb-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">Carga</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-50 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-1000 ${
                        slot.quantity === 100 ? 'bg-indigo-600' : 
                        slot.quantity === 50 ? 'bg-amber-400' : 
                        'bg-emerald-400'
                      }`} 
                      style={{ width: `${slot.quantity || 0}%` }} 
                    />
                  </div>
                  <span className="text-[9px] font-black text-slate-800">{slot.quantity}%</span>
                </div>
              </div>

              <div className="text-[8px] font-black text-slate-400 uppercase flex items-center gap-1">
                {slot.status === 'occupied' ? '📦 ' + (slot.item_name || 'OCUPADO') : '⚪ VACÍO'}
              </div>
            </button>
          ))
        )}
      </div>

      <ScannerModal 
        isOpen={isScannerOpen} 
        onClose={() => setIsScannerOpen(false)} 
        onScan={handleScanResult} 
        title="Buscar por código" 
      />
    </div>
  );
};

export default SlotGrid;
