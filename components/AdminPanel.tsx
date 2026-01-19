
import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { WarehouseSlot, UserProfile } from '../types';

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

interface OperatorData extends UserProfile {
  totalActions: number;
  logs: MovementLog[];
  avgTimePerCart: string;
}

interface ZoneCountStats {
  grande: number;
  mediano: number;
  pequeno: number;
  totalVerificados: number;
}

type AdminTab = 'movements' | 'stats_operators' | 'stats_slots' | 'heatmap' | 'reports';

const AdminPanel: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<AdminTab>('movements');
  const [loading, setLoading] = useState(true);
  
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

  const [allLogs, setAllLogs] = useState<MovementLog[]>([]);
  const [operators, setOperators] = useState<OperatorData[]>([]);
  const [allSlotsData, setAllSlotsData] = useState<WarehouseSlot[]>([]);
  
  const [slotFilterSize, setSlotFilterSize] = useState('');
  const [slotFilterOcc, setSlotFilterOcc] = useState('');
  const [slotFilterCode, setSlotFilterCode] = useState('');
  
  const [cartSearchFilter, setCartSearchFilter] = useState('');
  const [selectedOperator, setSelectedOperator] = useState<OperatorData | null>(null);
  const [opDetailDate, setOpDetailDate] = useState(new Date().toISOString().split('T')[0]);

  const [heatmapSizeFilter, setHeatmapSizeFilter] = useState<string>('Mediano');

  useEffect(() => {
    fetchAllAdminData();
  }, [dateFrom, dateTo, activeSubTab]);

  const fetchAllAdminData = async () => {
    setLoading(true);
    try {
      const start = `${dateFrom}T00:00:00`;
      const end = `${dateTo}T23:59:59`;

      const { data: logsData } = await supabase
        .from('movement_logs')
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: true });

      const logs = (logsData || []) as MovementLog[];
      setAllLogs([...logs].reverse());

      const { data: profilesData } = await supabase.from('profiles').select('*');
      
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
      setAllSlotsData(allSlots);

      if (profilesData) {
        const enriched = profilesData.map(profile => {
          const opLogs = logs.filter(l => 
            l.operator_email === profile.email || 
            l.operator_name === profile.full_name
          );

          let avgTimeString = "---";
          if (opLogs.length > 1) {
            let totalDiff = 0;
            let pairs = 0;
            for (let i = 1; i < opLogs.length; i++) {
              const diff = new Date(opLogs[i].created_at).getTime() - new Date(opLogs[i-1].created_at).getTime();
              if (diff > 0 && diff < 20 * 60 * 1000) {
                totalDiff += diff;
                pairs++;
              }
            }
            if (pairs > 0) {
              const avgMs = totalDiff / pairs;
              const mins = Math.floor(avgMs / 60000);
              const secs = Math.floor((avgMs % 60000) / 1000);
              avgTimeString = `${mins}m ${secs}s`;
            }
          }

          return {
            ...profile,
            totalActions: opLogs.length,
            logs: opLogs,
            avgTimePerCart: avgTimeString
          } as OperatorData;
        });
        setOperators(enriched);
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const rows = text.split('\n').slice(1);
      const slotsToUpsert = rows.map(row => {
        const parts = row.split(',');
        const code = parts[0]?.trim().toUpperCase();
        const size = parts[1]?.trim() || 'Mediano';
        if (!code) return null;
        return { code, size, status: 'empty', quantity: 0, is_scanned_once: false };
      }).filter(Boolean);

      if (slotsToUpsert.length > 0) {
        const { error } = await supabase.from('warehouse_slots').upsert(slotsToUpsert, { onConflict: 'code' });
        if (error) alert(error.message);
        else fetchAllAdminData();
      }
    };
    reader.readAsText(file);
  };

  const zonesReports = useMemo(() => {
    const zones: Record<string, ZoneCountStats> = {};
    const validated = allSlotsData.filter(s => s.is_scanned_once);
    const uniqueZones = Array.from(new Set(allSlotsData.map(s => s.code.substring(0, 3))));

    uniqueZones.forEach(zoneName => {
      const zoneSlots = validated.filter(s => s.code.startsWith(zoneName));
      if (zoneSlots.length === 0) return;
      
      zones[zoneName] = {
        grande: zoneSlots.filter(s => s.size === 'Grande').length,
        mediano: zoneSlots.filter(s => s.size === 'Mediano').length,
        pequeno: zoneSlots.filter(s => s.size === 'Pequeño').length,
        totalVerificados: zoneSlots.length
      };
    });

    const totalSlots = allSlotsData.length;
    const verifiedSlotsCount = validated.length;
    const verifiedPercent = totalSlots > 0 ? Math.round((verifiedSlotsCount / totalSlots) * 100) : 0;

    return { zones, totalSlots, verifiedSlotsCount, verifiedPercent };
  }, [allSlotsData]);

  const heatmapData = useMemo(() => {
    // FIX: Define explicit type for heatmap structure to avoid 'unknown' index errors
    const structure: Record<string, Record<string, WarehouseSlot[]>> = {};
    const filteredBySelectedSize = allSlotsData.filter(s => s.size === heatmapSizeFilter);
    filteredBySelectedSize.forEach(s => {
      const planta = s.code.substring(0, 3);
      const calle = s.code.substring(3, 5);
      if (!structure[planta]) structure[planta] = {};
      if (!structure[planta][calle]) structure[planta][calle] = [];
      structure[planta][calle].push(s);
    });
    Object.keys(structure).forEach(p => {
      Object.keys(structure[p]).forEach(c => {
        structure[p][c].sort((a, b) => a.code.localeCompare(b.code));
      });
    });
    return structure;
  }, [allSlotsData, heatmapSizeFilter]);

  const filteredOpLogs = useMemo(() => {
    if (!selectedOperator) return [];
    const start = `${opDetailDate}T00:00:00`;
    const end = `${opDetailDate}T23:59:59`;
    return selectedOperator.logs.filter(l => l.created_at >= start && l.created_at <= end).reverse();
  }, [selectedOperator, opDetailDate]);

  const filteredMainLogs = useMemo(() => {
    if (!cartSearchFilter) return allLogs;
    return allLogs.filter(log => log.cart_id.includes(cartSearchFilter.toUpperCase()));
  }, [allLogs, cartSearchFilter]);

  return (
    <div className="space-y-6 pb-24 max-w-5xl mx-auto px-2" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="flex bg-slate-900 p-1.5 rounded-3xl shadow-xl sticky top-2 z-30 border border-slate-700 overflow-hidden">
        <div className="flex w-full gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { id: 'movements', label: 'Historial', icon: '📋' },
            { id: 'stats_operators', label: 'Operarios', icon: '👥' },
            { id: 'stats_slots', label: 'Sectores', icon: '📊' },
            { id: 'heatmap', label: 'Plano', icon: '🌡️' },
            { id: 'reports', label: 'Informe', icon: '📈' }
          ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveSubTab(tab.id as AdminTab)} className={`flex-1 min-w-[70px] flex flex-col items-center justify-center gap-1 py-3 rounded-2xl transition-all ${activeSubTab === tab.id ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400'}`}>
              <span className="text-sm">{tab.icon}</span>
              <span className="text-[8px] font-semibold uppercase tracking-widest">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {activeSubTab === 'movements' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border-2 border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="flex flex-col">
                <label className="text-[9px] font-semibold text-slate-400 uppercase mb-1.5 ml-1 tracking-widest">Día Consulta</label>
                <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setDateTo(e.target.value); }} className="bg-slate-50 p-4 rounded-xl font-medium text-xs outline-none border-2 border-transparent focus:border-indigo-500 transition-all" />
             </div>
             <div className="flex flex-col">
                <label className="text-[9px] font-semibold text-slate-400 uppercase mb-1.5 ml-1 tracking-widest">Buscar Carro</label>
                <input type="text" placeholder="ID CARRO..." value={cartSearchFilter} onChange={e => setCartSearchFilter(e.target.value.toUpperCase())} className="bg-slate-50 p-4 rounded-xl font-medium text-xs outline-none border-2 border-transparent focus:border-indigo-500 uppercase transition-all" />
             </div>
          </div>
          <div className="bg-white rounded-[2.5rem] border-2 border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[600px]">
              <thead className="bg-slate-50 text-[10px] font-semibold text-slate-400 uppercase tracking-widest border-b-2 border-slate-100">
                <tr><th className="px-8 py-5">Hora</th><th className="px-8 py-5">Operario</th><th className="px-8 py-5">Carro</th><th className="px-8 py-5">Ubicación</th><th className="px-8 py-5 text-right">Ocupación (Ant &gt; Nue)</th></tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-50">
                {filteredMainLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-all">
                    <td className="px-8 py-4 text-slate-400 font-medium">{new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                    <td className="px-8 py-4 uppercase text-slate-700 font-medium">{log.operator_name}</td>
                    <td className="px-8 py-4"><span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg border border-indigo-100 font-medium text-[9px] uppercase">{log.cart_id}</span></td>
                    <td className="px-8 py-4 font-medium text-slate-600 text-[11px]">{log.slot_code}</td>
                    <td className="px-8 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 font-medium text-[9px]">
                        <span className="text-slate-400">{log.old_quantity ?? 0}%</span>
                        <span className="text-slate-300">→</span>
                        <span className={`${log.new_quantity === 100 ? 'text-rose-600' : log.new_quantity === 50 ? 'text-amber-600' : 'text-emerald-600'}`}>{log.new_quantity}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === 'stats_operators' && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {operators.map(op => (
              <button 
                key={op.id} 
                onClick={() => { setSelectedOperator(op); setOpDetailDate(dateFrom); }} 
                className={`bg-white p-6 rounded-[2.5rem] border-2 transition-all shadow-sm flex items-center justify-between group text-left active:scale-95 ${selectedOperator?.id === op.id ? 'border-indigo-600 ring-4 ring-indigo-50' : 'border-slate-100 hover:shadow-xl'}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white font-medium text-xl shadow-lg transition-colors ${selectedOperator?.id === op.id ? 'bg-indigo-600' : 'bg-slate-900'}`}>
                    {op.full_name ? op.full_name[0] : '?'}
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-800 text-sm leading-none mb-1 uppercase">{op.full_name}</h4>
                    <p className="text-[9px] font-semibold text-indigo-500 uppercase tracking-widest leading-relaxed">
                      {op.totalActions} ACCIONES<br/>
                      <span className="text-emerald-500">⏳ {op.avgTimePerCart} MEDIO</span>
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs">{selectedOperator?.id === op.id ? '🔽' : '📋'}</span>
                </div>
              </button>
            ))}
          </div>

          {selectedOperator && (
            <div className="bg-white rounded-[3rem] p-10 border-2 border-indigo-100 shadow-inner animate-fade-in space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-6">
                <div>
                  <h3 className="text-xl font-semibold text-slate-800 uppercase tracking-tight">{selectedOperator.full_name}</h3>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Resumen de Actividad</p>
                </div>
                <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                   <label className="text-[9px] font-semibold text-slate-400 uppercase ml-2">Día:</label>
                   <input 
                    type="date" 
                    value={opDetailDate} 
                    onChange={e => setOpDetailDate(e.target.value)}
                    className="bg-transparent p-2 font-medium text-xs outline-none"
                   />
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[400px]">
                  <thead className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                    <tr>
                      <th className="py-4 px-2">HORA</th>
                      <th className="py-4 px-2">CARRO</th>
                      <th className="py-4 px-2">UBICACIÓN</th>
                      <th className="py-4 px-2 text-right">CAMBIO CARGA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredOpLogs.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-10 text-slate-400 font-semibold uppercase text-[10px] tracking-widest">Sin registros este día</td></tr>
                    ) : filteredOpLogs.map(l => (
                      <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-4 px-2 text-slate-400 font-medium">{new Date(l.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                        <td className="py-4 px-2 uppercase font-medium text-indigo-600">{l.cart_id}</td>
                        <td className="py-4 px-2 font-medium text-slate-700">{l.slot_code}</td>
                        <td className="py-4 px-2 text-right">
                          <div className="flex items-center justify-end gap-1.5 font-medium text-[8px]">
                            <span className="text-slate-400">{l.old_quantity ?? 0}%</span>
                            <span className="text-slate-300">→</span>
                            <span className={`${l.new_quantity === 100 ? 'text-rose-600' : l.new_quantity === 50 ? 'text-amber-600' : 'text-emerald-600'}`}>{l.new_quantity}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'heatmap' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white p-8 rounded-[3rem] border-2 border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center relative overflow-hidden">
             <div className="absolute -right-4 -bottom-4 text-indigo-50 text-8xl font-medium opacity-30">🏢</div>
             <div className="relative z-10 text-center md:text-left">
               <h3 className="text-xl font-semibold text-slate-800 tracking-tighter uppercase">Mapa de Planta</h3>
               <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em] mt-1">Filtrado por: <span className="text-indigo-600">{heatmapSizeFilter}</span></p>
             </div>
             
             <div className="flex flex-col gap-4 mt-6 md:mt-0 z-10">
               <div className="flex bg-slate-50 p-1 rounded-xl border-2 border-slate-100 overflow-x-auto no-scrollbar max-w-[320px]">
                  {['Pequeño', 'Mediano', 'Grande'].map(size => (
                    <button key={size} onClick={() => setHeatmapSizeFilter(size)} className={`px-4 py-2 rounded-lg text-[8px] font-semibold uppercase tracking-widest transition-all whitespace-nowrap ${heatmapSizeFilter === size ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}>{size}</button>
                  ))}
               </div>
               <div className="flex gap-4 justify-center md:justify-end">
                 <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-500 rounded-full"></div><span className="text-[8px] font-semibold uppercase">0%</span></div>
                 <div className="flex items-center gap-2"><div className="w-3 h-3 bg-amber-500 rounded-full"></div><span className="text-[8px] font-semibold uppercase">50%</span></div>
                 <div className="flex items-center gap-2"><div className="w-3 h-3 bg-rose-500 rounded-full"></div><span className="text-[8px] font-semibold uppercase">100%</span></div>
               </div>
             </div>
          </div>
          <div className="space-y-12">
            {Object.keys(heatmapData).length === 0 ? (
              <div className="bg-white p-20 rounded-[3rem] text-center border-2 border-dashed border-slate-200"><p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">No hay huecos de tipo {heatmapSizeFilter} registrados</p></div>
            ) : Object.keys(heatmapData).sort().map(planta => (
              <div key={planta} className="space-y-4">
                <div className="flex items-center gap-3 ml-4"><div className="w-1.5 h-6 bg-slate-900 rounded-full"></div><h4 className="text-xl font-semibold text-slate-800 uppercase tracking-tighter">PLANTA {planta}</h4></div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Object.keys(heatmapData[planta]).sort().map(calle => (
                    <div key={calle} className="bg-white p-6 rounded-[2.5rem] border-2 border-slate-50 shadow-sm flex flex-col">
                      <div className="flex items-center justify-between mb-4 px-2">
                        <h5 className="text-[10px] font-semibold text-indigo-600 uppercase tracking-widest">Calle {calle}</h5>
                        <span className="text-[8px] font-semibold text-slate-300 uppercase">{heatmapData[planta][calle].length} HUECOS</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {heatmapData[planta][calle].map(slot => (
                          <div key={slot.id} className={`w-7 h-7 rounded-lg border border-black/5 flex items-center justify-center text-[8px] font-medium transition-all hover:scale-125 shadow-sm cursor-help ${!slot.is_scanned_once ? 'bg-slate-50 text-slate-200' : slot.quantity === 100 ? 'bg-rose-500 text-white' : slot.quantity === 50 ? 'bg-amber-400 text-amber-900' : 'bg-emerald-500 text-white'}`} title={`${slot.code}: ${slot.quantity}% (${slot.size})`}>{slot.code.slice(-2)}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSubTab === 'reports' && (
        <div className="space-y-12 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <div className="bg-white p-8 rounded-[3rem] border-2 border-slate-100 shadow-sm flex flex-col justify-center relative overflow-hidden group">
                <div className="absolute -right-4 -bottom-4 text-slate-50 text-8xl font-medium opacity-40 group-hover:opacity-60 transition-opacity">📦</div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em] mb-2 z-10">Total Huecos</p>
                <h3 className="text-5xl font-semibold text-slate-900 tracking-tighter z-10">{zonesReports.totalSlots}</h3>
             </div>
             <div className="bg-white p-8 rounded-[3rem] border-2 border-slate-100 shadow-sm flex flex-col justify-center relative overflow-hidden group">
                <div className="absolute -right-4 -bottom-4 text-emerald-50 text-8xl font-medium opacity-40 group-hover:opacity-60 transition-opacity">✓</div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em] mb-2 z-10">Verificados</p>
                <h3 className="text-5xl font-semibold text-emerald-600 tracking-tighter z-10">{zonesReports.verifiedSlotsCount}</h3>
             </div>
             <div className="bg-indigo-600 p-8 rounded-[3rem] text-white shadow-2xl flex flex-col justify-center relative overflow-hidden group">
                <div className="absolute -right-4 -bottom-4 text-white/10 text-8xl font-medium opacity-40 group-hover:opacity-60 transition-opacity">%</div>
                <p className="text-[10px] font-semibold text-indigo-200 uppercase tracking-[0.2em] mb-2 z-10">Control Inventario</p>
                <h3 className="text-5xl font-semibold tracking-tighter z-10">{zonesReports.verifiedPercent}%</h3>
                <div className="mt-4 w-full h-2 bg-white/20 rounded-full overflow-hidden z-10"><div className="h-full bg-white transition-all duration-1000" style={{width: `${zonesReports.verifiedPercent}%`}} /></div>
             </div>
          </div>

          <div className="space-y-8">
            {/* FIX: Ensure proper typing for zones iteration to avoid Property '...' does not exist on type 'unknown' */}
            {Object.entries(zonesReports.zones as Record<string, ZoneCountStats>).sort().map(([zone, stats]) => (
              <div key={zone} className="bg-white p-8 rounded-[3rem] border-2 border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all w-full">
                <div className="absolute -right-6 -top-6 text-slate-50 text-9xl font-medium opacity-30 group-hover:scale-110 transition-transform">{zone}</div>
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="w-1.5 h-8 bg-indigo-600 rounded-full"></div>
                    <h4 className="text-2xl font-semibold text-slate-800 uppercase tracking-tighter">PLANTA {zone}</h4>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
                    <div className="md:col-span-3 grid grid-cols-3 gap-4">
                      <div className="bg-blue-50/50 p-6 rounded-[2rem] border border-blue-100 text-center">
                        <p className="text-[10px] font-semibold text-blue-400 uppercase mb-2 tracking-widest">Grande</p>
                        <p className="text-3xl font-semibold text-blue-600">{stats.grande}</p>
                      </div>
                      <div className="bg-indigo-50/50 p-6 rounded-[2rem] border border-indigo-100 text-center">
                        <p className="text-[10px] font-semibold text-indigo-400 uppercase mb-2 tracking-widest">Mediano</p>
                        <p className="text-3xl font-semibold text-indigo-600">{stats.mediano}</p>
                      </div>
                      <div className="bg-emerald-50/50 p-6 rounded-[2rem] border border-emerald-100 text-center">
                        <p className="text-[10px] font-semibold text-emerald-400 uppercase mb-2 tracking-widest">Pequeño</p>
                        <p className="text-3xl font-semibold text-emerald-600">{stats.pequeno}</p>
                      </div>
                    </div>
                    
                    <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex flex-col items-center justify-center">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Verificados</p>
                      <p className="text-3xl font-semibold text-slate-800">{stats.totalVerificados}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSubTab === 'stats_slots' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white p-8 rounded-[3rem] border-2 border-slate-100 shadow-sm flex justify-between items-center relative overflow-hidden">
            <div className="absolute -right-4 -bottom-4 text-slate-50 text-8xl font-medium opacity-30">📋</div>
            <div className="z-10"><h3 className="font-semibold text-slate-800 uppercase tracking-tighter text-lg">Sectores</h3><p className="text-[10px] font-semibold text-slate-400 uppercase mt-1 tracking-widest">Inventario Maestro</p></div>
            <label className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-semibold text-[10px] uppercase cursor-pointer shadow-lg hover:bg-indigo-600 transition-all tracking-widest z-10">Cargar CSV<input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" /></label>
          </div>
          <div className="bg-white p-4 rounded-[2rem] border-2 border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3 shadow-sm">
            <input type="text" placeholder="BUSCAR CÓDIGO..." value={slotFilterCode} onChange={e => setSlotFilterCode(e.target.value.toUpperCase())} className="bg-slate-50 p-4 rounded-xl font-medium text-xs outline-none border-2 border-transparent focus:border-indigo-500 uppercase shadow-inner transition-all" />
            <select value={slotFilterSize} onChange={e => setSlotFilterSize(e.target.value)} className="bg-slate-50 p-4 rounded-xl font-medium text-xs outline-none border-2 border-transparent focus:border-indigo-500 uppercase shadow-inner transition-all"><option value="">TAMAÑO</option>{['Pequeño', 'Mediano', 'Grande'].map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}</select>
            <select value={slotFilterOcc} onChange={e => setSlotFilterOcc(e.target.value)} className="bg-slate-50 p-4 rounded-xl font-medium text-xs outline-none border-2 border-transparent focus:border-indigo-500 uppercase shadow-inner transition-all"><option value="">OCUPACIÓN</option><option value="0">VACÍO (0%)</option><option value="50">MEDIO (50%)</option><option value="100">LLENO (100%)</option></select>
          </div>
          <div className="bg-white rounded-[2.5rem] border-2 border-slate-100 overflow-hidden shadow-sm overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[500px]">
              <thead className="bg-slate-50 text-[10px] font-semibold text-slate-400 uppercase tracking-widest border-b-2 border-slate-100"><tr><th className="px-8 py-5">Ubicación</th><th className="px-8 py-5">Tipo</th><th className="px-8 py-5">Nivel Carga</th><th className="px-8 py-5 text-right">Verificado</th></tr></thead>
              <tbody className="divide-y-2 divide-slate-50">
                {allSlotsData.filter(s => s.code.includes(slotFilterCode) && (!slotFilterSize || s.size === slotFilterSize) && (!slotFilterOcc || String(s.quantity) === slotFilterOcc)).slice(0, 100).map(slot => (
                  <tr key={slot.id} className="text-slate-800 hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-4 font-medium text-indigo-600">{slot.code}</td>
                    <td className="px-8 py-4 uppercase text-slate-400 font-medium text-[9px]">{slot.size}</td>
                    <td className="px-8 py-4"><div className="flex items-center gap-3"><div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden shadow-inner"><div className={`h-full ${slot.quantity === 100 ? 'bg-rose-500' : slot.quantity === 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{width: `${slot.quantity}%`}} /></div><span className="font-medium text-[9px] opacity-70">{slot.quantity}%</span></div></td>
                    <td className="px-8 py-4 text-right"><span className={`px-3 py-1 rounded-lg text-[9px] font-medium uppercase ${slot.is_scanned_once ? 'text-emerald-600' : 'text-slate-300'}`}>{slot.is_scanned_once ? '✓' : '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
