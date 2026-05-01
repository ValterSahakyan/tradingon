import type { AuthSession } from '../types'

interface AuthScreenProps {
  session: AuthSession | null
  busy: boolean
  error: string | null
  onConnect: () => void
}

export default function AuthScreen({ session, busy, error, onConnect }: AuthScreenProps) {
  const authKnown = session !== null
  const allowedWallet = session?.allowedWallet
  const authEnabled = session?.authEnabled !== false

  let kicker = 'Backend Access'
  let description = 'Checking backend authentication mode.'
  let metaLabel = 'Backend status'
  let metaValue = 'Unavailable'
  let buttonLabel = 'Retry Backend'

  if (authKnown && authEnabled) {
    kicker = 'Wallet Access'
    description = 'Connect your MetaMask wallet to access the dashboard.'
    metaLabel = allowedWallet ? 'Authorized wallet' : 'Auth mode'
    metaValue = allowedWallet ?? 'Wallet auth enabled'
    buttonLabel = 'Connect MetaMask'
  } else if (authKnown && !authEnabled) {
    kicker = 'Open Access'
    description = 'Wallet auth is disabled on the backend, so the dashboard can be entered directly.'
    metaLabel = 'Auth mode'
    metaValue = 'Open (no wallet restriction)'
    buttonLabel = 'Enter Dashboard'
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-kicker">{kicker}</div>
        <h1>TradingOn Dashboard</h1>
        <p>{description}</p>

        <div className="auth-meta">
          <span className="auth-label">{metaLabel}</span>
          <code className="auth-wallet">{metaValue}</code>
        </div>

        {error ? <div className="auth-error">{error}</div> : null}

        <button className="btn-primary auth-btn" onClick={onConnect} disabled={busy}>
          {busy ? 'Connecting...' : buttonLabel}
        </button>
      </section>
    </main>
  )
}
