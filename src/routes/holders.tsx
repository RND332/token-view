import { useEffect, useMemo, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import * as d3 from 'd3'
import { sankeyCircular } from 'd3-sankey-circular'

import '../App.css'


type HolderPoint = {
  day: string
  unique_addrs: number
}

type ChartPoint = {
  date: Date
  value: number
}

const getHolderSeries = createServerFn({ method: 'GET' }).handler(async () => {
  const [{ Database }, { resolve }] = await Promise.all([
    import('bun:sqlite'),
    import('node:path'),
  ])

  const dbPath = resolve(process.cwd(), 'data', 'db.sqlite')
  const db = new Database(dbPath, { readonly: true })

  try {
    const rows = db
      .query(
        `
        WITH all_addrs AS (
          SELECT date(timestamp, 'unixepoch') AS day, from_addr AS addr FROM transfers
          UNION ALL
          SELECT date(timestamp, 'unixepoch') AS day, to_addr AS addr FROM transfers
        ), day_addr AS (
          SELECT day, addr FROM all_addrs GROUP BY day, addr
        )
        SELECT day, COUNT(*) AS unique_addrs
        FROM day_addr
        GROUP BY day
        ORDER BY day
      `,
      )
      .all() as HolderPoint[]

    return rows
  } finally {
    db.close()
  }
})

const getSankeyData = createServerFn({ method: 'GET' }).handler(async () => {
    const [{ Database }, { resolve }] = await Promise.all([
        import('bun:sqlite'),
        import('node:path'),
    ])
  
    const dbPath = resolve(process.cwd(), 'data', 'db.sqlite')
    const db = new Database(dbPath, { readonly: true })
  
    try {
        const rows = db
            .query(
                `
                WITH hourly AS (
                    SELECT
                        strftime('%Y-%m-%d %H:00', timestamp, 'unixepoch') AS hour,
                        from_addr,
                        to_addr,
                        SUM(value * 1.0) AS amount
                    FROM transfers
                    GROUP BY hour, from_addr, to_addr
                )
                SELECT hour, from_addr, to_addr, amount
                FROM hourly
                WHERE amount != 0
                ORDER BY hour
            `,
            )
            .all() as { hour: string; from_addr: string; to_addr: string; amount: number }[]

        const nodesMap = new Map<
            string,
            { id: string; addr: string; day: string; hour: string; label: string }
        >()
        const links: { source: string; target: string; value: number; day: string }[] = []

        for (const row of rows) {
            const sourceId = `${row.hour}-${row.from_addr}`
            const targetId = `${row.hour}-${row.to_addr}`

            if (!nodesMap.has(sourceId)) {
                nodesMap.set(sourceId, {
                    id: sourceId,
                    addr: row.from_addr,
                    day: row.hour,
                    hour: row.hour,
                    label: `${row.hour} – ${row.from_addr}`,
                })
            }
            if (!nodesMap.has(targetId)) {
                nodesMap.set(targetId, {
                    id: targetId,
                    addr: row.to_addr,
                    day: row.hour,
                    hour: row.hour,
                    label: `${row.hour} – ${row.to_addr}`,
                })
            }

            links.push({
                source: sourceId,
                target: targetId,
                value: row.amount,
                day: row.hour,
            })
        }

        return {
            nodes: Array.from(nodesMap.values()),
            links,
        }
    } catch (e) {
        console.error('Error fetching sankey data:', e)
        return { nodes: [], links: [] }
    } finally {
        db.close()
    }
})

export const Route = createFileRoute('/holders')({
  loader: async () => {return {holderSeries: await getHolderSeries(), sankeyData: await getSankeyData()};},
  component: Holders,
})

function Holders() {
  const data = Route.useLoaderData() as {
    holderSeries: HolderPoint[]
    sankeyData: { nodes: { id: string; addr: string; hour: string; label: string }[]; links: { source: string; target: string; value: number; hour: string }[] }
  }
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const chartData = useMemo<ChartPoint[]>(
    () =>
      data.holderSeries
        .map((d) => ({
          date: new Date(`${d.day}T00:00:00Z`),
          value: d.unique_addrs,
        }))
        .filter((d) => !Number.isNaN(d.date.getTime()))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [data],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || chartData.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const deviceScale = window.devicePixelRatio || 1
    const width = 880
    const height = 360
    canvas.width = width * deviceScale
    canvas.height = height * deviceScale
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(deviceScale, deviceScale)

    ctx.clearRect(0, 0, width, height)

    const margin = { top: 24, right: 24, bottom: 32, left: 56 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    const x = d3
      .scaleTime()
      .domain(d3.extent(chartData, (d: ChartPoint) => d.date) as [Date, Date])
      .range([0, innerWidth])

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(chartData, (d: ChartPoint) => d.value) ?? 0])
      .nice()
      .range([innerHeight, 0])

    const line = d3
      .line()
      .x((d: ChartPoint) => x(d.date))
      .y((d: ChartPoint) => y(d.value))
      .context(ctx)

    ctx.save()
    ctx.translate(margin.left, margin.top)

    // axes
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1
    y.ticks(6).forEach((t: number) => {
      const ty = y(t)
      ctx.beginPath()
      ctx.moveTo(0, ty)
      ctx.lineTo(innerWidth, ty)
      ctx.stroke()
      ctx.fillStyle = '#64748b'
      ctx.font = '11px "Space Grotesk", "Segoe UI", sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(t.toString(), -8, ty)
    })

    // x ticks
    x.ticks(6).forEach((t: Date) => {
      const tx = x(t)
      ctx.beginPath()
      ctx.moveTo(tx, innerHeight)
      ctx.lineTo(tx, innerHeight + 6)
      ctx.stroke()
      ctx.fillStyle = '#64748b'
      ctx.font = '11px "Space Grotesk", "Segoe UI", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(d3.timeFormat('%b %d')(t), tx, innerHeight + 8)
    })

    // line
    ctx.strokeStyle = '#0ea5e9'
    ctx.lineWidth = 2
    ctx.beginPath()
    line(chartData)
    ctx.stroke()

    // area fill
    const area = d3
      .area()
      .x((d: ChartPoint) => x((d as ChartPoint).date))
      .y0(innerHeight)
      .y1((d: ChartPoint) => y((d as ChartPoint).value))
      .context(ctx)

    ctx.fillStyle = 'rgba(14, 165, 233, 0.12)'
    ctx.beginPath()
    area(chartData)
    ctx.fill()

    // points
    ctx.fillStyle = '#0284c7'
    chartData.forEach((d) => {
      ctx.beginPath()
      ctx.arc(x(d.date), y(d.value), 3, 0, Math.PI * 2)
      ctx.fill()
    })

    ctx.restore()
  }, [chartData])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-3 py-6">
        <header className="flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Holders</p>
          <h1 className="text-xl font-semibold text-slate-900">Unique holders over time</h1>
          <p className="text-sm text-slate-600">Computed from distinct addresses seen in transfers per day.</p>
        </header>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {chartData.length === 0 ? (
            <p className="text-sm text-slate-600">No data available.</p>
          ) : (
            <div className="overflow-auto">
              <canvas ref={canvasRef} aria-label="Holders over time chart" />
            </div>
          )}
        </section>
      </main>
    <section className="mx-auto flex flex-col gap-3 px-3 pb-8">
      <header className="flex flex-col gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Transfers</p>
        <h2 className="text-lg font-semibold text-slate-900">Sankey timeline</h2>
        <p className="text-sm text-slate-600">Hourly transfer flows between addresses.</p>
      </header>

      {data.sankeyData.links.length === 0 ? (
        <p className="text-sm text-slate-600">No transfer data available.</p>
      ) : (
        <HourlySankey data={data.sankeyData} />
      )}
    </section>
    </div>
  )
}

