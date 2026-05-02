import type { Position } from '../types'
import { formatUsd, formatPct, PATTERN_NAMES } from '../utils'

interface Props {
  positions: Position[]
}

export default function PositionsPanel({ positions }: Props) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="portfolio-tabs">
            <span className="portfolio-tab">Balances ({positions.length})</span>
            <span className="portfolio-tab is-active">Positions</span>
            <span className="portfolio-tab">Outcomes</span>
            <span className="portfolio-tab">Open Orders</span>
            <span className="portfolio-tab">Trade History</span>
          </div>
          <div className="panel-title">Open Positions</div>
        </div>
        <div className="mini">{positions.length} open</div>
      </div>

      <div className="positions">
        {positions.length === 0 ? (
          <div className="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18"/>
              <path d="m18.7 8-5.1 5.2-2.8-2.7L7 14.3"/>
            </svg>
            <p>No active positions tracked</p>
          </div>
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
    <div className={`position position--row ${pos.direction}`}>
      <div className="position-row">
        <div>
          <div className="token">{pos.token}</div>
          <div className="mini">
            {pos.direction.toUpperCase()} | Score {pos.score} | {pos.marketCondition}
          </div>
        </div>

        <div className="position-grid position-grid--portfolio">
          <DataBox label="Size" value={`${Number(pos.notional).toFixed(2)}`} />
          <DataBox label="Position Value" value={formatUsd(pos.notional)} />
          <DataBox label="Entry Price" value={Number(pos.entryPrice).toFixed(6)} />
          <DataBox label="Mark Price" value={Number(pos.currentPrice).toFixed(6)} />
          <DataBox label="PnL (ROE %)" value={`${formatUsd(pnlNum)} | ${formatPct(pos.pnlPct)}`} color={pnlColor} />
          <DataBox label="Liq. Price" value={Number(pos.stopPrice).toFixed(6)} />
          <DataBox label="Margin" value={Number(pos.margin).toFixed(2)} />
          <DataBox label="Funding" value={`${pos.leverage}x`} />
        </div>

        <div className="position-side">
          <div className="mono" style={{ fontSize: 20, color: pnlColor }}>
            {formatUsd(pnlNum)}
          </div>
          <div className="tags tags--compact">
            {pos.patternsFired?.length > 0
              ? pos.patternsFired.map(id => (
                  <span key={id} className="tag">{PATTERN_NAMES[id] ?? id}</span>
                ))
              : <span className="mini">No patterns recorded</span>}
          </div>
          <div className="mini">TP1 {Number(pos.tp1Price).toFixed(6)} | {pos.timeLeftMins}m left</div>
        </div>
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
