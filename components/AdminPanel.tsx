
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

interface MovementLog {
  id: string;
  operator_name: string;
  cart_id: string;
  slot_code: string;
  new_status: string;
  new_quantity: number;
  created_at: string;
}

interface Productivity {
  name: string;
  count: number;
}

const AdminPanel: React.FC = () => {
  const [logs, setLogs] = useState<MovementLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchCart, setSearchCart] = useState('');
  const [operatorStats, setOperatorStats] = useState<Productivity[]>([]);

  useEffect(() => {
    fetchData();
    
    // Suscripción para actualizaciones en vivo
    const channel = supabase
      .channel('admin-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'movement_logs' }, () => {
        fetchData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedDate, searchCart]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('movement_logs')
        .select('*')
        .order('created_at', { ascending: false });

      // Filtro por fecha (día completo)
      if (!searchCart) {
        query = query
          .gte('created_at', `${selectedDate}T00:00:00`)
          .lte('created_at', `${selectedDate}T23:59:59`);
      }

      // Filtro por buscador de carro
      if (searchCart) {
        query = query.ilike('cart_id', `%${searchCart}%`);
      }

      const { data, error } = await query;
      
      if (data) {
        setLogs(data);
        calculateStats(data);
      }
    } catch (err) {
      console.error("Error fetching admin data:", err);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (data: MovementLog[]) => {
    const statsMap: Record<string, number> = {};
    data.forEach(log => {
      statsMap[log.operator_name] = (statsMap[log.operator_name] || 0) + 1;
    });
    const statsArray = Object.entries(statsMap).map(([name, count]) => ({ name, count }));
    setOperatorStats(statsArray.sort((a, b) => b.count - a.count));
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return {
      day: d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }),
      time: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    };
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Controles Superiores */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
        <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
          <span>🔍</span> Filtros de Auditoría
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Seleccionar Día</label>
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setSearchCart(''); // Limpiar búsqueda si cambia fecha
              }}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl py-2 px-4 focus:border-indigo-500 outline-none transition-all font-bold text-slate-700"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Buscador de Carro / Lote</label>
            <div className="relative">
              <input 
                type="text" 
                placeholder="Ej: CAR-001..."
                value={searchCart}
                onChange={(e) => setSearchCart(e.target.value.toUpperCase())}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl py-2 px-4 focus:border-indigo-500 outline-none transition-all font-bold text-slate-700 uppercase"
              />
              {searchCart && (
                <button onClick={() => setSearchCart('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">✕</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Resumen de Productividad por Empleado */}
      {!searchCart && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {operatorStats.length > 0 ? operatorStats.map((stat, idx) => (
            <div key={idx} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group hover:border-indigo-200 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-black">
                  {stat.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-black text-slate-800">{stat.name}</p>
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Operador</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-indigo-600">{stat.count}</span>
                <p className="text-[9px] text-slate-400 font-bold uppercase">Ubicaciones</p>
              </div>
            </div>
          )) : (
            <div className="col-span-full bg-slate-50 border-2 border-dashed border-slate-200 p-6 rounded-3xl text-center text-slate-400 text-sm">
              Sin actividad registrada para este día
            </div>
          )}
        </div>
      )}

      {/* Listado de Trazabilidad */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span>{searchCart ? '📦 Resultado Búsqueda Carro' : '📜 Movimientos del Día'}</span>
          </h3>
          <span className="px-3 py-1 bg-white border border-slate-200 rounded-full text-[10px] font-black text-slate-500">
            {logs.length} REGISTROS
          </span>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-10 text-center text-slate-400 flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs font-bold uppercase tracking-widest">Sincronizando...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-20 text-center text-slate-300 italic flex flex-col items-center gap-4">
              <span className="text-5xl opacity-20">🔎</span>
              <p>No se encontraron movimientos con los filtros actuales.</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 text-[10px] uppercase font-black text-slate-500 tracking-wider">
                <tr>
                  <th className="px-6 py-4">Fecha/Hora</th>
                  <th className="px-6 py-4">Operador</th>
                  <th className="px-6 py-4">Origen (Carro)</th>
                  <th className="px-6 py-4">Destino (Hueco)</th>
                  <th className="px-6 py-4 text-center">Estado Final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {logs.map((log) => {
                  const date = formatDate(log.created_at);
                  return (
                    <tr key={log.id} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-700">{date.day}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{date.time}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center text-[9px] font-black">
                            {log.operator_name.substring(0,2).toUpperCase()}
                          </div>
                          <span className="font-bold text-slate-800 truncate max-w-[120px]">{log.operator_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded-lg text-xs font-black border border-amber-100">
                          {log.cart_id}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg text-xs font-black border border-indigo-100">
                          {log.slot_code}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${
                          log.new_quantity === 0 ? 'bg-emerald-100 text-emerald-700' : 
                          log.new_quantity === 50 ? 'bg-amber-100 text-amber-700' : 
                          'bg-indigo-100 text-indigo-700'
                        }`}>
                          {log.new_quantity}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="flex justify-center gap-4">
        <button 
          onClick={() => window.print()}
          className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-bold text-sm hover:bg-slate-800 transition-colors flex items-center gap-2 active:scale-95"
        >
          <span>🖨️</span> Imprimir Reporte
        </button>
      </div>
    </div>
  );
};

export default AdminPanel;
