import type { DashboardPage, RuntimeInfo, BotStatus } from '../types'

interface Props {
  currentPage: DashboardPage
  onNavigate: (page: DashboardPage) => void
  version: string
  runtime: RuntimeInfo | null
  status: BotStatus | null
  connectedAddress: string | null
  showWallet: boolean
  onDisconnect: () => void
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
  connectedAddress,
  showWallet,
  onDisconnect,
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
          {showWallet && (
            <div className="wallet-menu">
              <div className="wallet-menu__label">Connected wallet</div>
              <div className="wallet-chip wallet-chip--address mono">{connectedAddress ?? '-'}</div>
              <button type="button" className="wallet-menu__disconnect" onClick={onDisconnect}>
                Disconnect
              </button>
            </div>
          )}
          <div className="version-chip">v{version}</div>
          <div className="wallet-chip">
            {runtime ? runtime.mode.toUpperCase() : 'MODE'} | {status ? status.state.replaceAll('_', ' ') : 'loading'}
          </div>
        </div>
      </div>
    </section>
  )
}
