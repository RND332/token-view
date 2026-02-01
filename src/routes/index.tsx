import { Link, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import '../App.css'

type TransferRow = {
  block: number
  timestamp: number
  tx_hash: string
  from_addr: string
  to_addr: string
  value: string
  direction: string
  is_mint: number
  is_burn: number
}

const fetchLedgerData = createServerFn({ method: 'GET' }).handler(async () => {
  const [{ Database }, { resolve }] = await Promise.all([
    import('bun:sqlite'),
    import('node:path'),
  ])

  const dbPath = resolve(process.cwd(), 'data', 'db.sqlite')
  const db = new Database(dbPath, { readonly: true })

  try {
    const transfers = db
      .query(
        `
        SELECT block, timestamp, tx_hash, from_addr, to_addr, value, direction, is_mint, is_burn
        FROM transfers
        ORDER BY block DESC
        LIMIT 25
      `,
      )
      .all() as TransferRow[]

    return { transfers }
  } finally {
    db.close()
  }
})

type LoaderData = Awaited<ReturnType<typeof fetchLedgerData>>

export const Route = createFileRoute('/')({
  component: Home,
  loader: () => fetchLedgerData(),
})

function Home() {
  const { transfers } = Route.useLoaderData() as LoaderData

  const latestBlock = transfers?.[0]?.block
  const lastUpdated = transfers?.[0]?.timestamp

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-3 py-6">
        <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur md:flex-row md:items-start md:justify-between">
          <div className="space-y-2.5 md:max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Ledger summary
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-[28px]">Token transfers overview</h1>
            <p className="max-w-3xl text-sm leading-relaxed text-slate-700">
              Data is read directly from <span className="font-mono text-slate-800">data/db.sqlite</span> via a
              TanStack Start server function, then streamed to this page.
            </p>
            <div className="flex flex-wrap gap-1.5">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm">
                {transfers?.length ?? 0} recent transfers
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm">
                Latest block {latestBlock ? formatNumber(latestBlock) : 'N/A'}
              </div>
            </div>
          </div>
          <div className="flex min-w-[210px] flex-col gap-1.5 rounded-lg border border-teal-200 bg-teal-700 p-3 text-teal-50 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-100">Last update</div>
            <div className="text-base font-bold">{lastUpdated ? formatTimestamp(lastUpdated) : 'Awaiting data'}</div>
            <p className="text-xs text-teal-100/90">Uses sqlite read-only access per request.</p>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <CardLink to="/transfers" title="Transfers" description="Review the latest 25 transfers from the ledger." />
          <CardLink to="/holders" title="Holders" description="See unique holders per day rendered as a D3 chart." />
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <header className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Transfers</p>
              <h2 className="text-lg font-semibold text-slate-900">Latest movements</h2>
              <p className="text-sm text-slate-600">Most recent 25 transfers ordered by block height.</p>
            </div>
          </header>

          <div className="overflow-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th scope="col" className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Block
                  </th>
                  <th scope="col" className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    When
                  </th>
                  <th scope="col" className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    From → To
                  </th>
                  <th scope="col" className="border-b border-slate-200 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Direction
                  </th>
                  <th scope="col" className="border-b border-slate-200 px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {transfers?.map((tx) => (
                  <tr key={tx.tx_hash} className="hover:bg-slate-50">
                    <td className="border-b border-slate-100 px-3 py-2 font-mono text-[13px] text-slate-700">{formatNumber(tx.block)}</td>
                    <td className="border-b border-slate-100 px-3 py-2 text-sm text-slate-600">{formatTimestamp(tx.timestamp)}</td>
                    <td className="border-b border-slate-100 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-800">
                        <span className="font-mono text-[13px] text-slate-700">{shortenAddress(tx.from_addr)}</span>
                        <span className="text-slate-400">→</span>
                        <span className="font-mono text-[13px] text-slate-700">{shortenAddress(tx.to_addr)}</span>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2">
                      <span className={badgeClass(tx)}>{labelFor(tx)}</span>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-right font-mono text-sm tabular-nums text-slate-900">{formatToken(tx.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function shortenAddress(address?: string) {
  if (!address) return 'N/A'
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatTimestamp(seconds?: number) {
  if (!seconds) return 'N/A'
  return new Date(seconds * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatToken(raw: string, decimals = 18, precision = 4) {
  try {
    const sign = raw.startsWith('-') ? '-' : ''
    const magnitude = raw.startsWith('-') ? raw.slice(1) : raw
    const value = BigInt(magnitude)
    const base = 10n ** BigInt(decimals)
    const whole = value / base
    const fraction = value % base
    const wholeWithCommas = addThousands(whole)
    const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, precision)

    return `${sign}${wholeWithCommas}${fractionStr ? `.${fractionStr}` : ''}`
  } catch (err) {
    console.error('Failed to format token amount', err)
    return raw
  }
}

function addThousands(value: bigint) {
  return value
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function labelFor(tx: TransferRow) {
  if (tx.is_mint) return 'Mint'
  if (tx.is_burn) return 'Burn'
  return tx.direction?.length ? tx.direction : 'Transfer'
}

function badgeClass(tx: TransferRow) {
  const base = 'inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold'

  if (tx.is_mint) return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`
  if (tx.is_burn) return `${base} border-rose-200 bg-rose-50 text-rose-700`
  return `${base} border-indigo-200 bg-indigo-50 text-indigo-700`
}

function CardLink({ to, title, description }: { to: string; title: string; description: string }) {
  return (
    <Link
      to={to}
      className="group flex flex-col gap-1 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:-translate-y-[1px] hover:border-slate-300 hover:shadow"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <span className="text-xs font-semibold text-slate-500 transition group-hover:text-slate-700">→</span>
      </div>
      <p className="text-sm text-slate-600">{description}</p>
    </Link>
  )
}
