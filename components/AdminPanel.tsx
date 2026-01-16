
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { WarehouseSlot } from '../types';

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
  ubications: MovementLog[];
  adjustments: MovementLog[];
}

const AdminPanel: React.FC = () => {
  const [loading, setLoading] = useState(true);
  
  // Filtros
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [searchOperator, setSearchOperator] = useState('all');
  const [searchCart, setSearchCart] = useState('');

  // Datos
  const [allLogs, setAllLogs] = useState<MovementLog[]>([]);
  const [operatorsList, setOperatorsList] = useState<string[]>([]);
  const [dailyStats, setDailyStats] = useState<OperatorStats[]>([]);
  
  const [selectedSlot, setSelectedSlot] = useState<WarehouseSlot | null>(null);
  const [showImporter, setShowImporter] = useState(false);
  const [rawInput, setRawInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchData();
  }, [dateFrom, dateTo]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Obtener todos los logs en el rango
      const { data: logs } = await supabase
        .from('movement_logs')
        .select('*')
        .gte('created_at', `${dateFrom}T00:00:00`)
        .lte('created_at', `${dateTo}T23:59:59`)
        .order('created_at', { ascending: false });

      if (logs) {
        setAllLogs(logs);
        
        // 2. Extraer lista única de operadores para el desplegable
        const names = Array.from(new Set(logs.map(l => l.operator_name)));
        setOperatorsList(names);

        // 3. Calcular estadísticas diarias (solo hoy) para las tarjetas superiores
        const today = new Date().toISOString().split('T')[0];
        const todayLogs = logs.filter(l => l.created_at.startsWith(today));
        
        const grouping: Record<string, OperatorStats> = {};
        todayLogs.forEach(log => {
          if (!grouping[log.operator_name]) {
            grouping[log.operator_name] = { name: log.operator_name, count: 0, ubications: [], adjustments: [] };
          }
          grouping[log.operator_name].count++;
          if (log.cart_id && log.cart_id !== 'MANUAL') {
            grouping[log.operator_name].ubications.push(log);
          } else {
            grouping[log.operator_name].adjustments.push(log);
          }
        });
        setDailyStats(Object.values(grouping));
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // Lógica de filtrado para la tabla principal
  const filteredLogs = allLogs.filter(log => {
    const matchOp = searchOperator === 'all' || log.operator_name === searchOperator;
    const matchCart = searchCart === '' || log.cart_id.toLowerCase().includes(searchCart.toLowerCase());
    return matchOp && matchCart;
  });

  const handleBulkImport = async () => {
    const lines = rawInput.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    if (lines.length === 0) return alert("Pega códigos.");
    setIsProcessing(true);
    try {
      const batch = lines.map(code => ({
        code: code.toUpperCase(), status: 'empty', is_scanned_once: false, size: 'Standard', quantity: 0, last_updated: new Date().toISOString()
      }));
      await supabase.from('warehouse_slots').upsert(batch, { onConflict: 'code' });
      alert(`✅ ${lines.length} importados.`);
      setRawInput('');
      setShowImporter(false);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      {/* 1. TARJETAS DE EMPLEADOS (OPERACIONES HOY) */}
      <section className="space-y-4">
        <div className="flex justify-between items-end px-2">
          <div>
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Rendimiento Hoy</h3>
            <p className="text-2xl font-black text-slate-800 tracking-tight">Actividad en Tiempo Real</p>
          </div>
          <button onClick={() => setShowImporter(!showImporter)} className="text-[9px] font-black bg-slate-900 text-white px-4 py-2 rounded-xl uppercase tracking-widest shadow-lg">📥 Importar Huecos</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {dailyStats.map(stat => (
            <div key={stat.name} className="bg-white p-5 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black">{stat.name[0]}</div>
                <div>
                  <h4 className="text-xs font-black text-slate-800 leading-none">{stat.name}</h4>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Hoy</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 p-2 rounded-xl text-center">
                  <p className="text-[7px] font-black text-slate-400 uppercase">Ops</p>
                  <p className="text-lg font-black text-slate-800">{stat.count}</p>
                </div>
                <div className="bg-indigo-50 p-2 rounded-xl text-center">
                  <p className="text-[7px] font-black text-indigo-400 uppercase">Ubis</p>
                  <p className="text-lg font-black text-indigo-700">{stat.ubications.length}</p>
                </div>
              </div>
            </div>
          ))}
          {dailyStats.length === 0 && (
            <div className="col-span-full py-8 text-center bg-white border-2 border-dashed border-slate-100 rounded-[2.5rem] text-slate-300 font-black text-[10px] uppercase tracking-widest">
              Sin actividad hoy todavía
            </div>
          )}
        </div>
      </section>

      {/* 2. PANEL DE FILTROS AVANZADOS */}
      <section className="bg-slate-950 p-6 rounded-[3rem] shadow-2xl text-white space-y-6">
        <div className="flex items-center gap-3">
          <span className="text-xl">🔍</span>
          <h3 className="text-lg font-black uppercase tracking-tight">Filtros de Búsqueda</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <label className="text-[8px] font-black text-indigo-300 uppercase tracking-widest ml-2">Desde</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full bg-white/10 border-none rounded-2xl px-4 py-3 text-[10px] font-black text-white outline-none ring-1 ring-white/10 focus:ring-indigo-500" />
          </div>
          <div className="space-y-1">
            <label className="text-[8px] font-black text-indigo-300 uppercase tracking-widest ml-2">Hasta</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full bg-white/10 border-none rounded-2xl px-4 py-3 text-[10px] font-black text-white outline-none ring-1 ring-white/10 focus:ring-indigo-500" />
          </div>
          <div className="space-y-1">
            <label className="text-[8px] font-black text-indigo-300 uppercase tracking-widest ml-2">Operador</label>
            <select 
              value={searchOperator} 
              onChange={e => setSearchOperator(e.target.value)}
              className="w-full bg-white/10 border-none rounded-2xl px-4 py-3 text-[10px] font-black text-white outline-none ring-1 ring-white/10 focus:ring-indigo-500 appearance-none"
            >
              <option value="all" className="text-slate-900">TODOS</option>
              {operatorsList.map(name => <option key={name} value={name} className="text-slate-900">{name.toUpperCase()}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[8px] font-black text-indigo-300 uppercase tracking-widest ml-2">Nº de Carro</label>
            <input 
              type="text" 
              placeholder="Ej: C12..." 
              value={searchCart} 
              onChange={e => setSearchCart(e.target.value)}
              className="w-full bg-white/10 border-none rounded-2xl px-4 py-3 text-[10px] font-black text-white outline-none ring-1 ring-white/10 focus:ring-indigo-500 placeholder:text-white/20"
            />
          </div>
        </div>
      </section>

      {showImporter && (
        <div className="bg-white p-6 rounded-[2.5rem] border-2 border-indigo-100 shadow-2xl animate-fade-in">
          <textarea value={rawInput} onChange={e => setRawInput(e.target.value)} placeholder="Pega códigos aquí..." className="w-full h-32 bg-slate-50 border-2 border-slate-100 rounded-3xl p-5 font-mono text-sm" />
          <button onClick={handleBulkImport} disabled={isProcessing} className="mt-3 w-full bg-indigo-600 text-white font-black py-4 rounded-2xl uppercase text-[10px] tracking-widest">PROCESAR IMPORTACIÓN</button>
        </div>
      )}

      {/* 3. TABLA UNIFICADA DE MOVIMIENTOS */}
      <section className="bg-white rounded-[3rem] border border-slate-100 shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Historial de Movimientos ({filteredLogs.length})</h3>
          <div className="flex gap-2">
            <span className="w-3 h-3 bg-indigo-500 rounded-full animate-pulse"></span>
            <span className="text-[10px] font-black text-slate-400 uppercase">Live</span>
          </div>
        </div>
        
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[8px] font-black text-slate-400 uppercase tracking-widest">
              <tr>
                <th className="px-8 py-5">Fecha / Hora</th>
                <th className="px-8 py-5">Operador</th>
                <th className="px-8 py-5">Nº Carro</th>
                <th className="px-8 py-5">Hueco</th>
                <th className="px-8 py-5 text-right">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-8 py-5 text-[10px] font-black text-slate-400">{formatDate(log.created_at)}</td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-slate-100 rounded-lg flex items-center justify-center text-[9px] font-black">{log.operator_name[0]}</div>
                      <span className="text-[11px] font-black text-slate-700">{log.operator_name}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className={`text-[9px] font-black px-3 py-1 rounded-lg ${log.cart_id === 'MANUAL' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-50 text-indigo-700'}`}>
                      {log.cart_id}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <span className="text-[11px] font-black text-slate-800 font-mono tracking-tighter bg-slate-100 px-2 py-1 rounded-md">{log.slot_code}</span>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${log.new_quantity > 0 ? 'bg-indigo-500' : 'bg-rose-400'}`} style={{ width: `${log.new_quantity}%` }} />
                      </div>
                      <span className="text-[10px] font-black text-slate-800">{log.new_quantity}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <div className="text-4xl mb-3 opacity-20">📭</div>
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No hay datos que coincidan con los filtros</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default AdminPanel;
