
import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { WarehouseSlot } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';

interface MovementLog {
  id: string;
  operator_name: string;
  cart_id: string;
  slot_code: string;
  new_status: string;
  new_quantity: number;
  created_at: string;
}

interface OperatorStats {
  name: string;
  count: number;
  ubicationsCount: number;
  adjustmentsCount: number;
  ubications: MovementLog[];
  adjustments: MovementLog[];
}

interface SectorStats {
  name: string;
  total: number;
  occupied: number;
  empty: number;
  avgQuantity: number;
}

type AdminTab = 'movements' | 'stats_slots' | 'stats_operators' | 'reports';

const AdminPanel: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<AdminTab>('movements');
  const [loading, setLoading] = useState(true);
  
  // Filtros Globales
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [searchOperator, setSearchOperator] = useState('all');
  const [searchCart, setSearchCart] = useState('');

  // Datos
  const [allLogs, setAllLogs] = useState<MovementLog[]>([]);
  const [operatorsList, setOperatorsList] = useState<string[]>([]);
  const [dailyStats, setDailyStats] = useState<OperatorStats[]>([]);
  const [sectorData, setSectorData] = useState<SectorStats[]>([]);
  
  // Detalle Seleccionado
  const [selectedOperator, setSelectedOperator] = useState<OperatorStats | null>(null);
  const [detailMode, setDetailMode] = useState<'ubications' | 'adjustments'>('ubications');

  const [showImporter, setShowImporter] = useState(false);
  const [rawInput, setRawInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchData();
    if (activeSubTab === 'stats_slots') fetchSectorStats();
  }, [dateFrom, dateTo, activeSubTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: logs } = await supabase
        .from('movement_logs')
        .select('*')
        .gte('created_at', `${dateFrom}T00:00:00`)
        .lte('created_at', `${dateTo}T23:59:59`)
        .order('created_at', { ascending: false });

      if (logs) {
        setAllLogs(logs);
        const names = Array.from(new Set(logs.map(l => l.operator_name)));
        setOperatorsList(names);

        const grouping: Record<string, OperatorStats> = {};
        logs.forEach(log => {
          if (!grouping[log.operator_name]) {
            grouping[log.operator_name] = { 
              name: log.operator_name, 
              count: 0, 
              ubicationsCount: 0,
              adjustmentsCount: 0,
              ubications: [], 
              adjustments: [] 
            };
          }
          grouping[log.operator_name].count++;
          const isUbi = log.cart_id && log.cart_id !== 'MANUAL';
          if (isUbi) {
            grouping[log.operator_name].ubicationsCount++;
            grouping[log.operator_name].ubications.push(log);
          } else {
            grouping[log.operator_name].adjustmentsCount++;
            grouping[log.operator_name].adjustments.push(log);
          }
        });

        const statsArray = Object.values(grouping);
        setDailyStats(statsArray);
        if (selectedOperator) {
          const updated = statsArray.find(s => s.name === selectedOperator.name);
          if (updated) setSelectedOperator(updated);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchSectorStats = async () => {
    const { data } = await supabase.from('warehouse_slots').select('code, status, quantity');
    if (data) {
      const prefixes = ['U01', 'U02'];
      const stats = prefixes.map(prefix => {
        const filtered = data.filter(s => s.code.startsWith(prefix));
        const total = filtered.length;
        const occupied = filtered.filter(s => s.status === 'occupied').length;
        const avgQuantity = total > 0 ? filtered.reduce((acc, s) => acc + (s.quantity || 0), 0) / total : 0;
        return { name: prefix, total, occupied, empty: total - occupied, avgQuantity: Math.round(avgQuantity) };
      });
      setSectorData(stats);
    }
  };

  const handleBulkImport = async () => {
    if (!rawInput.trim()) return;
    setIsProcessing(true);
    try {
      const lines = rawInput.split('\n').filter(line => line.trim());
      const slotsToInsert = lines.map(line => ({
        code: line.trim().toUpperCase(),
        status: 'empty',
        size: 'Mediano',
        is_scanned_once: false,
        quantity: 0,
        last_updated: new Date().toISOString()
      }));
      const { error } = await supabase.from('warehouse_slots').upsert(slotsToInsert, { onConflict: 'code' });
      if (error) throw error;
      alert(`Éxito: ${slotsToInsert.length} huecos procesados.`);
      setRawInput('');
      setShowImporter(false);
      fetchSectorStats();
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const filteredLogs = useMemo(() => {
    return allLogs.filter(log => {
      const matchOp = selectedOperator ? log.operator_name === selectedOperator.name : (searchOperator === 'all' || log.operator_name === searchOperator);
      const matchCart = searchCart === '' || log.cart_id.toLowerCase().includes(searchCart.toLowerCase());
      const isAdjustment = !log.cart_id || log.cart_id === 'MANUAL';
      const matchType = detailMode === 'ubications' ? !isAdjustment : isAdjustment;
      return matchOp && matchCart && matchType;
    });
  }, [allLogs, selectedOperator, searchOperator, searchCart, detailMode]);

  const COLORS = ['#6366f1', '#cbd5e1'];

  return (
    <div className="space-y-8 pb-20">
      {/* SUBMENU NAV */}
      <div className="flex bg-white p-2 rounded-3xl border border-slate-100 shadow-sm sticky top-0 z-20 backdrop-blur-md bg-white/90 overflow-x-auto no-scrollbar">
        <div className="flex min-w-max gap-1 w-full">
          {[
            { id: 'movements', label: 'Movimientos', icon: '📋' },
            { id: 'stats_operators', label: 'Est. Operarios', icon: '👥' },
            { id: 'stats_slots', label: 'Est. Huecos', icon: '📊' },
            { id: 'reports', label: 'Informes', icon: '📄' }
          ].map((tab) => (
            <button 
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as AdminTab)}
              className={`flex-1 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 whitespace-nowrap ${activeSubTab === tab.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
            >
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* FILTROS GLOBALES (Se muestran en casi todas las pestañas) */}
      {activeSubTab !== 'stats_slots' && (
        <section className="bg-slate-950 p-6 rounded-[3rem] shadow-2xl text-white space-y-6">
          <div className="flex justify-between items-center px-2">
            <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-3"><span>🔍</span> Rango de Consulta</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[8px] font-black text-indigo-300 uppercase tracking-widest ml-2">Desde</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full bg-white/10 border-none rounded-2xl px-4 py-3 text-[10px] font-black text-white outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-indigo-300 uppercase tracking-widest ml-2">Hasta</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full bg-white/10 border-none rounded-2xl px-4 py-3 text-[10px] font-black text-white outline-none" />
            </div>
          </div>
        </section>
      )}

      {/* CONTENIDO SEGÚN PESTAÑA */}
      {activeSubTab === 'movements' && (
        <div className="space-y-8 animate-fade-in">
          {/* TARJETAS DE EMPLEADOS */}
          <section className="space-y-4">
            <div className="flex justify-between items-end px-2">
              <div>
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Personal</h3>
                <p className="text-2xl font-black text-slate-800 tracking-tight">Actividad en Rango</p>
              </div>
              <button onClick={() => setShowImporter(true)} className="text-[9px] font-black bg-indigo-600 text-white px-4 py-2 rounded-xl uppercase tracking-widest shadow-lg">📥 Lote</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {dailyStats.map(stat => (
                <button 
                  key={stat.name} 
                  onClick={() => {
                    const isSame = selectedOperator?.name === stat.name;
                    setSelectedOperator(isSame ? null : stat);
                    setSearchOperator(isSame ? 'all' : stat.name);
                  }}
                  className={`bg-white p-5 rounded-[2.5rem] border-2 text-left transition-all hover:shadow-xl active:scale-95 ${selectedOperator?.name === stat.name ? 'border-indigo-600 ring-4 ring-indigo-50' : 'border-slate-100'}`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black ${selectedOperator?.name === stat.name ? 'bg-indigo-600' : 'bg-slate-800'}`}>
                      {stat.name[0]}
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-800 leading-none">{stat.name}</h4>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Total: {stat.count}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 p-2 rounded-xl text-center">
                      <p className="text-[7px] font-black text-slate-400 uppercase">Ubis</p>
                      <p className="text-sm font-black text-slate-800">{stat.ubicationsCount}</p>
                    </div>
                    <div className="bg-indigo-50 p-2 rounded-xl text-center">
                      <p className="text-[7px] font-black text-indigo-400 uppercase">Regs</p>
                      <p className="text-sm font-black text-indigo-700">{stat.adjustmentsCount}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* TABLA DE MOVIMIENTOS */}
          <section className="bg-white rounded-[3rem] border border-slate-100 shadow-xl overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50/50">
              <div className="flex bg-white p-1 rounded-2xl border border-slate-200">
                <button onClick={() => setDetailMode('ubications')} className={`px-6 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${detailMode === 'ubications' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400'}`}>Ubicaciones</button>
                <button onClick={() => setDetailMode('adjustments')} className={`px-6 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${detailMode === 'adjustments' ? 'bg-amber-500 text-white shadow-lg' : 'text-slate-400'}`}>Regularizaciones</button>
              </div>
              <input type="text" value={searchCart} onChange={e => setSearchCart(e.target.value)} placeholder="FILTRAR POR CARRO..." className="bg-white border-2 border-slate-100 rounded-xl px-4 py-2 text-[10px] font-black uppercase outline-none focus:border-indigo-300 w-full md:w-48" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-white text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <tr>
                    <th className="px-10 py-5">Fecha / Hora</th>
                    {!selectedOperator && <th className="px-10 py-5">Operador</th>}
                    <th className="px-10 py-5">Nº Carro</th>
                    <th className="px-10 py-5">Hueco</th>
                    <th className="px-10 py-5 text-right">Ocupación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-10 py-5 text-[10px] font-black text-slate-400">{formatDate(log.created_at)}</td>
                      {!selectedOperator && <td className="px-10 py-5 font-black text-slate-700 text-[11px]">{log.operator_name}</td>}
                      <td className="px-10 py-5">
                        <span className={`text-[9px] font-black px-3 py-1 rounded-lg ${log.cart_id === 'MANUAL' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-50 text-indigo-700'}`}>{log.cart_id}</span>
                      </td>
                      <td className="px-10 py-5 font-mono text-[11px] font-black text-slate-600">{log.slot_code}</td>
                      <td className="px-10 py-5 text-right font-black text-slate-800 text-[11px] tabular-nums">{log.new_quantity}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {activeSubTab === 'stats_operators' && (
        <section className="space-y-8 animate-fade-in">
          <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-8">Rendimiento Comparativo</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: '#64748b' }} />
                  <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 900, fontSize: '10px' }} />
                  <Legend verticalAlign="top" height={36} wrapperStyle={{ fontWeight: 900, fontSize: '10px', textTransform: 'uppercase' }} />
                  <Bar dataKey="ubicationsCount" name="Carros Ubicados" fill="#6366f1" radius={[10, 10, 0, 0]} />
                  <Bar dataKey="adjustmentsCount" name="Huecos Actualizados" fill="#f59e0b" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dailyStats.map(stat => (
              <div key={stat.name} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-lg">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white font-black text-xl">{stat.name[0]}</div>
                  <div>
                    <h4 className="text-sm font-black text-slate-800">{stat.name}</h4>
                    <p className="text-[9px] font-black text-slate-400 uppercase">Resumen de Periodo</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl">
                    <span className="text-[9px] font-black text-slate-500 uppercase">Carros Ubicados</span>
                    <span className="text-xl font-black text-indigo-600">{stat.ubicationsCount}</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl">
                    <span className="text-[9px] font-black text-slate-500 uppercase">Ajustes Manuales</span>
                    <span className="text-xl font-black text-amber-500">{stat.adjustmentsCount}</span>
                  </div>
                  <div className="flex justify-between items-center bg-indigo-600 p-4 rounded-2xl text-white">
                    <span className="text-[9px] font-black uppercase">Total Acciones</span>
                    <span className="text-xl font-black">{stat.count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeSubTab === 'stats_slots' && (
        <section className="space-y-8 animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-8">Ocupación Media por Sector</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sectorData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: '#64748b' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: '#64748b' }} domain={[0, 100]} />
                    <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 900, fontSize: '10px' }} />
                    <Bar dataKey="avgQuantity" name="Ocupación (%)" fill="#6366f1" radius={[12, 12, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sectorData.map(s => (
                <div key={s.name} className="bg-slate-900 text-white p-8 rounded-[3rem] space-y-4">
                  <h4 className="text-2xl font-black">{s.name}</h4>
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase"><span>Total</span><span>{s.total}</span></div>
                    <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase"><span>Ocupados</span><span className="text-indigo-400">{s.occupied}</span></div>
                    <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase"><span>Vacíos</span><span className="text-emerald-400">{s.empty}</span></div>
                  </div>
                  <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden mt-4">
                    <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${s.avgQuantity}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {activeSubTab === 'reports' && (
        <section className="space-y-8 animate-fade-in print:p-0">
          <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl print:shadow-none print:border-none">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 print:hidden">
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Generador de Informes</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Selecciona un empleado para exportar su actividad</p>
              </div>
              <div className="flex gap-2">
                <select 
                  className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-3 text-[11px] font-black uppercase outline-none focus:border-indigo-500"
                  value={searchOperator}
                  onChange={(e) => setSearchOperator(e.target.value)}
                >
                  <option value="all">TODOS LOS EMPLEADOS</option>
                  {operatorsList.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
                <button 
                  onClick={() => window.print()}
                  className="bg-indigo-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all"
                >
                  🖨️ Imprimir
                </button>
              </div>
            </div>

            {/* VISTA PREVIA DEL INFORME (Optimizado para impresión) */}
            <div className="space-y-8 border-t border-slate-100 pt-8 print:border-none">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="bg-indigo-600 w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-xl">WH</div>
                  <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Informe de Actividad Almacén</h2>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Periodo: {dateFrom} al {dateTo}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Generado el</p>
                  <p className="text-xs font-black text-slate-800">{new Date().toLocaleString()}</p>
                </div>
              </div>

              {dailyStats.filter(s => searchOperator === 'all' || s.name === searchOperator).map(stat => (
                <div key={stat.name} className="space-y-6 break-after-page">
                  <div className="flex justify-between items-end border-b-2 border-slate-900 pb-4">
                    <h4 className="text-xl font-black text-slate-900 uppercase">Empleado: {stat.name}</h4>
                    <div className="text-right">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Acciones:</span>
                      <span className="text-lg font-black text-slate-900 ml-2">{stat.count}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-slate-200 p-6 rounded-3xl">
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Ubicaciones (Carros)</h5>
                      <p className="text-3xl font-black text-indigo-600">{stat.ubicationsCount}</p>
                    </div>
                    <div className="border border-slate-200 p-6 rounded-3xl">
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Regularizaciones (Manual)</h5>
                      <p className="text-3xl font-black text-amber-500">{stat.adjustmentsCount}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h5 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Detalle de Operaciones:</h5>
                    <table className="w-full text-left text-[9px]">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-400 uppercase font-black">
                          <th className="py-2">Fecha</th>
                          <th className="py-2">Carro / Motivo</th>
                          <th className="py-2">Hueco</th>
                          <th className="py-2 text-right">Ocupación Resultante</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {stat.ubications.concat(stat.adjustments).sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(log => (
                          <tr key={log.id}>
                            <td className="py-2 font-black text-slate-400">{formatDate(log.created_at)}</td>
                            <td className="py-2 font-black text-slate-800">{log.cart_id}</td>
                            <td className="py-2 font-black text-indigo-600">{log.slot_code}</td>
                            <td className="py-2 font-black text-right">{log.new_quantity}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* MODAL IMPORTADOR */}
      {showImporter && (
        <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-[3rem] w-full max-w-lg space-y-4 animate-fade-in shadow-2xl">
            <h3 className="text-xl font-black text-slate-800 uppercase text-center tracking-tight">Importación en Lote</h3>
            <textarea value={rawInput} onChange={e => setRawInput(e.target.value)} placeholder="U01-01-A..." className="w-full h-48 bg-slate-50 border-2 border-slate-100 rounded-3xl p-6 font-mono text-sm outline-none focus:border-indigo-500 transition-all" />
            <div className="flex gap-4 pt-2">
              <button onClick={() => setShowImporter(false)} className="flex-1 py-4 text-slate-400 font-black text-[10px] uppercase tracking-widest">Cancelar</button>
              <button onClick={handleBulkImport} disabled={isProcessing} className="flex-2 bg-indigo-600 text-white px-10 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl disabled:opacity-50">
                {isProcessing ? 'Procesando...' : 'Confirmar Importación'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print\:p-0, .print\:p-0 * { visibility: visible; }
          .print\:p-0 { position: absolute; left: 0; top: 0; width: 100%; }
          .print\:hidden { display: none !important; }
          .print\:shadow-none { box-shadow: none !important; }
          .print\:border-none { border: none !important; }
          .no-scrollbar { overflow: visible !important; }
          @page { margin: 1cm; }
        }
      `}</style>
    </div>
  );
};

export default AdminPanel;
