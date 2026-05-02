import type { PnlPoint } from '../types'
import { formatUsd } from '../utils'

interface Props {
  data: PnlPoint[]
  embedded?: boolean
}

export default function PnlChart({ data, embedded = false }: Props) {
  return (
    <div className={embedded ? 'chart-panel chart-panel--embedded' : 'panel'}>
      {!embedded && (
        <div className="panel-head">
          <div className="panel-title">PnL Curve</div>
          <div className="mini">Last 7 days</div>
        </div>
      )}

      {!data.length ? (
        <div className="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18"/>
            <path d="m18.7 8-5.1 5.2-2.8-2.7L7 14.3"/>
          </svg>
          <p>Insufficient performance history to map curve</p>
        </div>
      ) : (
        <div className={`chart ${embedded ? 'chart--embedded' : ''}`}>
          <ChartSvg data={data} />
        </div>
      )}
    </div>
  )
}

function ChartSvg({ data }: { data: PnlPoint[] }) {
  if (!data.length) return null

  const width = 100
  const height = 100
  const left = 8
  const right = 4
  const top = 8
  const bottom = 12
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom

  const values = data.map((point) => Number(point.cumPnl))
  const times = data.map((point) => Number(point.time))
  const dataMin = Math.min(...values)
  const dataMax = Math.max(...values)
  const valuePadding = Math.max(0.5, Math.abs(dataMax - dataMin) * 0.15)
  const min = Math.min(dataMin, 0) - valuePadding
  const max = Math.max(dataMax, 0) + valuePadding
  const range = max - min || 1
  const minTime = Math.min(...times)
  const maxTime = Math.max(...times)
  const timeRange = maxTime - minTime || 1
  const finalValue = values[values.length - 1]
  const stroke = finalValue >= 0 ? '#3ee0bb' : '#ff7c87'

  const points = data.map((point) => {
    const x = left + ((point.time - minTime) / timeRange) * plotWidth
    const y = top + (1 - (point.cumPnl - min) / range) * plotHeight
    return { x, y, value: point.cumPnl, time: point.time }
  })
  const pointsStr = points.map((point) => `${point.x},${point.y}`).join(' ')
  const lastPoint = points[points.length - 1]
  const areaPoints = `${left},${height - bottom} ${pointsStr} ${left + plotWidth},${height - bottom}`
  const zeroY = top + (1 - (0 - min) / range) * plotHeight
  const yTicks = Array.from({ length: 4 }, (_, index) => {
    const value = max - (range / 3) * index
    const y = top + (plotHeight / 3) * index
    return { value, y }
  })
  const xTicks = [0, 0.5, 1].map((position) => {
    const time = minTime + timeRange * position
    const x = left + plotWidth * position
    return { x, label: formatShortDate(time) }
  })

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="pnl-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>

      {yTicks.map((tick, index) => (
        <g key={`y-${index}`}>
          <line
            x1={left}
            y1={tick.y}
            x2={left + plotWidth}
            y2={tick.y}
            stroke="rgba(140,179,174,0.16)"
            strokeDasharray="2 3"
          />
          <text
            x={left - 1.5}
            y={tick.y - 1}
            textAnchor="end"
            fontSize="3.2"
            fill="rgba(140,179,174,0.8)"
          >
            {formatAxisUsd(tick.value)}
          </text>
        </g>
      ))}

      {xTicks.map((tick, index) => (
        <text
          key={`x-${index}`}
          x={tick.x}
          y={height - 3}
          textAnchor={index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'}
          fontSize="3.2"
          fill="rgba(140,179,174,0.8)"
        >
          {tick.label}
        </text>
      ))}

      {zeroY >= top && zeroY <= height - bottom && (
        <line
          x1={left}
          y1={zeroY}
          x2={left + plotWidth}
          y2={zeroY}
          stroke="rgba(242,247,245,0.26)"
          strokeDasharray="2 3"
        />
      )}

      <polygon points={areaPoints} fill="url(#pnl-fill)" />
      <polyline
        points={pointsStr}
        fill="none"
        stroke={stroke}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastPoint.x} cy={lastPoint.y} r="1.9" fill={stroke} />
      <circle cx={lastPoint.x} cy={lastPoint.y} r="3.4" fill="rgba(62,224,187,0.12)" />
    </svg>
  )
}

function formatShortDate(ts: number): string {
  const date = new Date(ts)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatAxisUsd(value: number): string {
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Number(value.toFixed(1))
  return formatUsd(rounded).replace('.00', '')
}
