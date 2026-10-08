import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Search, MapPin, X } from 'lucide-react';
import useWorldStore from '../../store/useWorldStore';
import { NODE_STATUS } from '../../domain/constants';
import { haversineDistance } from '../../utils/geo';

/**
 * Junction picker.
 *
 * A real road network has hundreds of junctions, so this is a searchable
 * combobox over road names rather than a dropdown of every node. Matches are
 * ranked by how well the road name matches, then by proximity to the map centre,
 * so the obvious answer is usually the first row.
 */
export default function NodePicker({ value, onChange, placeholder = 'Search a junction or road', autoFocus = false }) {
  const nodes = useWorldStore((s) => s.nodes);
  const center = useWorldStore((s) => s.center);
  const facilities = useWorldStore((s) => s.facilities);
  const disasters = useWorldStore((s) => s.disasters);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const selected = nodes.find((n) => n.id === value) || null;
  const facilityByNode = useMemo(
    () => new Map(facilities.map((f) => [f.node, f])),
    [facilities],
  );
  const blocked = useMemo(() => new Set(disasters.map((d) => d.node)), [disasters]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const scored = nodes.map((n) => {
      const name = n.name.toLowerCase();
      let score = 0;
      if (q) {
        if (name.startsWith(q)) score = 3;
        else if (name.includes(q)) score = 2;
        else if (n.id.toLowerCase().includes(q)) score = 1;
        else return null;
      }
      const distance = haversineDistance(center.lat, center.lng, n.lat, n.lng);
      return { node: n, score, distance };
    });

    return scored
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || (b.node.degree ?? 2) - (a.node.degree ?? 2) || a.distance - b.distance)
      .slice(0, 60);
  }, [nodes, query, center]);

  return (
    <div className="relative" ref={boxRef}>
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={open ? query : selected?.name || ''}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setQuery('');
            setOpen(true);
          }}
          autoFocus={autoFocus}
          placeholder={placeholder}
          className="w-full pl-8 pr-7 py-2 border border-[#CBD5E1] rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-all"
        />
        {selected && !open && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery('');
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600"
            aria-label="Clear"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {selected && !open && (
        <p className="text-[9.5px] text-slate-400 mt-1 font-mono">
          {selected.id} · {selected.degree ?? 2} road(s) meet here
        </p>
      )}

      {open && (
        <div className="absolute z-[2100] mt-1 w-full max-h-60 overflow-y-auto bg-white border border-[#E2E8F0] rounded-xl shadow-panel">
          {results.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic p-3">No junction matches “{query}”.</p>
          ) : (
            results.map(({ node }) => {
              const facility = facilityByNode.get(node.id);
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => {
                    onChange(node.id);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`w-full text-left px-3 py-2 hover:bg-slate-50 flex items-start gap-2 transition-colors ${
                    node.id === value ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-700'
                  }`}
                >
                  <MapPin
                    className={`w-3 h-3 mt-0.5 shrink-0 ${
                      blocked.has(node.id)
                        ? 'text-red-500'
                        : node.status === NODE_STATUS.CONGESTED
                          ? 'text-orange-500'
                          : 'text-gray-300'
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold text-gray-800 truncate">{node.name}</span>
                    <span className="block text-[9.5px] text-gray-400 truncate">
                      {node.id}
                      {facility ? ` · ${facility.name}` : ''}
                      {blocked.has(node.id) ? ' · blocked' : ''}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
