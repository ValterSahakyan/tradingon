import type { AuthSession } from '../types'

interface AuthScreenProps {
  session: AuthSession | null
  busy: boolean
  error: string | null
  onConnect: () => void
}

export default function AuthScreen({ session, busy, error, onConnect }: AuthScreenProps) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-kicker">Wallet Access</div>
        <h1>TradingOn is locked to one wallet.</h1>
        <p>
          Connect the authorized wallet and sign the access challenge to open the bot dashboard.
        </p>

        <div className="auth-meta">
          <span className="auth-label">Allowed wallet</span>
          <code className="auth-wallet">{session?.allowedWallet ?? 'Not configured'}</code>
        </div>

        {error ? <div className="auth-error">{error}</div> : null}

        <button className="btn-primary auth-btn" onClick={onConnect} disabled={busy || !session?.authEnabled}>
          {busy ? 'Waiting for signature...' : 'Connect Wallet'}
        </button>

        {!session?.authEnabled ? (
          <p className="auth-footnote">
            Dashboard auth is not configured yet. Set `DASHBOARD_ALLOWED_WALLET` and
            `DASHBOARD_AUTH_SECRET` on the server.
          </p>
        ) : null}
      </section>
    </main>
  )
}
