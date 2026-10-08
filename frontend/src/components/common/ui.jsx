import React from 'react';

/** Small shared primitives so every panel looks like the same product. */

export function Card({ className = '', children, ...rest }) {
  return (
    <div
      className={`bg-white border border-[#E2E8F0] rounded-xl shadow-subtle ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Panel({ title, subtitle, actions, className = '', bodyClass = '', children }) {
  return (
    <Card className={`flex flex-col overflow-hidden ${className}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC]/90 shrink-0">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold text-slate-900 truncate">{title}</h3>}
            {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={`flex-1 min-h-0 overflow-y-auto ${bodyClass || 'p-4'}`}>{children}</div>
    </Card>
  );
}

export function Badge({ tone = 'bg-slate-100 text-slate-600 border border-slate-200/60', className = '', children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap tracking-wide ${tone} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'bg-slate-100 text-slate-700',
  /** Draws attention to a tile that is reporting a problem. */
  alert = false,
}) {
  return (
    <Card
      className={`p-4 flex items-start gap-3 card-hover ${
        alert ? 'border-red-200 bg-red-50/50 ring-1 ring-red-200/50' : ''
      }`}
    >
      {Icon && (
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>
          <Icon style={{ width: 18, height: 18 }} />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[11px] text-slate-500 font-medium truncate">{label}</p>
        <p
          className={`text-2xl font-bold leading-tight tabular-nums ${
            alert ? 'text-red-700' : 'text-slate-900'
          }`}
        >
          {value}
        </p>
        {hint && (
          <p className={`text-[10px] mt-0.5 truncate ${alert ? 'text-red-500' : 'text-slate-400'}`} title={hint}>
            {hint}
          </p>
        )}
      </div>
    </Card>
  );
}

export function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center py-10 px-4">
      {Icon && <Icon className="w-7 h-7 text-slate-300 mb-2" />}
      <p className="text-xs font-semibold text-slate-600">{title}</p>
      {hint && <p className="text-[11px] text-slate-400 mt-1 max-w-xs">{hint}</p>}
    </div>
  );
}

export function Meter({ value, tone = 'bg-slate-900', height = 'h-1.5' }) {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100;
  return (
    <div className={`w-full ${height} bg-slate-100 rounded-full overflow-hidden`}>
      <div className={`h-full rounded-full transition-all duration-300 ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[11px] font-semibold text-slate-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

const controlClass =
  'w-full px-3 py-2 border border-[#CBD5E1] rounded-lg text-xs bg-white transition-all outline-none ' +
  'focus:ring-2 focus:ring-slate-900/15 focus:border-slate-900 ' +
  'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed';

export function Select({ className = '', children, ...rest }) {
  return (
    <select className={`${controlClass} ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Input({ className = '', ...rest }) {
  return <input className={`${controlClass} ${className}`} {...rest} />;
}

export function Textarea({ className = '', rows = 3, ...rest }) {
  return <textarea rows={rows} className={`${controlClass} resize-y leading-relaxed ${className}`} {...rest} />;
}

/** The sentinel value a ComboSelect uses for "not one of the presets". */
export const CUSTOM_VALUE = '__custom__';

/**
 * A dropdown of known values that an operator can always step outside of.
 */
export function ComboSelect({
  value,
  onValueChange,
  options,
  customValue = '',
  onCustomChange,
  customOptionLabel = 'Other — type your own',
  customPlaceholder = 'Describe it in your own words',
  customHint,
  disabled = false,
  autoFocusCustom = true,
}) {
  const isCustom = value === CUSTOM_VALUE;
  return (
    <div className="space-y-2">
      <Select value={value} onChange={(e) => onValueChange(e.target.value)} disabled={disabled}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        <option value={CUSTOM_VALUE}>{customOptionLabel}</option>
      </Select>

      {isCustom && (
        <div className="animate-fade-in">
          <Input
            value={customValue}
            onChange={(e) => onCustomChange(e.target.value)}
            placeholder={customPlaceholder}
            autoFocus={autoFocusCustom}
            disabled={disabled}
          />
          {customHint && <span className="block text-[10px] text-slate-400 mt-1">{customHint}</span>}
        </div>
      )}
    </div>
  );
}

export function Button({ variant = 'primary', size = 'md', className = '', children, ...rest }) {
  const variants = {
    primary: 'bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white shadow-xs',
    ghost: 'bg-white border border-[#CBD5E1] text-slate-700 hover:bg-slate-50 active:bg-slate-100',
    subtle: 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:bg-slate-300',
    danger: 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 active:bg-red-200',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 active:bg-emerald-200',
  };
  const sizes = {
    sm: 'px-2.5 py-1 text-[11px]',
    md: 'px-3 py-1.5 text-xs',
    lg: 'px-4 py-2 text-[13px]',
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-all
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30 focus-visible:ring-offset-1
        disabled:opacity-40 disabled:cursor-not-allowed ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Modal({ title, subtitle, onClose, footer, width = 'max-w-lg', children }) {
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-slate-950/40 backdrop-blur-[2px] z-[2000] flex items-center justify-center p-4 animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 w-full ${width} max-h-[90vh] flex flex-col overflow-hidden`}
      >
        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-start justify-between gap-4 shrink-0 bg-[#F8FAFC]">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 -mt-0.5 -mr-1 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400
              hover:text-slate-700 hover:bg-slate-100 transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
            aria-label="Close"
          >
            <span className="text-xl leading-none">&times;</span>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC] flex justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function KeyValue({ label, value, mono = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[11px] text-gray-500 shrink-0">{label}</span>
      <span className={`text-[11px] font-semibold text-gray-800 text-right truncate ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}
