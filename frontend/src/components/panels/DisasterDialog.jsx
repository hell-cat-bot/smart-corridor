import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Ban } from 'lucide-react';
import useUIStore from '../../store/useUIStore';
import useWorldStore from '../../store/useWorldStore';
import { injectDisaster } from '../../lib/simControl';
import { DISASTER_TYPES } from '../../domain/constants';
import { Modal, Field, Input, Button, Meter, ComboSelect, CUSTOM_VALUE } from '../common/ui';
import NodePicker from '../common/NodePicker';

const SEVERITY_BANDS = [
  { at: 0.34, label: 'Partial obstruction', tone: 'text-amber-700' },
  { at: 0.67, label: 'Major obstruction', tone: 'text-orange-700' },
  { at: 1.01, label: 'Junction impassable', tone: 'text-red-700' },
];

export default function DisasterDialog() {
  const open = useUIStore((s) => s.showDisasterDialog);
  const presetNode = useUIStore((s) => s.disasterDialogNode);
  const close = useUIStore((s) => s.closeDisasterDialog);
  const disasters = useWorldStore((s) => s.disasters);
  const units = useWorldStore((s) => s.units);

  const [type, setType] = useState('flood');
  const [customType, setCustomType] = useState('');
  const [node, setNode] = useState(presetNode || null);
  const [severity, setSeverity] = useState(0.85);
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (presetNode) setNode(presetNode);
  }, [presetNode]);

  if (!open) return null;

  const isCustom = type === CUSTOM_VALUE;
  const typeLabel = isCustom ? customType.trim() : DISASTER_TYPES.find((t) => t.id === type)?.label;
  const alreadyBlocked = disasters.some((d) => d.node === node);
  const affected = units.filter((u) => u.route?.path.includes(node));
  const band = SEVERITY_BANDS.find((b) => severity < b.at) ?? SEVERITY_BANDS[2];

  const canSubmit = Boolean(node) && !alreadyBlocked && (!isCustom || customType.trim().length > 0);

  const reset = () => {
    setCustomType('');
    setLabel('');
    setNote('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    const created = await injectDisaster({
      node,
      type: isCustom ? 'custom' : type,
      typeLabel: typeLabel || 'Incident',
      severity,
      label: label.trim() || null,
      note: note.trim(),
    });
    if (created) {
      toast.error(created.label, { description: `Junction ${created.node} is now impassable` });
      reset();
      close();
    }
    // A null result has already been explained by the control layer.
  };

  return (
    <Modal
      title="Inject disaster"
      subtitle="A blocked junction leaves the routing graph entirely, and every active leg crossing it replans straight away — running or paused"
      onClose={close}
      width="max-w-xl"
      footer={
        <>
          <Button variant="subtle" onClick={close}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} disabled={!canSubmit}>
            <Ban className="w-3.5 h-3.5" />
            {!node
              ? 'Pick a junction'
              : alreadyBlocked
                ? 'Junction already blocked'
                : isCustom && !customType.trim()
                  ? 'Name the incident'
                  : 'Inject disaster'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Disaster type" hint="Pick a preset, or choose Other to describe it yourself.">
            <ComboSelect
              value={type}
              onValueChange={setType}
              options={DISASTER_TYPES.map((t) => ({ value: t.id, label: t.label }))}
              customValue={customType}
              onCustomChange={setCustomType}
              customOptionLabel="Other — type your own"
              customPlaceholder="e.g. Bridge collapse, gas leak, protest"
            />
          </Field>

          <Field label="Junction" hint="Search by road name, or click a junction on the map.">
            <NodePicker value={node} onChange={setNode} placeholder="Search a road or junction" />
          </Field>
        </div>

        <Field
          label={`Severity — ${Math.round(severity * 100)}%`}
          hint="Reported to operators for triage. The blockage itself is always absolute."
        >
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={severity}
            onChange={(e) => setSeverity(Number(e.target.value))}
            className="w-full accent-[#111827]"
            aria-label="Severity"
          />
          <div className="mt-2 flex items-center gap-3">
            <div className="flex-1">
              <Meter value={severity} tone="bg-red-500" />
            </div>
            <span className={`text-[10px] font-bold whitespace-nowrap ${band.tone}`}>{band.label}</span>
          </div>
        </Field>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Display label (optional)" hint="Overrides the generated name in lists and logs.">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={typeLabel ? `${typeLabel} — junction name` : 'Auto-generated'}
            />
          </Field>
          <Field label="Operator note (optional)">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. reported by traffic control, ETA to clear unknown"
            />
          </Field>
        </div>

        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
          <p className="text-[11px] font-semibold text-amber-800 mb-1.5 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Immediate consequences
          </p>
          <ul className="text-[11px] text-amber-700 space-y-1 list-disc list-inside marker:text-amber-400">
            <li>The junction is marked blocked and any green wave held there is dropped</li>
            <li>
              {affected.length === 0
                ? 'No active leg currently crosses this junction'
                : `${affected.length} active leg(s) replan immediately: ${affected.map((u) => u.id).join(', ')}`}
            </li>
            <li>The pre-blockage path stays on the map as the dashed comparison route</li>
            <li>Any unit with no way around at all holds at the stop line and raises an alert</li>
          </ul>
        </div>
      </form>
    </Modal>
  );
}
