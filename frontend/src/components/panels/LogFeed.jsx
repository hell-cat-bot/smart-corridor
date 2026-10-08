import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, Download, Trash2, ScrollText } from 'lucide-react';
import useLogStore from '../../store/useLogStore';
import useUIStore from '../../store/useUIStore';
import {
  LOG_CATEGORY,
  LOG_CATEGORY_LABEL,
  LOG_CATEGORY_TONE,
  SEVERITY,
  SEVERITY_TONE,
} from '../../domain/constants';
import { Badge, Button, EmptyState } from '../common/ui';

function LogRow({ entry, expandable }) {
  const [open, setOpen] = useState(false);
  const tone = LOG_CATEGORY_TONE[entry.category] || LOG_CATEGORY_TONE[LOG_CATEGORY.SIMULATION];
  const refs = Object.entries(entry.refs || {}).filter(([, v]) => v);
  const hasData = entry.data && Object.keys(entry.data).length > 0;

  return (
    <div className={`rounded-md border border-gray-100 bg-gray-50/60 border-l-4 ${tone.bar}`}>
      <button
        onClick={() => expandable && hasData && setOpen(!open)}
        className="w-full text-left px-2.5 py-2 flex items-start gap-2"
      >
        {expandable && hasData ? (
          open ? (
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <Badge tone={`${tone.bg} ${tone.text}`}>{LOG_CATEGORY_LABEL[entry.category]}</Badge>
            <Badge tone={SEVERITY_TONE[entry.severity]}>{entry.severity}</Badge>
            <span className="text-[9.5px] font-mono text-gray-400">T+{Math.round(entry.simTime)}s</span>
            {refs.map(([k, v]) => (
              <span key={k} className="text-[9.5px] font-mono text-gray-400">
                {k}={v}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-gray-700 font-medium leading-snug break-words">{entry.message}</p>
        </div>

        <span className="text-[9.5px] text-gray-400 font-mono shrink-0 self-center">
          {new Date(entry.wallTime).toLocaleTimeString([], { hour12: false })}
        </span>
      </button>

      {open && hasData && (
        <pre className="mx-2.5 mb-2 p-2 rounded bg-white border border-gray-100 text-[9.5px] font-mono text-gray-600 overflow-x-auto">
          {JSON.stringify(entry.data, null, 2)}
        </pre>
      )}
    </div>
  );
}

/**
 * Structured log feed. Compact mode is the dashboard tab; the full Logs view
 * turns on filters, search and the raw decision payloads.
 */
export default function LogFeed({ full = false, limit = 200 }) {
  const entries = useLogStore((s) => s.entries);
  const clear = useLogStore((s) => s.clear);
  const filters = useUIStore((s) => s.logFilters);
  const setFilters = useUIStore((s) => s.setLogFilters);

  const categories = Object.values(LOG_CATEGORY);

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return entries
      .filter((e) => (filters.categories.length ? filters.categories.includes(e.category) : true))
      .filter((e) => (filters.severity === 'all' ? true : e.severity === filters.severity))
      .filter((e) =>
        q
          ? e.message.toLowerCase().includes(q) ||
            JSON.stringify(e.refs).toLowerCase().includes(q) ||
            JSON.stringify(e.data).toLowerCase().includes(q)
          : true,
      )
      .slice(0, limit);
  }, [entries, filters, limit]);

  const toggleCategory = (cat) => {
    const next = filters.categories.includes(cat)
      ? filters.categories.filter((c) => c !== cat)
      : [...filters.categories, cat];
    setFilters({ categories: next });
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart-corridor-log-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      {full && (
        <div className="space-y-2 mb-3 shrink-0">
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => {
              const tone = LOG_CATEGORY_TONE[cat];
              const active = filters.categories.includes(cat);
              const count = entries.filter((e) => e.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-colors ${
                    active ? `${tone.bg} ${tone.text} border-current` : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {LOG_CATEGORY_LABEL[cat]} <span className="opacity-60">{count}</span>
                </button>
              );
            })}
            {filters.categories.length > 0 && (
              <button
                onClick={() => setFilters({ categories: [] })}
                className="px-2.5 py-1 rounded-full text-[10px] font-semibold text-gray-400 hover:text-gray-700"
              >
                Clear filters
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={filters.query}
                onChange={(e) => setFilters({ query: e.target.value })}
                placeholder="Search messages, entity refs and structured data"
                className="w-full pl-8 pr-2 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] outline-none focus:ring-2 focus:ring-[#111827]"
              />
            </div>
            <select
              value={filters.severity}
              onChange={(e) => setFilters({ severity: e.target.value })}
              className="px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] outline-none"
            >
              <option value="all">All severities</option>
              {Object.values(SEVERITY).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Button variant="ghost" onClick={download}>
              <Download className="w-3.5 h-3.5" />
              Export
            </Button>
            <Button variant="ghost" onClick={clear}>
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
        {filtered.length === 0 ? (
          <EmptyState icon={ScrollText} title="No log entries match" hint="Run the simulation or relax the filters." />
        ) : (
          filtered.map((entry) => <LogRow key={entry.id} entry={entry} expandable={full} />)
        )}
      </div>

      {full && (
        <p className="text-[10px] text-gray-400 mt-2 shrink-0">
          Showing {filtered.length} of {entries.length} records · every record carries sim time, category, entity refs and the
          structured data behind the decision.
        </p>
      )}
    </div>
  );
}
