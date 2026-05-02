import { useEffect, useState } from 'react'
import type { Signal, WatchCandidate } from '../types'
import { timeAgo, PATTERN_NAMES } from '../utils'

interface Props {
  signals: Signal[]
  watchlist: WatchCandidate[]
  latestSignalsFound: number
  latestCandidatesFound: number
  lastScanAt?: number
}

type SignalTab = 'confirmed' | 'tradable' | 'developing'

export default function SignalsPanel({
  signals,
  watchlist,
  latestSignalsFound,
  latestCandidatesFound,
  lastScanAt,
}: Props) {
  const tradable = watchlist.filter((item) => item.tradable)
  const developing = watchlist.filter((item) => !item.tradable)
  const availableTabs: SignalTab[] = ['confirmed', 'tradable', 'developing'].filter((tab) => {
    if (tab === 'confirmed') return signals.length > 0
    if (tab === 'tradable') return tradable.length > 0
    return developing.length > 0
  }) as SignalTab[]
  const [activeTab, setActiveTab] = useState<SignalTab>(availableTabs[0] ?? 'confirmed')

  useEffect(() => {
    if (!availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0] ?? 'confirmed')
    }
  }, [activeTab, availableTabs])

  const emptyMessage =
    activeTab === 'confirmed'
      ? 'No recent confirmed signals saved'
      : activeTab === 'tradable'
        ? 'No tradable setups in the current scan'
        : 'No developing setups in the current scan'

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="portfolio-tabs">
            <button
              type="button"
              className={`portfolio-tab ${activeTab === 'confirmed' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('confirmed')}
            >
              Confirmed ({signals.length})
            </button>
            <button
              type="button"
              className={`portfolio-tab ${activeTab === 'tradable' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('tradable')}
            >
              Tradable ({tradable.length})
            </button>
            <button
              type="button"
              className={`portfolio-tab ${activeTab === 'developing' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('developing')}
            >
              Developing ({developing.length})
            </button>
          </div>
          <div className="panel-title">Signals</div>
        </div>
        <div className="mini">
          Latest scan: {latestSignalsFound} confirmed | {latestCandidatesFound} watched
        </div>
      </div>

      <div className="mini" style={{ marginBottom: 12 }}>
        {lastScanAt
          ? `Last scan ${timeAgo(lastScanAt)}. Table rows reflect recent saved history and current scan candidates.`
          : 'Table rows reflect recent saved history and current scan candidates.'}
      </div>

      {activeTab === 'confirmed' && signals.length > 0 && (
        <div className="signals-table-wrap">
          <table className="signals-table">
            <thead>
              <tr>
                <th>Coin</th>
                <th>Direction</th>
                <th>Score</th>
                <th>Price</th>
                <th>Patterns</th>
                <th>Seen</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((sig, i) => (
                <tr key={`${sig.token}-${i}`}>
                  <td className="mono">{sig.token}</td>
                  <td>
                    <span className={`pill ${sig.direction === 'long' ? 'good' : 'bad'}`}>
                      {sig.direction}
                    </span>
                  </td>
                  <td>{sig.score}</td>
                  <td className="mono">{Number(sig.currentPrice).toFixed(6)}</td>
                  <td>{formatPatternNames(sig.patternsFired)}</td>
                  <td>{timeAgo(sig.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'tradable' && tradable.length > 0 && (
        <div className="signals-table-wrap">
          <table className="signals-table">
            <thead>
              <tr>
                <th>Coin</th>
                <th>Direction</th>
                <th>Score</th>
                <th>Price</th>
                <th>Patterns</th>
                <th>Reason</th>
                <th>Seen</th>
              </tr>
            </thead>
            <tbody>
              {tradable.map((item, i) => (
                <tr key={`${item.token}-tradable-${i}`}>
                  <td className="mono">{item.token}</td>
                  <td>
                    <span className={`pill ${item.direction === 'short' ? 'bad' : 'good'}`}>
                      {(item.direction ?? 'watch').toUpperCase()}
                    </span>
                  </td>
                  <td>{item.score}</td>
                  <td className="mono">{Number(item.currentPrice).toFixed(6)}</td>
                  <td>{formatPatternNames(item.patternsFired)}</td>
                  <td>{item.reason ?? '-'}</td>
                  <td>{timeAgo(item.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'developing' && developing.length > 0 && (
        <div className="signals-table-wrap">
          <table className="signals-table">
            <thead>
              <tr>
                <th>Coin</th>
                <th>Direction</th>
                <th>Score</th>
                <th>Price</th>
                <th>Patterns</th>
                <th>Reason</th>
                <th>Seen</th>
              </tr>
            </thead>
            <tbody>
              {developing.map((item, i) => (
                <tr key={`${item.token}-developing-${i}`}>
                  <td className="mono">{item.token}</td>
                  <td>
                    <span className="pill warn">{(item.direction ?? 'watch').toUpperCase()}</span>
                  </td>
                  <td>{item.score}</td>
                  <td className="mono">{Number(item.currentPrice).toFixed(6)}</td>
                  <td>{formatPatternNames(item.patternsFired)}</td>
                  <td>{item.reason ?? '-'}</td>
                  <td>{timeAgo(item.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {((activeTab === 'confirmed' && signals.length === 0)
        || (activeTab === 'tradable' && tradable.length === 0)
        || (activeTab === 'developing' && developing.length === 0)) && (
        <div className="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p>{emptyMessage}</p>
        </div>
      )}
    </div>
  )
}

function formatPatternNames(patterns: string[]): string {
  if (!patterns.length) return '-'
  return patterns.map((id) => PATTERN_NAMES[id] ?? id).join(', ')
}
