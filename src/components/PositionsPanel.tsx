import type { Position } from '../types'
import { formatUsd, formatPct } from '../utils'

interface Props {
  positions: Position[]
}

export default function PositionsPanel({ positions }: Props) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="portfolio-tabs">
          <span className="portfolio-tab is-active">Positions ({positions.length})</span>
        </div>
        <div className="mini">All</div>
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
                <th>Close All</th>
                <th>TP/SL</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos, i) => (
                <PositionRow key={`${pos.token}-${i}`} pos={pos} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PositionRow({ pos }: { pos: Position }) {
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
          <span>Limit</span>
          <span>Market</span>
          <span>Reverse</span>
        </div>
      </td>
      <td className="mono">{tpSl}</td>
    </tr>
  )
}