function HourlySankey({
  data,
}: {
  data: { nodes: { id: string; addr: string; hour: string; label: string }[]; links: { source: string; target: string; value: number; hour: string }[] }
}) {
  const prepared = useMemo(() => {
    const nodes = data.nodes.map((n) => ({ ...n, name: n.label ?? n.id }))
    const links = data.links
      .filter((l) => l.source && l.target && l.source !== l.target)
      .map((l) => ({ ...l, value: Math.max(0.0001, Number(l.value) || 0) }))

    const hours = Array.from(new Set(nodes.map((d) => d.hour))).sort()
    const idToIndex = new Map<string, number>()
    nodes.forEach((n, idx) => idToIndex.set(n.id, idx))

    const indexedLinks = links
      .map((l) => ({
        source: idToIndex.get(l.source) ?? -1,
        target: idToIndex.get(l.target) ?? -1,
        value: l.value,
        hour: l.hour,
      }))
      .filter((l) => l.source >= 0 && l.target >= 0)

    return { nodes, links: indexedLinks, hours }
  }, [data])

  const margin = { top: 24, right: 24, bottom: 32, left: 24 }
  const innerWidth = useMemo(() => Math.max(900, Math.min(2400, 220 + prepared.hours.length * 120)), [prepared.hours.length])
  const innerHeight = 640
  const width = innerWidth + margin.left + margin.right
  const height = innerHeight + margin.top + margin.bottom

  const graph = useMemo(() => {
    const nodes = prepared.nodes.map((n) => ({ ...n }))
    const links = prepared.links.map((l) => ({ ...l }))

    const hourIndex = new Map<string, number>()
    prepared.hours.forEach((h, i) => hourIndex.set(h, i))

    const sankey = sankeyCircular()
      .nodeId((d: any) => d.id)
      .nodeWidth(14)
      .nodePadding(24)
      .nodeAlign((d: any) => hourIndex.get(d.hour) ?? 0)
      .size([innerWidth, innerHeight])
      .circularLinkGap(6)

    return sankey({ nodes, links })
  }, [prepared, innerWidth, innerHeight])

  const color = useMemo(() => d3.scaleOrdinal(d3.schemeTableau10), [])

  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <svg width={width} height={height} role="img" aria-label="Sankey timeline of transfers">
        <g transform={`translate(${margin.left},${margin.top})`}>
          <g fill="none" strokeOpacity={0.25}>
            {graph.links.map((link: any, i: number) => (
              <path
                key={`${link.source.id}-${link.target.id}-${i}`}
                stroke={color((link as any).source.addr)}
                strokeWidth={Math.max(1, link.width)}
              />
            ))}
          </g>

          <g>
            {graph.nodes.map((node: any) => (
              <g key={node.id} transform={`translate(${node.x0},${node.y0})`}>
                <rect
                  width={node.x1 - node.x0}
                  height={Math.max(4, node.y1 - node.y0)}
                  fill={color(node.addr)}
                  rx={2}
                />
                <title>{`${node.label}`}</title>
                <text
                  x={(node.x1 - node.x0) + 6}
                  y={(node.y1 - node.y0) / 2}
                  dy="0.35em"
                  fontSize={11}
                  fill="#0f172a"
                >
                  {node.addr.slice(0, 6)}…{node.addr.slice(-4)}
                </text>
              </g>
            ))}
          </g>

          <g>
            {prepared.hours.map((h, idx) => {
              const span = prepared.hours.length > 1 ? innerWidth / (prepared.hours.length - 1) : 0
              const x = idx * span
              return (
                <g key={h}>
                  <line x1={x} y1={-4} x2={x} y2={innerHeight + 4} stroke="#e2e8f0" strokeWidth={1} />
                  <text
                    x={x}
                    y={innerHeight + 10}
                    textAnchor="middle"
                    fontSize={11}
                    fill="#475569"
                  >
                    {h.slice(11, 16)}
                  </text>
                </g>
              )
            })}
          </g>
        </g>
      </svg>
    </div>
  )
}


