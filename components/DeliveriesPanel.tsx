
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { UserProfile, Delivery, Trucker } from '../types';

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

const DeliveriesPanel: React.FC<DeliveriesPanelProps> = ({ user }) => {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [trucks, setTrucks] = useState<Trucker[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [view, setView] = useState<'agenda' | 'create'>('agenda');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  
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
      setTrucks(data?.map((t: any) => ({ id: t.id, label: t.full_name, created_at: t.created_at })) || []);
    } catch (err) {
      console.error("Error fetching trucks:", err);
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

  const handleCreateDelivery = async () => {
    if (!newDelivery.truck_id || !newDelivery.order_number || !newDelivery.postal_code) {
      setMessage({ type: 'error', text: 'Faltan campos obligatorios' });
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
        setMessage({ type: 'success', text: 'Reparto actualizado correctamente' });
      } else {
        const { error } = await supabase.from('deliveries').insert([payload]);
        if (error) throw error;
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
      comments: delivery.comments
    });
    setPostalCodeLocality(delivery.locality || '');
    setEditingId(delivery.id);
    setView('create');
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
    <div className="p-4 md:p-6 w-full animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 max-w-7xl mx-auto">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Agenda de Repartos</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Distribución y Logística</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Buscar:</span>
            <input 
              type="text" 
              placeholder="Camión..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none w-24 md:w-40"
            />
          </div>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Fecha:</span>
            <input 
              type="date" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none"
            />
          </div>
          <button 
            onClick={() => setView(view === 'agenda' ? 'create' : 'agenda')}
            className="bg-indigo-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100 active:scale-95 transition-all"
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
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Código Postal</label>
                <div className="flex gap-3 items-center">
                  <input 
                    type="text" 
                    value={newDelivery.postal_code || ''}
                    onChange={e => handlePostalCodeChange(e.target.value)}
                    placeholder="28001"
                    className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-6 text-sm font-bold outline-none focus:border-indigo-500 transition-all"
                    tabIndex={2}
                  />
                    {postalCodeLocality && (
                      <div className="bg-indigo-50 text-indigo-600 px-4 py-4 rounded-2xl border border-indigo-100 font-black text-[10px] uppercase animate-fade-in">
                        {isSearchingLocality ? 'Buscando...' : postalCodeLocality}
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
          {editingId && (
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
              className="w-full mt-4 py-2 text-slate-400 font-black text-[9px] uppercase tracking-widest hover:text-slate-600 transition-all"
            >
              Cancelar Edición
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 w-full">
          {loading ? (
            <div className="py-20 text-center animate-pulse">
              <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest">Cargando agenda de repartos...</p>
            </div>
          ) : trucks.filter(truck => 
              deliveries.some(d => d.truck_id === truck.id) && 
              truck.label.toLowerCase().includes(searchTerm.toLowerCase())
            ).length === 0 ? (
            <div className="bg-white rounded-[3rem] p-20 text-center border border-slate-100 max-w-2xl mx-auto w-full">
              <p className="text-4xl mb-4">🚛</p>
              <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest">
                {searchTerm ? 'No se encontraron camiones con ese nombre' : 'No hay repartos asignados para esta fecha'}
              </p>
            </div>
          ) : trucks.filter(truck => 
              deliveries.some(d => d.truck_id === truck.id) && 
              truck.label.toLowerCase().includes(searchTerm.toLowerCase())
            ).map(truck => {
            const truckDeliveries = deliveries.filter(d => d.truck_id === truck.id);
            return (
              <div key={truck.id} className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden flex flex-col w-full">
                <div className="bg-slate-900 px-6 py-2 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🚚</span>
                    <h4 className="text-white text-xs font-black uppercase tracking-widest">{truck.label}</h4>
                  </div>
                  <span className="bg-white/10 text-white/80 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">
                    {truckDeliveries.length} REPARTOS
                  </span>
                </div>
                
                  <div className="p-3 flex-1 space-y-2">
                    {truckDeliveries.length === 0 ? (
                      <div className="py-10 text-center">
                        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest italic">Sin repartos para hoy</p>
                      </div>
                    ) : truckDeliveries.map(delivery => (
                      <div key={delivery.id} className="bg-slate-50 p-2 px-6 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-all group flex items-center justify-between gap-4">
                        <div className="flex items-center gap-8 flex-1">
                          <div className="w-28 shrink-0">
                            <p className="text-sm font-black text-slate-800 tracking-tighter">#{delivery.order_number}</p>
                            <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">
                              {WAREHOUSES.find(w => w.id === delivery.warehouse_origin)?.label || delivery.warehouse_origin}
                            </p>
                          </div>

                          <div className="h-8 w-px bg-slate-200 shrink-0" />

                          <div className="flex-1 flex items-center gap-10">
                            <div className="flex items-center gap-3 min-w-[200px]">
                              <span className="text-sm">📍</span>
                              <div>
                                <p className="text-[10px] font-bold text-slate-700 uppercase">
                                  {delivery.postal_code} - {delivery.locality}
                                </p>
                                {delivery.created_by_name && (
                                  <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Por: {delivery.created_by_name}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 min-w-[160px]">
                              <span className="text-sm">📦</span>
                              <p className="text-[10px] font-bold text-slate-700 uppercase">{delivery.merchandise_type}</p>
                            </div>
                            {delivery.comments && (
                              <div className="hidden xl:block flex-1">
                                <p className="text-[9px] text-slate-900 font-bold italic">"{delivery.comments}"</p>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          <span className={`text-[8px] font-black px-4 py-2 rounded-xl uppercase shadow-sm ${delivery.delivery_time === 'morning' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-indigo-100 text-indigo-700 border border-indigo-200'}`}>
                            {delivery.delivery_time === 'morning' ? 'MAÑANA' : 'TARDE'}
                          </span>
                          <button 
                            onClick={() => handleEdit(delivery)}
                            className="p-2.5 hover:bg-white rounded-xl text-slate-400 hover:text-indigo-600 transition-all border border-transparent hover:border-slate-200 shadow-sm"
                            title="Editar reparto"
                          >
                            ✏️
                          </button>
                        </div>
                      </div>
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
