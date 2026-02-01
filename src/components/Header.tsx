import { Link } from '@tanstack/react-router'

export default function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-3 py-2.5 text-sm font-semibold text-slate-800">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-white text-xs font-bold">TV</span>
          <div className="leading-tight">
            <div className="text-sm font-bold text-slate-900">Token View</div>
            <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">Ledger explorer</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <NavLink to="/" label="Overview" />
          <NavLink to="/holders" label="Holders" />
          <NavLink to="/transfers" label="Transfers" />
        </div>
      </nav>
    </header>
  )
}

function NavLink({ to, label, subtle }: { to: string; label: string; subtle?: boolean }) {
  const base = 'rounded-md px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300'
  const hover = 'hover:bg-slate-50'
  const text = subtle ? 'text-slate-600 hover:text-slate-900' : 'text-slate-800 hover:text-slate-900'
  return (
    <Link to={to} className={`${base} ${hover} ${text}`} activeProps={{ className: 'bg-slate-900 text-white hover:text-white hover:bg-slate-900' }}>
      {label}
    </Link>
  )
}
