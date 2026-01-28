
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { WarehouseSlot, UserProfile, Trucker, UserRole } from '../types';
import UserManagement from './UserManagement';

interface MovementLog {
  id: string;
  operator_name: string;
  operator_email?: string;
  cart_id: string;
  slot_code: string;
  new_status: string;
  new_quantity: number;
  old_quantity?: number;
  created_at: string;
}

type AdminTab = 'movements' | 'operators' | 'truckers' | 'sectors' | 'reports';

const AdminPanel: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<AdminTab>('movements');
  const [loading, setLoading] = useState(true);
  
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

  const [allLogs, setAllLogs] = useState<MovementLog[]>([]);
  const [truckers, setTruckers] = useState<Trucker[]>([]);
  const [showTruckerModal, setShowTruckerModal] = useState(false);
  const [truckerForm, setTruckerForm] = useState({ label: '' });

  // Stats para Sectores
  const [stats, setStats] = useState({
    total: 0,
    occupied: 0,
    empty: 0,
    pending: 0
  });

  useEffect(() => {
    fetchData();
  }, [dateFrom, dateTo, activeSubTab]);

  const fetchData = async () => {
    setLoading(true);
    if (activeSubTab === 'movements') {
      const { data } = await supabase
        .from('movement_logs')
        .select('*')
        .gte('created_at', `${dateFrom}T00:00:00`)
        .lte('created_at', `${dateTo}T23:59:59`)
        .order('created_at', { ascending: false });
      setAllLogs(data || []);
    } else if (activeSubTab === 'truckers') {
      const { data } = await supabase.from('truckers').select('*').order('full_name');
      setTruckers(data?.map((t: any) => ({ id: t.id, label: t.full_name, created_at: t.created_at })) || []);
    } else if (activeSubTab === 'sectors') {
      const { data } = await supabase.from('warehouse_slots').select('is_scanned_once, quantity');
      if (data) {
        setStats({
          total: data.length,
          occupied: data.filter(s => s.quantity && s.quantity > 0).length,
          empty: data.filter(s => s.is_scanned_once && s.quantity === 0).length,
          pending: data.filter(s => !s.is_scanned_once).length
        });
      }
    }
    setLoading(false);
  };

  const handleCreateTrucker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!truckerForm.label) return;
    const { error } = await supabase.from('truckers').insert([{ full_name: truckerForm.label.toUpperCase().trim() }]);
    if (!error) { setTruckerForm({ label: '' }); setShowTruckerModal(false); fetchData(); }
  };

  const deleteTrucker = async (id: string) => {
    if (confirm("¿Eliminar camión?")) {
      await supabase.from('truckers').delete().eq('id', id);
      fetchData();
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      {/* Sub-navegación estilo imagen */}
      <div className="flex justify-center">
        <nav className="bg-slate-950 p-2 rounded-[2.5rem] shadow-2xl flex items-center gap-1 md:gap-2 border border-slate-800">
          {[
            { id: 'movements', label: 'HISTORIAL', icon: '📋' },
            { id: 'operators', label: 'OPERARIOS', icon: '👥' },
            { id: 'sectors', label: 'SECTORES', icon: '📊' },
            { id: 'truckers', label: 'CAMIONES', icon: '🚛' },
            { id: 'reports', label: 'INFORME', icon: '📈' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as AdminTab)}
              className={`px-4 md:px-8 py-4 rounded-[2rem] flex flex-col items-center gap-1.5 transition-all min-w-[80px] md:min-w-[120px] ${
                activeSubTab === tab.id 
                ? 'bg-white text-slate-900 shadow-xl' 
                : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <span className="text-sm md:text-base">{tab.icon}</span>
              <span className="text-[7px] md:text-[9px] font-black uppercase tracking-[0.2em]">{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Contenido Dinámico */}
      <div className="bg-white p-6 md:p-10 rounded-[3.5rem] border border-slate-100 shadow-sm min-h-[500px]">
        {activeSubTab === 'movements' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-end">
               <div className="flex-1 space-y-2">
                 <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Rango de fechas</label>
                 <div className="flex gap-2">
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none flex-1 border border-slate-100" />
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none flex-1 border border-slate-100" />
                 </div>
               </div>
            </div>
            <div className="overflow-x-auto rounded-3xl border border-slate-50">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-900 text-white font-black uppercase tracking-widest text-[9px]">
                  <tr>
                    <th className="px-6 py-5">OPERARIO</th>
                    <th className="px-6 py-5">CARRO</th>
                    <th className="px-6 py-5">HUECO</th>
                    <th className="px-6 py-5">CARGA</th>
                    <th className="px-6 py-5">FECHA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {allLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-800 uppercase">{log.operator_name}</td>
                      <td className="px-6 py-4 font-black text-indigo-600">{log.cart_id}</td>
                      <td className="px-6 py-4 font-black text-slate-900">{log.slot_code}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-lg font-black ${log.new_quantity === 100 ? 'bg-rose-50 text-rose-600' : log.new_quantity === 50 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          {log.new_quantity}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-400 font-bold uppercase">{new Date(log.created_at).toLocaleString([], {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'})}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeSubTab === 'operators' && <UserManagement />}

        {activeSubTab === 'truckers' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">Transportistas Habituales</h3>
               <button onClick={() => setShowTruckerModal(true)} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-100">Nuevo Camión</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               {truckers.map(t => (
                 <div key={t.id} className="p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex items-center justify-between group">
                    <div>
                      <p className="font-black text-slate-800 uppercase text-sm">{t.label}</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">Registrado</p>
                    </div>
                    <button onClick={() => deleteTrucker(t.id)} className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">🗑️</button>
                 </div>
               ))}
            </div>
          </div>
        )}

        {activeSubTab === 'sectors' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Estado Global Inventario</h4>
                <div className="space-y-4">
                   <div className="flex justify-between items-end">
                      <span className="text-2xl font-black text-slate-800">{stats.total}</span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Huecos Totales</span>
                   </div>
                   <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-600 transition-all" style={{width: `${(stats.occupied / stats.total) * 100}%`}}></div>
                   </div>
                   <div className="grid grid-cols-3 gap-2">
                      <div className="p-4 bg-white rounded-2xl text-center shadow-sm">
                        <p className="text-lg font-black text-emerald-500">{stats.empty}</p>
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-1">Vacíos</p>
                      </div>
                      <div className="p-4 bg-white rounded-2xl text-center shadow-sm">
                        <p className="text-lg font-black text-rose-500">{stats.occupied}</p>
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-1">Ocupados</p>
                      </div>
                      <div className="p-4 bg-white rounded-2xl text-center shadow-sm">
                        <p className="text-lg font-black text-amber-500">{stats.pending}</p>
                        <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-1">S/Lectura</p>
                      </div>
                   </div>
                </div>
             </div>
             <div className="bg-indigo-900 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col justify-center text-white">
                <div className="absolute -right-10 -bottom-10 text-white/10 text-[10rem] font-black pointer-events-none">OK</div>
                <h4 className="text-[10px] font-black text-indigo-300 uppercase tracking-[0.3em] mb-4">Métrica de Ocupación</h4>
                <p className="text-5xl font-black">{Math.round((stats.occupied / (stats.total || 1)) * 100)}%</p>
                <p className="text-[10px] font-bold uppercase tracking-widest mt-4 opacity-60">Saturación del Almacén</p>
             </div>
          </div>
        )}

        {activeSubTab === 'reports' && (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
             <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center text-3xl">📈</div>
             <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Generador de Informes</h3>
             <p className="text-slate-400 text-xs font-medium max-w-xs">Los informes detallados por PDF y exportación Excel estarán disponibles próximamente.</p>
          </div>
        )}
      </div>

      {showTruckerModal && (
        <div className="fixed inset-0 z-[300] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
           <form onSubmit={handleCreateTrucker} className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl space-y-6">
              <div className="text-center">
                 <h3 className="text-xl font-black text-slate-800 uppercase">Nuevo Transportista</h3>
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Habitual de Expedición</p>
              </div>
              <input 
                autoFocus 
                placeholder="NOMBRE / Nº CAMIÓN" 
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 font-black text-xs text-center outline-none focus:border-indigo-500 uppercase" 
                value={truckerForm.label} 
                onChange={e => setTruckerForm({ label: e.target.value })} 
              />
              <div className="space-y-3">
                 <button type="submit" className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px]">Guardar Transportista</button>
                 <button type="button" onClick={() => setShowTruckerModal(false)} className="w-full py-4 text-slate-400 font-black text-[9px] uppercase tracking-[0.2em]">Cancelar</button>
              </div>
           </form>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
