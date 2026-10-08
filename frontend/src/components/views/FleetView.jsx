import React from 'react';
import { Building2, Truck } from 'lucide-react';
import useWorldStore from '../../store/useWorldStore';
import useUIStore from '../../store/useUIStore';
import { UnitCard } from '../panels/UnitsPanel';
import { Panel, Badge, KeyValue } from '../common/ui';
import { FACILITY_TYPE, UNIT_STATUS, UNIT_TYPE } from '../../domain/constants';

export default function FleetView() {
  const units = useWorldStore((s) => s.units);
  const facilities = useWorldStore((s) => s.facilities);
  const nodes = useWorldStore((s) => s.nodes);
  const selectedUnitId = useUIStore((s) => s.selectedUnitId);
  const setSelectedUnitId = useUIStore((s) => s.setSelectedUnitId);

  const hospitals = facilities.filter((f) => f.type === FACILITY_TYPE.HOSPITAL);
  const stations = facilities.filter((f) => f.type === FACILITY_TYPE.FIRE_STATION);

  const FacilityCard = ({ facility }) => {
    const based = units.filter((u) => u.baseFacilityId === facility.id);
    const available = based.filter((u) => u.status === UNIT_STATUS.AVAILABLE).length;
    const node = nodes.find((n) => n.id === facility.node);
    const isHospital = facility.type === FACILITY_TYPE.HOSPITAL;

    return (
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-3.5 shadow-2xs">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-slate-900 truncate">{facility.name}</p>
            <p className="text-[10px] text-slate-500">{node?.name ?? facility.node}</p>
          </div>
          <Badge tone={isHospital ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}>
            {isHospital ? 'Hospital' : 'Fire station'}
          </Badge>
        </div>
        <div className="mt-2">
          <KeyValue label="Units based here" value={`${available} available / ${based.length}`} />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {based.map((u) => (
            <span key={u.id} className="px-2 py-0.5 rounded bg-slate-50 border border-[#E2E8F0] text-slate-700 text-[10px] font-mono font-medium">
              {u.id}
            </span>
          ))}
          {based.length === 0 && <span className="text-[10px] text-slate-400 italic">No units currently based here</span>}
        </div>
      </div>
    );
  };

  const ambulances = units.filter((u) => u.type === UNIT_TYPE.AMBULANCE);
  const engines = units.filter((u) => u.type === UNIT_TYPE.FIRETRUCK);

  return (
    <div className="flex-1 overflow-y-auto p-5 min-h-0">
      <div className="grid xl:grid-cols-3 gap-4">
        <Panel
          title="Ambulance fleet"
          subtitle={`${ambulances.filter((u) => u.status === UNIT_STATUS.AVAILABLE).length} of ${ambulances.length} available`}
          actions={<Truck className="w-4 h-4 text-gray-300" />}
          className="min-h-[300px]"
        >
          <div className="space-y-1.5">
            {ambulances.map((u) => (
              <UnitCard key={u.id} unit={u} selected={selectedUnitId === u.id} onSelect={() => setSelectedUnitId(u.id)} />
            ))}
          </div>
        </Panel>

        <Panel
          title="Fire fleet"
          subtitle={`${engines.filter((u) => u.status === UNIT_STATUS.AVAILABLE).length} of ${engines.length} available`}
          actions={<Truck className="w-4 h-4 text-gray-300" />}
          className="min-h-[300px]"
        >
          <div className="space-y-1.5">
            {engines.map((u) => (
              <UnitCard key={u.id} unit={u} selected={selectedUnitId === u.id} onSelect={() => setSelectedUnitId(u.id)} />
            ))}
          </div>
        </Panel>

        <Panel
          title="Facilities"
          subtitle="Placement and availability anchors for dispatch"
          actions={<Building2 className="w-4 h-4 text-gray-300" />}
          className="min-h-[300px]"
        >
          <div className="space-y-2">
            {[...hospitals, ...stations].map((f) => (
              <FacilityCard key={f.id} facility={f} />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
