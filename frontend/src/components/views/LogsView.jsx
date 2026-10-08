import React from 'react';
import LogFeed from '../panels/LogFeed';
import { Panel } from '../common/ui';

export default function LogsView() {
  return (
    <div className="flex-1 p-5 min-h-0 flex flex-col">
      <Panel
        title="Structured operations log"
        subtitle="Mission lifecycle, dispatch choices, routing and replans, congestion samples, disasters, signal preemption, junction conflicts and simulation control — each with the data behind the decision"
        className="flex-1 min-h-0"
        bodyClass="p-4"
      >
        <LogFeed full limit={400} />
      </Panel>
    </div>
  );
}
