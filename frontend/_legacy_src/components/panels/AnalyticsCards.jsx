import React from 'react';
import useVehicleStore from '../../store/useVehicleStore';
import useDisasterStore from '../../store/useDisasterStore';
import useGridStore from '../../store/useGridStore';
import { Activity, Flame, Siren, MapPin, AlertTriangle, Route, Clock, Percent } from 'lucide-react';

export default function AnalyticsCards() {
  const vehicles = useVehicleStore((s) => s.vehicles);
  const disasters = useDisasterStore((s) => s.disasters);
  const nodes = useGridStore((s) => s.nodes);

  const total = vehicles?.length || 0;
  const ambulanceCount = vehicles?.filter(v => v.type === 'ambulance').length || 0;
  const fireCount = vehicles?.filter(v => v.type === 'firetruck').length || 0;
  
  const activeVehicles = vehicles?.filter(v => v.status === 'en_route' || v.status === 'rerouted') || [];
  const avgEta = activeVehicles.length > 0 
    ? Math.round(activeVehicles.reduce((acc, v) => acc + (v.eta || 0), 0) / activeVehicles.length / 60) 
    : 0;

  const reroutedCount = vehicles?.filter(v => v.status === 'rerouted').length || 0;
  const disastersActive = disasters?.length || 0;
  const blockedNodesCount = nodes?.filter(n => n.status === 'blocked').length || 0;

  const avgCongestion = nodes?.length > 0
    ? Math.round((nodes.reduce((acc, n) => acc + (n.congestion || 0), 0) / nodes.length) * 100)
    : 0;

  const cards = [
    { label: 'Total Fleet', value: total, icon: Activity, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
    { label: 'Ambulances', value: ambulanceCount, icon: Siren, color: 'text-red-600', bg: 'bg-red-50 border-red-100' },
    { label: 'Fire Units', value: fireCount, icon: Flame, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-100' },
    { label: 'Average ETA', value: `${avgEta}m`, icon: Clock, color: 'text-green-600', bg: 'bg-green-50 border-green-100' },
    { label: 'Rerouted', value: reroutedCount, icon: Route, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
    { label: 'Active Disasters', value: disastersActive, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50 border-red-100' },
    { label: 'Blocked Intersects', value: blockedNodesCount, icon: MapPin, color: 'text-gray-600', bg: 'bg-gray-50 border-gray-100' },
    { label: 'Avg Congestion', value: `${avgCongestion}%`, icon: Percent, color: 'text-[#7C6FEF]', bg: 'bg-[#EDE9FE] border-[#7C6FEF]/10' },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">Emergency Corridor Analytics</h3>
          <p className="text-xs text-gray-500">Live operational telemetry & status counts</p>
        </div>
      </div>

      <div className="flex-grow min-h-0 overflow-y-auto grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {cards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div 
              key={idx} 
              className={`flex flex-col items-center justify-center p-3 rounded-lg border ${card.bg} hover:shadow-sm transition-shadow`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1.5 ${card.color} bg-white shadow-sm`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-base font-bold text-gray-900 leading-tight">{card.value}</div>
              <div className="text-[10px] font-medium text-gray-500 text-center mt-0.5 leading-tight">{card.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
