
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

const AdminPanel: React.FC = () => {
  const [logs, setLogs] = useState<MovementLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
    
    // Suscripción real para ver los logs entrar en vivo
    const channel = supabase
      .channel('logs-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'movement_logs' }, (payload) => {
        setLogs(prev => [payload.new as MovementLog, ...prev].slice(0, 50));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchLogs = async () => {
    const { data, error } = await supabase
      .from('movement_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (data) setLogs(data);
    setLoading(false);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return {
      day: d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }),
      time: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    };
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Resumen de actividad */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Movimientos</p>
          <span className="text-2xl font-black text-slate-800">{logs.length}</span>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado Sistema</p>
          <span className="text-sm font-bold text-emerald-500 flex items-center gap-1">
            <span className="w-2 h-2 bg-emerald-500 rounded-full"></span> ONLINE
          </span>
        </div>
      </div>

      {/* Sección de Trazabilidad */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span>📜</span> Trazabilidad de Movimientos
          </h3>
          <button 
            onClick={fetchLogs}
            className="text-xs bg-white border border-slate-200 px-3 py-1 rounded-lg font-bold hover:bg-slate-50"
          >
            Refrescar
          </button>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-10 text-center text-slate-400">Cargando historial...</div>
          ) : logs.length === 0 ? (
            <div className="p-10 text-center text-slate-400 italic">No hay registros de movimientos todavía.</div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-slate-50/80 text-[10px] uppercase font-black text-slate-500 tracking-wider">
                <tr>
                  <th className="px-6 py-4 text-center">Fecha/Hora</th>
                  <th className="px-6 py-4">Operador</th>
                  <th className="px-6 py-4">Movimiento</th>
                  <th className="px-6 py-4">Capacidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {logs.map((log) => {
                  const date = formatDate(log.created_at);
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col items-center">
                          <span className="font-bold text-slate-700">{date.day}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{date.time}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-[10px] font-black">
                            {log.operator_name.substring(0,2).toUpperCase()}
                          </div>
                          <span className="font-bold text-slate-800">{log.operator_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-400 uppercase font-black tracking-tighter">De Carro {log.cart_id || '?'}</span>
                          <span className="text-indigo-600 font-bold">👉 Hueco {log.slot_code}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
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

      <div className="grid grid-cols-2 gap-4">
        <button className="bg-slate-900 text-white p-4 rounded-3xl font-bold text-sm hover:bg-slate-800 transition-colors flex flex-col items-center gap-2 active:scale-95">
          <span className="text-xl">📊</span>
          Exportar CSV
        </button>
        <button className="bg-white text-slate-900 border-2 border-slate-100 p-4 rounded-3xl font-bold text-sm hover:bg-slate-50 transition-colors flex flex-col items-center gap-2 active:scale-95">
          <span className="text-xl">📍</span>
          Mapa de Calor
        </button>
      </div>
    </div>
  );
};

export default AdminPanel;
