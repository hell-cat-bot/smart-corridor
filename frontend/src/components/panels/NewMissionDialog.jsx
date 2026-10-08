import React, { useMemo, useState, useEffect } from 'react';
import { toast } from 'sonner';
import useUIStore from '../../store/useUIStore';
import useWorldStore from '../../store/useWorldStore';
import useSettingsStore from '../../store/useSettingsStore';
import { createMission, rankUnits, chooseHospital } from '../../lib/simControl';
import {
  SERVICE,
  SERVICE_LABEL,
  EMERGENCY_CLASSES,
  PRIORITY_LABEL,
  findEmergencyClass,
  FACILITY_TYPE,
} from '../../domain/constants';
import { Modal, Field, Select, Input, Button, KeyValue, Badge, ComboSelect, CUSTOM_VALUE } from '../common/ui';
import NodePicker from '../common/NodePicker';
import { formatDuration, formatMeters } from '../../utils/geo';

/**
 * The primary operator action: a call at a scene, not a vehicle with a
 * destination. The unit and the receiving facility are proposed by the system.
 */
export default function NewMissionDialog() {
  const open = useUIStore((s) => s.showMissionDialog);
  const setOpen = useUIStore((s) => s.setShowMissionDialog);
  const closeMissionDialog = useUIStore((s) => s.closeMissionDialog);
  const missionDialogNode = useUIStore((s) => s.missionDialogNode);
  const nodes = useWorldStore((s) => s.nodes);
  const facilities = useWorldStore((s) => s.facilities);
  const autoApprove = useSettingsStore((s) => s.autoApprove);

  const [service, setService] = useState(SERVICE.MEDICAL);
  const [emergencyClass, setEmergencyClass] = useState('cardiac');
  const [customEmergency, setCustomEmergency] = useState('');
  const [customDwell, setCustomDwell] = useState('');
  const [sceneNode, setSceneNode] = useState(() => useWorldStore.getState().nodes[0]?.id ?? null);
  const [priorityOverride, setPriorityOverride] = useState('auto');
  const [note, setNote] = useState('');

  // When opened from the map with a pre-selected node, sync it in.
  useEffect(() => {
    if (missionDialogNode) setSceneNode(missionDialogNode);
  }, [missionDialogNode]);

  const classes = EMERGENCY_CLASSES[service] || [];
  const isCustomClass = emergencyClass === CUSTOM_VALUE;
  const cls = isCustomClass ? null : findEmergencyClass(service, emergencyClass) || classes[0];

  // A typed-in emergency has no preset priority or dwell, so it defaults to P2
  // and the standard 45s until the operator says otherwise.
  const priority = priorityOverride === 'auto' ? cls?.priority ?? 2 : Number(priorityOverride);
  const dwell = isCustomClass ? Number(customDwell) || 45 : cls?.dwell ?? 45;

  // Live preview of what the dispatcher would choose right now.
  const preview = useMemo(() => {
    if (!open || !sceneNode) return null;
    const candidates = rankUnits(service, sceneNode);
    const best = candidates[0] || null;
    let hospital = null;
    if (best && service === SERVICE.MEDICAL) {
      const unit = useWorldStore.getState().getUnit(best.unitId);
      hospital = unit ? chooseHospital(sceneNode, unit) : null;
    }
    return { candidates, best, hospital };
  }, [open, service, sceneNode]);

  if (!open) return null;

  const handleClose = () => closeMissionDialog();

  const handleServiceChange = (value) => {
    setService(value);
    const first = (EMERGENCY_CLASSES[value] || [])[0];
    setEmergencyClass(first?.id ?? '');
  };

  const canSubmit = Boolean(sceneNode) && (!isCustomClass || customEmergency.trim().length > 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    // In server mode this is a request to ml_backend, so it is awaited; the
    // control layer has already reported any failure, and resolves null.
    const mission = await createMission({
      service,
      emergencyClass: isCustomClass ? 'custom' : emergencyClass,
      emergencyLabel: isCustomClass ? customEmergency.trim() : null,
      dwellSeconds: isCustomClass ? Number(customDwell) || null : null,
      sceneNode,
      priority: priorityOverride === 'auto' ? undefined : Number(priorityOverride),
      note,
    });
    if (!mission) return;
    toast.success(
      autoApprove
        ? `${mission.id} created and auto-dispatched`
        : `${mission.id} created — awaiting dispatch approval`,
      { description: `${mission.emergencyLabel} · P${mission.priority}` },
    );
    handleClose();
    setNote('');
    setCustomEmergency('');
    setCustomDwell('');
  };


  const sceneName = nodes.find((n) => n.id === sceneNode)?.name ?? sceneNode;

  return (
    <Modal
      title="New mission"
      subtitle="Create an emergency call at a scene — the system proposes the unit and receiving facility"
      onClose={handleClose}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="subtle" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {!sceneNode
              ? 'Pick a scene junction'
              : isCustomClass && !customEmergency.trim()
                ? 'Name the emergency'
                : autoApprove
                  ? 'Create & dispatch'
                  : 'Create mission'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid md:grid-cols-2 gap-5">
        <div className="space-y-3">
          <Field label="Service">
            <div className="grid grid-cols-2 gap-2">
              {[SERVICE.MEDICAL, SERVICE.FIRE].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleServiceChange(s)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    service === s
                      ? 'bg-slate-900 border-slate-900 text-white shadow-2xs'
                      : 'bg-white border-[#CBD5E1] text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {SERVICE_LABEL[s]}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Emergency class" hint={`On-scene dwell ${dwell}s`}>
            <ComboSelect
              value={emergencyClass}
              onValueChange={setEmergencyClass}
              options={classes.map((c) => ({ value: c.id, label: `${c.label} (default P${c.priority})` }))}
              customValue={customEmergency}
              onCustomChange={setCustomEmergency}
              customOptionLabel="Other — type your own"
              customPlaceholder="e.g. Industrial burn, drowning, collapse rescue"
            />
          </Field>

          {isCustomClass && (
            <Field label="On-scene dwell (optional)" hint="Seconds spent at the scene. Leave blank for the 45s default.">
              <Input
                type="number"
                min="5"
                max="600"
                step="5"
                value={customDwell}
                onChange={(e) => setCustomDwell(e.target.value)}
                placeholder="45"
              />
            </Field>
          )}

          <Field label="Scene junction" hint="Search by road name, or click a junction on the operations map.">
            <NodePicker value={sceneNode} onChange={setSceneNode} placeholder="Search a road or junction" />
          </Field>

          <Field
            label="Priority"
            hint={isCustomClass ? 'A typed-in class has no preset priority — automatic resolves to P2.' : 'Override only when the call warrants it'}
          >
            <Select value={priorityOverride} onChange={(e) => setPriorityOverride(e.target.value)}>
              <option value="auto">Automatic — from emergency class</option>
              <option value="1">{PRIORITY_LABEL[1]}</option>
              <option value="2">{PRIORITY_LABEL[2]}</option>
              <option value="3">{PRIORITY_LABEL[3]}</option>
            </Select>
          </Field>

          <Field label="Caller note (optional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. two casualties, access from north" />
          </Field>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-[#E2E8F0] bg-slate-50/75 p-3.5 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">System proposal</span>
              <Badge tone="bg-slate-200 text-slate-900 border border-slate-300 font-bold">P{priority}</Badge>
            </div>

            {!sceneNode ? (
              <p className="text-[11px] text-gray-400 italic py-4">Pick a scene junction to see the dispatch proposal.</p>
            ) : preview?.best ? (
              <>
                <KeyValue label="Scene" value={sceneName} />
                <KeyValue label="Suggested unit" value={preview.best.label} />
                <KeyValue label="Dispatch from" value={preview.best.facilityId} mono />
                <KeyValue label="Leg 1 distance" value={formatMeters(preview.best.distance)} />
                <KeyValue label="Leg 1 ETA" value={formatDuration(preview.best.eta)} />
                {preview.hospital && (
                  <>
                    <KeyValue label="Likely hospital" value={preview.hospital.facility.name} />
                    <KeyValue label="Leg 2 ETA" value={formatDuration(preview.hospital.plan.eta)} />
                  </>
                )}
                {service === SERVICE.FIRE && (
                  <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
                    Fire response routes Leg 1 only. Return to station is not part of the optimised response.
                  </p>
                )}
              </>
            ) : (
              <p className="text-[11px] text-red-600 font-medium py-4">
                No suitable unit is currently available. The call can still be created — it will queue until a unit frees up.
              </p>
            )}
          </div>

          {preview?.candidates?.length > 1 && (
            <div className="rounded-xl border border-[#E2E8F0] bg-white p-3.5 shadow-2xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
                Candidate ranking
              </span>
              <div className="space-y-1">
                {preview.candidates.slice(0, 4).map((c, i) => (
                  <div key={c.unitId} className="flex items-center justify-between text-[11px]">
                    <span className={i === 0 ? 'font-bold text-gray-900' : 'text-gray-600'}>
                      {i + 1}. {c.label}
                    </span>
                    <span className="font-mono text-gray-500">{formatDuration(c.eta)}</span>
                  </div>
                ))}
              </div>
              <p className="text-[9.5px] text-gray-400 mt-2">Ranked by congestion-aware ETA from the unit's facility.</p>
            </div>
          )}

          <p className="text-[10px] text-gray-400 leading-relaxed">
            Hospitals: {facilities.filter((f) => f.type === FACILITY_TYPE.HOSPITAL).length} · Fire stations:{' '}
            {facilities.filter((f) => f.type === FACILITY_TYPE.FIRE_STATION).length}
          </p>
        </div>
      </form>
    </Modal>
  );
}
