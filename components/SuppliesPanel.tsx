
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { WarehouseSupply, WarehouseSupplyLog, UserProfile } from '../types';

const SuppliesPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'reports'>('inventory');
  const [supplies, setSupplies] = useState<WarehouseSupply[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSupplyModal, setShowSupplyModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  // Estados para historial y ajuste
  const [selectedSupplyForLog, setSelectedSupplyForLog] = useState<WarehouseSupply | null>(null);
  const [activeLogs, setActiveLogs] = useState<WarehouseSupplyLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [supplyAction, setSupplyAction] = useState<{item: WarehouseSupply, delta: number} | null>(null);
  const [actionComment, setActionComment] = useState('');

  // Estados para Informes
  const today = new Date().toISOString().split('T')[0];
  const [reportFrom, setReportFrom] = useState(today);
  const [reportTo, setReportTo] = useState(today);
  const [reportCategory, setReportCategory] = useState('TODAS');
  const [groupedLogs, setGroupedLogs] = useState<Record<string, { supply: WarehouseSupply, logs: WarehouseSupplyLog[] }>>({});

  const [supplyForm, setSupplyForm] = useState({
    name: '',
    category: 'VARIOS',
    quantity: 0,
    min_quantity: 5,
    unit: 'unidades'
  });

  useEffect(() => {
    const savedUser = localStorage.getItem('wh_user');
    if (savedUser) setCurrentUser(JSON.parse(savedUser));
    fetchSupplies();
  }, []);

  useEffect(() => {
    if (activeTab === 'reports') {
      fetchReportData();
    }
  }, [activeTab, reportFrom, reportTo, reportCategory]);

  const fetchSupplies = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('warehouse_supplies').select('*').order('name');
      setSupplies(data || []);
    } catch (err) {
      console.error("Error fetching supplies:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchReportData = async () => {
    setLoadingLogs(true);
    try {
      // 1. Obtener los suministros (filtrados por categoría si aplica)
      let query = supabase.from('warehouse_supplies').select('*');
      if (reportCategory !== 'TODAS') {
        query = query.eq('category', reportCategory);
      }
      const { data: items } = await query;
      
      if (!items) return;

      const itemIds = items.map(i => i.id);

      // 2. Obtener los logs para esos suministros en el rango de fechas
      const { data: logs } = await supabase
        .from('warehouse_supply_logs')
        .select('*')
        .in('supply_id', itemIds)
        .gte('created_at', `${reportFrom}T00:00:00`)
        .lte('created_at', `${reportTo}T23:59:59`)
        .order('created_at', { ascending: false });

      // 3. Agrupar por artículo
      const grouped: Record<string, { supply: WarehouseSupply, logs: WarehouseSupplyLog[] }> = {};
      items.forEach(item => {
        const itemLogs = (logs || []).filter(l => l.supply_id === item.id);
        if (itemLogs.length > 0) {
          grouped[item.id] = {
            supply: item,
            logs: itemLogs
          };
        }
      });
      setGroupedLogs(grouped);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const fetchLogs = async (supplyId: string) => {
    setLoadingLogs(true);
    try {
      const { data } = await supabase
        .from('warehouse_supply_logs')
        .select('*')
        .eq('supply_id', supplyId)
        .order('created_at', { ascending: false });
      setActiveLogs(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleCreateSupply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplyForm.name) return;
    setLoading(true);
    try {
      const { data: newSupply, error } = await supabase.from('warehouse_supplies').insert([{
        name: supplyForm.name.toUpperCase().trim(),
        category: supplyForm.category.toUpperCase().trim(),
        quantity: supplyForm.quantity,
        min_quantity: supplyForm.min_quantity,
        unit: supplyForm.unit.toLowerCase().trim()
      }]).select().single();

      if (!error && newSupply) {
        await supabase.from('warehouse_supply_logs').insert([{
          supply_id: newSupply.id,
          operator_name: currentUser?.full_name || 'Admin',
          change_amount: supplyForm.quantity,
          comment: 'ALTA INICIAL'
        }]);

        setSupplyForm({ name: '', category: 'VARIOS', quantity: 0, min_quantity: 5, unit: 'unidades' });
        setShowSupplyModal(false);
        fetchSupplies();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const confirmStockAdjustment = async () => {
    if (!supplyAction) return;
    const { item, delta } = supplyAction;
    const newQty = Math.max(0, item.quantity + delta);

    setLoading(true);
    try {
      const { error: updateError } = await supabase
        .from('warehouse_supplies')
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq('id', item.id);

      if (updateError) throw updateError;

      const { error: logError } = await supabase.from('warehouse_supply_logs').insert([{
        supply_id: item.id,
        operator_name: currentUser?.full_name || 'Admin',
        change_amount: delta,
        comment: actionComment.toUpperCase().trim() || (delta > 0 ? 'ADICIÓN DE STOCK' : 'RETIRO DE MATERIAL')
      }]);

      if (logError) throw logError;

      setSupplyAction(null);
      setActionComment('');
      fetchSupplies();
    } catch (err) {
      console.error(err);
      alert("Error al actualizar stock");
    } finally {
      setLoading(false);
    }
  };

  const deleteSupply = async (id: string) => {
    if (confirm("¿Eliminar este material del inventario? Se borrará también su historial.")) {
      const { error } = await supabase.from('warehouse_supplies').delete().eq('id', id);
      if (!error) fetchSupplies();
    }
  };

  const categories = ['TODAS', ...Array.from(new Set(supplies.map(s => s.category)))];

  return (
    <div className="space-y-6 animate-fade-in pb-24" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="bg-white p-6 md:p-8 rounded-[3rem] border-2 border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center relative overflow-hidden">
        <div className="absolute -right-4 -bottom-4 text-indigo-50 text-8xl font-bold opacity-30">📦</div>
        <div className="relative z-10">
          <h2 className="text-lg md:text-xl font-black text-slate-800 uppercase tracking-tighter">Suministros Almacén</h2>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Control de Stock de Consumibles</p>
        </div>
        
        <div className="flex bg-slate-900 p-1.5 rounded-2xl mt-4 md:mt-0 relative z-10 shadow-lg shrink-0">
          <button 
            onClick={() => setActiveTab('inventory')} 
            className={`px-4 md:px-6 py-2 rounded-xl text-[8px] font-bold uppercase tracking-widest transition-all ${activeTab === 'inventory' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
          >
            Stock
          </button>
          <button 
            onClick={() => setActiveTab('reports')} 
            className={`px-4 md:px-6 py-2 rounded-xl text-[8px] font-bold uppercase tracking-widest transition-all ${activeTab === 'reports' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
          >
            Informes
          </button>
        </div>
      </div>

      {activeTab === 'inventory' ? (
        <>
          <div className="flex justify-end">
            <button 
              onClick={() => setShowSupplyModal(true)} 
              className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-100 active:scale-95 transition-all"
            >
              Nuevo Material
            </button>
          </div>

          {loading && !supplyAction ? (
            <div className="py-20 text-center animate-pulse">
               <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Actualizando inventario...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {supplies.map(item => {
                const isLow = item.quantity <= item.min_quantity;
                return (
                  <div key={item.id} className={`p-6 rounded-[2.5rem] border-2 flex flex-col justify-between transition-all group ${isLow ? 'bg-amber-50 border-amber-200 shadow-md' : 'bg-white border-slate-100 shadow-sm'}`}>
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{item.category}</span>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => { setSelectedSupplyForLog(item); fetchLogs(item.id); }} 
                            className="text-indigo-400 hover:text-indigo-600 text-[9px] font-black uppercase tracking-widest"
                          >
                            Historial 📋
                          </button>
                          <button onClick={() => deleteSupply(item.id)} className="text-slate-200 hover:text-rose-500 transition-opacity">✕</button>
                        </div>
                      </div>
                      <p className="font-black text-slate-800 uppercase text-sm mb-1">{item.name}</p>
                      <div className="flex items-end gap-2">
                        <span className={`text-3xl font-black ${isLow ? 'text-amber-600' : 'text-indigo-600'}`}>{item.quantity}</span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase mb-2">{item.unit}</span>
                      </div>
                      {isLow && (
                        <div className="flex items-center gap-2 mt-2 bg-amber-100/50 px-3 py-1 rounded-lg w-fit">
                          <span className="animate-pulse">⚠️</span>
                          <p className="text-[7px] font-black text-amber-700 uppercase tracking-widest">STOCK BAJO (MÍN: {item.min_quantity})</p>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-8 flex items-center gap-2">
                      <button 
                        onClick={() => setSupplyAction({ item, delta: -1 })} 
                        className="flex-1 bg-slate-50 hover:bg-slate-200 py-4 rounded-2xl font-black text-slate-600 transition-all border border-slate-100"
                      >
                        -
                      </button>
                      <button 
                        onClick={() => setSupplyAction({ item, delta: 1 })} 
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 py-4 rounded-2xl font-black text-white transition-all shadow-xl shadow-indigo-100"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
              {supplies.length === 0 && (
                <div className="col-span-full py-20 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
                   <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No hay materiales registrados</p>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-8 animate-fade-in">
          <div className="bg-white p-6 md:p-10 rounded-[3rem] border-2 border-slate-100 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Desde</label>
                <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} className="w-full bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none border border-slate-100" />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Hasta</label>
                <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} className="w-full bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none border border-slate-100" />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Filtrar Categoría</label>
                <select 
                  value={reportCategory} 
                  onChange={e => setReportCategory(e.target.value)} 
                  className="w-full bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none border border-slate-100 uppercase"
                >
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {loadingLogs ? (
              <div className="py-20 text-center animate-pulse">
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Generando Informe...</p>
              </div>
            ) : Object.keys(groupedLogs).length === 0 ? (
              <div className="py-20 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">No se encontraron movimientos en este periodo</p>
              </div>
            ) : (
              // Fixed: Explicitly casting entry to the correct type to avoid TS errors where entry is inferred as {}
              Object.values(groupedLogs).map((entry) => {
                const { supply, logs } = entry as { supply: WarehouseSupply; logs: WarehouseSupplyLog[] };
                return (
                  <div key={supply.id} className="bg-white rounded-[3rem] border-2 border-slate-100 overflow-hidden shadow-sm">
                    <div className="bg-slate-50 px-8 py-5 border-b-2 border-slate-100 flex justify-between items-center">
                      <div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-tighter">{supply.name}</h3>
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em]">{supply.category}</span>
                      </div>
                      <div className="text-right">
                         <p className="text-[8px] font-bold text-slate-400 uppercase">Stock actual</p>
                         <p className="text-sm font-black text-indigo-600">{supply.quantity} {supply.unit}</p>
                      </div>
                    </div>
                    <div className="p-4 space-y-2">
                      {logs.map(log => (
                        <div key={log.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors gap-3">
                          <div className="flex items-center gap-4">
                             <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black ${log.change_amount > 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                               {log.change_amount > 0 ? '+' : ''}{log.change_amount}
                             </div>
                             <div>
                                <p className="text-[9px] font-black text-slate-800 uppercase leading-none mb-1">{log.comment || 'SIN COMENTARIO'}</p>
                                <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">{new Date(log.created_at).toLocaleDateString()} @ {new Date(log.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>
                             </div>
                          </div>
                          <div className="text-left md:text-right">
                             <p className="text-[8px] font-black text-slate-400 uppercase">Realizado por</p>
                             <p className="text-[9px] font-bold text-slate-600 uppercase">{log.operator_name}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Modales Existentes (Sin cambios) */}
      {supplyAction && (
        <div className="fixed inset-0 z-[300] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 md:p-10 shadow-2xl space-y-6 animate-fade-in border border-white">
            <div className="text-center">
               <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                 {supplyAction.delta > 0 ? 'Añadir Unidades' : 'Retirar Material'}
               </h3>
               <p className="text-[9px] font-black text-indigo-400 tracking-widest mt-1 uppercase">
                 {supplyAction.item.name}
               </p>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-50 p-6 rounded-3xl border-2 border-slate-100 text-center">
                 <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Cantidad a {supplyAction.delta > 0 ? 'sumar' : 'restar'}</p>
                 <div className="flex items-center justify-center gap-6">
                    <button onClick={() => setSupplyAction({...supplyAction, delta: Math.min(-1, supplyAction.delta + 1)})} className={`w-10 h-10 rounded-full bg-white shadow-sm font-black ${supplyAction.delta >= 0 ? 'hidden' : ''}`}>-</button>
                    <span className="text-4xl font-black text-slate-800">{Math.abs(supplyAction.delta)}</span>
                    <button onClick={() => setSupplyAction({...supplyAction, delta: supplyAction.delta - 1})} className={`w-10 h-10 rounded-full bg-white shadow-sm font-black ${supplyAction.delta >= 0 ? 'hidden' : ''}`}>+</button>
                    <button onClick={() => setSupplyAction({...supplyAction, delta: Math.max(1, supplyAction.delta - 1)})} className={`w-10 h-10 rounded-full bg-white shadow-sm font-black ${supplyAction.delta <= 0 ? 'hidden' : ''}`}>-</button>
                    <button onClick={() => setSupplyAction({...supplyAction, delta: supplyAction.delta + 1})} className={`w-10 h-10 rounded-full bg-white shadow-sm font-black ${supplyAction.delta <= 0 ? 'hidden' : ''}`}>+</button>
                 </div>
              </div>

              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Motivo / Comentario</label>
                <textarea 
                  autoFocus
                  placeholder="EJ: PARA SECCIÓN MONTAJE, ROTURA..." 
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 font-black text-[10px] outline-none focus:border-indigo-500 uppercase transition-all resize-none h-24" 
                  value={actionComment} 
                  onChange={e => setActionComment(e.target.value)} 
                />
              </div>
            </div>

            <div className="space-y-3">
               <button 
                onClick={confirmStockAdjustment} 
                className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px]"
               >
                 Confirmar Movimiento
               </button>
               <button onClick={() => { setSupplyAction(null); setActionComment(''); }} className="w-full py-3 text-slate-400 font-black text-[9px] uppercase tracking-[0.2em]">
                 Cancelar
               </button>
            </div>
          </div>
        </div>
      )}

      {selectedSupplyForLog && (
        <div className="fixed inset-0 z-[300] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[3rem] p-8 shadow-2xl flex flex-col max-h-[85vh] animate-fade-in border border-white">
            <div className="text-center mb-6">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Historial de Movimientos</h3>
              <p className="text-[9px] font-black text-indigo-500 tracking-widest mt-1 uppercase">{selectedSupplyForLog.name}</p>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 pr-2">
              {loadingLogs ? (
                <div className="py-20 text-center animate-pulse text-[10px] font-black text-slate-300 uppercase">Cargando historial...</div>
              ) : activeLogs.length === 0 ? (
                <div className="py-20 text-center text-[10px] font-black text-slate-300 uppercase">Sin movimientos registrados</div>
              ) : activeLogs.map(log => (
                <div key={log.id} className="bg-slate-50 p-5 rounded-3xl border border-slate-100 flex flex-col gap-2 relative overflow-hidden">
                   <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${log.change_amount > 0 ? 'bg-emerald-400' : 'bg-rose-400'}`}></div>
                   <div className="flex justify-between items-start">
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                          {new Date(log.created_at).toLocaleDateString()} - {new Date(log.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                        </span>
                        <span className="text-[9px] font-black text-slate-800 uppercase">{log.operator_name}</span>
                      </div>
                      <div className={`text-sm font-black ${log.change_amount > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {log.change_amount > 0 ? '+' : ''}{log.change_amount} {selectedSupplyForLog.unit}
                      </div>
                   </div>
                   <p className="text-[9px] font-bold text-slate-500 bg-white/50 p-2 rounded-xl italic uppercase tracking-tighter">
                     "{log.comment || 'SIN COMENTARIO'}"
                   </p>
                </div>
              ))}
            </div>

            <button onClick={() => setSelectedSupplyForLog(null)} className="mt-6 w-full bg-slate-900 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px]">Cerrar Historial</button>
          </div>
        </div>
      )}

      {showSupplyModal && (
        <div className="fixed inset-0 z-[300] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
           <form onSubmit={handleCreateSupply} className="bg-white w-full max-w-sm rounded-[3rem] p-8 md:p-10 shadow-2xl space-y-4 animate-fade-in border border-white">
              <div className="text-center mb-4">
                 <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Nuevo Material</h3>
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Gestión de Consumibles</p>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Nombre</label>
                  <input autoFocus placeholder="PEGAMENTO, GUANTES..." className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 font-black text-xs outline-none focus:border-indigo-500 uppercase transition-all" value={supplyForm.name} onChange={e => setSupplyForm({ ...supplyForm, name: e.target.value })} />
                </div>

                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Categoría</label>
                  <input placeholder="VARIOS, PROTECCIÓN..." className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 font-black text-xs outline-none focus:border-indigo-500 uppercase transition-all" value={supplyForm.category} onChange={e => setSupplyForm({ ...supplyForm, category: e.target.value })} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Stock Inicial</label>
                    <input type="number" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 font-black text-xs outline-none focus:border-indigo-500 transition-all text-center" value={supplyForm.quantity} onChange={e => setSupplyForm({ ...supplyForm, quantity: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Mínimo Alerta</label>
                    <input type="number" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 font-black text-xs outline-none focus:border-indigo-500 transition-all text-center" value={supplyForm.min_quantity} onChange={e => setSupplyForm({ ...supplyForm, min_quantity: parseInt(e.target.value) || 0 })} />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Unidad</label>
                  <input placeholder="UNIDADES, KG, PARES..." className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 font-black text-xs outline-none focus:border-indigo-500 uppercase transition-all" value={supplyForm.unit} onChange={e => setSupplyForm({ ...supplyForm, unit: e.target.value })} />
                </div>
              </div>

              <div className="space-y-3 mt-6">
                 <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px] disabled:opacity-50 active:scale-95 transition-all">
                   {loading ? 'GUARDANDO...' : 'Añadir al Inventario'}
                 </button>
                 <button type="button" onClick={() => setShowSupplyModal(false)} className="w-full py-3 text-slate-400 font-black text-[9px] uppercase tracking-[0.2em] hover:text-slate-800 transition-colors">Cancelar</button>
              </div>
           </form>
        </div>
      )}
    </div>
  );
};

export default SuppliesPanel;
