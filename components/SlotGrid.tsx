
import React, { useState, useEffect } from 'react';
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
    const channel = supabase.channel('grid-updates-v3').on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_slots' }, () => {
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
        .update({ size: newSize, is_scanned_once: true })
        .eq('id', selectedSlot.id);
      
      if (error) throw error;
      
      setSlots(slots.map(s => s.id === selectedSlot.id ? { ...s, size: newSize, is_scanned_once: true } : s));
      setSelectedSlot(null);
      setSearchQuery('');
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setUpdating(false);
    }
  };

  const deleteSlot = async () => {
    if (!selectedSlot) return;
    if (!confirm(`¿Estás seguro de ELIMINAR el hueco ${selectedSlot.code}?`)) return;

    setUpdating(true);
    try {
      const { error } = await supabase.from('warehouse_slots').delete().eq('id', selectedSlot.id);
      if (error) throw error;
      setSlots(slots.filter(s => s.id !== selectedSlot.id));
      setSelectedSlot(null);
      setSearchQuery('');
    } catch (err: any) {
      alert("Error al eliminar: " + err.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleSearch = (val: string) => {
    const code = val.toUpperCase().trim();
    setSearchQuery(code);
    const match = slots.find(s => s.code === code);
    if (match) setSelectedSlot(match);
  };

  const filteredSlots = slots.filter(s => {
    const matchesSearch = s.code.includes(searchQuery);
    if (!matchesSearch) return false;
    if (filter === 'all') return true;
    if (filter === 'new') return !s.is_scanned_once;
    return s.status === filter;
  });

  const getStats = (sizeName: string) => {
    const subset = slots.filter(s => s.size === sizeName);
    return {
      total: subset.length,
      freeAndScanned: subset.filter(s => s.is_scanned_once && s.status === 'empty').length,
      pending: subset.filter(s => !s.is_scanned_once).length
    };
  };

  const sizes = [
    { name: 'Grande', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
    { name: 'Mediano', color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
    { name: 'Pequeño', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' }
  ];

  if (loading) return <div className="p-20 text-center font-black text-slate-300 animate-pulse text-sm uppercase tracking-widest">Sincronizando Almacén...</div>;

  return (
    <div className="space-y-6">
      {/* TARJETAS DE ESTADÍSTICAS */}
      <div className="grid grid-cols-3 gap-3">
        {sizes.map(size => {
          const { total, freeAndScanned, pending } = getStats(size.name);
          return (
            <div key={size.name} className={`${size.bg} ${size.border} border-2 rounded-[2rem] p-4 shadow-sm flex flex-col items-center justify-center text-center`}>
              <span className={`text-[8px] font-black uppercase tracking-widest ${size.color} mb-1`}>{size.name}</span>
              <div className="text-xl font-black text-slate-800 leading-none">{total}</div>
              
              <div className="w-full grid grid-cols-1 gap-1 mt-3 pt-2 border-t border-white/60">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[7px] font-black text-slate-400 uppercase">LIBRES:</span>
                  <span className={`text-[10px] font-black ${size.color}`}>{freeAndScanned}</span>
                </div>
                <div className="flex justify-between items-center px-1">
                  <span className="text-[7px] font-black text-slate-400 uppercase">FALTAN:</span>
                  <span className="text-[10px] font-black text-rose-500">{pending}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* BUSCADOR */}
      <div className="relative group">
        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors">🔍</div>
        <input 
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="BUSCAR O ESCANEAR..."
          className="w-full bg-white border-2 border-slate-100 rounded-[2rem] py-5 px-14 font-black text-slate-700 focus:border-indigo-500 outline-none shadow-xl shadow-slate-200/50 transition-all uppercase tracking-widest text-sm"
        />
        <button onClick={() => setIsScannerOpen(true)} className="absolute right-4 top-1/2 -translate-y-1/2 bg-indigo-600 text-white w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all">📷</button>
      </div>

      {/* FILTROS */}
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {['all', 'new', 'occupied', 'empty'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase transition-all whitespace-nowrap shadow-sm border ${
              filter === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-100'
            }`}
          >
            {f === 'all' ? 'Todos' : f === 'new' ? 'Faltan' : f === 'occupied' ? 'Ocupados' : 'Vacíos'}
          </button>
        ))}
      </div>

      {/* GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {filteredSlots.map((slot) => (
          <button 
            key={slot.id} 
            onClick={() => setSelectedSlot(slot)}
            className={`p-4 rounded-[2rem] border relative overflow-hidden text-left active:scale-95 transition-all hover:shadow-xl ${
              slot.is_scanned_once ? 'bg-white border-slate-100' : 'bg-slate-50 border-dashed border-slate-300'
            }`}
          >
            {!slot.is_scanned_once && (
              <div className="absolute top-0 right-0 bg-rose-500 text-white text-[7px] font-black px-2 py-1 rounded-bl-xl uppercase tracking-tighter">FALTA</div>
            )}
            <div className="flex justify-between items-start mb-3">
              <span className="text-xs font-black text-slate-800 tracking-tight">{slot.code}</span>
              <span className={`text-[7px] font-black uppercase px-2 py-1 rounded-lg ${
                slot.size === 'Grande' ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'
              }`}>{slot.size}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-slate-50 rounded-full overflow-hidden">
                <div className={`h-full ${slot.status === 'empty' ? 'bg-slate-200' : 'bg-indigo-600'}`} style={{ width: `${slot.quantity || 0}%` }} />
              </div>
              <span className="text-[9px] font-black text-slate-800">{slot.quantity}%</span>
            </div>
          </button>
        ))}
      </div>

      {/* MODAL EDICIÓN */}
      {selectedSlot && (
        <div className="fixed inset-0 z-[150] bg-slate-900/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl animate-fade-in border border-slate-100 max-h-[90vh] overflow-y-auto text-center space-y-6">
            <div className="inline-block p-4 bg-indigo-50 rounded-3xl mb-2">
              <span className="text-3xl">🏗️</span>
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-800 tracking-tight">{selectedSlot.code}</h3>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">Gestión de Ubicación</p>
              {!selectedSlot.is_scanned_once && (
                <span className="bg-rose-100 text-rose-600 text-[8px] font-black px-3 py-1 rounded-full uppercase mt-2 inline-block">Falta Escaneo Inicial</span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 text-left">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-1">Definir Tamaño:</p>
              {['Pequeño', 'Mediano', 'Grande', 'Palet'].map((size) => (
                <button
                  key={size}
                  disabled={updating}
                  onClick={() => updateSlotSize(size)}
                  className={`py-3.5 rounded-2xl font-black transition-all border-2 text-xs flex justify-between px-6 items-center ${
                    selectedSlot.size === size 
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                    : 'bg-slate-50 text-slate-600 border-slate-100 hover:border-indigo-200'
                  }`}
                >
                  <span>{size.toUpperCase()}</span>
                  {selectedSlot.size === size && <span>✓</span>}
                </button>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-3">
              <button onClick={deleteSlot} className="w-full py-4 bg-rose-50 text-rose-600 rounded-2xl font-black text-xs uppercase hover:bg-rose-100 transition-all">🗑️ Eliminar</button>
              <button onClick={() => { setSelectedSlot(null); setSearchQuery(''); }} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      <ScannerModal isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScan={handleSearch} title="Buscar Ubicación" />
    </div>
  );
};

export default SlotGrid;
