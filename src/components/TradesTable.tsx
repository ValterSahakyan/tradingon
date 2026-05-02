import { useEffect, useState } from 'react'
import type { Trade } from '../types'
import { formatUsd } from '../utils'

interface Props {
  trades: Trade[]
}

const PAGE_SIZE = 10

export default function TradesTable({ trades }: Props) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(trades.length / PAGE_SIZE))
  const startIndex = (page - 1) * PAGE_SIZE
  const visibleTrades = trades.slice(startIndex, startIndex + PAGE_SIZE)

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages))
  }, [totalPages])

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Recent Trades</div>
        <div className="mini">{trades.length} total</div>
      </div>

      {trades.length === 0 ? (
        <div className="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
          </svg>
          <p>No completed trades recorded</p>
        </div>
      ) : (
        <>
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
              {visibleTrades.map((trade, index) => {
                const pnl = trade.pnlUsd == null ? null : Number(trade.pnlUsd)
                const pnlColor = pnl == null ? 'var(--muted)' : pnl >= 0 ? 'var(--good)' : 'var(--bad)'
                return (
                  <tr key={`${trade.id}-${startIndex + index}`}>
                    <td className="mono">{trade.token}</td>
                    <td>{trade.direction?.toUpperCase() ?? '-'}</td>
                    <td className="mono">{Number(trade.entryPrice ?? 0).toFixed(6)}</td>
                    <td className="mono">
                      {trade.exitPrice == null ? '-' : Number(trade.exitPrice).toFixed(6)}
                    </td>
                    <td className="mono" style={{ color: pnlColor }}>
                      {pnl == null ? '-' : formatUsd(pnl)}
                    </td>
                    <td>{trade.exitReason ?? '-'}</td>
                    <td>{trade.score}/4</td>
                    <td>{trade.durationMinutes == null ? '-' : `${trade.durationMinutes}m`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="table-pagination">
            <div className="mini">
              Showing {startIndex + 1}-{Math.min(startIndex + visibleTrades.length, trades.length)} of {trades.length}
            </div>
            <div className="table-pagination__controls">
              <button
                type="button"
                className="table-page-btn"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <span className="table-page-indicator">Page {page} / {totalPages}</span>
              <button
                type="button"
                className="table-page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
