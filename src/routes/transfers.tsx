import { useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import * as d3 from 'd3'
import { sankey, sankeyLinkHorizontal } from 'd3-sankey'

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

const getTransfers = createServerFn({ method: 'GET' }).handler(async () => {
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
        LIMIT 200
      `,
      )
      .all() as TransferRow[]

    return transfers
  } finally {
    db.close()
  }
})

type LoaderData = Awaited<ReturnType<typeof getTransfers>>

export const Route = createFileRoute('/transfers')({
  loader: () => getTransfers(),
  component: Transfers,
})

function Transfers() {
  const transfers = Route.useLoaderData() as LoaderData

  const flowData = useMemo(() => {
    if (!transfers?.length) return { nodes: [], links: [] }

    const linkCounts = new Map<string, number>()
    const nodeIds = new Set<string>()

    transfers.forEach((tx) => {
      if (!tx.from_addr || !tx.to_addr) return
      const key = `${tx.from_addr}->${tx.to_addr}`
      linkCounts.set(key, (linkCounts.get(key) ?? 0) + 1)
      nodeIds.add(tx.from_addr)
      nodeIds.add(tx.to_addr)
    })

    const links = Array.from(linkCounts.entries())
      .map(([key, value]) => {
        const [source, target] = key.split('->')
        return { source, target, value }
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 40)

    const nodes = Array.from(nodeIds)
      .filter((id) => links.some((l) => l.source === id || l.target === id))
      .map((id) => ({ id }))

    return { nodes, links }
  }, [transfers])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-3 py-6">
        <header className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Transfers</p>
          <h1 className="text-xl font-semibold text-slate-900">Recent transfers (latest 200)</h1>
          <p className="text-sm text-slate-600">Rows are pulled directly from the SQLite transfer log ordered by block height.</p>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Flow</p>
              <h2 className="text-base font-semibold text-slate-900">Top address flows (by transfer count)</h2>
              <p className="text-xs text-slate-600">Shows up to the 40 most active source→destination pairs from the latest 200 transfers.</p>
            </div>
          </div>
          {flowData.links.length === 0 ? (
            <p className="text-sm text-slate-600">Not enough data to render flows yet.</p>
          ) : (
            <div className="overflow-auto">
              <FlowChart data={flowData} />
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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

type FlowChartData = {
  nodes: { id: string }[]
  links: { source: string; target: string; value: number }[]
}

type SankeyNodeView = FlowChartData['nodes'][number] & {
  x0: number
  x1: number
  y0: number
  y1: number
}

type SankeyLinkView = {
  source: SankeyNodeView
  target: SankeyNodeView
  value: number
  width?: number
}

function FlowChart({ data }: { data: FlowChartData }) {
  const width = 960
  const height = 540

  const sankeyData = useMemo(() => {
    const layout = sankey()
      .nodeId((d: { id: string }) => d.id)
      .nodeWidth(16)
      .nodePadding(18)
      .extent([
        [1, 1],
        [width - 1, height - 6],
      ])

    const result = layout({
      nodes: data.nodes.map((d) => ({ ...d })),
      links: data.links.map((d) => ({ ...d })),
    }) as unknown as { nodes: SankeyNodeView[]; links: SankeyLinkView[] }

    return result
  }, [data, height, width])

  const color = useMemo(() => d3.scaleOrdinal(d3.schemeTableau10), [])

  return (
    <svg width={width} height={height} role="img" aria-label="Sankey flow of transfers">
      <g fill="none" strokeOpacity={0.3}>
        {sankeyData.links.map((link, i) => (
          <path
            key={i}
            stroke="#0f172a"
            strokeWidth={Math.max(1, link.width ?? 1)}
          />
        ))}
      </g>

      <g>
        {sankeyData.nodes.map((node, i) => (
          <g key={i}>
            <rect
              x={node.x0}
              y={node.y0}
              width={(node.x1 ?? 0) - (node.x0 ?? 0)}
              height={(node.y1 ?? 0) - (node.y0 ?? 0)}
              fill={color(node.id)}
              fillOpacity={0.85}
            />
            <text
              x={(node.x0 ?? 0) - 8}
              y={((node.y0 ?? 0) + (node.y1 ?? 0)) / 2}
              dy="0.35em"
              textAnchor="end"
              fontSize={11}
              fill="#0f172a"
            >
              {node.id}
            </text>
          </g>
        ))}
      </g>
    </svg>
  )
}

function shortenAddress(address?: string) {
  if (!address) return 'N/A'
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
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
