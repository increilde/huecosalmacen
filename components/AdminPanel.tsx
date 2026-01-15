
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

interface OperatorData {
  name: string;
  movements: MovementLog[];
}

const AdminPanel: React.FC = () => {
  const [logs, setLogs] = useState<MovementLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [operators, setOperators] = useState<OperatorData[]>([]);
  
  // Estados para la carga masiva
  const [rawInput, setRawInput] = useState('');
  const [defaultSize, setDefaultSize] = useState('Standard');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showImporter, setShowImporter] = useState(false);

  // Estado para la ficha de hueco rápida
  const [selectedSlot, setSelectedSlot] = useState<WarehouseSlot | null>(null);
  const [updating, setUpdating] = useState(false);

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

  const openSlotInfo = async (code: string) => {
    const { data, error } = await supabase.from('warehouse_slots').select('*').eq('code', code).single();
    if (data) {
      setSelectedSlot(data);
    }
  };

  const updateSlotSize = async (newSize: string) => {
    if (!selectedSlot) return;
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('warehouse_slots')
        .update({ size: newSize })
        .eq('id', selectedSlot.id);
      
      if (error) throw error;
      setSelectedSlot(null);
      alert("Tamaño actualizado correctamente.");
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleBulkImport = async () => {
    const lines = rawInput.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    if (lines.length === 0) return alert("Pega códigos primero.");
    if (!confirm(`Importar ${lines.length} huecos?`)) return;

    setIsProcessing(true);
    try {
      const batchSize = 200;
      for (let i = 0; i < lines.length; i += batchSize) {
        const batch = lines.slice(i, i + batchSize).map(code => ({
          code: code.toUpperCase(),
          status: 'empty',
          is_scanned_once: false,
          size: defaultSize,
          quantity: 0,
          last_updated: new Date().toISOString()
        }));
        await supabase.from('warehouse_slots').upsert(batch, { onConflict: 'code' });
      }
      alert(`✅ ${lines.length} huecos importados.`);
      setRawInput('');
      setShowImporter(false);
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* FICHA RÁPIDA DE HUECO */}
      {selectedSlot && (
        <div className="fixed inset-0 z-[150] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl animate-fade-in">
            <div className="text-center space-y-6">
              <h3 className="text-2xl font-black text-slate-800">Hueco {selectedSlot.code}</h3>
              <div className="grid grid-cols-1 gap-3">
                <p className="text-[10px] font-black text-slate-400 uppercase text-left ml-2">Cambiar Tamaño</p>
                {['Pequeño', 'Mediano', 'Grande', 'Palet'].map((size) => (
                  <button
                    key={size}
                    disabled={updating}
                    onClick={() => updateSlotSize(size)}
                    className={`py-4 rounded-2xl font-black transition-all border-2 ${
                      selectedSlot.size === size ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 border-slate-100 text-slate-600'
                    }`}
                  >
                    {size.toUpperCase()}
                  </button>
                ))}
              </div>
              <button onClick={() => setSelectedSlot(null)} className="text-slate-400 font-bold text-xs uppercase pt-2">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Cabecera */}
      <div className="bg-slate-950 p-6 rounded-[2.5rem] shadow-xl text-white">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight">Panel de Control</h2>
            <p className="text-indigo-400 text-[10px] font-black uppercase">Infraestructura Crítica</p>
          </div>
          <button 
            onClick={() => setShowImporter(!showImporter)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-2xl font-black text-[11px] shadow-lg transition-all"
          >
            {showImporter ? 'CERRAR' : '📥 IMPORTAR HUECOS'}
          </button>
        </div>
      </div>

      {showImporter && (
        <div className="bg-white p-6 rounded-[2.5rem] border-2 border-indigo-100 shadow-2xl animate-fade-in">
          <textarea 
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder="Pega códigos aquí..."
            className="w-full h-64 bg-slate-50 border-2 border-slate-100 rounded-3xl p-5 font-mono text-sm focus:border-indigo-500 outline-none transition-all resize-none"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {['Standard', 'Grande', 'Pequeño', 'Palet'].map(size => (
              <button key={size} onClick={() => setDefaultSize(size)} className={`px-4 py-2 rounded-xl text-[10px] font-black border transition-all ${defaultSize === size ? 'bg-indigo-600 text-white' : 'bg-white'}`}>
                {size.toUpperCase()}
              </button>
            ))}
            <button onClick={handleBulkImport} disabled={isProcessing} className="ml-auto bg-emerald-500 text-white px-6 py-2 rounded-xl font-black text-[10px] uppercase">
              Iniciar Volcado
            </button>
          </div>
        </div>
      )}

      <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm">
        <label className="text-[10px] font-black text-slate-400 uppercase ml-2 block mb-1">Día de Supervisión</label>
        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3 px-4 font-bold text-slate-700 outline-none" />
      </div>

      <section className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
        <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
          <h3 className="text-sm font-black uppercase tracking-widest">Actividad Reciente</h3>
          <span className="bg-white/20 px-4 py-1 rounded-full text-xl font-black">{logs.length}</span>
        </div>
        <div className="max-h-[300px] overflow-y-auto no-scrollbar">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b">
              <tr>
                <th className="px-6 py-4">Operador</th>
                <th className="px-6 py-4">Ruta</th>
                <th className="px-6 py-4 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-xs">{log.operator_name}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-[10px] font-black">
                      <span className="text-amber-600">{log.cart_id}</span>
                      <span className="text-slate-300">➔</span>
                      <button onClick={() => openSlotInfo(log.slot_code)} className="text-indigo-600 hover:underline">{log.slot_code}</button>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-[9px] font-black px-2 py-1 rounded bg-indigo-50 text-indigo-700">{log.new_quantity}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {operators.map((op, idx) => (
          <div key={idx} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-lg overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
              <span className="text-sm font-black text-slate-800">{op.name}</span>
              <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-[10px] font-black">{op.movements.length} MOVS</span>
            </div>
            <div className="p-4 space-y-2 max-h-[250px] overflow-y-auto no-scrollbar">
              {op.movements.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-slate-700">{m.cart_id} ➔</span>
                    <button onClick={() => openSlotInfo(m.slot_code)} className="font-black text-indigo-600 text-[10px] hover:underline">{m.slot_code}</button>
                  </div>
                  <span className="text-[9px] font-black text-slate-400">{m.new_quantity}%</span>
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
