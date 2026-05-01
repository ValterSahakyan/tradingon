import type { DashboardData, RuntimeInfo } from '../types'
import { formatUsd, formatPct, formatTime, timeAgo, statePillClass } from '../utils'

interface Props {
  dashboard: DashboardData | null
  runtime: RuntimeInfo | null
  balance: { perpBalance: number | null; spotBalance: number | null; updatedAt: number | null; needsAccountAddress: boolean } | null
  busy: boolean
  voiceEnabled: boolean
  lastEvent: string | null
  onVoiceToggle: () => void
  onScan: () => void
  onPause: () => void
  onResume: () => void
}

export default function HeroSection({ dashboard, runtime, balance, busy, voiceEnabled, lastEvent, onVoiceToggle, onScan, onPause, onResume }: Props) {
  const status = dashboard?.status
  const stats = dashboard?.stats

  const pnlNum = Number(stats?.todayPnl ?? 0)
  const pnlColor = pnlNum >= 0 ? 'var(--good)' : 'var(--bad)'
  const balanceColor =
    balance?.perpBalance != null && balance.perpBalance > 0
      ? 'var(--good)'
      : balance?.spotBalance != null && balance.spotBalance > 0
        ? 'var(--warn)'
        : undefined
  const zeroOrNull = balance?.perpBalance == null || balance.perpBalance === 0
  const balanceSubtext =
    balance == null
      ? 'Loading...'
      : balance.needsAccountAddress && zeroOrNull
        ? 'Set Main Account Address in Config → Exchange'
        : balance.spotBalance != null && balance.spotBalance > 0 && zeroOrNull
          ? `Spot: $${Number(balance.spotBalance).toFixed(2)} - transfer to perp account`
          : balance.updatedAt
            ? `Updated ${timeAgo(balance.updatedAt)}`
            : 'Unavailable - check Hyperliquid private key and account address'

  return (
    <section className="hero">
      <div className="hero-card">
        <div className="kicker">Trading Operations</div>
        <h1>TradingOn Bot Console</h1>
        <p>Live bot state, open positions, signals, trade performance, and strategy settings.</p>

        <div className="hero-grid">
          <div className="metric">
            <div className="metric-label">Bot State</div>
            <div className="metric-value">{status ? status.state.replaceAll('_', ' ') : '-'}</div>
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
            <div className="metric-value">{status?.marketCondition ?? '-'}</div>
            <div className="metric-sub">
              {status
                ? `SOL 1h ${formatPct(status.marketMoves.sol1h)} | BTC 4h ${formatPct(status.marketMoves.btc4h)}`
                : '-'}
            </div>
          </div>

          <div className="metric">
            <div className="metric-label">Today PnL</div>
            <div className="metric-value mono" style={{ color: pnlColor }}>
              {stats ? formatUsd(stats.todayPnl) : '-'}
            </div>
            <div className="metric-sub">
              {stats
                ? `Week ${formatUsd(stats.weekPnl)} | Win rate ${Number(stats.winRatePct ?? 0).toFixed(1)}%`
                : '-'}
            </div>
          </div>

          <div className="metric">
            <div className="metric-label">Balance</div>
            <div className="metric-value mono" style={{ color: balanceColor }}>
              {balance?.perpBalance != null ? `$${Number(balance.perpBalance).toFixed(2)}` : '-'}
            </div>
            <div className="metric-sub">{balanceSubtext}</div>
          </div>

          <div className="metric">
            <div className="metric-label">Coverage</div>
            <div className="metric-value mono">
              {status ? `${status.openPositions}/${status.maxPositions}` : '-'}
            </div>
            <div className="metric-sub">
              {status
                ? `${status.trackedTokens} tracked | ${status.scanDiagnostics?.candidatesFound ?? 0} watchlist | ${status.scanDiagnostics?.signalsFound ?? 0} signals`
                : '-'}
            </div>
          </div>
        </div>
      </div>

      <div className="hero-card status-stack">
        <div className="status-row">
          <div>
            <div className="mini">Runtime</div>
            <strong>{runtime ? runtime.mode.toUpperCase() : '-'}</strong>
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
            <strong>{status ? status.state.replaceAll('_', ' ') : '-'}</strong>
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

        <div className="status-row voice-row">
          <div className="voice-info">
            <div className="mini">Voice Alerts</div>
            <div className="voice-last">{lastEvent ?? 'No events yet'}</div>
          </div>
          <button
            className={`voice-toggle ${voiceEnabled ? 'voice-toggle--on' : ''}`}
            onClick={onVoiceToggle}
            aria-pressed={voiceEnabled}
            title={voiceEnabled ? 'Click to mute' : 'Click to enable voice'}
          >
            <span className="voice-toggle__track">
              <span className="voice-toggle__thumb" />
            </span>
            <span className="voice-toggle__label">
              {voiceEnabled ? <><span className="voice-dot" />ON</> : 'OFF'}
            </span>
          </button>
        </div>
      </div>
    </section>
  )
}
