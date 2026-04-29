import type { Position } from '../types'
import { formatUsd, formatPct, PATTERN_NAMES } from '../utils'

interface Props {
  positions: Position[]
}

export default function PositionsPanel({ positions }: Props) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Open Positions</div>
        <div className="mini">{positions.length} open</div>
      </div>

      <div className="positions">
        {positions.length === 0 ? (
          <div className="empty">No open positions.</div>
        ) : (
          positions.map((pos, i) => <PositionCard key={`${pos.token}-${i}`} pos={pos} />)
        )}
      </div>
    </div>
  )
}

function PositionCard({ pos }: { pos: Position }) {
  const pnlNum = Number(pos.pnlUsd)
  const pnlColor = pnlNum >= 0 ? 'var(--good)' : 'var(--bad)'

  return (
    <div className={`position ${pos.direction}`}>
      <div className="position-top">
        <div>
          <div className="token">{pos.token}</div>
          <div className="mini">
            {pos.direction.toUpperCase()} | Score {pos.score} | {pos.marketCondition}
          </div>
        </div>
        <div className="mono" style={{ fontSize: 20, color: pnlColor }}>
          {formatUsd(pnlNum)}
        </div>
      </div>

      <div className="position-grid">
        <DataBox label="Entry"       value={Number(pos.entryPrice).toFixed(6)} />
        <DataBox label="Current"     value={Number(pos.currentPrice).toFixed(6)} />
        <DataBox label="Stop"        value={Number(pos.stopPrice).toFixed(6)} />
        <DataBox label="PnL %"       value={formatPct(pos.pnlPct)} color={pnlColor} />
        <DataBox label="Margin"      value={Number(pos.margin).toFixed(2)} />
        <DataBox label="Notional"    value={Number(pos.notional).toFixed(2)} />
        <DataBox label="Take Profit" value={Number(pos.tp1Price).toFixed(6)} />
        <DataBox label="Time Left"   value={`${pos.timeLeftMins}m`} />
      </div>

      <div className="tags">
        {pos.patternsFired?.length > 0
          ? pos.patternsFired.map(id => (
              <span key={id} className="tag">{PATTERN_NAMES[id] ?? id}</span>
            ))
          : <span className="mini">No patterns recorded</span>}
      </div>
    </div>
  )
}

function DataBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="data-box">
      <span>{label}</span>
      <strong className="mono" style={color ? { color } : undefined}>{value}</strong>
    </div>
  )
}
