import type { DashboardPage, RuntimeInfo, BotStatus } from '../types'

interface Props {
  currentPage: DashboardPage
  onNavigate: (page: DashboardPage) => void
  version: string
  runtime: RuntimeInfo | null
  status: BotStatus | null
}

const NAV_ITEMS: Array<{ id: DashboardPage; label: string }> = [
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'positions', label: 'Positions' },
  { id: 'trades', label: 'Trades' },
  { id: 'signals', label: 'Signals' },
  { id: 'config', label: 'Config' },
]

export default function DashboardNav({
  currentPage,
  onNavigate,
  version,
  runtime,
  status,
}: Props) {
  return (
    <section className="portfolio-hero">
      <div className="portfolio-nav">
        <div className="portfolio-brand">
          <span className="brand-mark" />
          <span>TradingOn</span>
        </div>

        <div className="portfolio-links">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-link ${currentPage === item.id ? 'is-active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="portfolio-nav-actions">
          <div className="version-chip">v{version}</div>
          <div className="wallet-chip">
            {runtime ? runtime.mode.toUpperCase() : 'MODE'} | {status ? status.state.replaceAll('_', ' ') : 'loading'}
          </div>
        </div>
      </div>
    </section>
  )
}
