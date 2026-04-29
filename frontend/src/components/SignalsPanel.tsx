import type { Signal } from '../types'
import { timeAgo, PATTERN_NAMES } from '../utils'

interface Props {
  signals: Signal[]
}

export default function SignalsPanel({ signals }: Props) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Signals</div>
        <div className="mini">{signals.length} recent</div>
      </div>

      <div className="signals">
        {signals.length === 0 ? (
          <div className="empty">No signals recorded yet.</div>
        ) : (
          signals.map((sig, i) => <SignalCard key={`${sig.token}-${i}`} sig={sig} />)
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
