
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile, ExpeditionLog, DailyNote, Trucker } from '../types';

interface ExpeditionPanelProps {
  user: UserProfile;
}

const MUELLES = ['MUELLE 12', 'MUELLE 13', 'MUELLE 14', 'MUELLE 15', 'MUELLE 16', 'MUELLE 17', 'MUELLE 18', 'MUELLE 19', 'MUELLE 20', 'MUELLE 21'];

const ExpeditionPanel: React.FC<ExpeditionPanelProps> = ({ user }) => {
  const [logs, setLogs] = useState<ExpeditionLog[]>([]);
  const [dailyNote, setDailyNote] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  
  // Función para obtener la fecha de hoy en formato YYYY-MM-DD
  const getTodayStr = () => new Date().toLocaleDateString('en-CA'); 

  // Función para obtener la fecha del próximo reparto (mañana, saltando domingos)
  const getNextDeliveryDay = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1); // Empezamos por mañana
    if (d.getDay() === 0) { // Si es domingo, pasamos al lunes
      d.setDate(d.getDate() + 1);
    }
    return d.toLocaleDateString('en-CA');
  };
  
  const [historyDate, setHistoryDate] = useState(getNextDeliveryDay());
  
  const [assigningData, setAssigningData] = useState<{dock: string, side: 'left' | 'right' | 'single'} | null>(null);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [truckId, setTruckId] = useState('');
  const [truckers, setTruckers] = useState<Trucker[]>([]);

  // Estados para creación rápida de camión
  const [showTruckerModal, setShowTruckerModal] = useState(false);
  const [newTruckerName, setNewTruckerName] = useState('');

  // Permitir edición si la fecha es hoy o futura
  const isToday = historyDate >= getTodayStr();

  useEffect(() => {
    fetchLogsAndNotes();
    fetchTruckers();
  }, [historyDate]);

  const fetchTruckers = async () => {
    const { data } = await supabase.from('truckers').select('*').order('full_name');
    if (data) {
      setTruckers(data.map((t: any) => ({
        id: t.id,
        label: t.full_name,
        created_at: t.created_at
      })));
    }
  };

  const fetchLogsAndNotes = async () => {
    setLoading(true);
    try {
      const { data: logsData } = await supabase
        .from('expedition_logs')
        .select('*')
        .gte('created_at', `${historyDate}T00:00:00`)
        .lte('created_at', `${historyDate}T23:59:59`)
        .order('created_at', { ascending: false });

      setLogs(logsData || []);

      const { data: noteData } = await supabase
        .from('daily_notes')
        .select('content')
        .eq('note_date', historyDate)
        .maybeSingle();

      setDailyNote(noteData?.content || '');
    } catch (err) {
      console.error("Error al obtener datos de expedición:", err);
    } finally {
      setLoading(false);
    }
  };

  const saveNote = async () => {
    const { error } = await supabase.from('daily_notes').upsert({
      note_date: historyDate,
      content: dailyNote,
      updated_at: new Date().toISOString()
    }, { onConflict: 'note_date' });
    
    if (!error) {
      alert("Nota del día guardada");
    }
  };

  const handleCreateQuickTrucker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTruckerName.trim()) return;
    
    setLoading(true);
    try {
      const formattedName = newTruckerName.toUpperCase().trim();
      const { error } = await supabase.from('truckers').insert([{ full_name: formattedName }]);
      if (error) throw error;
      
      await fetchTruckers();
      setTruckId(formattedName);
      setNewTruckerName('');
      setShowTruckerModal(false);
    } catch (err: any) {
      alert("Error al crear camión: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!truckId || !assigningData || !isToday) return;

    setLoading(true);
    try {
      if (editingLogId) {
        const { error } = await supabase
          .from('expedition_logs')
          .update({
            truck_id: truckId.toUpperCase().trim(),
            side: assigningData.side
          })
          .eq('id', editingLogId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('expedition_logs')
          .insert([{
            dock_id: assigningData.dock,
            side: assigningData.side,
            truck_id: truckId.toUpperCase().trim(),
            operator_name: user.full_name,
            status: 'loading',
            created_at: `${historyDate}T${new Date().toLocaleTimeString('en-GB')}` 
          }]);

        if (error) throw error;
      }
      
      closeModal();
      await fetchLogsAndNotes();
    } catch (err: any) {
      alert("Error al procesar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = async (e: React.MouseEvent, logId: string) => {
    e.preventDefault();
    e.stopPropagation(); 

    if (!isToday) {
      alert("Solo se puede modificar registros de hoy o futuros.");
      return;
    }

    if (!confirm("¿Confirmar salida del camión? El muelle quedará libre.")) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('expedition_logs')
        .update({
          status: 'completed',
          finished_at: new Date().toISOString()
        })
        .eq('id', logId);

      if (error) throw error;
      
      await fetchLogsAndNotes();
    } catch (err: any) {
      alert("Error al finalizar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (log: ExpeditionLog) => {
    if (!isToday) return;
    setAssigningData({ dock: log.dock_id, side: log.side });
    setTruckId(log.truck_id);
    setEditingLogId(log.id);
  };

  const closeModal = () => {
    setAssigningData(null);
    setTruckId('');
    setEditingLogId(null);
  };

  const getActiveLogsForDock = (dock: string) => {
    if (isToday) {
      return logs.filter(l => l.dock_id === dock && l.status === 'loading');
    }
    return logs.filter(l => l.dock_id === dock);
  };

  const SingleDockCard = ({ log, dock, side = 'single' }: { log?: ExpeditionLog, dock: string, side?: 'left' | 'right' | 'single' }) => {
    return (
      <div className={`p-4 md:p-5 rounded-[2rem] border-2 transition-all flex flex-col justify-between h-full min-h-[140px] ${log ? (log.status === 'completed' ? 'border-emerald-100 bg-emerald-50/20' : 'border-indigo-100 bg-indigo-50/40 shadow-sm') : 'border-slate-50 bg-white'}`}>
        <div className="flex justify-between items-start mb-2">
          <span className="text-[7px] font-black uppercase tracking-[0.15em] text-slate-400">
            {side === 'single' ? 'COMPLETO' : side === 'left' ? 'IZQUIERDA' : 'DERECHA'}
          </span>
          {log && <span className="text-[8px] font-bold text-slate-400">{new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>}
        </div>

        {log ? (
          <div className="space-y-3">
            <div className="bg-white p-3 rounded-xl border border-indigo-50 shadow-sm">
              <p className="text-sm md:text-base font-black text-slate-800 tracking-tighter leading-none uppercase truncate">{log.truck_id}</p>
              {log.status === 'completed' && <p className="text-[7px] font-black text-emerald-500 uppercase tracking-widest mt-1">✓ SALIDA: {new Date(log.finished_at!).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>}
            </div>
            
            {isToday && log.status === 'loading' && (
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => openEditModal(log)}
                  className="bg-slate-900 text-white py-2.5 rounded-xl text-[7px] font-black uppercase tracking-widest active:scale-95 transition-all"
                >
                  MODIF.
                </button>
                <button 
                  onClick={(e) => handleFinish(e, log.id)}
                  className="bg-emerald-600 text-white py-2.5 rounded-xl text-[7px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-md shadow-emerald-100"
                >
                  VACIAR
                </button>
              </div>
            )}
            
            {!isToday && (
               <div className="text-center py-1">
                 <span className="text-[7px] font-black text-slate-300 uppercase tracking-[0.2em]">CERRADO</span>
               </div>
            )}
          </div>
        ) : (
          isToday ? (
            <button 
              onClick={() => setAssigningData({ dock, side })}
              className="w-full flex-1 rounded-[1.5rem] border-2 border-dashed border-slate-100 text-[8px] font-black text-slate-300 uppercase tracking-widest hover:border-indigo-400 hover:text-indigo-400 hover:bg-slate-50 transition-all flex items-center justify-center"
            >
              <span>DISPONIBLE</span>
            </button>
          ) : (
            <div className="w-full flex-1 rounded-[1.5rem] border-2 border-dashed border-slate-50 flex items-center justify-center">
              <span className="text-[8px] font-black text-slate-200 uppercase tracking-widest">SIN DATOS</span>
            </div>
          )
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in pb-24" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="bg-white p-6 md:p-8 rounded-[3rem] border-2 border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center relative overflow-hidden">
        <div className="absolute -right-4 -bottom-4 text-indigo-50 text-8xl font-bold opacity-30">🚛</div>
        <div className="relative z-10 w-full md:w-auto">
          <h2 className="text-lg md:text-xl font-black text-slate-800 uppercase tracking-tighter">Control de Expedición</h2>
          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-1">
            CAMIONES PARA EL REPARTO DEL DÍA {new Date(historyDate).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </p>
          <div className="flex items-center gap-2 mt-2">
             <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">CAMBIAR FECHA:</span>
             <input 
              id="expedition-date-selector"
              type="date" 
              value={historyDate} 
              onChange={e => { if (e.target.value) setHistoryDate(e.target.value); }}
              className={`px-3 py-1.5 rounded-xl font-black text-[10px] outline-none border-2 transition-all cursor-pointer ${historyDate === getTodayStr() ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : historyDate > getTodayStr() ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-slate-900 border-slate-800 text-white'}`}
             />
             {historyDate < getTodayStr() && <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-lg text-[7px] font-black uppercase tracking-widest">MODO CONSULTA</span>}
          </div>
        </div>
        <div className="flex bg-slate-900 p-1.5 rounded-2xl mt-4 md:mt-0 relative z-10 shadow-lg shrink-0">
          <button onClick={() => setActiveTab('current')} className={`px-4 md:px-6 py-2 rounded-xl text-[8px] font-bold uppercase tracking-widest transition-all ${activeTab === 'current' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Vista Muelles</button>
          <button onClick={() => setActiveTab('history')} className={`px-4 md:px-6 py-2 rounded-xl text-[8px] font-bold uppercase tracking-widest transition-all ${activeTab === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>Listado Diario</button>
        </div>
      </div>

      <div className="bg-white p-5 md:p-6 rounded-[2.5rem] border-2 border-slate-100 shadow-sm">
        <div className="flex justify-between items-center mb-3 px-2">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">📝 Observaciones Turno</label>
          {isToday && (
            <button onClick={saveNote} className="text-[8px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-4 py-2 rounded-xl">Guardar</button>
          )}
        </div>
        <textarea 
          readOnly={!isToday}
          className={`w-full border-2 rounded-[2rem] p-5 text-xs font-medium text-slate-700 outline-none transition-all min-h-[80px] resize-none ${isToday ? 'bg-slate-50 border-slate-100 focus:border-indigo-500' : 'bg-slate-50/50 border-transparent text-slate-400'}`}
          placeholder={isToday ? "Escribe incidencias del turno..." : "Sin notas."}
          value={dailyNote}
          onChange={e => setDailyNote(e.target.value)}
        />
      </div>

      {activeTab === 'current' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {MUELLES.map(muelle => {
            const dockLogs = getActiveLogsForDock(muelle);
            const isSplit = dockLogs.some(l => l.side === 'left' || l.side === 'right');
            const singleLog = dockLogs.find(l => l.side === 'single');
            const leftLog = dockLogs.find(l => l.side === 'left');
            const rightLog = dockLogs.find(l => l.side === 'right');

            return (
              <div key={muelle} className="flex flex-col gap-3">
                <div className="bg-slate-50/50 p-4 md:p-5 rounded-[2.5rem] border border-slate-200/50 shadow-sm flex-1">
                  <h3 className="text-center font-black text-slate-800 uppercase text-[9px] tracking-[0.3em] mb-4">{muelle}</h3>
                  
                  {isSplit ? (
                    <div className="grid grid-cols-1 gap-3 animate-fade-in">
                      <SingleDockCard log={leftLog} dock={muelle} side="left" />
                      <SingleDockCard log={rightLog} dock={muelle} side="right" />
                    </div>
                  ) : (
                    <div className="animate-fade-in h-full">
                      <SingleDockCard log={singleLog} dock={muelle} side="single" />
                    </div>
                  )}
                </div>
                
                {isToday && !isSplit && !singleLog && (
                  <button 
                    onClick={() => setAssigningData({ dock: muelle, side: 'left' })}
                    className="self-center bg-white border-2 border-slate-100 text-slate-300 w-10 h-10 rounded-full flex items-center justify-center text-xl font-black hover:border-indigo-500 hover:text-indigo-500 transition-all active:scale-90"
                  >
                    +
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white rounded-[2.5rem] border-2 border-slate-100 overflow-hidden shadow-sm overflow-x-auto">
             <table className="w-full text-left text-[11px] min-w-[650px]">
                <thead className="bg-slate-50 text-[8px] font-black text-slate-400 uppercase tracking-widest border-b-2 border-slate-100">
                  <tr>
                    <th className="px-6 py-4">MUELLE</th>
                    <th className="px-6 py-4">LADO</th>
                    <th className="px-6 py-4">CAMIÓN</th>
                    <th className="px-6 py-4">TIEMPOS</th>
                    <th className="px-6 py-4 text-right">ESTADO</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-slate-50">
                  {logs.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-16 text-center font-black text-[9px] text-slate-300 uppercase tracking-widest">Sin registros</td></tr>
                  ) : logs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="px-6 py-4 font-black text-slate-800">{log.dock_id}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded-lg text-[7px] font-black uppercase ${log.side === 'single' ? 'bg-slate-100 text-slate-600' : 'bg-indigo-50 text-indigo-600'}`}>
                          {log.side === 'single' ? 'UNO' : log.side === 'left' ? 'IZQ' : 'DER'}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-black text-indigo-600 uppercase">{log.truck_id}</td>
                      <td className="px-6 py-4 text-[8px] font-bold text-slate-400 uppercase">
                        {new Date(log.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} 
                        {log.finished_at && <span className="text-emerald-500 ml-1.5">→ {new Date(log.finished_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`px-3 py-1 rounded-xl text-[7px] font-black uppercase ${log.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                          {log.status === 'completed' ? 'SALIDA' : 'CARGA'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
             </table>
          </div>
        </div>
      )}

      {assigningData && isToday && (
        <div className="fixed inset-0 z-[200] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4">
           <div className="bg-white w-full max-lg rounded-[3.5rem] p-6 md:p-10 shadow-2xl animate-fade-in relative overflow-hidden flex flex-col max-h-[90vh]">
              <div className="absolute -right-8 -top-8 text-slate-50 text-9xl font-bold opacity-30 pointer-events-none">🚛</div>
              
              <div className="relative z-10 flex flex-col h-full min-h-0">
                <div className="text-center mb-5 shrink-0">
                  <h3 className="text-lg md:text-xl font-black text-slate-800 uppercase tracking-tighter">
                    {editingLogId ? 'Actualizar' : 'Asignar Camión'}
                  </h3>
                  <p className="text-[9px] font-black text-indigo-400 tracking-widest mt-1 uppercase">{assigningData.dock}</p>
                </div>
                
                <div className="space-y-5 flex-1 overflow-y-auto pr-1 min-h-0">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center mb-2 px-2">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Habituales</label>
                      <button 
                        onClick={() => setShowTruckerModal(true)} 
                        className="text-[7px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100 active:scale-95 transition-all"
                      >
                        + Nuevo Camión
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {truckers.map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTruckId(t.label)}
                          className={`p-3 rounded-xl border-2 transition-all flex flex-col items-center justify-center text-center gap-1 ${
                            truckId === t.label 
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100' 
                            : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-white'
                          }`}
                        >
                          <span className="text-[9px] font-black uppercase leading-tight">{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="h-[1px] bg-slate-100 flex-1"></div>
                    <span className="text-[7px] font-black text-slate-300 uppercase tracking-widest">O entrada manual</span>
                    <div className="h-[1px] bg-slate-100 flex-1"></div>
                  </div>

                  <div>
                    <input 
                      autoFocus 
                      placeholder="IDENTIFICADOR..." 
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3 px-6 font-black text-base text-center uppercase outline-none focus:border-indigo-500" 
                      value={truckId} 
                      onChange={e => setTruckId(e.target.value.toUpperCase())} 
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                       {['single', 'left', 'right'].map((s) => (
                         <button 
                           key={s}
                           type="button"
                           onClick={() => setAssigningData({...assigningData, side: s as any})}
                           className={`py-3 rounded-xl text-[8px] font-black uppercase tracking-widest border-2 transition-all ${assigningData.side === s ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                         >
                           {s === 'single' ? 'UNO' : s === 'left' ? 'IZQ' : 'DER'}
                         </button>
                       ))}
                  </div>
                </div>

                <div className="mt-6 space-y-2 shrink-0 pb-2">
                  <button 
                    onClick={() => handleAssign()}
                    disabled={loading || !truckId} 
                    className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[9px] disabled:opacity-50"
                  >
                    Confirmar Entrada
                  </button>
                  <button onClick={closeModal} className="w-full py-3 text-slate-400 font-black text-[8px] uppercase tracking-widest">Cerrar</button>
                </div>
              </div>
           </div>
        </div>
      )}

      {showTruckerModal && (
        <div className="fixed inset-0 z-[300] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
           <form onSubmit={handleCreateQuickTrucker} className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl space-y-6 animate-fade-in border border-white">
              <div className="text-center">
                 <h3 className="text-xl font-black text-slate-800 uppercase">Nuevo Transportista</h3>
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Registrar para habituales</p>
              </div>
              <input 
                autoFocus 
                placeholder="NOMBRE / Nº CAMIÓN" 
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 font-black text-xs text-center outline-none focus:border-indigo-500 uppercase" 
                value={newTruckerName} 
                onChange={e => setNewTruckerName(e.target.value)} 
              />
              <div className="space-y-3">
                 <button type="submit" disabled={loading || !newTruckerName.trim()} className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px] disabled:opacity-50">Guardar Camión</button>
                 <button type="button" onClick={() => { setShowTruckerModal(false); setNewTruckerName(''); }} className="w-full py-4 text-slate-400 font-black text-[9px] uppercase tracking-[0.2em]">Cancelar</button>
              </div>
           </form>
        </div>
      )}
    </div>
  );
};

export default ExpeditionPanel;
