
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
  ubications: MovementLog[];
  adjustments: MovementLog[];
}

const AdminPanel: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [operators, setOperators] = useState<OperatorStats[]>([]);
  const [selectedOperator, setSelectedOperator] = useState<OperatorStats | null>(null);
  const [viewMode, setViewMode] = useState<'ubications' | 'adjustments'>('ubications');
  
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
        const grouping: Record<string, { ubi: MovementLog[], adj: MovementLog[] }> = {};
        
        data.forEach(log => {
          if (!grouping[log.operator_name]) grouping[log.operator_name] = { ubi: [], adj: [] };
          
          // Consideramos "Regularización" si no hay carro o es MANUAL
          const isAdjustment = !log.cart_id || log.cart_id === 'MANUAL';
          if (isAdjustment) {
            grouping[log.operator_name].adj.push(log);
          } else {
            grouping[log.operator_name].ubi.push(log);
          }
        });

        const stats = Object.entries(grouping).map(([name, data]) => ({
          name,
          ubications: data.ubi,
          adjustments: data.adj
        }));
        
        setOperators(stats);
        // Si hay un operario seleccionado, actualizar sus datos localmente
        if (selectedOperator) {
          const updated = stats.find(s => s.name === selectedOperator.name);
          if (updated) setSelectedOperator(updated);
        }
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
      {/* MODAL DE FICHA */}
      {selectedSlot && (
        <div className="fixed inset-0 z-[150] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 shadow-2xl animate-fade-in">
            <div className="text-center space-y-6">
              <h3 className="text-2xl font-black text-slate-800 tracking-tight">Hueco {selectedSlot.code}</h3>
              <div className="grid grid-cols-1 gap-2">
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
                <button onClick={deleteSlot} className="w-full py-4 bg-rose-50 text-rose-600 rounded-2xl font-black text-xs uppercase tracking-widest">BORRAR</button>
                <button onClick={() => setSelectedSlot(null)} className="text-slate-400 font-bold text-xs uppercase pt-2 block mx-auto">Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CABECERA */}
      <div className="bg-slate-950 p-6 rounded-[2.5rem] shadow-xl text-white flex justify-between items-center">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight">Administración</h2>
          <p className="text-indigo-400 text-[10px] font-black uppercase tracking-widest">Control Operativo</p>
        </div>
        <div className="flex gap-2">
           <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-white/10 border-none rounded-xl px-4 py-2 text-[10px] font-black text-white outline-none" />
           <button onClick={() => setShowImporter(!showImporter)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase shadow-lg">📥 IMPORTAR</button>
        </div>
      </div>

      {showImporter && (
        <div className="bg-white p-6 rounded-[2.5rem] border-2 border-indigo-100 shadow-2xl animate-fade-in">
          <textarea 
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder="Códigos (uno por línea)..."
            className="w-full h-32 bg-slate-50 border-2 border-slate-100 rounded-3xl p-5 font-mono text-sm outline-none"
          />
          <div className="mt-4 flex justify-between items-center">
            <div className="flex gap-1">
              {['Standard', 'Grande', 'Pequeño'].map(size => (
                <button key={size} onClick={() => setDefaultSize(size)} className={`px-3 py-1.5 rounded-lg text-[9px] font-black border transition-all ${defaultSize === size ? 'bg-indigo-600 text-white' : 'bg-white'}`}>
                  {size.toUpperCase()}
                </button>
              ))}
            </div>
            <button onClick={handleBulkImport} disabled={isProcessing} className="bg-emerald-500 text-white px-6 py-2 rounded-xl font-black text-[10px] uppercase">VOLCAR</button>
          </div>
        </div>
      )}

      {/* TARJETAS DE EMPLEADOS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {operators.map((op) => (
          <button 
            key={op.name}
            onClick={() => { setSelectedOperator(op); setViewMode('ubications'); }}
            className={`p-6 rounded-[2.5rem] bg-white border-2 text-left transition-all hover:shadow-xl active:scale-95 ${selectedOperator?.name === op.name ? 'border-indigo-500 ring-4 ring-indigo-50' : 'border-slate-100'}`}
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white font-black text-lg">
                {op.name[0]}
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-800 leading-none mb-1">{op.name}</h4>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Activo hoy</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-indigo-50 p-3 rounded-2xl">
                <p className="text-[8px] font-black text-indigo-400 uppercase tracking-tighter mb-1">Ubicaciones</p>
                <p className="text-xl font-black text-indigo-700">{op.ubications.length}</p>
              </div>
              <div className="bg-amber-50 p-3 rounded-2xl">
                <p className="text-[8px] font-black text-amber-400 uppercase tracking-tighter mb-1">Ajustes</p>
                <p className="text-xl font-black text-amber-700">{op.adjustments.length}</p>
              </div>
            </div>
          </button>
        ))}
        {operators.length === 0 && !loading && (
          <div className="col-span-full py-12 text-center text-slate-300 font-black uppercase text-xs border-2 border-dashed border-slate-100 rounded-[2.5rem]">
            No hay actividad hoy
          </div>
        )}
      </div>

      {/* DETALLE DEL OPERARIO SELECCIONADO */}
      {selectedOperator && (
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl overflow-hidden animate-fade-in">
          <div className="p-6 bg-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-500 p-2 rounded-xl text-xs font-black">DETALLE</div>
              <h3 className="font-black text-sm uppercase tracking-widest">{selectedOperator.name}</h3>
            </div>
            
            <div className="flex bg-white/10 p-1 rounded-2xl">
              <button 
                onClick={() => setViewMode('ubications')}
                className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${viewMode === 'ubications' ? 'bg-white text-slate-900 shadow-lg' : 'text-white'}`}
              >
                📦 Ubicaciones ({selectedOperator.ubications.length})
              </button>
              <button 
                onClick={() => setViewMode('adjustments')}
                className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${viewMode === 'adjustments' ? 'bg-white text-slate-900 shadow-lg' : 'text-white'}`}
              >
                🔧 Regularizaciones ({selectedOperator.adjustments.length})
              </button>
            </div>
          </div>

          <div className="max-h-[500px] overflow-y-auto no-scrollbar">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-slate-50 text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <tr>
                  <th className="px-8 py-4">Hora</th>
                  <th className="px-8 py-4">{viewMode === 'ubications' ? 'Carro' : 'Tipo'}</th>
                  <th className="px-8 py-4">Hueco</th>
                  <th className="px-8 py-4 text-right">Ocupación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(viewMode === 'ubications' ? selectedOperator.ubications : selectedOperator.adjustments).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-4 text-[10px] font-bold text-slate-400">
                      {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-8 py-4">
                      <span className={`text-[10px] font-black px-3 py-1 rounded-lg ${viewMode === 'ubications' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
                        {viewMode === 'ubications' ? log.cart_id : 'MANUAL'}
                      </span>
                    </td>
                    <td className="px-8 py-4">
                      <button onClick={() => openSlotInfo(log.slot_code)} className="text-[11px] font-black text-slate-700 hover:text-indigo-600 underline decoration-indigo-200 underline-offset-4">
                        {log.slot_code}
                      </button>
                    </td>
                    <td className="px-8 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                         <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                           <div className="h-full bg-indigo-500" style={{ width: `${log.new_quantity}%` }} />
                         </div>
                         <span className="text-[10px] font-black text-slate-800">{log.new_quantity}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(viewMode === 'ubications' ? selectedOperator.ubications : selectedOperator.adjustments).length === 0 && (
              <div className="p-12 text-center text-slate-300 font-black uppercase text-[10px] tracking-widest">
                Sin registros en esta categoría
              </div>
            )}
          </div>
          
          <div className="p-4 bg-slate-50 flex justify-center">
            <button onClick={() => setSelectedOperator(null)} className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">Cerrar Detalle</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
