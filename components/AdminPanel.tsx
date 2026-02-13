
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { WarehouseSlot, UserProfile, Trucker, UserRole, Machinery, Task, Role } from '../types';
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

interface TaskLog {
  id: string;
  task_id: string;
  operator_email: string;
  start_time: string;
  end_time: string | null;
  created_at: string;
  tasks?: { name: string };
  profiles?: { full_name: string };
}

type AdminTab = 'movements' | 'operators' | 'truckers' | 'sectors' | 'reports' | 'machinery' | 'tasks';
type ReportScope = 'range' | 'week' | 'today';

interface AdminPanelProps {
  user: UserProfile;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ user }) => {
  const [activeSubTab, setActiveSubTab] = useState<AdminTab>('movements');
  const [tasksView, setTasksView] = useState<'report' | 'config'>('report');
  const [loading, setLoading] = useState(true);
  
  const todayLocal = new Date().toLocaleDateString('en-CA');
  
  // Periodo seleccionado - Por defecto hoy
  const [scope, setScope] = useState<ReportScope>('today');
  const [dateFrom, setDateFrom] = useState(todayLocal); 
  const [dateTo, setDateTo] = useState(todayLocal);
  const [selectedOperator, setSelectedOperator] = useState<string | null>(null);
  const [cartSearch, setCartSearch] = useState('');

  const [allLogs, setAllLogs] = useState<MovementLog[]>([]);
  const [truckers, setTruckers] = useState<Trucker[]>([]);
  const [machinery, setMachinery] = useState<Machinery[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [showTruckerModal, setShowTruckerModal] = useState(false);
  const [showMachineryModal, setShowMachineryModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  
  const [truckerForm, setTruckerForm] = useState({ label: '' });
  const [machineryForm, setMachineryForm] = useState({ type: 'carretilla' as 'carretilla' | 'pda', identifier: '' });
  
  // Estados para Tareas (Creación / Edición)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState({ name: '', allowed_roles: [] as string[], is_timed: false });

  // Estados para Filtros de Historial de Tareas de Tiempo
  const [taskLogDateFrom, setTaskLogDateFrom] = useState(todayLocal);
  const [taskLogDateTo, setTaskLogDateTo] = useState(todayLocal);
  const [taskLogOperator, setTaskLogOperator] = useState<string>('todos');
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
  const [loadingTaskLogs, setLoadingTaskLogs] = useState(false);

  const [stats, setStats] = useState({
    total: 0,
    occupied: 0,
    empty: 0,
    pending: 0
  });

  const [warehouseBreakdown, setWarehouseBreakdown] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, [dateFrom, dateTo, activeSubTab]);

  useEffect(() => {
    if (activeSubTab === 'tasks' && tasksView === 'report') {
      fetchTaskLogs();
    }
  }, [activeSubTab, tasksView, taskLogDateFrom, taskLogDateTo, taskLogOperator]);

  const setRangeToThisWeek = () => {
    const now = new Date();
    const day = now.getDay() || 7; 
    const monday = new Date(now);
    monday.setDate(now.getDate() - day + 1);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    setDateFrom(monday.toLocaleDateString('en-CA'));
    setDateTo(sunday.toLocaleDateString('en-CA'));
    setScope('week');
  };

  const setRangeToToday = () => {
    setDateFrom(todayLocal);
    setDateTo(todayLocal);
    setScope('today');
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeSubTab === 'movements' || activeSubTab === 'reports') {
        const { data: logs } = await supabase
          .from('movement_logs')
          .select('*')
          .gte('created_at', `${dateFrom}T00:00:00`)
          .lte('created_at', `${dateTo}T23:59:59`)
          .order('created_at', { ascending: false });
        setAllLogs(logs || []);

        if (activeSubTab === 'reports') {
          let allSlots: WarehouseSlot[] = [];
          let from = 0;
          const step = 1000;
          let hasMore = true;
          
          while (hasMore) {
            const { data, error } = await supabase
              .from('warehouse_slots')
              .select('*')
              .range(from, from + step - 1);
            
            if (error) { hasMore = false; break; }
            if (data && data.length > 0) {
              allSlots = [...allSlots, ...data as WarehouseSlot[]];
              if (data.length < step) hasMore = false;
              from += step;
            } else { hasMore = false; }
          }

          if (allSlots.length > 0) {
            const breakdown = processWarehouseReport(allSlots);
            setWarehouseBreakdown(breakdown);
          }
        }
      } else if (activeSubTab === 'truckers') {
        const { data } = await supabase.from('truckers').select('*').order('full_name');
        setTruckers(data?.map((t: any) => ({ id: t.id, label: t.full_name, created_at: t.created_at })) || []);
      } else if (activeSubTab === 'machinery') {
        const { data } = await supabase.from('machinery').select('*').order('type', { ascending: true }).order('identifier', { ascending: true });
        setMachinery(data || []);
      } else if (activeSubTab === 'tasks') {
        const { data: tasksData } = await supabase.from('tasks').select('*').order('name');
        const { data: rolesData } = await supabase.from('roles').select('*').order('name');
        setTasks(tasksData || []);
        setRoles(rolesData || []);
      } else if (activeSubTab === 'sectors') {
        let allSectorSlots: any[] = [];
        let from = 0;
        const step = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from('warehouse_slots')
            .select('is_scanned_once, quantity')
            .range(from, from + step - 1);
          
          if (error || !data || data.length === 0) {
            hasMore = false;
          } else {
            allSectorSlots = [...allSectorSlots, ...data];
            if (data.length < step) hasMore = false;
            from += step;
          }
        }

        if (allSectorSlots.length > 0) {
          setStats({
            total: allSectorSlots.length,
            occupied: allSectorSlots.filter(s => s.quantity && s.quantity > 0).length,
            empty: allSectorSlots.filter(s => s.is_scanned_once && s.quantity === 0).length,
            pending: allSectorSlots.filter(s => !s.is_scanned_once).length
          });
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTaskLogs = async () => {
    setLoadingTaskLogs(true);
    try {
      let query = supabase
        .from('task_logs')
        .select(`
          id, task_id, operator_email, start_time, end_time, created_at,
          tasks ( name ),
          profiles ( full_name )
        `)
        .gte('created_at', `${taskLogDateFrom}T00:00:00`)
        .lte('created_at', `${taskLogDateTo}T23:59:59`)
        .order('created_at', { ascending: false });

      if (taskLogOperator !== 'todos') {
        query = query.eq('operator_email', taskLogOperator);
      }

      const { data, error } = await query;
      if (error) throw error;
      setTaskLogs((data || []) as any[]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTaskLogs(false);
    }
  };

  /**
   * Lógica de redondeo: 
   * - Mínimo 15 min.
   * - Tramos de 15 min siempre al alza.
   */
  const getRoundedDurationMs = (start: string, end: string | null): number => {
    if (!end) return 0;
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    const diffMs = Math.max(0, endMs - startMs);
    
    const intervalMs = 15 * 60 * 1000; // 15 minutos en ms
    
    if (diffMs === 0) return 0;
    
    // Aplicar mínimo 15 minutos y redondear al alza al siguiente tramo de 15 min
    return Math.ceil(Math.max(diffMs, intervalMs) / intervalMs) * intervalMs;
  };

  const formatMsToHHMM = (ms: number): string => {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
  };

  const calculateTotalTimeRounded = (logs: TaskLog[]) => {
    let totalMs = 0;
    logs.forEach(log => {
      if (log.start_time && log.end_time) {
        totalMs += getRoundedDurationMs(log.start_time, log.end_time);
      }
    });
    return formatMsToHHMM(totalMs);
  };

  const processWarehouseReport = (slots: WarehouseSlot[]) => {
    const plants = ['U01', 'U02'];
    const sizes = ['Grande', 'Mediano', 'Pequeño'];
    
    return plants.map(plant => {
      const plantSlots = slots.filter(s => s.code.startsWith(plant));
      const sizeBreakdown = sizes.map(size => {
        const sSlots = plantSlots.filter(s => s.size === size);
        const total = sSlots.length;
        const full = sSlots.filter(s => s.quantity === 100).length;
        const half = sSlots.filter(s => s.quantity === 50).length;
        const empty = sSlots.filter(s => s.is_scanned_once && s.quantity === 0).length;
        
        const occupancy = total > 0 
          ? Math.round((sSlots.filter(s => (s.quantity || 0) > 0).length / total) * 100)
          : 0;

        return { size, total, full, half, empty, occupancy };
      });

      const totalPlant = plantSlots.length;
      const avgOccupancy = totalPlant > 0 
        ? Math.round((plantSlots.filter(s => (s.quantity || 0) > 0).length / totalPlant) * 100)
        : 0;

      return { plant, sizeBreakdown, avgOccupancy, totalScanned: plantSlots.filter(s => s.is_scanned_once).length, totalSlots: totalPlant };
    });
  };

  const getOperatorStats = () => {
    const map = new Map<string, { name: string, count: number, logs: MovementLog[], email: string }>();
    allLogs.forEach(log => {
      const key = log.operator_email || log.operator_name;
      if (!map.has(key)) map.set(key, { name: log.operator_name, count: 0, logs: [], email: log.operator_email || '' });
      const entry = map.get(key)!;
      entry.count++;
      entry.logs.push(log);
    });
    return Array.from(map.entries());
  };

  const calculateAvgTime = (logs: MovementLog[]) => {
    if (logs.length < 2) return '--';
    const sorted = [...logs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    let totalDiff = 0;
    for (let i = 1; i < sorted.length; i++) {
      totalDiff += new Date(sorted[i].created_at).getTime() - new Date(sorted[i-1].created_at).getTime();
    }
    const avgMs = totalDiff / (sorted.length - 1);
    const mins = Math.floor(avgMs / 60000);
    const secs = Math.floor((avgMs % 60000) / 1000);
    return `${mins}m ${secs}s`;
  };

  const filteredLogs = allLogs.filter(l => {
    const matchesOperator = selectedOperator ? (l.operator_email || l.operator_name) === selectedOperator : true;
    const matchesCart = cartSearch ? (l.cart_id || '').toUpperCase().includes(cartSearch.toUpperCase()) : true;
    return matchesOperator && matchesCart;
  });

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

  const handleCreateMachinery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!machineryForm.identifier) return;
    const { error } = await supabase.from('machinery').insert([{ 
      type: machineryForm.type, 
      identifier: machineryForm.identifier.toUpperCase().trim() 
    }]);
    if (!error) { 
      setMachineryForm({ type: 'carretilla', identifier: '' }); 
      setShowMachineryModal(false); 
      fetchData(); 
    }
  };

  const deleteMachinery = async (id: string) => {
    if (confirm("¿Eliminar maquinaria?")) {
      await supabase.from('machinery').delete().eq('id', id);
      fetchData();
    }
  };

  const handleCreateOrUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskForm.name) return;
    
    setLoading(true);
    try {
      if (editingTaskId) {
        const { error } = await supabase.from('tasks').update({
          name: taskForm.name.toUpperCase().trim(),
          allowed_roles: taskForm.allowed_roles,
          is_timed: taskForm.is_timed
        }).eq('id', editingTaskId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('tasks').insert([{
          name: taskForm.name.toUpperCase().trim(),
          allowed_roles: taskForm.allowed_roles,
          is_timed: taskForm.is_timed
        }]);
        if (error) throw error;
      }

      setTaskForm({ name: '', allowed_roles: [], is_timed: false });
      setEditingTaskId(null);
      setShowTaskModal(false);
      fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openEditTask = (task: Task) => {
    setTaskForm({
      name: task.name,
      allowed_roles: task.allowed_roles,
      is_timed: task.is_timed
    });
    setEditingTaskId(task.id);
    setShowTaskModal(true);
  };

  const deleteTask = async (id: string) => {
    if (confirm("¿Eliminar esta tarea?")) {
      await supabase.from('tasks').delete().eq('id', id);
      fetchData();
    }
  };

  const toggleRoleForTask = (roleName: string) => {
    setTaskForm(prev => ({
      ...prev,
      allowed_roles: prev.allowed_roles.includes(roleName)
        ? prev.allowed_roles.filter(r => r !== roleName)
        : [...prev.allowed_roles, roleName]
    }));
  };

  const handleFinishTaskLog = async (logId: string) => {
    if (user.role !== 'admin') return;
    if (!confirm("¿Deseas finalizar esta tarea manualmente con la hora actual?")) return;
    
    setLoadingTaskLogs(true);
    try {
      const { error } = await supabase
        .from('task_logs')
        .update({ end_time: new Date().toISOString() })
        .eq('id', logId);
      if (error) throw error;
      await fetchTaskLogs();
    } catch (err: any) {
      alert("Error al finalizar: " + err.message);
    } finally {
      setLoadingTaskLogs(false);
    }
  };

  const handleDeleteTaskLog = async (logId: string) => {
    if (user.role !== 'admin') return;
    if (!confirm("¿Estás seguro de eliminar este registro de tiempo? Esta acción no se puede deshacer.")) return;
    
    setLoadingTaskLogs(true);
    try {
      const { error } = await supabase
        .from('task_logs')
        .delete()
        .eq('id', logId);
      if (error) throw error;
      await fetchTaskLogs();
    } catch (err: any) {
      alert("Error al eliminar: " + err.message);
    } finally {
      setLoadingTaskLogs(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      <div className="flex justify-center">
        <nav className="bg-slate-950 p-2 rounded-[2.5rem] shadow-2xl flex items-center gap-1 md:gap-2 border border-slate-800 overflow-x-auto no-scrollbar max-w-full">
          {[
            { id: 'movements', label: 'HISTORIAL', icon: '📋' },
            { id: 'operators', label: 'OPERARIOS', icon: '👥' },
            { id: 'sectors', label: 'SECTORES', icon: '📊' },
            { id: 'machinery', label: 'MAQUINARIA', icon: '🛠️' },
            { id: 'tasks', label: 'TAREAS', icon: '📌' },
            { id: 'truckers', label: 'CAMIONES', icon: '🚛' },
            { id: 'reports', label: 'INFORME', icon: '📈' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as AdminTab)}
              className={`px-4 md:px-8 py-4 rounded-[2rem] flex flex-col items-center gap-1.5 transition-all min-w-[90px] md:min-w-[120px] ${
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

      <div className="bg-white p-4 md:p-10 rounded-[3rem] border border-slate-100 shadow-sm min-h-[500px]">
        {activeSubTab === 'movements' && (
          <div className="space-y-8">
            {/* Filtros Historial */}
            <div className="flex flex-col lg:flex-row gap-4 items-end justify-between">
               <div className="w-full flex flex-col md:flex-row gap-4 flex-wrap">
                 <div className="space-y-2">
                   <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Periodo Consulta</label>
                   <div className="flex gap-2">
                      <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setScope('range'); }} className="bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none flex-1 border border-slate-100" />
                      <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setScope('range'); }} className="bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none flex-1 border border-slate-100" />
                   </div>
                 </div>
                 <div className="space-y-2 min-w-[180px]">
                   <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Operario</label>
                   <select 
                    value={selectedOperator || ''} 
                    onChange={e => setSelectedOperator(e.target.value || null)}
                    className="w-full bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none border border-slate-100 uppercase"
                   >
                     <option value="">TODOS LOS EMPLEADOS</option>
                     {getOperatorStats().map(([key, op]) => (
                       <option key={key} value={key}>{op.name}</option>
                     ))}
                   </select>
                 </div>
                 <div className="space-y-2 flex-1 min-w-[180px]">
                   <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2">Buscar Carro</label>
                   <input 
                    type="text" 
                    placeholder="ID CARRO..." 
                    value={cartSearch} 
                    onChange={e => setCartSearch(e.target.value.toUpperCase())}
                    className="w-full bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none border border-slate-100 uppercase"
                   />
                 </div>
               </div>
               {(selectedOperator || cartSearch) && (
                 <button onClick={() => { setSelectedOperator(null); setCartSearch(''); }} className="text-[10px] font-black text-rose-500 uppercase tracking-widest bg-rose-50 px-4 py-2 rounded-xl border border-rose-100 mb-1 whitespace-nowrap">Limpiar Filtros ✕</button>
               )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {getOperatorStats().map(([key, op]) => (
                <button 
                  key={key} 
                  onClick={() => setSelectedOperator(key)}
                  className={`p-5 rounded-[2rem] border-2 transition-all text-left flex flex-col justify-between h-28 ${selectedOperator === key ? 'bg-indigo-600 border-indigo-600 shadow-lg shadow-indigo-100 text-white' : 'bg-slate-50 border-slate-50 hover:border-indigo-200'}`}
                >
                  <div className="flex justify-between items-start">
                    <span className="text-xl">👷</span>
                    <span className={`text-[12px] font-black ${selectedOperator === key ? 'text-indigo-100' : 'text-indigo-500'}`}>{op.count}</span>
                  </div>
                  <p className={`text-[10px] font-black uppercase tracking-tight leading-tight line-clamp-2 ${selectedOperator === key ? 'text-white' : 'text-slate-800'}`}>{op.name}</p>
                </button>
              ))}
            </div>

            <div className="overflow-x-auto rounded-[2rem] border border-slate-50 shadow-inner">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-900 text-white font-black uppercase tracking-widest text-[8px]">
                  <tr>
                    <th className="px-6 py-5">TRABAJADOR</th>
                    <th className="px-6 py-5">CARRO</th>
                    <th className="px-6 py-5">HUECO</th>
                    <th className="px-6 py-5">ESTADO</th>
                    <th className="px-6 py-5 text-right">HORA</th>
                    <th className="px-6 py-5 text-right">FECHA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredLogs.length === 0 ? (
                    <tr><td colSpan={6} className="py-20 text-center text-slate-300 font-black uppercase text-[10px] tracking-widest">No hay movimientos que coincidan</td></tr>
                  ) : filteredLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-800 uppercase">{log.operator_name}</td>
                      <td className="px-6 py-4 font-black text-indigo-600">{log.cart_id}</td>
                      <td className="px-6 py-4 font-black text-slate-900">{log.slot_code}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-lg font-black ${log.new_quantity === 100 ? 'bg-rose-50 text-rose-600' : log.new_quantity === 50 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          {log.new_quantity}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-400 font-bold text-right">{new Date(log.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</td>
                      <td className="px-6 py-4 text-slate-400 font-bold text-right">{new Date(log.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeSubTab === 'operators' && <UserManagement />}

        {activeSubTab === 'tasks' && (
          <div className="space-y-8">
            <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit mx-auto mb-8 shadow-inner">
               <button 
                onClick={() => setTasksView('report')} 
                className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tasksView === 'report' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
               >
                 Informe de Tiempos
               </button>
               <button 
                onClick={() => setTasksView('config')} 
                className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tasksView === 'config' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
               >
                 Configuración
               </button>
            </div>

            {tasksView === 'report' ? (
              <section className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 space-y-8 animate-fade-in">
                 <div className="flex flex-col md:flex-row justify-between items-end gap-6">
                    <div className="space-y-2">
                      <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">Rendimiento en Tareas (Redondeado)</h3>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tramos de 15 min al alza (Regla 15 min min.)</p>
                    </div>
                    <div className="flex flex-wrap gap-4 items-end">
                       <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Desde</label>
                          <input type="date" value={taskLogDateFrom} onChange={e => setTaskLogDateFrom(e.target.value)} className="bg-white p-3 rounded-xl text-[10px] font-black outline-none border border-slate-200" />
                       </div>
                       <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Hasta</label>
                          <input type="date" value={taskLogDateTo} onChange={e => setTaskLogDateTo(e.target.value)} className="bg-white p-3 rounded-xl text-[10px] font-black outline-none border border-slate-200" />
                       </div>
                       <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Operario</label>
                          <select 
                            value={taskLogOperator} 
                            onChange={e => setTaskLogOperator(e.target.value)}
                            className="bg-white p-3 rounded-xl text-[10px] font-black outline-none border border-slate-200 uppercase min-w-[150px]"
                          >
                            <option value="todos">Todos los Operarios</option>
                            {getOperatorStats().map(([key, op]) => (
                              <option key={key} value={op.email}>{op.name.toUpperCase()}</option>
                            ))}
                          </select>
                       </div>
                    </div>
                 </div>

                 <div className="bg-indigo-600 p-8 rounded-[2.5rem] shadow-xl text-white flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden">
                    <div className="absolute -right-10 -bottom-10 text-white/10 text-[12rem] font-black pointer-events-none">Σ</div>
                    <div className="relative z-10 text-center md:text-left">
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-200 mb-2">Total tiempo acumulado</p>
                      <p className="text-6xl font-black tracking-tighter">{calculateTotalTimeRounded(taskLogs)}</p>
                      <p className="text-[8px] font-bold uppercase tracking-widest mt-2 opacity-60">HH:MM DE ACTIVIDAD FACTURABLE</p>
                    </div>
                    <div className="relative z-10 bg-white/10 backdrop-blur-md p-6 rounded-3xl border border-white/20 text-center">
                      <p className="text-[9px] font-black uppercase tracking-widest mb-1">Registros</p>
                      <p className="text-3xl font-black">{taskLogs.length}</p>
                    </div>
                 </div>

                 <div className="overflow-x-auto rounded-[2rem] bg-white border border-slate-100">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-950 text-white font-black uppercase tracking-widest text-[8px]">
                        <tr>
                          <th className="px-6 py-4">TAREA</th>
                          <th className="px-6 py-4">OPERARIO</th>
                          <th className="px-6 py-4 text-center">INICIO</th>
                          <th className="px-6 py-4 text-center">FIN</th>
                          <th className="px-6 py-4 text-right">DURACIÓN (REDON)</th>
                          <th className="px-6 py-4 text-center">ACCIONES</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {loadingTaskLogs ? (
                          <tr><td colSpan={6} className="py-16 text-center animate-pulse text-slate-300 font-black uppercase text-[10px]">Cargando registros...</td></tr>
                        ) : taskLogs.length === 0 ? (
                          <tr><td colSpan={6} className="py-16 text-center text-slate-300 font-black uppercase text-[10px]">Sin actividad en el periodo</td></tr>
                        ) : taskLogs.map(log => {
                          const roundedMs = getRoundedDurationMs(log.start_time, log.end_time);
                          const durationStr = log.end_time ? formatMsToHHMM(roundedMs) : '--:--';
                          
                          return (
                            <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4 font-black text-slate-800 uppercase">{log.tasks?.name || 'Desconocida'}</td>
                              <td className="px-6 py-4 font-bold text-indigo-600 uppercase">{log.profiles?.full_name || log.operator_email}</td>
                              <td className="px-6 py-4 text-slate-400 font-bold text-center text-[10px]">
                                {new Date(log.start_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                              </td>
                              <td className="px-6 py-4 text-slate-400 font-bold text-center text-[10px]">
                                {log.end_time ? new Date(log.end_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : <span className="text-rose-500 font-black">ABIERTA</span>}
                              </td>
                              <td className="px-6 py-4 text-right font-black text-slate-900">
                                {durationStr}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <div className="flex justify-center gap-2">
                                  {user.role === 'admin' && (
                                    <>
                                      {!log.end_time && (
                                        <button 
                                          onClick={() => handleFinishTaskLog(log.id)}
                                          className="bg-emerald-50 text-emerald-600 p-2 rounded-lg hover:bg-emerald-100 transition-all active:scale-90"
                                          title="Finalizar tarea manualmente"
                                        >
                                          🏁
                                        </button>
                                      )}
                                      <button 
                                        onClick={() => handleDeleteTaskLog(log.id)}
                                        className="bg-rose-50 text-rose-600 p-2 rounded-lg hover:bg-rose-100 transition-all active:scale-90"
                                        title="Eliminar registro"
                                      >
                                        🗑️
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                 </div>
              </section>
            ) : (
              <section className="space-y-6 animate-fade-in">
                <div className="flex justify-between items-center mb-6">
                   <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">Gestión de Tareas Disponibles</h3>
                   <button onClick={() => { setEditingTaskId(null); setTaskForm({ name: '', allowed_roles: [], is_timed: false }); setShowTaskModal(true); }} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-100 active:scale-95 transition-all">Nueva Tarea</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                   {tasks.map(t => (
                     <div key={t.id} className="p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex flex-col justify-between group transition-all hover:bg-white hover:shadow-xl relative overflow-hidden h-44">
                        <div className="flex justify-between items-start">
                          <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-lg">
                            {t.is_timed ? '⏱️' : '📌'}
                          </div>
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={() => openEditTask(t)} className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-400 flex items-center justify-center">✏️</button>
                            <button onClick={() => deleteTask(t.id)} className="w-8 h-8 rounded-lg bg-rose-50 text-rose-400 flex items-center justify-center">🗑️</button>
                          </div>
                        </div>
                        <div className="mt-4">
                          <p className="font-black text-slate-800 uppercase text-xs line-clamp-1">{t.name}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {t.allowed_roles.map(r => (
                              <span key={r} className="text-[7px] font-black text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 uppercase">{r}</span>
                            ))}
                          </div>
                        </div>
                     </div>
                   ))}
                </div>
              </section>
            )}
          </div>
        )}

        {activeSubTab === 'machinery' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">Maquinaria y PDAs</h3>
               <button onClick={() => setShowMachineryModal(true)} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-100">Nueva Maquina</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
               {machinery.map(m => (
                 <div key={m.id} className="p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center">
                        {m.type === 'carretilla' ? '🚜' : '📱'}
                      </div>
                      <div>
                        <p className="font-black text-slate-800 uppercase text-sm">{m.identifier}</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">{m.type}</p>
                      </div>
                    </div>
                    <button onClick={() => deleteMachinery(m.id)} className="w-10 h-10 rounded-xl bg-rose-100 text-rose-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">🗑️</button>
                 </div>
               ))}
            </div>
          </div>
        )}

        {activeSubTab === 'truckers' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">Transportistas Habituales</h3>
               <button onClick={() => setShowTruckerModal(true)} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-100">Nuevo Camión</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
               {truckers.map(t => (
                 <div key={t.id} className="p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex items-center justify-between group">
                    <div>
                      <p className="font-black text-slate-800 uppercase text-sm">{t.label}</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">Registrado</p>
                    </div>
                    <button onClick={() => deleteTrucker(t.id)} className="w-10 h-10 rounded-xl bg-rose-100 text-rose-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">🗑️</button>
                 </div>
               ))}
            </div>
          </div>
        )}

        {activeSubTab === 'sectors' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 shadow-sm space-y-4">
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
                <p className="text-5xl font-black">{stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0}%</p>
                <p className="text-[10px] font-bold uppercase tracking-widest mt-4 opacity-60">Saturación del Almacén</p>
             </div>
          </div>
        )}

        {activeSubTab === 'reports' && (
          <div className="space-y-12 animate-fade-in">
             <div className="flex flex-col md:flex-row gap-6 items-end mb-8">
               <div className="flex-1 space-y-4">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Periodo del Informe</label>
                 <div className="flex flex-wrap gap-2">
                    <button onClick={setRangeToToday} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${scope === 'today' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>Hoy</button>
                    <button onClick={setRangeToThisWeek} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${scope === 'week' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>Esta Semana</button>
                    <button onClick={() => setScope('range')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${scope === 'range' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>Manual</button>
                 </div>
                 <div className="flex gap-2">
                    <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setScope('range'); }} className="bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none flex-1 border border-slate-100" />
                    <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setScope('range'); }} className="bg-slate-50 p-4 rounded-2xl text-xs font-bold outline-none flex-1 border border-slate-100" />
                 </div>
               </div>
            </div>

            <section className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-800 uppercase tracking-tight ml-2">Desglose Ocupación por Planta y Tamaño</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 {warehouseBreakdown.map((plantData: any) => (
                   <div key={plantData.plant} className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 space-y-6">
                      <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                        <div>
                          <h4 className="text-3xl font-bold text-indigo-600 leading-none">{plantData.plant}</h4>
                          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.2em] mt-2">PLANTA DE ALMACENAMIENTO</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-semibold text-slate-800">{plantData.avgOccupancy}%</p>
                          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-1">Media Ocupación</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {plantData.sizeBreakdown.map((sizeData: any) => (
                          <div key={sizeData.size} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                             <div className="flex justify-between items-center mb-4">
                                <span className="text-sm font-semibold text-slate-800 uppercase">{sizeData.size}</span>
                                <span className="text-base font-bold text-indigo-500">{sizeData.occupancy}%</span>
                             </div>
                             <div className="grid grid-cols-4 gap-2 text-center">
                               <div className="flex flex-col">
                                 <span className="text-lg font-semibold text-slate-800 leading-none">{sizeData.total}</span>
                                 <span className="text-[10px] font-medium text-slate-400 uppercase mt-2">Capacidad</span>
                               </div>
                               <div className="flex flex-col">
                                 <span className="text-lg font-semibold text-rose-500 leading-none">{sizeData.full}</span>
                                 <span className="text-[10px] font-medium text-slate-400 uppercase mt-2">Llenos</span>
                               </div>
                               <div className="flex flex-col">
                                 <span className="text-lg font-semibold text-amber-500 leading-none">{sizeData.half}</span>
                                 <span className="text-[10px] font-medium text-slate-400 uppercase mt-2">Medios</span>
                               </div>
                               <div className="flex flex-col">
                                 <span className="text-lg font-semibold text-emerald-500 leading-none">{sizeData.empty}</span>
                                 <span className="text-[10px] font-medium text-slate-400 uppercase mt-2">Libres</span>
                               </div>
                             </div>
                             <div className="mt-5 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 transition-all" style={{width: `${sizeData.occupancy}%`}}></div>
                             </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-center text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-2">Ocupación real calculada sobre {plantData.totalSlots} huecos en {plantData.plant}</p>
                   </div>
                 ))}
              </div>
            </section>

            <section className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-800 uppercase tracking-tight ml-2">Rendimiento Operarios (Promedio en Periodo Seleccionado)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {getOperatorStats().map(([key, op]) => (
                  <div key={key} className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex items-center justify-between group">
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-2xl shadow-sm">👷</div>
                      <div>
                        <p className="font-semibold text-slate-800 uppercase text-sm tracking-tight">{op.name}</p>
                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-[0.2em] mt-1">{op.count} CAPTURAS EN EL PERIODO</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-semibold text-indigo-600 leading-none">{calculateAvgTime(op.logs)}</p>
                      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mt-1">Tiempo Medio</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      {showTaskModal && (
        <div className="fixed inset-0 z-[300] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
           <form onSubmit={handleCreateOrUpdateTask} className="bg-white w-full max-sm rounded-[3rem] p-10 shadow-2xl space-y-6 animate-fade-in border border-white">
              <div className="text-center">
                 <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">{editingTaskId ? 'Editar Tarea' : 'Configurar Tarea'}</h3>
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Definir actividad</p>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Nombre de la Tarea</label>
                  <input 
                    autoFocus 
                    placeholder="EJ: TRASPASOS JUNCARIL" 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 font-black text-xs text-center outline-none focus:border-indigo-500 uppercase" 
                    value={taskForm.name} 
                    onChange={e => setTaskForm({ ...taskForm, name: e.target.value })} 
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Roles Permitidos</label>
                  <div className="grid grid-cols-2 gap-2">
                    {roles.map(role => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => toggleRoleForTask(role.name)}
                        className={`py-3 rounded-xl text-[8px] font-black uppercase tracking-widest border transition-all ${taskForm.allowed_roles.includes(role.name) ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-slate-50 text-slate-400 border-slate-100'}`}
                      >
                        {role.name.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between bg-slate-50 p-5 rounded-3xl border border-slate-100">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-800 uppercase">Tarea de Tiempo</span>
                    <span className="text-[7px] font-bold text-slate-400 uppercase">Activa cronómetro al iniciar</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTaskForm({ ...taskForm, is_timed: !taskForm.is_timed })}
                    className={`w-12 h-6 rounded-full relative transition-all ${taskForm.is_timed ? 'bg-indigo-600' : 'bg-slate-300'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${taskForm.is_timed ? 'left-7 shadow-sm' : 'left-1 shadow-none'}`}></div>
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                 <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px] active:scale-95 transition-all">
                    {loading ? 'GUARDANDO...' : (editingTaskId ? 'Actualizar Tarea' : 'Guardar Tarea')}
                 </button>
                 <button type="button" onClick={() => { setShowTaskModal(false); setEditingTaskId(null); }} className="w-full py-4 text-slate-400 font-black text-[9px] uppercase tracking-[0.2em]">Cancelar</button>
              </div>
           </form>
        </div>
      )}

      {showTruckerModal && (
        <div className="fixed inset-0 z-[300] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
           <form onSubmit={handleCreateTrucker} className="bg-white w-full max-sm rounded-[3rem] p-10 shadow-2xl space-y-6 animate-fade-in border border-white">
              <div className="text-center">
                 <h3 className="text-xl font-black text-slate-800 uppercase">Nuevo Transportista</h3>
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Registrar para habituales</p>
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

      {showMachineryModal && (
        <div className="fixed inset-0 z-[300] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
           <form onSubmit={handleCreateMachinery} className="bg-white w-full max-w-sm rounded-[3rem] p-10 shadow-2xl space-y-6 animate-fade-in border border-white">
              <div className="text-center">
                 <h3 className="text-xl font-black text-slate-800 uppercase">Nueva Maquinaria</h3>
                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Carretillas y PDAs</p>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Tipo</label>
                  <select 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 font-black text-xs outline-none focus:border-indigo-500 transition-all uppercase"
                    value={machineryForm.type}
                    onChange={e => setMachineryForm({ ...machineryForm, type: e.target.value as any })}
                  >
                    <option value="carretilla">🚜 CARRETILLA</option>
                    <option value="pda">📱 PDA</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-2">Identificador</label>
                  <input 
                    autoFocus 
                    placeholder="EJ: C-14, PDA-02..." 
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-6 font-black text-xs text-center outline-none focus:border-indigo-500 uppercase" 
                    value={machineryForm.identifier} 
                    onChange={e => setMachineryForm({ ...machineryForm, identifier: e.target.value })} 
                  />
                </div>
              </div>

              <div className="space-y-3">
                 <button type="submit" className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-[10px]">Registrar Maquina</button>
                 <button type="button" onClick={() => setShowMachineryModal(false)} className="w-full py-4 text-slate-400 font-black text-[9px] uppercase tracking-[0.2em]">Cancelar</button>
              </div>
           </form>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
