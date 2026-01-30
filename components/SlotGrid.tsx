
import React, { useState, useEffect } from 'react';
import { UserRole, WarehouseSlot } from '../types';
import { supabase } from '../supabaseClient';
import ScannerModal from './ScannerModal';

interface SlotGridProps {
  userRole: UserRole;
}

const SlotGrid: React.FC<SlotGridProps> = ({ userRole }) => {
  const [slots, setSlots] = useState<WarehouseSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<WarehouseSlot | null>(null);
  const [updating, setUpdating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const [globalStats, setGlobalStats] = useState({
    totalAbsolute: 0,
    occupancyPercent: 0,
    pendingInitialScan: 0,
    sizeStats: {
      Grande: { percent: 0, count: 0 },
      Mediano: { percent: 0, count: 0 },
      Pequeño: { percent: 0, count: 0 }
    }
  });

  const [occupancyFilter, setOccupancyFilter] = useState<'all' | 'empty' | 'occupied' | 'pending'>('all');

  useEffect(() => {
    fetchSlots();
    const channel = supabase.channel('grid-updates-v11').on('postgres_changes', { event: '*', schema: 'public', table: 'warehouse_slots' }, () => {
      fetchSlots();
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchSlots = async () => {
    try {
      let allSlots: WarehouseSlot[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase.from('warehouse_slots').select('*').order('code').range(from, from + step - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allSlots = [...allSlots, ...data as WarehouseSlot[]];
          if (data.length < step) hasMore = false;
          from += step;
        } else { hasMore = false; }
      }
      setSlots(allSlots);
      const active = allSlots.filter(s => s.is_scanned_once);
      
      // Cálculo de ocupación por tamaño (basado en posiciones ocupadas para consistencia)
      const calculateSizeOccupancy = (size: string) => {
        const sizeSlots = allSlots.filter(s => s.size === size);
        if (sizeSlots.length === 0) return { percent: 0, count: 0 };
        const occupiedCount = sizeSlots.filter(s => (s.quantity || 0) > 0).length;
        const percent = Math.round((occupiedCount / sizeSlots.length) * 100);
        return { percent, count: sizeSlots.length };
      };

      setGlobalStats({
        totalAbsolute: allSlots.length,
        // Sincronizado con Sectores: (Huecos con algo / Huecos Totales)
        occupancyPercent: allSlots.length > 0 ? Math.round((allSlots.filter(s => (s.quantity || 0) > 0).length / allSlots.length) * 100) : 0,
        pendingInitialScan: allSlots.filter(s => !s.is_scanned_once).length,
        sizeStats: {
          Grande: calculateSizeOccupancy('Grande'),
          Mediano: calculateSizeOccupancy('Mediano'),
          Pequeño: calculateSizeOccupancy('Pequeño')
        }
      });
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const updateSlotSize = async (newSize: string) => {
    if (!selectedSlot) return;
    setUpdating(true);
    try {
      const { error } = await supabase.from('warehouse_slots').update({ size: newSize, is_scanned_once: true }).eq('id', selectedSlot.id);
      if (error) throw error;
      setSelectedSlot(null);
    } catch (err: any) { alert(err.message); } finally { setUpdating(false); }
  };

  const filteredSlots = slots.filter(s => {
    const matchesSearch = s.code.includes(searchQuery.toUpperCase().trim());
    if (!matchesSearch) return false;
    if (occupancyFilter === 'empty') return s.is_scanned_once && s.quantity === 0;
    if (occupancyFilter === 'occupied') return s.quantity && s.quantity > 0;
    if (occupancyFilter === 'pending') return !s.is_scanned_once;
    return true;
  });

  const getProgressColor = (q: number = 0) => {
    if (q === 0) return 'bg-emerald-500';
    if (q === 50) return 'bg-amber-400';
    return 'bg-rose-500';
  };

  if (loading) return <div className="p-20 text-center font-medium text-slate-300 animate-pulse text-[11px] uppercase tracking-widest">Cargando inventario...</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col justify-center relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 text-slate-50 text-8xl font-bold opacity-30">🏢</div>
          <p className="text-[10px] font-semibold uppercase text-slate-400 tracking-[0.2em] mb-2 z-10">Total Huecos</p>
          <h3 className="text-4xl font-semibold text-slate-900 tracking-tight z-10">{globalStats.totalAbsolute}</h3>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col justify-center relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 text-indigo-50 text-8xl font-bold opacity-30">%</div>
          <p className="text-[10px] font-semibold uppercase text-slate-400 tracking-[0.2em] mb-2 z-10">Ocupación Almacén</p>
          <h3 className="text-4xl font-semibold text-indigo-600 tracking-tight z-10">{globalStats.occupancyPercent}%</h3>
        </div>
      </div>

      <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4 ml-2">Ocupación por tamaño (Huecos Totales)</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 p-4 rounded-2xl text-center border border-slate-100 flex flex-col justify-center">
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">Grande</p>
            <p className="text-xl font-black text-indigo-600 leading-none">{globalStats.sizeStats.Grande.percent}%</p>
            <p className="text-[7px] font-bold text-slate-400 uppercase mt-2 tracking-tighter">de {globalStats.sizeStats.Grande.count} huecos</p>
          </div>
          <div className="bg-slate-50 p-4 rounded-2xl text-center border border-slate-100 flex flex-col justify-center">
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">Mediano</p>
            <p className="text-xl font-black text-indigo-600 leading-none">{globalStats.sizeStats.Mediano.percent}%</p>
            <p className="text-[7px] font-bold text-slate-400 uppercase mt-2 tracking-tighter">de {globalStats.sizeStats.Mediano.count} huecos</p>
          </div>
          <div className="bg-slate-50 p-4 rounded-2xl text-center border border-slate-100 flex flex-col justify-center">
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">Pequeño</p>
            <p className="text-xl font-black text-indigo-600 leading-none">{globalStats.sizeStats.Pequeño.percent}%</p>
            <p className="text-[7px] font-bold text-slate-400 uppercase mt-2 tracking-tighter">de {globalStats.sizeStats.Pequeño.count} huecos</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {['all', 'empty', 'occupied', 'pending'].map((id) => (
            <button key={id} onClick={() => setOccupancyFilter(id as any)} className={`px-4 py-2 rounded-xl text-[10px] font-semibold uppercase border transition-all ${occupancyFilter === id ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-400 border-slate-100'}`}>
              {id === 'all' ? 'Todos' : id === 'empty' ? 'Vacíos' : id === 'occupied' ? 'Ocupados' : 'Pendientes'}
            </button>
          ))}
        </div>
        <div className="relative">
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="FILTRAR POR CÓDIGO..." className="w-full bg-white border border-slate-200 rounded-[2rem] py-5 px-8 font-medium text-slate-700 focus:border-indigo-400 outline-none shadow-sm transition-all uppercase text-sm" />
          <button onClick={() => setIsScannerOpen(true)} className="absolute right-4 top-1/2 -translate-y-1/2 bg-indigo-600 text-white w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all">📷</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {filteredSlots.slice(0, 1000).map((slot) => (
          <button key={slot.id} onClick={() => setSelectedSlot(slot)} className={`p-5 rounded-[2rem] border relative overflow-hidden text-left active:scale-95 transition-all hover:shadow-lg ${slot.is_scanned_once ? 'bg-white border-slate-100' : 'bg-slate-50 border-dashed border-slate-300'}`}>
            <div className="flex justify-between items-center mb-4"><span className="text-[11px] font-semibold text-slate-800 tracking-tight uppercase">{slot.code}</span></div>
            <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
               <div className={`h-full transition-all duration-700 ${getProgressColor(slot.quantity)}`} style={{ width: `${slot.quantity || 0}%` }} />
            </div>
            <div className="mt-3 flex justify-between items-center"><span className="text-[8px] font-medium text-slate-400 uppercase">{slot.size}</span><span className={`text-[9px] font-semibold ${slot.quantity === 100 ? 'text-rose-500' : slot.quantity === 50 ? 'text-amber-500' : 'text-emerald-500'}`}>{slot.quantity || 0}%</span></div>
          </button>
        ))}
      </div>

      {selectedSlot && (
        <div className="fixed inset-0 z-[150] bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-10 shadow-2xl text-center space-y-8 animate-fade-in">
            <h3 className="text-xl font-semibold text-slate-900 tracking-tight">{selectedSlot.code}</h3>
            <div className="grid grid-cols-1 gap-2">
              {['Pequeño', 'Mediano', 'Grande'].map((size) => (
                <button key={size} onClick={() => updateSlotSize(size)} className={`py-4 rounded-xl font-medium transition-all border text-[11px] uppercase tracking-widest ${selectedSlot.size === size ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>{size}</button>
              ))}
            </div>
            <button onClick={() => setSelectedSlot(null)} className="w-full py-4 text-slate-400 font-semibold text-[10px] uppercase tracking-widest hover:text-slate-800">Cerrar</button>
          </div>
        </div>
      )}

      <ScannerModal isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScan={(res) => setSearchQuery(res)} title="Buscar Ubicación" />
    </div>
  );
};

export default SlotGrid;
