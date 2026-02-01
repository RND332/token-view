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
                WITH daily AS (
                  SELECT
                    date(timestamp, 'unixepoch') AS day,
                    from_addr,
                    to_addr,
                    SUM(value * 1.0) AS amount
                  FROM transfers
                  GROUP BY day, from_addr, to_addr
                )
                SELECT day, from_addr, to_addr, amount
                FROM daily
                WHERE amount != 0
                ORDER BY day
            `,
            )
              .all() as { day: string; from_addr: string; to_addr: string; amount: number }[]

        const nodesMap = new Map<
            string,
              { id: string; addr: string; day: string; label: string }
        >()
            const links: { source: string; target: string; value: number; day: string }[] = []

        for (const row of rows) {
              const sourceId = `${row.day}-${row.from_addr}`
              const targetId = `${row.day}-${row.to_addr}`

            if (!nodesMap.has(sourceId)) {
                nodesMap.set(sourceId, {
                    id: sourceId,
                    addr: row.from_addr,
                  day: row.day,
                  label: `${row.day} – ${row.from_addr}`,
                })
            }
            if (!nodesMap.has(targetId)) {
                nodesMap.set(targetId, {
                    id: targetId,
                    addr: row.to_addr,
                  day: row.day,
                  label: `${row.day} – ${row.to_addr}`,
                })
            }

            links.push({
                source: sourceId,
                target: targetId,
                value: row.amount,
                day: row.day,
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
    sankeyData: { nodes: { id: string; addr: string; day: string; label: string }[]; links: { source: string; target: string; value: number; day: string }[] }
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
    <section className="mx-auto flex max-w-5xl flex-col gap-3 px-3 pb-8">
      <header className="flex flex-col gap-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Flows</p>
        <h2 className="text-lg font-semibold text-slate-900">Sankey timeline (daily)</h2>
        <p className="text-sm text-slate-600">Latest daily snapshots of value moving between addresses.</p>
      </header>

    {(() => {
      type SankeyNode = { id: string; addr: string; day: string; label: string }
      type SankeyLink = { source: string; target: string; value: number; day: string }

      const linkDay = (l: SankeyLink) => l.day ?? 'unknown'
      const grouped = d3.group<SankeyLink, string>(data.sankeyData.links, linkDay)
      const days = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b))
      const palette = d3.scaleOrdinal<string, string>(d3.schemeTableau10)
      const width = 880
      const baseHeight = 180
      const heightPerNode = 8
      const heightPerLink = 2

      if (days.length === 0) {
        return <p className="text-sm text-slate-600">No flow data available.</p>
      }

      return (
        <div className="flex flex-col gap-4">
        {days.map((day: string) => {
          const dayLinks = grouped.get(day) ?? []
          if (dayLinks.length === 0) return null

          const nodeIds = new Set<string>()
          dayLinks.forEach((l: SankeyLink) => {
            nodeIds.add(String(l.source))
            nodeIds.add(String(l.target))
          })
          const dayNodes = data.sankeyData.nodes.filter((n) => nodeIds.has(n.id))

          const dynamicHeight = Math.max(
            baseHeight,
            baseHeight + dayNodes.length * heightPerNode + dayLinks.length * heightPerLink,
          )

          const sankeyGen = sankeyCircular<SankeyNode, SankeyLink>()
            .nodeId((d) => d.id)
            .nodeWidth(10)
            .nodePadding(12)
            .extent([
            [0, 0],
            [width, dynamicHeight],
            ])

          const graph = sankeyGen({
            nodes: dayNodes.map((n) => ({ ...n })),
            links: dayLinks.map((l) => ({ ...l })),
          })

          const linkPath = (link: any) => {
            const x0 = link.source.x1
            const x1 = link.target.x0
            const y0 = link.y0
            const y1 = link.y1
            const xi = d3.interpolateNumber(x0, x1)
            const x2 = xi(0.5)
            const x3 = xi(0.5)
            return `M${x0},${y0}C${x2},${y0} ${x3},${y1} ${x1},${y1}`
          }

          return (
            <figure
            key={day}
            className="overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
            <figcaption className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Snapshot
                </p>
                <p className="text-sm font-semibold text-slate-800">{day}</p>
              </div>
              <p className="text-xs text-slate-500">
                {dayNodes.length} addresses · {dayLinks.length} links
              </p>
            </figcaption>
            <svg width={width} height={dynamicHeight} role="presentation">
              <g>
                {(graph.links as any[]).map((link, idx) => (
                <path
                  key={`${link.source.id}-${link.target.id}-${idx}`}
                  d={linkPath(link)}
                  stroke="rgba(14,165,233,0.35)"
                  strokeWidth={Math.max(1, link.width || 1)}
                  fill="none"
                  opacity={0.9}
                >
                  <title>{`${link.source.addr} → ${link.target.addr} · ${link.value}`}</title>
                </path>
                ))}
                {(graph.nodes as any[]).map((node) => (
                <g key={node.id} transform={`translate(${node.x0},${node.y0})`}>
                  <rect
                    width={Math.max(2, node.x1 - node.x0)}
                    height={Math.max(2, node.y1 - node.y0)}
                    fill={palette(node.addr)}
                    rx={2}
                    ry={2}
                  />
                  <text
                    x={Math.max(2, node.x1 - node.x0) + 6}
                    y={(node.y1 - node.y0) / 2}
                    dy="0.35em"
                    fontSize={11}
                    fill="#334155"
                  >
                    {node.addr.slice(0, 12)}
                  </text>
                </g>
                ))}
              </g>
            </svg>
            </figure>
          )
        })}
        </div>
      )
    })()}
    </section>
    </div>
  )
}

