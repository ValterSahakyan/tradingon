import type { DashboardData, RuntimeInfo } from '../types'
import { formatUsd, formatPct, formatTime, timeAgo, statePillClass } from '../utils'

interface Props {
  dashboard: DashboardData | null
  runtime: RuntimeInfo | null
  busy: boolean
  onScan: () => void
  onPause: () => void
  onResume: () => void
}

export default function HeroSection({ dashboard, runtime, busy, onScan, onPause, onResume }: Props) {
  const status = dashboard?.status
  const stats = dashboard?.stats

  const pnlNum = Number(stats?.todayPnl ?? 0)
  const pnlColor = pnlNum >= 0 ? 'var(--good)' : 'var(--bad)'

  return (
    <section className="hero">
      <div className="hero-card">
        <div className="kicker">Trading Operations</div>
        <h1>TradingOn Bot Console</h1>
        <p>Live bot state, open positions, signals, trade performance, and strategy settings.</p>

        <div className="hero-grid">
          <div className="metric">
            <div className="metric-label">Bot State</div>
            <div className="metric-value">{status ? status.state.replaceAll('_', ' ') : '—'}</div>
            <div className="metric-sub">
              {status?.pauseReason
                ? `Pause reason: ${status.pauseReason}`
                : status?.pauseUntil
                  ? `Paused until ${formatTime(status.pauseUntil)}`
                  : 'Trading gate clear'}
            </div>
          </div>

          <div className="metric">
            <div className="metric-label">Market</div>
            <div className="metric-value">{status?.marketCondition ?? '—'}</div>
            <div className="metric-sub">
              {status
                ? `SOL 1h ${formatPct(status.marketMoves.sol1h)} | BTC 4h ${formatPct(status.marketMoves.btc4h)}`
                : '—'}
            </div>
          </div>

          <div className="metric">
            <div className="metric-label">Today PnL</div>
            <div className="metric-value mono" style={{ color: pnlColor }}>
              {stats ? formatUsd(stats.todayPnl) : '—'}
            </div>
            <div className="metric-sub">
              {stats ? `Week ${formatUsd(stats.weekPnl)} | Win rate ${Number(stats.winRatePct ?? 0).toFixed(1)}%` : '—'}
            </div>
          </div>

          <div className="metric">
            <div className="metric-label">Coverage</div>
            <div className="metric-value mono">
              {status ? `${status.openPositions}/${status.maxPositions}` : '—'}
            </div>
            <div className="metric-sub">
              {status ? `${status.trackedTokens} tracked tokens` : '—'}
            </div>
          </div>
        </div>
      </div>

      <div className="hero-card status-stack">
        <div className="status-row">
          <div>
            <div className="mini">Runtime</div>
            <strong>{runtime ? runtime.mode.toUpperCase() : '—'}</strong>
          </div>
          <span className={`pill ${runtime?.isRunning ? 'warn' : 'neutral'}`}>
            {runtime?.isRunning ? 'Scan Running' : runtime ? `Every ${runtime.scanIntervalSeconds}s` : 'Loading'}
          </span>
        </div>

        <div className="status-row">
          <div>
            <div className="mini">Last Scan</div>
            <strong>{runtime?.lastScanAt ? timeAgo(runtime.lastScanAt) : 'No scan recorded'}</strong>
          </div>
          {runtime?.lastScanResult ? (
            <span className={`pill ${runtime.lastScanResult.ok ? 'good' : 'bad'}`}>
              {runtime.lastScanResult.message}
            </span>
          ) : (
            <span className="pill neutral">No data</span>
          )}
        </div>

        <div className="status-row">
          <div>
            <div className="mini">State</div>
            <strong>{status ? status.state.replaceAll('_', ' ') : '—'}</strong>
          </div>
          {status && (
            <span className={`pill ${statePillClass(status.state)}`}>
              {status.state.replaceAll('_', ' ')}
            </span>
          )}
        </div>

        <div className="status-row" style={{ flexWrap: 'wrap' }}>
          <div>
            <div className="mini">Controls</div>
            <strong>Manual actions</strong>
          </div>
          <div className="actions">
            <button className="btn-primary" disabled={busy} onClick={onScan}>Run Scan</button>
            <button className="btn-danger" disabled={busy} onClick={onPause}>Pause 2h</button>
            <button className="btn-secondary" disabled={busy} onClick={onResume}>Resume</button>
          </div>
        </div>
      </div>
    </section>
  )
}
