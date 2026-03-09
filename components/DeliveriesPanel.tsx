
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile, Delivery, Trucker, DeliveryLog } from '../types';

interface DeliveriesPanelProps {
  user: UserProfile;
}

const POSTAL_CODES: Record<string, string> = {
  '28001': 'Madrid', '08001': 'Barcelona', '41001': 'Sevilla', '46001': 'Valencia',
  '29001': 'Málaga', '30001': 'Murcia', '07001': 'Palma de Mallorca', '35001': 'Las Palmas',
  '48001': 'Bilbao', '03001': 'Alicante', '50001': 'Zaragoza', '47001': 'Valladolid',
  '33001': 'Oviedo', '15001': 'A Coruña', '36001': 'Pontevedra', '39001': 'Santander',
  '31001': 'Pamplona', '20001': 'San Sebastián', '01001': 'Vitoria', '26001': 'Logroño',
  '18001': 'Granada', '18210': 'Peligros', '18230': 'Atarfe', '18200': 'Maracena',
  '18100': 'Armilla', '18140': 'La Zubia', '18151': 'Ogíjares', '18194': 'Churriana de la Vega',
  '18015': 'Granada (Norte)', '18600': 'Motril', '18613': 'Motril (Puerto)', '18690': 'Almuñécar',
  '18700': 'Vélez de Benaudalla', '18800': 'Baza', '18500': 'Guadix', '04001': 'Almería',
  '23001': 'Jaén', '14001': 'Córdoba', '11001': 'Cádiz', '21001': 'Huelva',
  '29002': 'Málaga (Centro)', '29620': 'Torremolinos', '29640': 'Fuengirola', '29600': 'Marbella',
  '29700': 'Vélez-Málaga', '29200': 'Antequera', '41002': 'Sevilla (Centro)', '41500': 'Alcalá de Guadaíra',
  '41700': 'Dos Hermanas', '41020': 'Sevilla (Este)', '04700': 'El Ejido', '04740': 'Roquetas de Mar'
};

const WAREHOUSES = [
  { id: '2', label: '2 MOTRIL' },
  { id: '3', label: '3 CENTRAL' },
  { id: '5', label: '5 JUNCARIL' },
  { id: '6', label: '6 ALMERIA' },
  { id: '8', label: '8 ALBAN' },
  { id: '9', label: '9 ANTEQUERA' },
  { id: '73', label: '73' }
];

const ZONES = ['GRANADA', 'COSTA', 'ANTEQUERA', 'ALMERÍA'];

