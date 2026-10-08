import React, { useState, useMemo } from 'react';

/**
 * Small SVG chart set for the analytics view.
 *
 * Every chart here is single-series on one axis: the form carries magnitude or
 * change-over-time, identity is never encoded by colour alone, and text stays in
 * ink tokens rather than the series colour. Hover is on by default.
 */

const INK = '#374151';
const MUTED = '#9CA3AF';
const GRID = '#EEF0F4';
const SERIES = '#111827';
const SURFACE = '#FFFFFF';

function useHover() {
  const [hover, setHover] = useState(null);
  return [hover, setHover];
}

function Tooltip({ x, y, lines, width }) {
  const boxWidth = 118;
  const left = Math.max(4, Math.min(x - boxWidth / 2, width - boxWidth - 4));
  return (
    <foreignObject x={left} y={Math.max(2, y - 46)} width={boxWidth} height={44} style={{ pointerEvents: 'none' }}>
      <div className="rounded-md bg-white border border-gray-200 shadow-md px-2 py-1">
        {lines.map((l, i) => (
          <p key={i} className={i === 0 ? 'text-[9.5px] text-gray-500' : 'text-[11px] font-bold text-gray-900'}>
            {l}
          </p>
        ))}
      </div>
    </foreignObject>
  );
}

/**
 * Change over time, one series. Crosshair + tooltip.
 * data: [{ x, y }]
 */
export function LineChart({ data, height = 140, yLabel = '', formatY = (v) => v.toFixed(0), formatX = (v) => v }) {
  const [hover, setHover] = useHover();
  const width = 640;
  const pad = { top: 12, right: 12, bottom: 22, left: 34 };

  const geom = useMemo(() => {
    const valid = (data || []).filter((d) => d && Number.isFinite(d.x) && Number.isFinite(d.y));
    if (valid.length < 2) return null;
    const xs = valid.map((d) => d.x);
    const ys = valid.map((d) => d.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys, 0.001) * 1.15;
    const px = (x) => pad.left + ((x - minX) / Math.max(maxX - minX, 0.0001)) * (width - pad.left - pad.right);
    const py = (y) => height - pad.bottom - (y / maxY) * (height - pad.top - pad.bottom);
    const points = valid.map((d) => ({ ...d, px: px(d.x), py: py(d.y) }));
    return { points, maxY, py, minX, maxX };
  }, [data, height]);

  if (!geom) {
    return (
      <div className="h-[140px] flex items-center justify-center text-[11px] text-gray-400 italic">
        Not enough samples yet — run the simulation.
      </div>
    );
  }

  const { points, maxY, py } = geom;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(' ');
  const area = `${line} L${points[points.length - 1].px.toFixed(1)},${height - pad.bottom} L${points[0].px.toFixed(1)},${height - pad.bottom} Z`;
  const ticks = [0, maxY / 2, maxY];

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    let nearest = points[0];
    for (const p of points) if (Math.abs(p.px - x) < Math.abs(nearest.px - x)) nearest = p;
    setHover(nearest);
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ height }}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={pad.left} x2={width - pad.right} y1={py(t)} y2={py(t)} stroke={GRID} strokeWidth="1" />
          <text x={pad.left - 6} y={py(t) + 3} textAnchor="end" fontSize="9" fill={MUTED}>
            {formatY(t)}
          </text>
        </g>
      ))}

      <path d={area} fill={SERIES} fillOpacity="0.10" />
      <path d={line} fill="none" stroke={SERIES} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

      {hover && (
        <>
          <line x1={hover.px} x2={hover.px} y1={pad.top} y2={height - pad.bottom} stroke={MUTED} strokeWidth="1" strokeDasharray="3 3" />
          <circle cx={hover.px} cy={hover.py} r="5" fill={SERIES} stroke={SURFACE} strokeWidth="2" />
          <Tooltip x={hover.px} y={hover.py} width={width} lines={[formatX(hover.x), `${formatY(hover.y)}${yLabel}`]} />
        </>
      )}

      <line x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} stroke="#E5E7EB" strokeWidth="1" />
      <text x={pad.left} y={height - 6} fontSize="9" fill={MUTED}>
        {formatX(points[0].x)}
      </text>
      <text x={width - pad.right} y={height - 6} fontSize="9" textAnchor="end" fill={MUTED}>
        {formatX(points[points.length - 1].x)}
      </text>
    </svg>
  );
}

