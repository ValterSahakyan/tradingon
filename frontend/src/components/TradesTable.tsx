import type { Trade } from '../types'
import { formatUsd } from '../utils'

interface Props {
  trades: Trade[]
}

export default function TradesTable({ trades }: Props) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Recent Trades</div>
        <div className="mini">{trades.length} latest</div>
      </div>

      {trades.length === 0 ? (
        <div className="empty">No closed trades yet.</div>
      ) : (
        <table className="trade-table">
          <thead>
            <tr>
              <th>Token</th>
              <th>Dir</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>PnL</th>
              <th>Reason</th>
              <th>Score</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t, i) => {
              const pnl = Number(t.pnlUsd ?? 0)
              const pnlColor = pnl >= 0 ? 'var(--good)' : 'var(--bad)'
              return (
                <tr key={i}>
                  <td className="mono">{t.token}</td>
                  <td>{t.direction?.toUpperCase() ?? '—'}</td>
                  <td className="mono">{Number(t.entryPrice ?? 0).toFixed(6)}</td>
                  <td className="mono">
                    {t.exitPrice == null ? '—' : Number(t.exitPrice).toFixed(6)}
                  </td>
                  <td className="mono" style={{ color: pnlColor }}>{formatUsd(pnl)}</td>
                  <td>{t.exitReason ?? '—'}</td>
                  <td>{t.score}/4</td>
                  <td>{t.durationMinutes == null ? '—' : `${t.durationMinutes}m`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
