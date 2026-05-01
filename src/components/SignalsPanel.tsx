import type { Signal, WatchCandidate } from '../types'
import { timeAgo, PATTERN_NAMES } from '../utils'

interface Props {
  signals: Signal[]
  watchlist: WatchCandidate[]
  latestSignalsFound: number
  latestCandidatesFound: number
  lastScanAt?: number
}

export default function SignalsPanel({
  signals,
  watchlist,
  latestSignalsFound,
  latestCandidatesFound,
  lastScanAt,
}: Props) {
  const tradable = watchlist.filter(item => item.tradable)
  const developing = watchlist.filter(item => !item.tradable)

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Signals</div>
        <div className="mini">
          Latest scan: {latestSignalsFound} confirmed | {latestCandidatesFound} watched
        </div>
      </div>

      <div className="signals">
        <div className="mini" style={{ marginBottom: 8 }}>
          {lastScanAt
            ? `Last scan ${timeAgo(lastScanAt)}. Cards below are recent confirmed history, not guaranteed live entries.`
            : 'Cards below are recent confirmed history, not guaranteed live entries.'}
        </div>

        {signals.length === 0 ? (
          <div className="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p>No recent confirmed signals saved</p>
          </div>
        ) : (
          <>
            <div className="panel-title" style={{ marginTop: 4 }}>Recent Confirmed History</div>
            {signals.map((sig, i) => <SignalCard key={`${sig.token}-${i}`} sig={sig} />)}
          </>
        )}

        {tradable.length > 0 && (
          <>
            <div className="panel-title" style={{ marginTop: 12 }}>Tradable In Current Scan</div>
            {tradable.map((item, i) => <CandidateCard key={`${item.token}-tradable-${i}`} item={item} />)}
          </>
        )}

        {developing.length > 0 && (
          <>
            <div className="panel-title" style={{ marginTop: 12 }}>Developing Setups</div>
            {developing.map((item, i) => <CandidateCard key={`${item.token}-watch-${i}`} item={item} />)}
          </>
        )}
      </div>
    </div>
  )
}

function SignalCard({ sig }: { sig: Signal }) {
  return (
    <div className="signal">
      <div className="signal-top">
        <div>
          <div className="token" style={{ fontSize: 16 }}>{sig.token}</div>
          <div className="mini">{sig.direction.toUpperCase()} | Score {sig.score}</div>
        </div>
        <span className={`pill ${sig.direction === 'long' ? 'good' : 'bad'}`}>
          {sig.direction}
        </span>
      </div>

      <div className="signal-meta">
        <span className="mono">Price {Number(sig.currentPrice).toFixed(6)}</span>
        <span>{timeAgo(sig.timestamp)}</span>
      </div>

      <div className="tags">
        {sig.patternsFired?.length > 0
          ? sig.patternsFired.map(id => (
              <span key={id} className="tag">{PATTERN_NAMES[id] ?? id}</span>
            ))
          : <span className="mini">No pattern metadata</span>}
      </div>
    </div>
  )
}

function CandidateCard({ item }: { item: WatchCandidate }) {
  return (
    <div className="signal">
      <div className="signal-top">
        <div>
          <div className="token" style={{ fontSize: 16 }}>{item.token}</div>
          <div className="mini">
            {(item.direction ?? 'watch').toUpperCase()} | Score {item.score}
          </div>
        </div>
        <span className={`pill ${item.tradable ? 'good' : 'warn'}`}>
          {item.tradable ? 'tradeable' : 'watch'}
        </span>
      </div>

      <div className="signal-meta">
        <span className="mono">Price {Number(item.currentPrice).toFixed(6)}</span>
        <span>{timeAgo(item.timestamp)}</span>
      </div>

      <div className="tags">
        {item.patternsFired.map(id => (
          <span key={id} className="tag">{PATTERN_NAMES[id] ?? id}</span>
        ))}
      </div>

      {item.reason && <div className="mini" style={{ marginTop: 8 }}>{item.reason}</div>}
    </div>
  )
}
