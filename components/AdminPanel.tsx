
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
  
  const [rawInput, setRawInput] = useState('');
  const [defaultSize, setDefaultSize] = useState('Standard');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showImporter, setShowImporter] = useState(false);

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
    const { data } = await supabase.from('warehouse_slots').select('*').eq('code', code).single();
    if (data) setSelectedSlot(data);
  };

  const updateSlotSize = async (newSize: string) => {
    if (!selectedSlot) return;
    setUpdating(true);
    try {
      await supabase.from('warehouse_slots').update({ size: newSize }).eq('id', selectedSlot.id);
      setSelectedSlot(null);
      alert("Tamaño actualizado.");
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setUpdating(false);
    }
  };

  const deleteSlot = async () => {
    if (!selectedSlot) return;
    if (!confirm(`¿Eliminar permanentemente ${selectedSlot.code}?`)) return;
    setUpdating(true);
    try {
      await supabase.from('warehouse_slots').delete().eq('id', selectedSlot.id);
      setSelectedSlot(null);
      alert("Hueco borrado.");
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleBulkImport = async () => {
    const lines = rawInput.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    if (lines.length === 0) return alert("Pega códigos.");
    setIsProcessing(true);
    try {
      const batchSize = 200;
      for (let i = 0; i < lines.length; i += batchSize) {
        const batch = lines.slice(i, i + batchSize).map(code => ({
          code: code.toUpperCase(), status: 'empty', is_scanned_once: false, size: defaultSize, quantity: 0, last_updated: new Date().toISOString()
        }));
        await supabase.from('warehouse_slots').upsert(batch, { onConflict: 'code' });
      }
      alert(`✅ ${lines.length} importados.`);
      setRawInput('');
      setShowImporter(false);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* MODAL DE FICHA (CON ELIMINAR) */}
      {selectedSlot && (
        <div className="fixed inset-0 z-[150] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl animate-fade-in">
            <div className="text-center space-y-6">
              <h3 className="text-2xl font-black text-slate-800 tracking-tight">Hueco {selectedSlot.code}</h3>
              
              <div className="grid grid-cols-1 gap-2">
                <p className="text-[10px] font-black text-slate-400 uppercase text-left ml-2">Cambiar Tamaño</p>
                {['Pequeño', 'Mediano', 'Grande', 'Palet'].map((size) => (
                  <button
                    key={size}
                    onClick={() => updateSlotSize(size)}
                    className={`py-3.5 rounded-2xl font-black text-xs border-2 transition-all ${
                      selectedSlot.size === size ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-100'
                    }`}
                  >
                    {size.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="pt-4 space-y-3">
                <button onClick={deleteSlot} className="w-full py-4 bg-rose-50 text-rose-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-100">
                  BORRAR DEFINITIVAMENTE
                </button>
                <button onClick={() => setSelectedSlot(null)} className="text-slate-400 font-bold text-xs uppercase pt-2 block mx-auto tracking-widest">Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CABECERA */}
      <div className="bg-slate-950 p-6 rounded-[2.5rem] shadow-xl text-white flex justify-between items-center">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight">Administración</h2>
          <p className="text-indigo-400 text-[10px] font-black uppercase">Gestión de Inventario Crítico</p>
        </div>
        <button onClick={() => setShowImporter(!showImporter)} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-[11px] shadow-lg">
          {showImporter ? 'CERRAR' : '📥 IMPORTAR'}
        </button>
      </div>

      {showImporter && (
        <div className="bg-white p-6 rounded-[2.5rem] border-2 border-indigo-100 shadow-2xl animate-fade-in">
          <textarea 
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder="Pega códigos aquí (uno por línea)..."
            className="w-full h-48 bg-slate-50 border-2 border-slate-100 rounded-3xl p-5 font-mono text-sm outline-none resize-none"
          />
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <span className="text-[10px] font-black text-slate-400 uppercase mr-2">Tamaño Lote:</span>
            {['Standard', 'Grande', 'Pequeño', 'Palet'].map(size => (
              <button key={size} onClick={() => setDefaultSize(size)} className={`px-4 py-2 rounded-xl text-[10px] font-black border transition-all ${defaultSize === size ? 'bg-indigo-600 text-white' : 'bg-white'}`}>
                {size.toUpperCase()}
              </button>
            ))}
            <button onClick={handleBulkImport} disabled={isProcessing} className="ml-auto bg-emerald-500 text-white px-6 py-2 rounded-xl font-black text-[10px] uppercase shadow-lg shadow-emerald-100">
              INICIAR VOLCADO
            </button>
          </div>
        </div>
      )}

      {/* ACTIVIDAD */}
      <section className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
        <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
          <h3 className="text-sm font-black uppercase tracking-widest tracking-tight">Historial Diario</h3>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-white/10 border-none rounded-xl px-3 py-1 text-xs font-black text-white outline-none" />
        </div>
        <div className="max-h-[400px] overflow-y-auto no-scrollbar">
          <table className="w-full text-left">
            <tbody className="divide-y divide-slate-50">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-black text-slate-800">{log.operator_name}</span>
                      <span className="text-[9px] text-slate-400 font-bold">{new Date(log.created_at).toLocaleTimeString()}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-600 font-black text-[10px]">{log.cart_id}</span>
                      <span className="text-slate-300">➔</span>
                      <button onClick={() => openSlotInfo(log.slot_code)} className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg font-black text-[10px] hover:bg-indigo-100 transition-all">
                        {log.slot_code}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-[9px] font-black px-2 py-1 rounded bg-slate-100 text-slate-500">{log.new_quantity}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default AdminPanel;
