import type { PnlPoint } from '../types'

interface Props {
  data: PnlPoint[]
}

export default function PnlChart({ data }: Props) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">PnL Curve</div>
        <div className="mini">Last 7 days</div>
      </div>

      {!data.length ? (
        <div className="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18"/>
            <path d="m18.7 8-5.1 5.2-2.8-2.7L7 14.3"/>
          </svg>
          <p>Insufficient performance history to map curve</p>
        </div>
      ) : (
        <div className="chart">
          <ChartSvg data={data} />
        </div>
      )}
    </div>
  )
}

function ChartSvg({ data }: { data: PnlPoint[] }) {
  if (!data.length) return null


  const values = data.map(p => Number(p.cumPnl))
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * 100
    const y = 90 - ((v - min) / range) * 75
    return `${x},${y}`
  })

  const pointsStr = pts.join(' ')
  const lastPt = pts[pts.length - 1]
  const lastY = lastPt.split(',')[1]
  const finalValue = values[values.length - 1]
  const stroke = finalValue >= 0 ? '#2dd4bf' : '#fb7185'
  const areaPoints = `0,90 ${pointsStr} 100,90`
  const midline = 90 - ((0 - min) / range) * 75

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        <linearGradient id="pnl-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor={stroke} stopOpacity={0.34} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <line
        x1="0" y1={midline} x2="100" y2={midline}
        stroke="rgba(148,163,184,0.18)"
        strokeDasharray="2 3"
      />
      <polygon points={areaPoints} fill="url(#pnl-fill)" />
      <polyline
        points={pointsStr}
        fill="none"
        stroke={stroke}
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="100" cy={lastY} r="2.4" fill={stroke} />
    </svg>
  )
}
