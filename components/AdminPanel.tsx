
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// Lista de huecos extraída de la imagen (Ejemplo parcial - el sistema procesará la lista que pongas aquí)
const MASTER_SLOT_LIST = [
  "U010207E1", "U011010H1", "U011111A2", "U011211B2", "U110110H2", "U110111A1",
  "U010207F1", "U011010J1", "U011111B1", "U011211C1", "U110110J1", "U110111A2",
  "U110010F2", "U110010H1", "U110010J2", "U110110F2", "U110110H1", "U110110J2",
  "U010207G1", "U010208A1", "U010208B1", "U010208C1", "U010208D1", "U010208E1",
  "U010208F1", "U010208G1", "U010208H1", "U010208J1", "U010209A1", "U010209B1",
  "U110408B1", "U110408B2", "U110409A1", "U110409A2", "U110409B1", "U110409B2"
  // ... el botón "Inicializar Todo" usará esta lista para poblar la DB
];

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
  const [operators, setOperators] = useState<OperatorData[]>([]);
  const [initLoading, setInitLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('movement_logs')
        .select('*')
        .gte('created_at', `${selectedDate}T00:00:00`)
        .lte('created_at', `${selectedDate}T23:59:59`)
        .order('created_at', { ascending: false });

      if (data) {
        const realMovements = data.filter(log => log.cart_id && log.cart_id !== 'MANUAL');
        setLogs(realMovements);
        const grouping: Record<string, MovementLog[]> = {};
        realMovements.forEach(log => {
          if (!grouping[log.operator_name]) grouping[log.operator_name] = [];
          grouping[log.operator_name].push(log);
        });
        setOperators(Object.entries(grouping).map(([name, moves]) => ({ name, movements: moves })));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBulkInit = async () => {
    if (!confirm("Esto creará o actualizará todos los huecos maestros. ¿Continuar?")) return;
    setInitLoading(true);
    try {
      const payloads = MASTER_SLOT_LIST.map(code => ({
        code: code,
        status: 'empty',
        is_scanned_once: false,
        size: code.startsWith('U1') ? 'Grande' : 'Standard',
        quantity: 0
      }));

      const { error } = await supabase.from('warehouse_slots').upsert(payloads, { onConflict: 'code' });
      if (error) throw error;
      alert("✅ Almacén inicializado con éxito.");
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setInitLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <div className="bg-indigo-900 p-6 rounded-[2.5rem] shadow-xl text-white">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-black uppercase">Gestión de Inventario</h2>
            <p className="text-indigo-300 text-[10px] font-bold">CONTROL MAESTRO DE HUECOS</p>
          </div>
          <button 
            onClick={handleBulkInit} 
            disabled={initLoading}
            className="bg-white text-indigo-900 px-6 py-3 rounded-2xl font-black text-[11px] shadow-lg active:scale-95 transition-all disabled:opacity-50"
          >
            {initLoading ? 'PROCESANDO...' : 'INICIALIZAR HUECOS MAESTROS'}
          </button>
        </div>
      </div>

      <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="flex-1 w-full">
          <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Día de Consulta</label>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3 px-4 focus:border-indigo-500 font-bold text-slate-700 outline-none" />
        </div>
      </div>

      <section className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
        <div className="p-6 bg-slate-50 flex justify-between items-center border-b">
          <h3 className="text-xs font-black uppercase text-slate-800">Ubicaciones Globales Hoy</h3>
          <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-[10px] font-black">{logs.length}</span>
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 font-black text-slate-400 uppercase">
              <tr>
                <th className="px-6 py-4">Operador</th>
                <th className="px-6 py-4">Carro ➔ Hueco</th>
                <th className="px-6 py-4 text-center">Carga</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-bold">{log.operator_name}</td>
                  <td className="px-6 py-4">
                    <span className="font-black text-amber-600">{log.cart_id}</span> ➔ <span className="font-black text-indigo-600">{log.slot_code}</span>
                  </td>
                  <td className="px-6 py-4 text-center font-black">{log.new_quantity}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {operators.map((op, idx) => (
          <div key={idx} className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b flex justify-between items-center">
              <span className="font-black text-slate-700 text-sm uppercase">{op.name}</span>
              <span className="text-[10px] font-black text-indigo-600">{op.movements.length} Movs</span>
            </div>
            <div className="p-4 space-y-2">
              {op.movements.map(m => (
                <div key={m.id} className="text-[10px] font-bold text-slate-500 flex justify-between">
                  <span>{m.cart_id} ➔ {m.slot_code}</span>
                  <span className="text-indigo-400">{m.new_quantity}%</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};

export default AdminPanel;
