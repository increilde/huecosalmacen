
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { CustomerPickup, UserProfile } from '../types';

interface RTCPanelProps {
  user: UserProfile;
}

const RTCPanel: React.FC<RTCPanelProps> = ({ user }) => {
  const [orderNumber, setOrderNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [activePickups, setActivePickups] = useState<CustomerPickup[]>([]);
  const [finishedPickups, setFinishedPickups] = useState<CustomerPickup[]>([]);
  const [tab, setTab] = useState<'active' | 'finished'>('active');

  useEffect(() => {
    fetchPickups();
    
    const channel = supabase
      .channel('rtc_panel_changes')
      .on('postgres_changes', { event: '*', table: 'customer_pickups' }, () => {
        fetchPickups();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchPickups = async () => {
    const today = new Date().toISOString().split('T')[0];
    
    // Active
    const { data: activeData } = await supabase
      .from('customer_pickups')
      .select('*')
      .neq('status', 'completed')
      .order('created_at', { ascending: true });
    
    if (activeData) setActivePickups(activeData);

    // Finished today
    const { data: finishedData } = await supabase
      .from('customer_pickups')
      .select('*')
      .eq('status', 'completed')
      .gte('created_at', `${today}T00:00:00`)
      .order('completed_at', { ascending: false });
    
    if (finishedData) setFinishedPickups(finishedData);
  };

  const handleCreatePickup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderNumber.trim()) return;
    
    setLoading(true);
    setMessage(null);
    
    try {
      const { error } = await supabase.from('customer_pickups').insert([{
        order_number: orderNumber.trim(),
        status: 'waiting'
      }]);
      
      if (error) throw error;
      
      setOrderNumber('');
      setMessage({ type: 'success', text: 'PEDIDO RTC ENVIADO CORRECTAMENTE' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const getWaitTime = (createdAt: string) => {
    const start = new Date(createdAt).getTime();
    const now = new Date().getTime();
    const diff = now - start;
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getWorkTime = (acceptedAt: string) => {
    const start = new Date(acceptedAt).getTime();
    const now = new Date().getTime();
    const diff = now - start;
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Formulario de Envío */}
        <div className="md:col-span-1">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 sticky top-24">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-indigo-600 w-10 h-10 rounded-2xl flex items-center justify-center text-white text-xl shadow-lg shadow-indigo-200">📋</div>
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Nuevo RTC</h2>
            </div>

            <form onSubmit={handleCreatePickup} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Número de Pedido</label>
                <input 
                  type="text" 
                  value={orderNumber}
                  onChange={e => setOrderNumber(e.target.value)}
                  placeholder="EJ: 123456"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 focus:border-indigo-500 font-black text-xl outline-none uppercase transition-all text-center"
                  required
                />
              </div>
              <button 
                type="submit"
                disabled={loading || !orderNumber.trim()}
                className="w-full bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl uppercase tracking-widest text-xs active:scale-95 transition-all disabled:opacity-50"
              >
                {loading ? 'ENVIANDO...' : 'ENVIAR A CARRETILLEROS'}
              </button>
            </form>

            {message && (
              <div className={`mt-6 p-4 rounded-2xl text-[10px] font-black text-center uppercase tracking-widest ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {message.text}
              </div>
            )}
          </div>
        </div>

        {/* Listado de Pedidos */}
        <div className="md:col-span-2">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 min-h-[500px]">
            <div className="flex items-center justify-between mb-8">
              <div className="flex gap-6">
                <button 
                  onClick={() => setTab('active')}
                  className={`text-xs font-black uppercase tracking-widest transition-all relative py-2 ${tab === 'active' ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-400'}`}
                >
                  En Curso ({activePickups.length})
                  {tab === 'active' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-full animate-fade-in"></div>}
                </button>
                <button 
                  onClick={() => setTab('finished')}
                  className={`text-xs font-black uppercase tracking-widest transition-all relative py-2 ${tab === 'finished' ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-400'}`}
                >
                  Finalizados Hoy ({finishedPickups.length})
                  {tab === 'finished' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-full animate-fade-in"></div>}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {tab === 'active' ? (
                activePickups.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                    <span className="text-5xl mb-4">⌛</span>
                    <p className="font-black text-[10px] uppercase tracking-widest">No hay pedidos RTC activos</p>
                  </div>
                ) : activePickups.map(pickup => (
                  <div key={pickup.id} className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex items-center justify-between group hover:border-indigo-200 transition-all">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-sm ${pickup.status === 'waiting' ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
                        {pickup.status === 'waiting' ? '⌛' : '👷'}
                      </div>
                      <div>
                        <p className="text-xl font-black text-slate-800 tracking-tighter">#{pickup.order_number}</p>
                        <p className={`text-[8px] font-black uppercase tracking-widest mt-1 ${pickup.status === 'waiting' ? 'text-amber-600' : 'text-indigo-600'}`}>
                          {pickup.status === 'waiting' ? 'ESPERANDO CARRETILLERO' : `ATENDIDO POR ${pickup.operator_name}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-slate-800">
                        {pickup.status === 'waiting' ? getWaitTime(pickup.created_at) : getWorkTime(pickup.accepted_at!)}
                      </p>
                      <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">
                        {pickup.status === 'waiting' ? 'TIEMPO ESPERA' : 'TIEMPO TRABAJO'}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                finishedPickups.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                    <span className="text-5xl mb-4">✅</span>
                    <p className="font-black text-[10px] uppercase tracking-widest">No hay pedidos finalizados hoy</p>
                  </div>
                ) : finishedPickups.map(pickup => (
                  <div key={pickup.id} className="bg-emerald-50/30 p-6 rounded-3xl border border-emerald-100 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center text-xl text-emerald-600 shadow-sm">✅</div>
                      <div>
                        <p className="text-xl font-black text-slate-800 tracking-tighter">#{pickup.order_number}</p>
                        <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mt-1">
                          FINALIZADO POR {pickup.operator_name}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-slate-800">
                        {pickup.completed_at ? new Date(pickup.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </p>
                      <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">
                        HORA CIERRE
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RTCPanel;
