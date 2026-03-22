import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Delivery, Installation } from '../types';
import { X, Navigation, Clock, MapPin } from 'lucide-react';

type RoutableItem = Delivery | Installation;

// Fix for default marker icon in Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface RouteMapProps {
  truckId: string;
  truckLabel: string;
  deliveries: RoutableItem[];
  onClose: () => void;
  onMaintainRoute?: (orderedDeliveries: any[]) => void;
}

const ORIGIN = {
  lat: 37.2307,
  lng: -3.6554,
  label: 'CENTRO HOGAR SÁNCHEZ (ALBOLOTE)'
};

const LOCALITY_COORDS: Record<string, { lat: number; lng: number }> = {
  'GRANADA': { lat: 37.1773, lng: -3.5986 },
  'ALBOLOTE': { lat: 37.2307, lng: -3.6554 },
  'PELIGROS': { lat: 37.2306, lng: -3.6289 },
  'ATARFE': { lat: 37.2222, lng: -3.6889 },
  'MARACENA': { lat: 37.2075, lng: -3.6333 },
  'ARMILLA': { lat: 37.1442, lng: -3.6267 },
  'LA ZUBIA': { lat: 37.1211, lng: -3.5853 },
  'OGÍJARES': { lat: 37.1194, lng: -3.6083 },
  'CHURRIANA DE LA VEGA': { lat: 37.1492, lng: -3.6453 },
  'GABIA GRANDE': { lat: 37.1347, lng: -3.6683 },
  'GABIA CHICA': { lat: 37.1186, lng: -3.6617 },
  'HÍJAR': { lat: 37.1478, lng: -3.6656 },
  'LAS GABIAS': { lat: 37.1347, lng: -3.6683 },
  'ALHENDÍN': { lat: 37.1083, lng: -3.6458 },
  'OTURA': { lat: 37.0917, lng: -3.6333 },
  'GÓJAR': { lat: 37.1167, lng: -3.6000 },
  'DÍLAR': { lat: 37.0750, lng: -3.6042 },
  'CULLAR VEGA': { lat: 37.1539, lng: -3.6717 },
  'VEGAS DEL GENIL': { lat: 37.1717, lng: -3.6650 },
  'PURCHIL': { lat: 37.1717, lng: -3.6650 },
  'BELICENA': { lat: 37.1867, lng: -3.6833 },
  'AMBROZ': { lat: 37.1652, lng: -3.6648 },
  'SANTA FE': { lat: 37.1894, lng: -3.7183 },
  'PINOS PUENTE': { lat: 37.2514, lng: -3.7486 },
  'PULIANAS': { lat: 37.2250, lng: -3.6083 },
  'JUN': { lat: 37.2250, lng: -3.5917 },
  'VÍZNAR': { lat: 37.2333, lng: -3.5500 },
  'ALFACAR': { lat: 37.2333, lng: -3.5667 },
  'HUÉTOR VEGA': { lat: 37.1458, lng: -3.5708 },
  'CÁJAR': { lat: 37.1333, lng: -3.5750 },
  'MONACHIL': { lat: 37.1333, lng: -3.5417 },
  'PINOS GENIL': { lat: 37.1625, lng: -3.5042 },
  'MOTRIL': { lat: 36.7458, lng: -3.5203 },
  'ALMUÑÉCAR': { lat: 36.7333, lng: -3.6833 },
  'BAZA': { lat: 37.4908, lng: -2.7725 },
  'GUADIX': { lat: 37.3008, lng: -3.1364 },
  'ALMERÍA': { lat: 36.8341, lng: -2.4637 },
  'EL EJIDO': { lat: 36.7761, lng: -2.8144 },
  'ROQUETAS DE MAR': { lat: 36.7642, lng: -2.6147 },
  'ANTEQUERA': { lat: 37.0194, lng: -4.5611 },
  'MÁLAGA': { lat: 36.7213, lng: -4.4214 },
  'MADRID': { lat: 40.4168, lng: -3.7038 },
  'BARCELONA': { lat: 41.3851, lng: 2.1734 },
  'SEVILLA': { lat: 37.3891, lng: -5.9845 },
  'VALENCIA': { lat: 39.4699, lng: -0.3763 },
  'JAÉN': { lat: 37.7796, lng: -3.7849 },
  'CÓRDOBA': { lat: 37.8882, lng: -4.7794 },
  'CÁDIZ': { lat: 36.5271, lng: -6.2886 },
  'HUELVA': { lat: 37.2614, lng: -6.9447 },
  'MOTRIL (PUERTO)': { lat: 36.7214, lng: -3.5222 },
  'VÉLEZ DE BENAUDALLA': { lat: 36.8314, lng: -3.5161 },
  'TORREMOLINOS': { lat: 36.6226, lng: -4.4991 },
  'FUENGIROLA': { lat: 36.5398, lng: -4.6247 },
  'MARBELLA': { lat: 36.5101, lng: -4.8824 },
  'VÉLEZ-MÁLAGA': { lat: 36.7817, lng: -4.1017 },
  'ALCALÁ DE GUADAÍRA': { lat: 37.3333, lng: -5.8500 },
  'DOS HERMANAS': { lat: 37.2833, lng: -5.9167 }
};