const DeliveriesPanel: React.FC<DeliveriesPanelProps> = ({ user }) => {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [trucks, setTrucks] = useState<Trucker[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [view, setView] = useState<'agenda' | 'create'>('agenda');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeZone, setActiveZone] = useState<string>('TODOS');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showHistoryId, setShowHistoryId] = useState<string | null>(null);
  const [deliveryLogs, setDeliveryLogs] = useState<DeliveryLog[]>([]);
  
  const [newDelivery, setNewDelivery] = useState<Partial<Delivery>>({
    warehouse_origin: '3',
    delivery_time: 'morning',
    merchandise_type: ''
  });
  const [postalCodeLocality, setPostalCodeLocality] = useState('');
  const [isSearchingLocality, setIsSearchingLocality] = useState(false);

  useEffect(() => {
    fetchTrucks();
    fetchDeliveries(selectedDate);
  }, [selectedDate]);

  const fetchTrucks = async () => {
    try {
      const { data, error } = await supabase.from('truckers').select('*').order('full_name');
      if (error) throw error;
      
      let sortedTrucks = data?.map((t: any) => ({ 
        id: t.id, 
        label: t.full_name, 
        zone: t.zone,
        created_at: t.created_at 
      })) || [];
      
      // Mover "PENDIENTE ASIGNAR" al principio
      sortedTrucks.sort((a, b) => {
        if (a.label.toUpperCase().includes('PENDIENTE ASIGNAR')) return -1;
        if (b.label.toUpperCase().includes('PENDIENTE ASIGNAR')) return 1;
        return 0;
      });
      
      setTrucks(sortedTrucks);
    } catch (err) {
      console.error("Error fetching trucks:", err);
    }
  };

  const handleUpdateTruckZone = async (truckId: string, zone: string) => {
    try {
      const { error } = await supabase
        .from('truckers')
        .update({ zone })
        .eq('id', truckId);
      
      if (error) throw error;
      
      setTrucks(prev => prev.map(t => t.id === truckId ? { ...t, zone } : t));
    } catch (err) {
      console.error("Error updating truck zone:", err);
    }
  };

  const fetchDeliveries = async (date: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('deliveries')
        .select('*')
        .eq('delivery_date', date)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setDeliveries(data || []);
    } catch (err) {
      console.error("Error fetching deliveries:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async (deliveryId: string) => {
    try {
      const { data, error } = await supabase
        .from('delivery_logs')
        .select('*')
        .eq('delivery_id', deliveryId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setDeliveryLogs(data || []);
    } catch (err) {
      console.error("Error fetching logs:", err);
    }
  };

  const addLog = async (deliveryId: string, action: string, details?: string) => {
    try {
      await supabase.from('delivery_logs').insert([{
        delivery_id: deliveryId,
        user_name: user.full_name,
        action,
        details
      }]);
    } catch (err) {
      console.error("Error adding log:", err);
    }
  };

  const handleCreateDelivery = async () => {
    if (!newDelivery.truck_id || !newDelivery.order_number) {
      setMessage({ type: 'error', text: 'Faltan campos obligatorios (Camión y Pedido)' });
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ...newDelivery,
        delivery_date: selectedDate,
        locality: postalCodeLocality,
        created_by_name: user.full_name
      };

      if (editingId) {
        const { error } = await supabase
          .from('deliveries')
          .update(payload)
          .eq('id', editingId);
        if (error) throw error;
        await addLog(editingId, 'EDICIÓN', `Pedido: ${payload.order_number}, CP: ${payload.postal_code}`);
        setMessage({ type: 'success', text: 'Reparto actualizado correctamente' });
      } else {
        const { data, error } = await supabase.from('deliveries').insert([payload]).select();
        if (error) throw error;
        if (data && data[0]) {
          await addLog(data[0].id, 'CREACIÓN', `Pedido inicial: ${payload.order_number}`);
        }
        setMessage({ type: 'success', text: 'Reparto creado correctamente' });
      }

      setNewDelivery({
        warehouse_origin: '3',
        delivery_time: 'morning',
        merchandise_type: ''
      });
      setPostalCodeLocality('');
      setEditingId(null);
      fetchDeliveries(selectedDate);
      setView('agenda');
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (delivery: Delivery) => {
    setNewDelivery({
      truck_id: delivery.truck_id,
      order_number: delivery.order_number,
      warehouse_origin: delivery.warehouse_origin,
      delivery_time: delivery.delivery_time,
      postal_code: delivery.postal_code,
      merchandise_type: delivery.merchandise_type,
      comments: delivery.comments,
      is_scheduled: delivery.is_scheduled
    });
    setPostalCodeLocality(delivery.locality || '');
    setEditingId(delivery.id);
    setView('create');
  };

  const toggleScheduled = async (delivery: Delivery) => {
    try {
      const newStatus = !delivery.is_scheduled;
      const { error } = await supabase
        .from('deliveries')
        .update({ is_scheduled: newStatus })
        .eq('id', delivery.id);
      
      if (error) throw error;
      
      await addLog(delivery.id, newStatus ? 'AGENDADO' : 'DESAGENDADO');
      
      setDeliveries(prev => prev.map(d => 
        d.id === delivery.id ? { ...d, is_scheduled: newStatus } : d
      ));
    } catch (err) {
      console.error("Error toggling scheduled status:", err);
    }
  };

  const handleDeleteDelivery = async (id: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este reparto?')) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('deliveries')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      setDeliveries(prev => prev.filter(d => d.id !== id));
      setMessage({ type: 'success', text: 'Reparto eliminado correctamente' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handlePostalCodeChange = async (code: string) => {
    setNewDelivery(prev => ({ ...prev, postal_code: code }));
    
    if (code.length === 5) {
      setIsSearchingLocality(true);
      try {
        // Usamos la API de Zippopotam para España
        const response = await window.fetch(`https://api.zippopotam.us/es/${code}`);
        if (response.ok) {
          const data = await response.json();
          if (data.places && data.places.length > 0) {
            const place = data.places[0];
            setPostalCodeLocality(place['place name']);
          }
        } else {
          // Fallback a la lista local si la API falla o no encuentra el CP
          setPostalCodeLocality(POSTAL_CODES[code] || '');
        }
      } catch (err) {
        console.error("Error buscando localidad:", err);
        setPostalCodeLocality(POSTAL_CODES[code] || '');
      } finally {
        setIsSearchingLocality(false);
      }
    } else {
      setPostalCodeLocality('');
    }
  };

  return (
    <div className="p-2 md:p-4 w-full animate-fade-in">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-6 max-w-[1800px] mx-auto">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Agenda de Repartos</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Distribución y Logística</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[9px] font-bold text-slate-400 uppercase">Buscar:</span>
            <input 
              type="text" 
              placeholder="Camión..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent text-[10px] font-bold text-slate-700 outline-none w-24 md:w-32"
            />
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[9px] font-bold text-slate-400 uppercase">Fecha:</span>
            <input 
              type="date" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-[10px] font-bold text-slate-700 outline-none"
            />
          </div>
          <button 
            onClick={() => setView(view === 'agenda' ? 'create' : 'agenda')}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100 active:scale-95 transition-all"
          >
            {view === 'agenda' ? 'Nuevo Reparto' : 'Ver Agenda'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-2xl mb-8 text-[11px] font-semibold text-center animate-fade-in uppercase tracking-widest ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {message.text}
        </div>
      )}

      {view === 'create' ? (
        <div className="bg-white rounded-[3rem] p-8 shadow-xl border border-slate-100 animate-fade-in max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Camión / Transportista</label>
                <select 
                  value={newDelivery.truck_id || ''}
                  onChange={e => setNewDelivery(prev => ({ ...prev, truck_id: e.target.value }))}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                  tabIndex={1}
                >
                  <option value="">Seleccionar camión...</option>
                  {trucks.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Código Postal (Opcional)</label>
                <input 
                  type="text" 
                  value={newDelivery.postal_code || ''}
                  onChange={e => handlePostalCodeChange(e.target.value)}
                  placeholder="Ej: 28001"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                  tabIndex={2}
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Población / Localidad</label>
                <div className="relative">
                  <input 
                    type="text" 
                    value={postalCodeLocality}
                    onChange={e => setPostalCodeLocality(e.target.value)}
                    placeholder="Ej: Madrid"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                    tabIndex={2.5}
                  />
                  {isSearchingLocality && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Número de Pedido</label>
                <input 
                  type="text" 
                  value={newDelivery.order_number || ''}
                  onChange={e => setNewDelivery(prev => ({ ...prev, order_number: e.target.value }))}
                  placeholder="Ej: 987654"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                  tabIndex={3}
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Tipo de Mercancía</label>
                <input 
                  type="text" 
                  value={newDelivery.merchandise_type || ''}
                  onChange={e => setNewDelivery(prev => ({ ...prev, merchandise_type: e.target.value }))}
                  placeholder="Ej: Paletizado / Paquetería"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                  tabIndex={4}
                />
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Almacén de Salida</label>
                <select 
                  value={newDelivery.warehouse_origin || '3'}
                  onChange={e => setNewDelivery(prev => ({ ...prev, warehouse_origin: e.target.value }))}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                  tabIndex={5}
                >
                  {WAREHOUSES.map(wh => (
                    <option key={wh.id} value={wh.id}>{wh.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Horario de Entrega</label>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setNewDelivery(prev => ({ ...prev, delivery_time: 'morning' }))}
                    className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${newDelivery.delivery_time === 'morning' ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                    tabIndex={6}
                  >
                    Mañana
                  </button>
                  <button 
                    onClick={() => setNewDelivery(prev => ({ ...prev, delivery_time: 'afternoon' }))}
                    className={`flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${newDelivery.delivery_time === 'afternoon' ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                    tabIndex={7}
                  >
                    Tarde
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Comentarios / Observaciones</label>
                <textarea 
                  value={newDelivery.comments || ''}
                  onChange={e => setNewDelivery(prev => ({ ...prev, comments: e.target.value }))}
                  placeholder="Notas para el transportista..."
                  rows={4}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all resize-none"
                  tabIndex={8}
                />
              </div>
            </div>
          </div>
          
          <button 
            onClick={handleCreateDelivery}
            disabled={loading}
            className="w-full bg-slate-900 text-white font-black py-5 rounded-[2rem] shadow-xl uppercase tracking-widest text-xs active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? 'PROCESANDO...' : editingId ? 'GUARDAR CAMBIOS' : 'CONFIRMAR Y CREAR REPARTO'}
          </button>
          
          <button 
            onClick={() => {
              setEditingId(null);
              setNewDelivery({
                warehouse_origin: '3',
                delivery_time: 'morning',
                merchandise_type: ''
              });
              setView('agenda');
            }}
            className="w-full mt-4 py-4 bg-slate-100 text-slate-600 font-black rounded-[2rem] uppercase tracking-widest text-xs active:scale-95 transition-all hover:bg-slate-200"
          >
            CANCELAR Y VOLVER
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-6 w-full max-w-[1800px] mx-auto">
          {/* Tabs de Zonas */}
          <div className="flex flex-wrap gap-2 mb-2 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
            {['TODOS', ...ZONES].map(zone => (
              <button
                key={zone}
                onClick={() => setActiveZone(zone)}
                className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  activeZone === zone 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' 
                    : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                }`}
              >
                {zone}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="py-20 text-center animate-pulse">
              <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest">Cargando agenda de repartos...</p>
            </div>
          ) : trucks.filter(truck => 
              deliveries.some(d => d.truck_id === truck.id) && 
              truck.label.toLowerCase().includes(searchTerm.toLowerCase()) &&
              (activeZone === 'TODOS' || truck.zone === activeZone)
            ).length === 0 ? (
            <div className="bg-white rounded-[3rem] p-20 text-center border border-slate-100 w-full">
              <p className="text-4xl mb-4">🚛</p>
              <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest">
                {searchTerm ? 'No se encontraron camiones con ese nombre' : 'No hay repartos asignados para esta zona/fecha'}
              </p>
            </div>
          ) : trucks.filter(truck => 
              deliveries.some(d => d.truck_id === truck.id) && 
              truck.label.toLowerCase().includes(searchTerm.toLowerCase()) &&
              (activeZone === 'TODOS' || truck.zone === activeZone)
            ).map(truck => {
            const truckDeliveries = deliveries
              .filter(d => d.truck_id === truck.id)
              .sort((a, b) => {
                if (a.delivery_time === 'morning' && b.delivery_time === 'afternoon') return -1;
                if (a.delivery_time === 'afternoon' && b.delivery_time === 'morning') return 1;
                return 0;
              });
            return (
              <div key={truck.id} className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden flex flex-col w-full">
                <div className="bg-slate-900 px-6 py-3 flex justify-between items-center">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">🚚</span>
                      <h4 className="text-white text-sm font-black uppercase tracking-widest">{truck.label}</h4>
                    </div>
                    
                    <div className="h-6 w-px bg-white/20" />
                    
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">ZONA:</span>
                      <select
                        value={truck.zone || ''}
                        onChange={(e) => handleUpdateTruckZone(truck.id, e.target.value)}
                        className="bg-white/10 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border border-white/10 outline-none focus:border-indigo-500 transition-all cursor-pointer"
                      >
                        <option value="" className="text-slate-900">SIN ZONA</option>
                        {ZONES.map(z => (
                          <option key={z} value={z} className="text-slate-900">{z}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <span className="bg-white/10 text-white/80 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest">
                    {truckDeliveries.length} REPARTOS
                  </span>
                </div>
                
                  <div className="p-3 flex-1 space-y-2">
                    {truckDeliveries.length === 0 ? (
                      <div className="py-10 text-center">
                        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest italic">Sin repartos para hoy</p>
                      </div>
                    ) : truckDeliveries.map(delivery => (
                      <React.Fragment key={delivery.id}>
                        <div className={`p-2 px-6 rounded-xl border transition-all group flex items-center justify-between gap-3 ${
                          delivery.is_scheduled 
                            ? 'bg-emerald-50 border-emerald-100' 
                            : 'bg-slate-50 border-slate-100 hover:border-indigo-200'
                        }`}>
                        <div className="flex items-center gap-8 flex-1">
                          <div className="w-28 shrink-0">
                            <p className="text-base font-black text-slate-800 tracking-tighter">#{delivery.order_number}</p>
                            <p className="text-[11px] font-black text-indigo-600 uppercase tracking-widest">
                              {WAREHOUSES.find(w => w.id === delivery.warehouse_origin)?.label || delivery.warehouse_origin}
                            </p>
                          </div>

                          <div className="h-12 w-px bg-slate-200 shrink-0" />

                          <div className="flex-1 flex flex-col justify-center gap-2 py-1">
                            <div className="flex flex-wrap items-start gap-x-8 gap-y-1">
                              <div className="flex items-center gap-2 min-w-[180px]">
                                <span className="text-lg">📍</span>
                                <p className="text-[12px] font-bold text-slate-700 uppercase leading-tight">
                                  {delivery.postal_code} - {delivery.locality}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 flex-1 min-w-[150px]">
                                <span className="text-lg">📦</span>
                                <p className="text-[12px] font-bold text-slate-700 uppercase leading-tight break-words">
                                  {delivery.merchandise_type}
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex flex-col gap-1">
                              {delivery.created_by_name && (
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Por: {delivery.created_by_name}</p>
                              )}
                              {delivery.comments && (
                                <div className="bg-slate-100/80 px-3 py-1.5 rounded-lg border-l-4 border-indigo-500 w-full mt-0.5">
                                  <p className="text-[11px] text-slate-900 font-bold italic leading-snug break-words">
                                    {delivery.comments}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`text-[9px] font-black px-3 py-1.5 rounded-lg uppercase shadow-sm ${delivery.delivery_time === 'morning' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-indigo-100 text-indigo-700 border border-indigo-200'}`}>
                            {delivery.delivery_time === 'morning' ? 'MAÑANA' : 'TARDE'}
                          </span>

                          <div className="flex items-center gap-0.5 bg-white p-0.5 rounded-xl border border-slate-100 shadow-sm">
                            <button 
                              onClick={() => toggleScheduled(delivery)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${delivery.is_scheduled ? 'bg-emerald-500 text-white shadow-md shadow-emerald-100' : 'hover:bg-slate-50 text-slate-400'}`}
                              title={delivery.is_scheduled ? 'Desmarcar agendado' : 'Marcar como agendado'}
                            >
                              <span className="text-xs">{delivery.is_scheduled ? '✓' : '📅'}</span>
                              <span className="text-[9px] font-black uppercase tracking-widest">{delivery.is_scheduled ? 'AGENDADO' : 'AGENDAR'}</span>
                            </button>

                            <div className="w-px h-4 bg-slate-100 mx-0.5" />

                            <button 
                              onClick={() => {
                                if (showHistoryId === delivery.id) {
                                  setShowHistoryId(null);
                                } else {
                                  setShowHistoryId(delivery.id);
                                  fetchLogs(delivery.id);
                                }
                              }}
                              className={`p-1.5 rounded-lg transition-all ${showHistoryId === delivery.id ? 'bg-indigo-600 text-white' : 'hover:bg-slate-50 text-slate-400'}`}
                              title="Ver histórico"
                            >
                              <span className="text-xs">📜</span>
                            </button>

                            <button 
                              onClick={() => handleEdit(delivery)}
                              className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-all"
                              title="Editar reparto"
                            >
                              <span className="text-xs">✏️</span>
                            </button>

                            <button 
                              onClick={() => handleDeleteDelivery(delivery.id)}
                              className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition-all"
                              title="Eliminar reparto"
                            >
                              <span className="text-xs">🗑️</span>
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      {showHistoryId === delivery.id && (
                        <div className="mx-6 mb-4 bg-white rounded-2xl border border-slate-100 shadow-inner p-4 animate-fade-in">
                          <div className="flex items-center justify-between mb-3 border-b border-slate-50 pb-2">
                            <h5 className="text-[10px] font-black text-slate-800 uppercase tracking-widest">Histórico de Movimientos</h5>
                            <button onClick={() => setShowHistoryId(null)} className="text-slate-300 hover:text-slate-500 text-xs">✕</button>
                          </div>
                          <div className="space-y-3">
                            {deliveryLogs.length === 0 ? (
                              <p className="text-[9px] text-slate-400 italic text-center py-2">No hay registros para este reparto</p>
                            ) : deliveryLogs.map(log => (
                              <div key={log.id} className="flex items-start gap-3 text-[9px]">
                                <div className="w-20 shrink-0 text-slate-400 font-medium">
                                  {new Date(log.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </div>
                                <div className="shrink-0">
                                  <span className={`px-2 py-0.5 rounded-md font-black uppercase tracking-tighter ${
                                    log.action === 'CREACIÓN' ? 'bg-emerald-100 text-emerald-700' :
                                    log.action === 'EDICIÓN' ? 'bg-blue-100 text-blue-700' :
                                    log.action === 'AGENDADO' ? 'bg-indigo-100 text-indigo-700' :
                                    'bg-slate-100 text-slate-600'
                                  }`}>
                                    {log.action}
                                  </span>
                                </div>
                                <div className="flex-1">
                                  <span className="font-bold text-slate-700">{log.user_name}:</span>
                                  <span className="ml-2 text-slate-500">{log.details || 'Sin detalles adicionales'}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DeliveriesPanel;
