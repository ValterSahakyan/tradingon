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
  const positions = dashboard?.positions ?? []
  const signals = dashboard?.signals ?? []
  const trades = dashboard?.trades ?? []
  const openExposure = positions.reduce((sum, position) => sum + Number(position.notional ?? 0), 0)
  const marginUsed = positions.reduce((sum, position) => sum + Number(position.margin ?? 0), 0)
  const netUnrealized = positions.reduce((sum, position) => sum + Number(position.pnlUsd ?? 0), 0)
  const latestTrade = trades[0] ?? null
  const latestSignal = signals[0] ?? null

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
          <p>Live equity, active risk, current automation state, and the latest execution context in one operator view.</p>
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

      <div className="portfolio-summary">
        <SummaryCard
          label="Account Equity"
          value={balance?.perpBalance != null ? `$${Number(balance.perpBalance).toFixed(2)}` : '-'}
          accent={balanceColor}
          detail={balanceSubtext}
        />
        <SummaryCard
          label="Margin In Use"
          value={positions.length ? formatUsd(marginUsed) : '$0.00'}
          detail={positions.length ? `${positions.length} open positions` : 'No open positions'}
        />
        <SummaryCard
          label="Open Exposure"
          value={positions.length ? formatUsd(openExposure) : '$0.00'}
          detail={status ? `${status.openPositions}/${status.maxPositions} slots used` : '-'}
        />
        <SummaryCard
          label="Unrealized PnL"
          value={positions.length ? formatUsd(netUnrealized) : '$0.00'}
          accent={netUnrealized >= 0 ? 'var(--good)' : 'var(--bad)'}
          detail={positions.length ? 'Across active positions' : 'Waiting for next entry'}
        />
        <SummaryCard
          label="Signals Confirmed"
          value={String(status?.scanDiagnostics?.signalsFound ?? 0)}
          detail={`${status?.scanDiagnostics?.candidatesFound ?? 0} watch candidates`}
        />
        <SummaryCard
          label="Win Rate"
          value={stats ? `${Number(stats.winRatePct ?? 0).toFixed(1)}%` : '-'}
          detail={stats ? `Week ${formatUsd(stats.weekPnl)}` : 'No stats yet'}
        />
      </div>

      <div className="hero">
        <div className="hero-card hero-card--chart">
          <div className="panel-head portfolio-chart-headline">
            <div>
              <div className="panel-title">PnL Performance</div>
              <div className="mini">Recorded trade PnL with live unrealized portfolio impact</div>
            </div>
            <div className="portfolio-chart-metrics">
              <div>
                <span className="metric-label">Today</span>
                <strong className="mono" style={{ color: pnlColor }}>{stats ? formatUsd(stats.todayPnl) : '-'}</strong>
              </div>
              <div>
                <span className="metric-label">Week</span>
                <strong className="mono">{stats ? formatUsd(stats.weekPnl) : '-'}</strong>
              </div>
              <div>
                <span className="metric-label">Current State</span>
                <strong>{status ? status.state.replaceAll('_', ' ') : '-'}</strong>
              </div>
            </div>
          </div>

          <div className="hero-chart-head">
            <div className="portfolio-chart-legend">
              <span className="chart-dot" style={{ backgroundColor: pnlNum >= 0 ? 'var(--good)' : 'var(--bad)' }} />
              <span>Realized cumulative PnL with current live open-position impact</span>
            </div>
            <div className="mini">{lastEvent ?? 'No voice events yet'}</div>
          </div>

          <PnlChart data={dashboard?.pnlChart ?? []} embedded />
        </div>

        <div className="hero-side hero-side--portfolio">
          <InsightCard
            title="Runtime"
            pill={runtime?.isRunning ? 'Scanning' : runtime ? `Every ${runtime.scanIntervalSeconds}s` : 'Loading'}
            pillClass={runtime?.isRunning ? 'warn' : 'neutral'}
            rows={[
              ['State', status ? status.state.replaceAll('_', ' ') : '-'],
              ['Last scan', runtime?.lastScanAt ? timeAgo(runtime.lastScanAt) : 'No scan recorded'],
              ['Market', status?.marketCondition ?? '-'],
            ]}
            footer={
              status?.pauseReason
                ? `Pause reason: ${status.pauseReason}`
                : status?.pauseUntil
                  ? `Paused until ${formatTime(status.pauseUntil)}`
                  : 'Trading gate clear'
            }
          />

          <InsightCard
            title="Market Snapshot"
            pill={status?.marketCondition ?? 'Loading'}
            pillClass={status ? statePillClass(status.state) : 'neutral'}
            rows={[
              ['SOL 1h', status ? formatPct(status.marketMoves.sol1h) : '-'],
              ['BTC 4h', status ? formatPct(status.marketMoves.btc4h) : '-'],
              ['Tracked', status ? String(status.trackedTokens) : '-'],
            ]}
            footer={status ? `${status.scanDiagnostics?.signalsFound ?? 0} signals in latest run` : 'Waiting for data'}
          />

          <InsightCard
            title="Latest Activity"
            rows={[
              ['Latest signal', latestSignal ? `${latestSignal.token} ${latestSignal.direction.toUpperCase()}` : 'None'],
              ['Latest trade', latestTrade ? `${latestTrade.token} ${latestTrade.direction.toUpperCase()}` : 'None'],
              ['Open positions', positions.length ? positions.map((position) => position.token).slice(0, 3).join(', ') : 'None'],
            ]}
            footer={
              latestTrade?.pnlUsd != null
                ? `Last trade result ${formatUsd(latestTrade.pnlUsd)}`
                : latestSignal
                  ? `Signal seen ${timeAgo(latestSignal.timestamp)}`
                  : 'No recent trade or signal data'
            }
          />
        </div>
      </div>

      <div className="portfolio-detail-grid">
        <div className="hero-card portfolio-list-card">
          <div className="panel-head">
            <div>
              <div className="panel-title">Open Positions</div>
              <div className="mini">Live risk currently deployed</div>
            </div>
            <span className="pill neutral">{positions.length} active</span>
          </div>
          <div className="portfolio-mini-list">
            {positions.length === 0 ? (
              <div className="mini">No active positions</div>
            ) : (
              positions.slice(0, 4).map((position) => (
                <div key={position.token} className="portfolio-mini-row">
                  <div>
                    <strong>{position.token}</strong>
                    <div className="mini">{position.direction.toUpperCase()} · {position.leverage}x · {formatUsd(position.notional)}</div>
                  </div>
                  <div className="portfolio-mini-row__value" style={{ color: Number(position.pnlUsd) >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                    {formatUsd(position.pnlUsd)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="hero-card portfolio-list-card">
          <div className="panel-head">
            <div>
              <div className="panel-title">Signal Radar</div>
              <div className="mini">Most recent confirmed opportunities</div>
            </div>
            <span className="pill neutral">{signals.length} tracked</span>
          </div>
          <div className="portfolio-mini-list">
            {signals.length === 0 ? (
              <div className="mini">No confirmed signals saved</div>
            ) : (
              signals.slice(0, 4).map((signal, index) => (
                <div key={`${signal.token}-${index}`} className="portfolio-mini-row">
                  <div>
                    <strong>{signal.token}</strong>
                    <div className="mini">{signal.direction.toUpperCase()} · score {signal.score}</div>
                  </div>
                  <div className="portfolio-mini-row__value mono">{Number(signal.currentPrice).toFixed(6)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="hero-card portfolio-list-card">
          <div className="panel-head">
            <div>
              <div className="panel-title">Recent Trades</div>
              <div className="mini">Last realized executions</div>
            </div>
            <span className="pill neutral">{trades.length} loaded</span>
          </div>
          <div className="portfolio-mini-list">
            {trades.length === 0 ? (
              <div className="mini">No completed trades recorded</div>
            ) : (
              trades.slice(0, 4).map((trade) => (
                <div key={trade.id} className="portfolio-mini-row">
                  <div>
                    <strong>{trade.token}</strong>
                    <div className="mini">{trade.direction.toUpperCase()} · {trade.exitReason ?? 'Closed'}</div>
                  </div>
                  <div className="portfolio-mini-row__value" style={{ color: Number(trade.pnlUsd ?? 0) >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                    {formatUsd(Number(trade.pnlUsd ?? 0))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function SummaryCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string
  value: string
  detail: string
  accent?: string
}) {
  return (
    <div className="metric metric--summary">
      <div className="metric-label">{label}</div>
      <div className="metric-value metric-value--summary mono" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      <div className="metric-sub">{detail}</div>
    </div>
  )
}

function InsightCard({
  title,
  pill,
  pillClass = 'neutral',
  rows,
  footer,
}: {
  title: string
  pill?: string
  pillClass?: string
  rows: Array<[string, string]>
  footer: string
}) {
  return (
    <div className="hero-card hero-card--insight">
      <div className="panel-head">
        <div className="panel-title">{title}</div>
        {pill ? <span className={`pill ${pillClass}`}>{pill}</span> : null}
      </div>
      <div className="insight-rows">
        {rows.map(([label, value]) => (
          <div key={label} className="insight-row">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="metric-link">{footer}</div>
    </div>
  )
}
