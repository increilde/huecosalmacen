
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { WarehouseSlot, UserProfile, Trucker, UserRole } from '../types';
import UserManagement from './UserManagement';

interface MovementLog {
  id: string;
  operator_name: string;
  operator_email?: string;
  cart_id: string;
  slot_code: string;
  new_status: string;
  new_quantity: number;
  old_quantity?: number;
  created_at: string;
}

type AdminTab = 'movements' | 'operators' | 'truckers' | 'sectors' | 'reports';

const AdminPanel: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<AdminTab>('movements');
  const [loading, setLoading] = useState(true);
  
  const todayLocal = new Date().toLocaleDateString('en-CA');
  // Para que el rendimiento sea acumulado por defecto, podemos poner una fecha de inicio más temprana
  const [dateFrom, setDateFrom] = useState('2024-01-01'); 
  const [dateTo, setDateTo] = useState(todayLocal);
  const [selectedOperator, setSelectedOperator] = useState<string | null>(null);
  const [cartSearch, setCartSearch] = useState('');

  const [allLogs, setAllLogs] = useState<MovementLog[]>([]);
  const [truckers, setTruckers] = useState<Trucker[]>([]);
  const [showTruckerModal, setShowTruckerModal] = useState(false);
  const [truckerForm, setTruckerForm] = useState({ label: '' });

  const [stats, setStats] = useState({
    total: 0,
    occupied: 0,
    empty: 0,
    pending: 0
  });

  const [warehouseBreakdown, setWarehouseBreakdown] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, [dateFrom, dateTo, activeSubTab]);

  const fetchData = async () => {
    setLoading(true);
    if (activeSubTab === 'movements' || activeSubTab === 'reports') {
      const { data: logs } = await supabase
        .from('movement_logs')
        .select('*')
        .gte('created_at', `${dateFrom}T00:00:00`)
        .lte('created_at', `${dateTo}T23:59:59`)
        .order('created_at', { ascending: false });
      setAllLogs(logs || []);

      if (activeSubTab === 'reports') {
        // Cargar TODOS los huecos mediante paginación para el informe
        let allSlots: WarehouseSlot[] = [];
        let from = 0;
        const step = 1000;
        let hasMore = true;
        
        while (hasMore) {
          const { data, error } = await supabase
            .from('warehouse_slots')
            .select('*')
            .range(from, from + step - 1);
          
          if (error) { hasMore = false; break; }
          if (data && data.length > 0) {
            allSlots = [...allSlots, ...data as WarehouseSlot[]];
            if (data.length < step) hasMore = false;
            from += step;
          } else { hasMore = false; }
        }

        if (allSlots.length > 0) {
          const breakdown = processWarehouseReport(allSlots);
          setWarehouseBreakdown(breakdown);
        }
      }
    } else if (activeSubTab === 'truckers') {
      const { data } = await supabase.from('truckers').select('*').order('full_name');
      setTruckers(data?.map((t: any) => ({ id: t.id, label: t.full_name, created_at: t.created_at })) || []);
    } else if (activeSubTab === 'sectors') {
      // Implementación de carga paginada para obtener el TOTAL REAL de huecos
      let allSectorSlots: any[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('warehouse_slots')
          .select('is_scanned_once, quantity')
          .range(from, from + step - 1);
        
        if (error || !data || data.length === 0) {
          hasMore = false;
        } else {
          allSectorSlots = [...allSectorSlots, ...data];
          if (data.length < step) hasMore = false;
          from += step;
        }
      }

      if (allSectorSlots.length > 0) {
        setStats({
          total: allSectorSlots.length,
          occupied: allSectorSlots.filter(s => s.quantity && s.quantity > 0).length,
          empty: allSectorSlots.filter(s => s.is_scanned_once && s.quantity === 0).length,
          pending: allSectorSlots.filter(s => !s.is_scanned_once).length
        });
      }
    }
    setLoading(false);
  };

  const processWarehouseReport = (slots: WarehouseSlot[]) => {
    const plants = ['U01', 'U02'];
    const sizes = ['Grande', 'Mediano', 'Pequeño'];
    
    return plants.map(plant => {
      const plantSlots = slots.filter(s => s.code.startsWith(plant));
      const sizeBreakdown = sizes.map(size => {
        const sSlots = plantSlots.filter(s => s.size === size);
        const total = sSlots.length;
        const full = sSlots.filter(s => s.quantity === 100).length;
        const half = sSlots.filter(s => s.quantity === 50).length;
        const empty = sSlots.filter(s => s.is_scanned_once && s.quantity === 0).length;
        
        const occupancy = total > 0 
          ? Math.round((sSlots.filter(s => (s.quantity || 0) > 0).length / total) * 100)
          : 0;

        return { size, total, full, half, empty, occupancy };
      });

      const totalPlant = plantSlots.length;
      const avgOccupancy = totalPlant > 0 
        ? Math.round((plantSlots.filter(s => (s.quantity || 0) > 0).length / totalPlant) * 100)
        : 0;

      return { plant, sizeBreakdown, avgOccupancy, totalScanned: plantSlots.filter(s => s.is_scanned_once).length, totalSlots: totalPlant };
    });
  };

  const getOperatorStats = () => {
    const map = new Map<string, { name: string, count: number, logs: MovementLog[] }>();
    allLogs.forEach(log => {
      const key = log.operator_email || log.operator_name;
      if (!map.has(key)) map.set(key, { name: log.operator_name, count: 0, logs: [] });
      const entry = map.get(key)!;
      entry.count++;
      entry.logs.push(log);
    });
    return Array.from(map.entries());
  };

  const calculateAvgTime = (logs: MovementLog[]) => {
    if (logs.length < 2) return '--';
    const sorted = [...logs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    let totalDiff = 0;
    for (let i = 1; i < sorted.length; i++) {
      totalDiff += new Date(sorted[i].created_at).getTime() - new Date(sorted[i-1].created_at).getTime();
    }
    const avgMs = totalDiff / (sorted.length - 1);
    const mins = Math.floor(avgMs / 60000);
    const secs = Math.floor((avgMs % 60000) / 1000);
    return `${mins}m ${secs}s`;
  };

  const filteredLogs = allLogs.filter(l => {
    const matchesOperator = selectedOperator ? (l.operator_email || l.operator_name) === selectedOperator : true;
    const matchesCart = cartSearch ? l.cart_id.toUpperCase().includes(cartSearch.toUpperCase()) : true;
    return matchesOperator && matchesCart;
  });

  const handleCreateTrucker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!truckerForm.label) return;
    const { error } = await supabase.from('truckers').insert([{ full_name: truckerForm.label.toUpperCase().trim() }]);
    if (!error) { setTruckerForm({ label: '' }); setShowTruckerModal(false); fetchData(); }
  };

  const deleteTrucker = async (id: string) => {
    if (confirm("¿Eliminar camión?")) {
      await supabase.from('truckers').delete().eq('id', id);
      fetchData();
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      <div className="flex justify-center">
        <nav className="bg-slate-950 p-2 rounded-[2.5rem] shadow-2xl flex items-center gap-1 md:gap-2 border border-slate-800 overflow-x-auto no-scrollbar max-w-full">
          {[
            { id: 'movements', label: 'HISTORIAL', icon: '📋' },
            { id: 'operators', label: 'OPERARIOS', icon: '👥' },
            { id: 'sectors', label: 'SECTORES', icon: '📊' },
            { id: 'truckers', label: 'CAMIONES', icon: '🚛' },
            { id: 'reports', label: 'INFORME', icon: '📈' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as AdminTab)}
              className={`px-4 md:px-8 py-4 rounded-[2rem] flex flex-col items-center gap-1.5 transition-all min-w-[90px] md:min-w-[120px] ${
                activeSubTab === tab.id 
                ? 'bg-white text-slate-900 shadow-xl' 
                : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <span className="text-sm md:text-base">{tab.icon}</span>
              <span className="text-[7px] md:text-[9px] font-black uppercase tracking-[0.2em]">{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="bg-white p-4 md:p-10 rounded-[3rem] border border-slate-100 shadow-sm min-h-[500px]">
        {activeSubTab === 'movements' && (
          <div className="space-y-8">
            <div className="flex flex-col lg:flex-row gap-4 items-end justify-between">
               <div className="w-full flex flex-col md:flex-row gap-4 flex-wrap">
                 <div className="space-y-2">
                   <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Rango Histórico</label>
                   <div className="flex gap-2">
                      <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none flex-1 border border-slate-100" />
                      <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none flex-1 border border-slate-100" />
                   </div>
                 </div>
                 <div className="space-y-2 min-w-[180px]">
                   <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Operario</label>
                   <select 
                    value={selectedOperator || ''} 
                    onChange={e => setSelectedOperator(e.target.value || null)}
                    className="w-full bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none border border-slate-100 uppercase"
                   >
                     <option value="">TODOS LOS EMPLEADOS</option>
                     {getOperatorStats().map(([key, op]) => (
                       <option key={key} value={key}>{op.name}</option>
                     ))}
                   </select>
                 </div>
                 <div className="space-y-2 flex-1 min-w-[180px]">
                   <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Buscar Carro</label>
                   <input 
                    type="text" 
                    placeholder="ID CARRO..." 
                    value={cartSearch} 
                    onChange={e => setCartSearch(e.target.value.toUpperCase())}
                    className="w-full bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none border border-slate-100 uppercase"
                   />
                 </div>
               </div>
               {(selectedOperator || cartSearch) && (
                 <button onClick={() => { setSelectedOperator(null); setCartSearch(''); }} className="text-[10px] font-black text-rose-500 uppercase tracking-widest bg-rose-50 px-4 py-2 rounded-xl border border-rose-100 mb-1 whitespace-nowrap">Limpiar Filtros ✕</button>
               )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {getOperatorStats().map(([key, op]) => (
                <button 
                  key={key} 
                  onClick={() => setSelectedOperator(key)}
                  className={`p-5 rounded-[2rem] border-2 transition-all text-left flex flex-col justify-between h-28 ${selectedOperator === key ? 'bg-indigo-600 border-indigo-600 shadow-lg shadow-indigo-100 text-white' : 'bg-slate-50 border-slate-50 hover:border-indigo-200'}`}
                >
                  <div className="flex justify-between items-start">
                    <span className="text-xl">👷</span>
                    <span className={`text-[12px] font-black ${selectedOperator === key ? 'text-indigo-100' : 'text-indigo-500'}`}>{op.count}</span>
                  </div>
                  <p className={`text-[10px] font-black uppercase tracking-tight leading-tight line-clamp-2 ${selectedOperator === key ? 'text-white' : 'text-slate-800'}`}>{op.name}</p>
                </button>
              ))}
            </div>

            <div className="overflow-x-auto rounded-[2rem] border border-slate-50 shadow-inner">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-900 text-white font-black uppercase tracking-widest text-[8px]">
                  <tr>
                    <th className="px-6 py-5">TRABAJADOR</th>
                    <th className="px-6 py-5">CARRO</th>
                    <th className="px-6 py-5">HUECO</th>
                    <th className="px-6 py-5">ESTADO</th>
                    <th className="px-6 py-5 text-right">HORA</th>
                    <th className="px-6 py-5 text-right">FECHA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredLogs.length === 0 ? (
                    <tr><td colSpan={6} className="py-20 text-center text-slate-300 font-black uppercase text-[10px] tracking-widest">No hay movimientos que coincidan</td></tr>
                  ) : filteredLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-800 uppercase">{log.operator_name}</td>
                      <td className="px-6 py-4 font-black text-indigo-600">{log.cart_id}</td>
                      <td className="px-6 py-4 font-black text-slate-900">{log.slot_code}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-lg font-black ${log.new_quantity === 100 ? 'bg-rose-50 text-rose-600' : log.new_quantity === 50 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          {log.new_quantity}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-400 font-bold text-right">{new Date(log.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</td>
                      <td className="px-6 py-4 text-slate-400 font-bold text-right">{new Date(log.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeSubTab === 'operators' && <UserManagement />}

        {activeSubTab === 'truckers' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">Transportistas Habituales</h3>
               <button onClick={() => setShowTruckerModal(true)} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-100">Nuevo Camión</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
               {truckers.map(t => (
                 <div key={t.id} className="p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex items-center justify-between group">
                    <div>
                      <p className="font-black text-slate-800 uppercase text-sm">{t.label}</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">Registrado</p>
                    </div>
                    <button onClick={() => deleteTrucker(t.id)} className="w-10 h-10 rounded-xl bg-rose-100 text-rose-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">🗑️</button>
                 </div>
               ))}
            </div>
          </div>
        )}

        {activeSubTab === 'sectors' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Estado Global Inventario</h4>
                <div className="space-y-4">
                   <div className="flex justify-between items-end">
                      <span className="text-2xl font-black text-slate-800">{stats.total}</span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Huecos Totales</span>
                   </div>
                   <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-600 transition-all" style={{width: `${(stats.occupied / stats.total) * 100}%`}}></div>
                   </div>
                   <div className="grid grid-cols-3 gap-2">
                      <div className="p-4 bg-white rounded-2xl text-center shadow-sm">
                        <p className="text-lg font-black text-emerald-500">{stats.empty}</p>
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-1">Vacíos</p>
                      </div>
                      <div className="p-4 bg-white rounded-2xl text-center shadow-sm">
                        <p className="text-lg font-black text-rose-500">{stats.occupied}</p>
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-1">Ocupados</p>
                      </div>
                      <div className="p-4 bg-white rounded-2xl text-center shadow-sm">
                        <p className="text-lg font-black text-amber-500">{stats.pending}</p>
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-1">S/Lectura</p>
                      </div>
                   </div>
                </div>
             </div>
             <div className="bg-indigo-900 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col justify-center text-white">
                <div className="absolute -right-10 -bottom-10 text-white/10 text-[10rem] font-black pointer-events-none">OK</div>
                <h4 className="text-[10px] font-black text-indigo-300 uppercase tracking-[0.3em] mb-4">Métrica de Ocupación</h4>
                <p className="text-5xl font-black">{stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0}%</p>
                <p className="text-[10px] font-bold uppercase tracking-widest mt-4 opacity-60">Saturación del Almacén</p>
             </div>
          </div>
        )}

        {activeSubTab === 'reports' && (
          <div className="space-y-12 animate-fade-in">
             <div className="flex flex-col md:flex-row gap-4 items-end mb-8">
               <div className="flex-1 space-y-2">
                 <label className="text-sm font-semibold text-slate-500 uppercase tracking-widest ml-2">Periodo Informe Operarios (Acumulado)</label>
                 <div className="flex gap-2">
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-slate-50 p-4 rounded-2xl text-base font-medium outline-none flex-1 border border-slate-100" />
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-slate-50 p-4 rounded-2xl text-base font-medium outline-none flex-1 border border-slate-100" />
                 </div>
               </div>
            </div>

            <section className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-800 uppercase tracking-tight ml-2">Desglose Ocupación por Planta y Tamaño</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 {warehouseBreakdown.map((plantData: any) => (
                   <div key={plantData.plant} className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 space-y-6">
                      <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                        <div>
                          <h4 className="text-3xl font-bold text-indigo-600 leading-none">{plantData.plant}</h4>
                          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.2em] mt-2">PLANTA DE ALMACENAMIENTO</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-semibold text-slate-800">{plantData.avgOccupancy}%</p>
                          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-1">Media Ocupación</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {plantData.sizeBreakdown.map((sizeData: any) => (
                          <div key={sizeData.size} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                             <div className="flex justify-between items-center mb-4">
                                <span className="text-sm font-semibold text-slate-800 uppercase">{sizeData.size}</span>
                                <span className="text-base font-bold text-indigo-500">{sizeData.occupancy}%</span>
                             </div>
                             <div className="grid grid-cols-4 gap-2 text-center">
                               <div className="flex flex-col">
                                 <span className="text-lg font-semibold text-slate-800 leading-none">{sizeData.total}</span>
                                 <span className="text-[10px] font-medium text-slate-400 uppercase mt-2">Capacidad</span>
                               </div>
                               <div className="flex flex-col">
                                 <span className="text-lg font-semibold text-rose-500 leading-none">{sizeData.full}</span>
                                 <span className="text-[10px] font-medium text-slate-400 uppercase mt-2">Llenos</span>
                               </div>
                               <div className="flex flex-col">
                                 <span className="text-lg font-semibold text-amber-500 leading-none">{sizeData.half}</span>
                                 <span className="text-[10px] font-medium text-slate-400 uppercase mt-2">Medios</span>
                               </div>
                               <div className="flex flex-col">
                                 <span className="text-lg font-semibold text-emerald-500 leading-none">{sizeData.empty}</span>
                                 <span className="text-[10px] font-medium text-slate-400 uppercase mt-2">Libres</span>
                               </div>
                             </div>
                             <div className="mt-5 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 transition-all" style={{width: `${sizeData.occupancy}%`}}></div>
                             </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-center text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-2">Ocupación real calculada sobre {plantData.totalSlots} huecos en {plantData.plant}</p>
                   </div>
                 ))}
              </div>
            </section>

            <section className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-800 uppercase tracking-tight ml-2">Rendimiento Operarios (Acumulado)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {getOperatorStats().map(([key, op]) => (
                  <div key={key} className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex items-center justify-between group">
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-2xl shadow-sm">👷</div>
                      <div>
                        <p className="font-semibold text-slate-800 uppercase text-sm tracking-tight">{op.name}</p>
                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.2em] mt-1">{op.count} CAPTURAS TOTALES</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-semibold text-indigo-600 leading-none">{calculateAvgTime(op.logs)}</p>
                      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-1">Tiempo Medio</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {getOperatorStats().length === 0 && warehouseBreakdown.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                 <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center text-4xl">📈</div>
                 <h3 className="text-2xl font-semibold text-slate-800 uppercase tracking-tight">Sin datos para informe</h3>
                 <p className="text-slate-400 text-sm font-medium max-w-sm uppercase tracking-widest leading-relaxed">No se han encontrado capturas en el rango seleccionado para calcular rendimientos.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {showTruckerModal && (
        <div className="fixed inset-0 z-[300] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
           <form onSubmit={handleCreateTrucker} className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl space-y-6">
              <div className="text-center">
                 <h3 className="text-xl font-black text-slate-800 uppercase">Nuevo Transportista</h3>
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Habitual de Expedición</p>
              </div>
              <input 
                autoFocus 
                placeholder="NOMBRE / Nº CAMIÓN" 
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 font-black text-xs text-center outline-none focus:border-indigo-500 uppercase" 
                value={truckerForm.label} 
                onChange={e => setTruckerForm({ label: e.target.value })} 
              />
              <div className="space-y-3">
                 <button type="submit" className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px]">Guardar Transportista</button>
                 <button type="button" onClick={() => setShowTruckerModal(false)} className="w-full py-4 text-slate-400 font-black text-[9px] uppercase tracking-[0.2em]">Cancelar</button>
              </div>
           </form>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