const getCoordinates = (item: RoutableItem) => {
  let locality = (item.locality || '').toUpperCase().trim();
  
  if (locality === 'GABIA LA CHICA') locality = 'GABIA CHICA';
  if (locality === 'GABIA LA GRANDE') locality = 'GABIA GRANDE';
  if (locality === 'LAS GABIAS') locality = 'GABIA GRANDE';
  if (locality === 'CÚLLAR VEGA') locality = 'CULLAR VEGA';
  if (locality === 'HUETOR VEGA') locality = 'HUÉTOR VEGA';
  if (locality === 'ALHENDIN') locality = 'ALHENDÍN';
  if (locality === 'GOJAR') locality = 'GÓJAR';
  if (locality === 'DILAR') locality = 'DÍLAR';
  if (locality === 'VIZNAR') locality = 'VÍZNAR';
  if (locality === 'CAJAR') locality = 'CÁJAR';

  const baseCoords = LOCALITY_COORDS[locality] || { lat: 37.1773, lng: -3.5986 };

  const seedStr = item.address || item.order_number || item.id || '';
  const seed = seedStr.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  const random = (s: number) => {
    const x = Math.sin(s) * 10000;
    return x - Math.floor(x);
  };
  
  const spread = item.address ? 0.01 : 0.005;
  const lat = baseCoords.lat + (random(seed) - 0.5) * spread;
  const lng = baseCoords.lng + (random(seed + 1) - 0.5) * spread;
  
  return { lat, lng };
};

