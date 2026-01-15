
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

interface OperatorData {
  name: string;
  movements: MovementLog[];
}

const AdminPanel: React.FC = () => {
  const [logs, setLogs] = useState<MovementLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchCart, setSearchCart] = useState('');
  const [operators, setOperators] = useState<OperatorData[]>([]);

  useEffect(() => {
    fetchData();
    
    const channel = supabase
      .channel('admin-realtime')
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

      // Filtrar por fecha
      query = query
        .gte('created_at', `${selectedDate}T00:00:00`)
        .lte('created_at', `${selectedDate}T23:59:59`);

      // Filtrar por búsqueda si existe
      if (searchCart) {
        query = query.ilike('cart_id', `%${searchCart}%`);
      }

      const { data, error } = await query;
      
      if (data) {
        // Filtramos solo los movimientos reales (Carro + Hueco)
        const realMovements = data.filter(log => log.cart_id && log.cart_id !== 'MANUAL');
        setLogs(realMovements);
        
        // Agrupar por operador
        const grouping: Record<string, MovementLog[]> = {};
        realMovements.forEach(log => {
          if (!grouping[log.operator_name]) grouping[log.operator_name] = [];
          grouping[log.operator_name].push(log);
        });

        const opsArray = Object.entries(grouping).map(([name, moves]) => ({
          name,
          movements: moves
        }));
        
        setOperators(opsArray.sort((a, b) => b.movements.length - a.movements.length));
      }
    } catch (err) {
      console.error("Error fetching admin data:", err);
    } finally {
      setLoading(false);
    }
  };

  const getTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Filtros de Control */}
      <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="flex-1 w-full">
          <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Día de Consulta</label>
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3 px-4 focus:border-indigo-500 font-bold text-slate-700 outline-none transition-all"
          />
        </div>
        <div className="flex-1 w-full">
          <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Filtrar por Carro</label>
          <input 
            type="text" 
            placeholder="Ej: CAR-99..."
            value={searchCart}
            onChange={(e) => setSearchCart(e.target.value.toUpperCase())}
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3 px-4 focus:border-indigo-500 font-bold text-slate-700 outline-none transition-all uppercase"
          />
        </div>
      </div>

      {/* TARJETA 1: Movimientos Globales del Día */}
      <section className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
        <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
          <div>
            <h3 className="text-lg font-black uppercase tracking-tight">Movimientos Globales Hoy</h3>
            <p className="text-indigo-200 text-xs font-bold">Relación Carro ↔ Ubicación</p>
          </div>
          <div className="bg-white/20 px-4 py-2 rounded-2xl backdrop-blur-md border border-white/10">
            <span className="text-2xl font-black">{logs.length}</span>
          </div>
        </div>

        <div className="max-h-[400px] overflow-y-auto no-scrollbar">
          {logs.length === 0 ? (
            <div className="p-12 text-center text-slate-400 italic">No hay movimientos de carros registrados hoy.</div>
          ) : (
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4">Hora</th>
                  <th className="px-6 py-4">Operador</th>
                  <th className="px-6 py-4">Carro ➔ Hueco</th>
                  <th className="px-6 py-4 text-center">Carga</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="px-6 py-4 text-xs font-mono text-slate-400">{getTime(log.created_at)}</td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-700">{log.operator_name}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded-lg border border-amber-100 text-[10px] font-black">{log.cart_id}</span>
                        <span className="text-slate-300">➔</span>
                        <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg border border-indigo-100 text-[10px] font-black">{log.slot_code}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`text-[10px] font-black px-3 py-1 rounded-full ${
                        log.new_quantity === 100 ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {log.new_quantity}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* TARJETAS POR TRABAJADOR */}
      <section className="space-y-4">
        <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest ml-4">Productividad por Trabajador</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {operators.length === 0 ? (
            <div className="col-span-full py-12 text-center bg-slate-100 rounded-[2rem] border-2 border-dashed border-slate-200">
              <p className="text-slate-400 text-sm font-bold">Sin actividad de empleados hoy</p>
            </div>
          ) : (
            operators.map((op, idx) => (
              <div key={idx} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-lg overflow-hidden flex flex-col">
                <div className="p-5 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-800 rounded-2xl flex items-center justify-center text-white font-black text-sm">
                      {op.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800">{op.name}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Operador</p>
                    </div>
                  </div>
                  <div className="bg-indigo-600 text-white px-3 py-1 rounded-full text-[10px] font-black">
                    {op.movements.length} CARROS
                  </div>
                </div>
                
                <div className="p-4 flex-1 space-y-2 max-h-[300px] overflow-y-auto no-scrollbar bg-white">
                  {op.movements.map((m) => (
                    <div key={m.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 font-mono">{getTime(m.created_at)}</span>
                        <div className="flex items-center gap-1">
                          <span className="font-black text-slate-700 text-xs">{m.cart_id}</span>
                          <span className="text-slate-300">➔</span>
                          <span className="font-black text-indigo-600 text-xs">{m.slot_code}</span>
                        </div>
                      </div>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-md ${
                        m.new_quantity === 100 ? 'bg-indigo-600 text-white' : 'bg-amber-500 text-white'
                      }`}>
                        {m.new_quantity}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};

export default AdminPanel;
