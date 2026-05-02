import type { Position } from '../types'
import { formatUsd, formatPct } from '../utils'

interface Props {
  positions: Position[]
  busy?: boolean
  onClosePosition?: (token: string) => void
  onCloseAll?: () => void
}

export default function PositionsPanel({ positions, busy = false, onClosePosition, onCloseAll }: Props) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="portfolio-tabs">
          <span className="portfolio-tab is-active">Positions ({positions.length})</span>
        </div>
        {positions.length > 0 ? (
          <button type="button" className="table-page-btn" disabled={busy} onClick={onCloseAll}>
            Close All Positions
          </button>
        ) : (
          <div className="mini">All</div>
        )}
      </div>

      {positions.length === 0 ? (
        <div className="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18"/>
            <path d="m18.7 8-5.1 5.2-2.8-2.7L7 14.3"/>
          </svg>
          <p>No active positions tracked</p>
        </div>
      ) : (
        <div className="positions-table-wrap">
          <table className="positions-table">
            <thead>
              <tr>
                <th>Coin</th>
                <th>Size</th>
                <th>Position Value</th>
                <th>Entry Price</th>
                <th>Mark Price</th>
                <th>PNL (ROE %)</th>
                <th>Liq. Price</th>
                <th>Margin</th>
                <th>Funding</th>
                <th>Actions</th>
                <th>TP/SL</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos, i) => (
                <PositionRow
                  key={`${pos.token}-${i}`}
                  pos={pos}
                  busy={busy}
                  onClose={() => onClosePosition?.(pos.token)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PositionRow({ pos, busy, onClose }: { pos: Position; busy: boolean; onClose: () => void }) {
  const pnlNum = Number(pos.pnlUsd)
  const pnlClass = pnlNum >= 0 ? 'good' : 'bad'
  const syntheticSize = `${Number(pos.notional / Math.max(pos.currentPrice, 0.00000001)).toFixed(2)} ${pos.token}`
  const tpSl = `${Number(pos.tp1Price).toFixed(4)} / ${Number(pos.stopPrice).toFixed(4)}`

  return (
    <tr className={`positions-table__row positions-table__row--${pos.direction}`}>
      <td>
        <div className="positions-coin">
          <span className="positions-coin__name">{pos.token}</span>
          <span className={`positions-coin__multiplier positions-coin__multiplier--${pos.direction}`}>
            {pos.leverage}x
          </span>
        </div>
      </td>
      <td className="mono">{syntheticSize}</td>
      <td className="mono">{formatUsd(pos.notional)}</td>
      <td className="mono">{Number(pos.entryPrice).toFixed(6)}</td>
      <td className="mono">{Number(pos.currentPrice).toFixed(6)}</td>
      <td className={`mono positions-pnl positions-pnl--${pnlClass}`}>
        {formatUsd(pnlNum)} ({formatPct(pos.pnlPct)})
      </td>
      <td className="mono">{Number(pos.stopPrice).toFixed(6)}</td>
      <td className="mono">
        {formatUsd(pos.margin)} <span className="positions-muted">(Cross)</span>
      </td>
      <td className="mono">{pos.holdMins}m</td>
      <td>
        <div className="positions-actions">
          <button type="button" className="positions-action-btn" disabled={busy} onClick={onClose}>
            Market Close
          </button>
        </div>
      </td>
      <td className="mono">{tpSl}</td>
    </tr>
  )
}