/**
 * Magnitude by identity, one series, vertical bars with rounded data-ends.
 * data: [{ label, value, sub }]
 */
export function BarChart({ data, height = 150, formatValue = (v) => v.toFixed(0), unit = '' }) {
  const [hover, setHover] = useHover();
  const width = 640;
  const pad = { top: 14, right: 8, bottom: 26, left: 34 };

  const validData = useMemo(() => {
    return (data || []).filter((d) => d && typeof d.value === 'number' && Number.isFinite(d.value) && d.value >= 0);
  }, [data]);

  if (!validData || validData.length === 0) {
    return (
      <div className="h-[150px] flex items-center justify-center text-[11px] text-gray-400 italic">
        No completed missions to measure yet.
      </div>
    );
  }

  const maxY = Math.max(...validData.map((d) => d.value), 0.001) * 1.15;
  const plotW = width - pad.left - pad.right;
  const slot = plotW / validData.length;
  const barW = Math.max(6, Math.min(slot - 4, 40)); // 2px surface gap either side
  const py = (v) => height - pad.bottom - (v / maxY) * (height - pad.top - pad.bottom);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
      {[0, maxY / 2, maxY].map((t, i) => (
        <g key={i}>
          <line x1={pad.left} x2={width - pad.right} y1={py(t)} y2={py(t)} stroke={GRID} strokeWidth="1" />
          <text x={pad.left - 6} y={py(t) + 3} textAnchor="end" fontSize="9" fill={MUTED}>
            {formatValue(t)}
          </text>
        </g>
      ))}

      {validData.map((d, i) => {
        const x = pad.left + slot * i + (slot - barW) / 2;
        const y = py(d.value);
        const h = height - pad.bottom - y;
        const active = hover?.label === d.label;
        return (
          <g key={d.label} onMouseEnter={() => setHover(d)}>
            <rect x={pad.left + slot * i} y={pad.top} width={slot} height={height - pad.top - pad.bottom} fill="transparent" />
            <rect x={x} y={y} width={barW} height={Math.max(h, 2)} rx="4" fill={SERIES} fillOpacity={active ? 1 : 0.82} />
            <text x={x + barW / 2} y={height - 10} textAnchor="middle" fontSize="9" fill={MUTED}>
              {d.label}
            </text>
          </g>
        );
      })}

      {hover && (
        <Tooltip
          x={pad.left + slot * validData.findIndex((d) => d.label === hover.label) + slot / 2}
          y={py(hover.value)}
          width={width}
          lines={[hover.sub || hover.label, `${formatValue(hover.value)}${unit}`]}
        />
      )}

      <line x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} stroke="#E5E7EB" strokeWidth="1" />
    </svg>
  );
}

/**
 * Ranked magnitude, sequential single hue (light -> dark with value).
 * data: [{ label, value, caption }] with value in 0..1
 */
export function RankedBars({ data, formatValue = (v) => `${Math.round(v * 100)}%` }) {
  if (!data || data.length === 0) {
    return <p className="text-[11px] text-gray-400 italic py-4">Nothing to rank yet.</p>;
  }

  // Single-hue amber ramp: magnitude reads from lightness, not from hue.
  const ramp = ['#FDE68A', '#FCD34D', '#FBBF24', '#F59E0B', '#D97706', '#B45309'];
  const colorFor = (v) => ramp[Math.min(ramp.length - 1, Math.floor(v * ramp.length))];

  return (
    <div className="space-y-1.5">
      {data.map((d) => (
        <div key={d.label} className="group">
          <div className="flex items-center justify-between text-[10.5px] mb-0.5">
            <span className="font-medium text-gray-700 truncate">{d.label}</span>
            <span className="font-mono font-bold text-gray-900 tabular-nums">{formatValue(d.value)}</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.max(2, d.value * 100)}%`, backgroundColor: colorFor(d.value) }}
              title={`${d.label}: ${formatValue(d.value)}`}
            />
          </div>
          {d.caption && <p className="text-[9.5px] text-gray-400 mt-0.5">{d.caption}</p>}
        </div>
      ))}
    </div>
  );
}

/** Compact inline trend for a stat tile. */
export function Sparkline({ values, color = SERIES, height = 28 }) {
  if (!values || values.length < 2) return <div style={{ height }} />;
  const width = 100;
  const max = Math.max(...values, 0.0001);
  const min = Math.min(...values);
  const span = Math.max(max - min, 0.0001);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - 2 - ((v - min) / span) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const CHART_INK = INK;
