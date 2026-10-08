import React from 'react';
import { Info } from 'lucide-react';
import useWorldStore from '../../store/useWorldStore';
import useConnectionStore from '../../store/useConnectionStore';
import StatCards from '../layout/StatCards';
import BottomPanel from '../layout/BottomPanel';
import OperationsMap from '../map/OperationsMap';
import SimControls from '../map/SimControls';
import UnitsPanel from '../panels/UnitsPanel';
import BlockedAlerts from '../panels/BlockedAlerts';

export default function OperationsView() {
  const isPlaceholder = useWorldStore((s) => s.isPlaceholderNetwork);
  const networkMeta = useWorldStore((s) => s.networkMeta);
  const source = useConnectionStore((s) => s.source);

  // Which road network is loaded depends on which engine is driving, so the fix
  // does too: in server mode the file that matters lives in ml_backend, and the
  // frontend's own fetch script would do nothing for it.
  const fromServer = source === 'server' || networkMeta?.source === 'ml_backend';

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {isPlaceholder && (
        <div className="mx-5 mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 shrink-0">
          <Info className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
          {fromServer ? (
            <p className="text-[11px] text-amber-800 leading-relaxed">
              The simulation backend is running on its placeholder grid, not real roads. Copy the
              real network over it —{' '}
              <code className="font-mono bg-white/70 px-1 py-0.5 rounded border border-amber-200">
                frontend/src/data/network.json
              </code>{' '}
              →{' '}
              <code className="font-mono bg-white/70 px-1 py-0.5 rounded border border-amber-200">
                ml_backend/app/data/network.json
              </code>{' '}
              — then restart uvicorn. Running the frontend's fetch script will not change what the
              backend serves.
            </p>
          ) : (
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Running on the placeholder network. For real Ghaziabad roads — with vehicles following actual road geometry — run{' '}
              <code className="font-mono bg-white/70 px-1 py-0.5 rounded border border-amber-200">
                node scripts/fetch-osm-network.mjs
              </code>{' '}
              once, then restart the dev server.
            </p>
          )}
        </div>
      )}

      <BlockedAlerts />

      <div className="px-5 pt-4 shrink-0">
        <StatCards />
      </div>

      <div className="flex-1 flex px-5 py-4 gap-4 overflow-hidden min-h-0">
        <UnitsPanel />
        <div className="flex-1 relative rounded-xl overflow-hidden border border-[#E5E7EB] min-h-[320px]">
          <OperationsMap />
          <SimControls />
        </div>
      </div>

      <BottomPanel />
    </div>
  );
}