const RouteMap: React.FC<RouteMapProps> = ({ truckId, truckLabel, deliveries, onClose, onMaintainRoute }) => {
  const [route, setRoute] = useState<{ lat: number; lng: number; item?: RoutableItem; isOrigin?: boolean; label?: string }[]>([]);
  const [roadGeometry, setRoadGeometry] = useState<[number, number][]>([]);
  const [totalDistance, setTotalDistance] = useState<number>(0);
  const [totalDuration, setTotalDuration] = useState<number>(0);
  const [isLoadingRoute, setIsLoadingRoute] = useState<boolean>(false);
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null);
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getItemTime = (item: RoutableItem) => {
    return (item as Delivery).delivery_time || (item as Installation).installation_time;
  };

  useEffect(() => {
    const calculateOptimalRoute = async () => {
      setIsLoadingRoute(true);
      const morning = deliveries.filter(d => getItemTime(d) === 'morning');
      const afternoon = deliveries.filter(d => getItemTime(d) === 'afternoon');
      
      const optimizedPoints: any[] = [{ ...ORIGIN, isOrigin: true }];
      let currentPos = ORIGIN;
      
      const findNearest = (items: RoutableItem[], from: { lat: number; lng: number }) => {
        let nearestIndex = -1;
        let minDistance = Infinity;
        
        items.forEach((item, index) => {
          const coords = getCoordinates(item);
          const dist = Math.sqrt(Math.pow(coords.lat - from.lat, 2) + Math.pow(coords.lng - from.lng, 2));
          if (dist < minDistance) {
            minDistance = dist;
            nearestIndex = index;
          }
        });
        
        return nearestIndex;
      };
      
      const remainingMorning = [...morning];
      while (remainingMorning.length > 0) {
        const index = findNearest(remainingMorning, currentPos);
        const item = remainingMorning.splice(index, 1)[0];
        const coords = getCoordinates(item);
        optimizedPoints.push({ ...coords, item });
        currentPos = coords;
      }
      
      const remainingAfternoon = [...afternoon];
      while (remainingAfternoon.length > 0) {
        const index = findNearest(remainingAfternoon, currentPos);
        const item = remainingAfternoon.splice(index, 1)[0];
        const coords = getCoordinates(item);
        optimizedPoints.push({ ...coords, item });
        currentPos = coords;
      }
      
      optimizedPoints.push({ ...ORIGIN, isOrigin: true });
      setRoute(optimizedPoints);

      try {
        const coordsString = optimizedPoints.map(p => `${p.lng},${p.lat}`).join(';');
        const response = await window.fetch(`https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`);
        const data = await response.json();

        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const roadCoords = data.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]] as [number, number]);
          setRoadGeometry(roadCoords);
          setTotalDistance(data.routes[0].distance / 1000);
          setTotalDuration(data.routes[0].duration);
        } else {
          setRoadGeometry(optimizedPoints.map(p => [p.lat, p.lng]));
          let dist = 0;
          for (let i = 0; i < optimizedPoints.length - 1; i++) {
            const p1 = optimizedPoints[i];
            const p2 = optimizedPoints[i+1];
            const dy = (p1.lat - p2.lat) * 111.32;
            const dx = (p1.lng - p2.lng) * 40075 * Math.cos((p1.lat + p2.lat) / 2 * Math.PI / 180) / 360;
            dist += Math.sqrt(dx * dx + dy * dy);
          }
          setTotalDistance(dist);
          setTotalDuration(dist * 120); // 2 mins per km
        }
      } catch (error) {
        console.error('Error fetching road route:', error);
        setRoadGeometry(optimizedPoints.map(p => [p.lat, p.lng]));
      } finally {
        setIsLoadingRoute(false);
      }
    };

    calculateOptimalRoute();
  }, [deliveries]);

  const handleMaintainRoute = async () => {
    if (!onMaintainRoute) return;
    
    setIsUpdatingOrder(true);
    try {
      // Filtrar el origen y fin, quedarnos solo con los items en el orden calculado
      const orderedItems = route
        .filter(p => !p.isOrigin && p.item)
        .map(p => p.item!);
      
      await onMaintainRoute(orderedItems);
      onClose();
    } catch (err) {
      console.error("Error updating route order:", err);
    } finally {
      setIsUpdatingOrder(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[500] bg-slate-900/95 backdrop-blur-xl flex flex-col">
      <div className="p-6 flex justify-between items-center border-b border-white/10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Navigation className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-black text-white uppercase tracking-tight">Ruta Optimizada: {truckLabel}</h3>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">Cálculo basado en franjas horarias y proximidad</p>
              <div className="h-3 w-px bg-white/10" />
              <div className="flex items-center gap-1.5 bg-emerald-500/20 px-2 py-0.5 rounded-md">
                <span className="text-[10px]">🛣️</span>
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                  {isLoadingRoute ? 'Calculando...' : `${totalDistance.toFixed(1)} KM REALES`}
                </span>
              </div>
              <div className="h-3 w-px bg-white/10" />
              <div className="flex items-center gap-1.5 bg-blue-500/20 px-2 py-0.5 rounded-md">
                <span className="text-[10px]">⏱️</span>
                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">
                  {isLoadingRoute ? 'Calculando...' : `${formatDuration(totalDuration)} EN VIAJE`}
                </span>
              </div>
              {onMaintainRoute && !isLoadingRoute && (
                <>
                  <div className="h-3 w-px bg-white/10" />
                  <button
                    onClick={handleMaintainRoute}
                    disabled={isUpdatingOrder}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg transition-all active:scale-95 disabled:opacity-50"
                  >
                    <span className="text-[10px]">🔄</span>
                    <span className="text-[10px] font-black uppercase tracking-widest">
                      {isUpdatingOrder ? 'GUARDANDO...' : 'MANTENER RUTA'}
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-all active:scale-95"
        >
          <X className="w-6 h-6" />
        </button>
      </div>
      
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="w-full lg:w-96 bg-slate-900 border-r border-white/10 overflow-y-auto p-6 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-white/60">
              <MapPin className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-widest">Puntos de Entrega</span>
            </div>
            
            {route.map((point, idx) => (
              <div 
                key={idx} 
                onMouseEnter={() => setHoveredPointIdx(idx)}
                onMouseLeave={() => setHoveredPointIdx(null)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${hoveredPointIdx === idx ? 'ring-2 ring-emerald-500 scale-[1.02]' : ''} ${point.isOrigin ? 'bg-white/5 border-white/10' : getItemTime(point.item!) === 'morning' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-indigo-500/10 border-indigo-500/20'}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5 ${point.isOrigin ? 'bg-white/20 text-white' : getItemTime(point.item!) === 'morning' ? 'bg-amber-500 text-white' : 'bg-indigo-500 text-white'}`}>
                    {idx}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-black text-white uppercase tracking-tight">
                      {point.isOrigin ? point.label : `PEDIDO: ${point.item?.order_number}`}
                    </p>
                    {!point.isOrigin && (
                      <>
                        <p className="text-[10px] font-bold text-white/60 uppercase mt-1">
                          {point.item?.postal_code} - {point.item?.locality}
                        </p>
                        {point.item?.address && (
                          <p className="text-[9px] font-medium text-white/40 uppercase mt-0.5 italic">
                            {point.item?.address}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 mt-2">
                          <Clock className="w-3 h-3 text-white/30" />
                          <span className={`text-[9px] font-black uppercase tracking-widest ${getItemTime(point.item!) === 'morning' ? 'text-amber-400' : 'text-indigo-400'}`}>
                            {getItemTime(point.item!) === 'morning' ? '8:00 - 12:00' : '13:00 - 18:00'}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="flex-1 relative">
          <MapContainer center={[ORIGIN.lat, ORIGIN.lng]} zoom={12} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            {route.map((point, idx) => (
              <Marker 
                key={idx} 
                position={[point.lat, point.lng]}
                eventHandlers={{
                  mouseover: () => setHoveredPointIdx(idx),
                  mouseout: () => setHoveredPointIdx(null)
                }}
                icon={L.divIcon({
                  className: 'custom-div-icon',
                  html: `<div style="background-color: ${point.isOrigin ? '#ffffff' : getItemTime(point.item!) === 'morning' ? '#f59e0b' : '#6366f1'}; width: ${hoveredPointIdx === idx ? '36px' : '24px'}; height: ${hoveredPointIdx === idx ? '36px' : '24px'}; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; color: ${point.isOrigin ? '#000' : '#fff'}; font-weight: 900; font-size: ${hoveredPointIdx === idx ? '14px' : '10px'}; box-shadow: 0 4px 6px rgba(0,0,0,0.3); transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);">${idx}</div>`,
                  iconSize: [hoveredPointIdx === idx ? 36 : 24, hoveredPointIdx === idx ? 36 : 24],
                  iconAnchor: [hoveredPointIdx === idx ? 18 : 12, hoveredPointIdx === idx ? 18 : 12]
                })}
              >
                <Popup autoPan={false}>
                  <div className="p-2 min-w-[150px]">
                    <p className="font-black text-xs uppercase text-slate-800">{point.isOrigin ? point.label : `Pedido: ${point.item?.order_number}`}</p>
                    {!point.isOrigin && (
                      <div className="mt-2 space-y-1">
                        <p className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
                          <span>📍</span> {point.item?.locality}
                        </p>
                        <p className="text-[10px] text-indigo-600 font-black uppercase flex items-center gap-1">
                          <span>📦</span> {point.item?.merchandise_type || 'Sin tipo'}
                        </p>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
            
            {roadGeometry.length > 0 && (
              <Polyline 
                positions={roadGeometry} 
                color="#10b981" 
                weight={5} 
                opacity={0.8} 
              />
            )}
            
            {roadGeometry.length === 0 && (
              <Polyline 
                positions={route.map(p => [p.lat, p.lng] as [number, number])} 
                color="#10b981" 
                weight={4} 
                opacity={0.6} 
                dashArray="10, 10"
              />
            )}
          </MapContainer>
          
          <div className="absolute bottom-6 right-6 z-[1000] bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-white/10 space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">Mañana (8:00 - 12:00)</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-indigo-500" />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">Tarde (13:00 - 18:00)</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-white" />
              <span className="text-[10px] font-black text-white uppercase tracking-widest">Origen/Fin (Albolote)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RouteMap;
