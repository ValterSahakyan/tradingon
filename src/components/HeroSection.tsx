import type { DashboardData, RuntimeInfo } from '../types'
import { formatUsd, formatPct, formatTime, timeAgo, statePillClass } from '../utils'
import PnlChart from './PnlChart'

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

export default function HeroSection({
  dashboard,
  runtime,
  balance,
  busy,
  voiceEnabled,
  lastEvent,
  onVoiceToggle,
  onScan,
  onPause,
  onResume,
}: Props) {
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
        ? 'Set Main Account Address in Config -> Exchange'
        : balance.spotBalance != null && balance.spotBalance > 0 && zeroOrNull
          ? `Spot: $${Number(balance.spotBalance).toFixed(2)} -> transfer to perp account`
          : balance.updatedAt
            ? `Updated ${timeAgo(balance.updatedAt)}`
            : 'Unavailable - check Hyperliquid private key and account address'

  return (
    <section className="portfolio-hero">
      <div className="portfolio-header">
        <div>
          <div className="kicker">Portfolio</div>
          <h1>TradingOn Portfolio</h1>
          <p>Bot state, account health, active exposure, recent signals, and operator controls.</p>
        </div>

        <div className="portfolio-actions">
          <button className="action-chip" disabled={busy} onClick={onScan}>Run Scan</button>
          <button className="action-chip" disabled={busy} onClick={onResume}>Resume</button>
          <button className="action-chip action-chip--danger" disabled={busy} onClick={onPause}>Pause 2h</button>
          <button
            className={`action-chip action-chip--toggle ${voiceEnabled ? 'is-on' : ''}`}
            onClick={onVoiceToggle}
            aria-pressed={voiceEnabled}
            title={voiceEnabled ? 'Click to mute' : 'Click to enable voice'}
          >
            {voiceEnabled ? 'Voice On' : 'Voice Off'}
          </button>
        </div>
      </div>

      <div className="hero">
        <div className="hero-side">
          <div className="hero-card hero-card--compact">
            <div className="metric-label">Account Value</div>
            <div className="metric-value mono" style={{ color: balanceColor }}>
              {balance?.perpBalance != null ? `$${Number(balance.perpBalance).toFixed(2)}` : '-'}
            </div>
            <div className="metric-sub">{balanceSubtext}</div>
            <div className="metric-link">
              {status?.accountValueAt ? `Synced ${timeAgo(status.accountValueAt)}` : 'Balance feed'}
            </div>
          </div>

          <div className="hero-card hero-card--compact">
            <div className="panel-head">
              <div className="metric-label">Runtime</div>
              <span className={`pill ${runtime?.isRunning ? 'warn' : 'neutral'}`}>
                {runtime?.isRunning ? 'Scanning' : runtime ? `Every ${runtime.scanIntervalSeconds}s` : 'Loading'}
              </span>
            </div>
            <div className="metric-value">{status ? status.state.replaceAll('_', ' ') : '-'}</div>
            <div className="metric-sub">
              {status?.pauseReason
                ? `Pause reason: ${status.pauseReason}`
                : status?.pauseUntil
                  ? `Paused until ${formatTime(status.pauseUntil)}`
                  : 'Trading gate clear'}
            </div>
            <div className="metric-link">
              {runtime?.lastScanAt ? `Last scan ${timeAgo(runtime.lastScanAt)}` : 'No scan recorded'}
            </div>
          </div>
        </div>

        <div className="hero-card">
          <div className="panel-head">
            <div>
              <div className="panel-title">Perps + Spot + Signals</div>
              <div className="mini">30D snapshot</div>
            </div>
            {status && (
              <span className={`pill ${statePillClass(status.state)}`}>
                {status.marketCondition}
              </span>
            )}
          </div>

          <div className="hero-grid hero-grid--portfolio">
            <div className="metric">
              <div className="metric-label">Today PnL</div>
              <div className="metric-value mono" style={{ color: pnlColor }}>
                {stats ? formatUsd(stats.todayPnl) : '-'}
              </div>
              <div className="metric-sub">{stats ? `Week ${formatUsd(stats.weekPnl)}` : '-'}</div>
            </div>

            <div className="metric">
              <div className="metric-label">Volume Coverage</div>
              <div className="metric-value mono">
                {status ? `${status.openPositions}/${status.maxPositions}` : '-'}
              </div>
              <div className="metric-sub">
                {status ? `${status.trackedTokens} tracked tokens` : '-'}
              </div>
            </div>

            <div className="metric">
              <div className="metric-label">Win Rate</div>
              <div className="metric-value mono">
                {stats ? `${Number(stats.winRatePct ?? 0).toFixed(1)}%` : '-'}
              </div>
              <div className="metric-sub">
                {status
                  ? `${status.scanDiagnostics?.signalsFound ?? 0} signals | ${status.scanDiagnostics?.candidatesFound ?? 0} watchlist`
                  : '-'}
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
          </div>

          <div className="hero-chart-head">
            <div className="panel-title">PnL</div>
            <div className="mini">{lastEvent ?? 'No voice events yet'}</div>
          </div>

          <PnlChart data={dashboard?.pnlChart ?? []} embedded />
        </div>
      </div>
    </section>
  )
}
