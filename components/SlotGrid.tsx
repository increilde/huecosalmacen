
import React, { useState, useEffect } from 'react';
import { UserRole, WarehouseSlot } from '../types';
import { supabase } from '../supabaseClient';

interface SlotGridProps {
  userRole: UserRole;
}

const SlotGrid: React.FC<SlotGridProps> = ({ userRole }) => {
  const [slots, setSlots] = useState<WarehouseSlot[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

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

  const filteredSlots = slots.filter(s => {
    if (filter === 'all') return true;
    if (filter === 'new') return !s.is_scanned_once;
    return s.status === filter;
  });

  if (loading) return <div className="p-20 text-center font-black text-slate-300 animate-pulse">CARGANDO ALMACÉN...</div>;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto pb-4 -mx-4 px-4 no-scrollbar">
        <div className="flex gap-2">
          {['all', 'new', 'occupied', 'empty'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase transition-all whitespace-nowrap shadow-sm border ${
                filter === f ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white text-slate-500 border-slate-100'
              }`}
            >
              {f === 'all' ? 'Ver Todo' : f === 'new' ? 'Nuevos/Sin Leer' : f === 'occupied' ? 'Ocupados' : 'Libres'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {filteredSlots.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-slate-200 text-slate-400 font-bold italic">No hay huecos en esta categoría</div>
        ) : (
          filteredSlots.map((slot) => (
            <div key={slot.id} className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group">
              {!slot.is_scanned_once && (
                <div className="absolute top-0 right-0 bg-amber-400 text-white text-[7px] font-black px-2 py-0.5 rounded-bl-lg uppercase">NUEVO</div>
              )}
              <div className="flex justify-between items-start mb-2">
                <span className="text-[11px] font-black text-slate-800">{slot.code}</span>
                <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-400`}>{slot.size}</span>
              </div>
              <p className="text-[9px] font-bold text-slate-500 truncate mb-2">
                {slot.status === 'occupied' ? (slot.item_name || '📦 Ocupado') : '⚪ Libre'}
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-50 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-700 ${slot.quantity === 100 ? 'bg-indigo-600' : slot.quantity === 50 ? 'bg-amber-400' : 'bg-slate-200'}`} style={{ width: `${slot.quantity || 0}%` }} />
                </div>
                <span className="text-[8px] font-black text-slate-400">{slot.quantity}%</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SlotGrid;
