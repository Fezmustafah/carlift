// Big tap-target option list used by both public forms (/join and /checkin).
export default function Choice({ options, value, onPick }) {
  return (
    <div className="space-y-2.5">
      {options.map((o) => {
        const active = value === o.v
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onPick(o.v)}
            className="w-full rounded-2xl px-4 py-4 text-left transition active:scale-[0.99] flex items-center gap-3"
            style={{
              border: `2px solid ${active ? 'var(--brand)' : 'var(--border-strong)'}`,
              background: active ? 'var(--brand-soft)' : 'var(--surface)',
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-lg font-semibold" style={{ color: active ? 'var(--brand-soft-fg)' : 'var(--text)' }}>
                {o.en}
              </div>
              {o.tl && <div className="text-sm muted">{o.tl}</div>}
            </div>
            {active && (
              <span className="text-lg" style={{ color: 'var(--brand)' }}>
                ✓
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
