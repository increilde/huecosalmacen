
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
    // Suscripción en tiempo real
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_slots' }, () => {
        fetchSlots();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchSlots = async () => {
    const { data } = await supabase.from('warehouse_slots').select('*').order('code');
    if (data) setSlots(data);
    setLoading(false);
  };

  const filteredSlots = slots.filter(s => filter === 'all' || s.status === filter);

  if (loading) return <div className="p-8 text-center text-slate-400">Cargando mapa...</div>;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto pb-2 -mx-4 px-4 no-scrollbar">
        <div className="flex gap-2 min-w-max">
          {['all', 'occupied', 'empty', 'reserved'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase transition-all whitespace-nowrap ${
                filter === f 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                : 'bg-white text-slate-500 border border-slate-100'
              }`}
            >
              {f === 'all' ? 'Todos' : f === 'occupied' ? 'Ocupados' : f === 'empty' ? 'Libres' : 'Reservados'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 xs:grid-cols-3 gap-3">
        {filteredSlots.length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-slate-200">
            <p className="text-slate-400 text-sm italic">Sin huecos registrados</p>
          </div>
        ) : (
          filteredSlots.map((slot) => (
            <div 
              key={slot.id}
              className={`p-3 rounded-2xl border transition-all active:scale-95 ${
                slot.status === 'empty' 
                ? 'border-emerald-100 bg-white' 
                : 'border-slate-100 bg-white'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded-lg">{slot.code}</span>
                <span className={`w-2 h-2 rounded-full ${
                  slot.status === 'empty' ? 'bg-emerald-400' : 'bg-indigo-500'
                }`}></span>
              </div>
              <div className="text-[11px] font-medium text-slate-600 truncate mb-1">
                {slot.status === 'occupied' ? (slot.item_name || 'Cargado') : 'HUECO LIBRE'}
              </div>
              <div className="flex items-end justify-between">
                <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden mr-2">
                  <div 
                    className={`h-full transition-all duration-1000 ${slot.quantity! > 50 ? 'bg-indigo-600' : 'bg-amber-400'}`} 
                    style={{ width: `${slot.quantity || 0}%` }}
                  ></div>
                </div>
                <span className="text-[9px] font-bold text-slate-400">{slot.quantity}%</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SlotGrid;
