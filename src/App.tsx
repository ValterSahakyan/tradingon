import { useState, useEffect, useCallback } from 'react'
import type { DashboardData, RuntimeInfo, ConfigSection, AuthSession } from './types'
import { ApiError, fetchDashboard, fetchRuntime, fetchConfig, saveConfig, botAction, fetchBalance, fetchSession, createChallenge, verifyWallet, logoutSession } from './api'
import Flash, { type FlashState } from './components/Flash'
import HeroSection from './components/HeroSection'
import PositionsPanel from './components/PositionsPanel'
import SignalsPanel from './components/SignalsPanel'
import PnlChart from './components/PnlChart'
import TradesTable from './components/TradesTable'
import ConfigPanel from './components/ConfigPanel'
import { useVoiceNotifications } from './hooks/useVoiceNotifications'
import AuthScreen from './components/AuthScreen'

const INITIAL_LOAD_RETRIES = 30
const INITIAL_LOAD_DELAY_MS = 1500

type AuthState = 'checking' | 'anonymous' | 'authenticated'

type BrowserEthereum = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>
}

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null)
  const [balance, setBalance] = useState<{ perpBalance: number | null; spotBalance: number | null; updatedAt: number | null } | null>(null)
  const [config, setConfig] = useState<ConfigSection[]>([])
  const [flash, setFlash] = useState<FlashState | null>(null)
  const [busy, setBusy] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [authSession, setAuthSession] = useState<AuthSession | null>(null)
  const [authState, setAuthState] = useState<AuthState>('checking')
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const { lastEvent } = useVoiceNotifications(dashboard, voiceEnabled)

  const showFlash = useCallback((message: string, kind: 'good' | 'bad' = 'good') => {
    setFlash({ message, kind, id: Date.now() })
  }, [])

  const loadDashboard = useCallback(async () => {
    const [dash, rt, bal] = await Promise.all([fetchDashboard(), fetchRuntime(), fetchBalance()])
    setDashboard(dash)
    setRuntime(rt)
    setBalance(bal)
  }, [])

  const loadConfig = useCallback(async () => {
    const cfg = await fetchConfig()
    setConfig(cfg.sections)
  }, [])

  const waitForSession = useCallback(async () => {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < INITIAL_LOAD_RETRIES; attempt += 1) {
      try {
        return await fetchSession()
      } catch (err) {
        lastError = err as Error
        await new Promise(resolve => setTimeout(resolve, INITIAL_LOAD_DELAY_MS))
      }
    }

    throw lastError ?? new Error('Backend unavailable')
  }, [])

  const waitForBackend = useCallback(async () => {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < INITIAL_LOAD_RETRIES; attempt += 1) {
      try {
        await Promise.all([loadDashboard(), loadConfig()])
        return
      } catch (err) {
        lastError = err as Error
        await new Promise(resolve => setTimeout(resolve, INITIAL_LOAD_DELAY_MS))
      }
    }

    throw lastError ?? new Error('Backend unavailable')
  }, [loadConfig, loadDashboard])

  useEffect(() => {
    waitForSession()
      .then(session => {
        setAuthSession(session)
        setAuthState(session.authEnabled && !session.authenticated ? 'anonymous' : 'authenticated')
      })
      .catch(err => {
        setAuthError((err as Error).message)
        setAuthState('anonymous')
      })
  }, [waitForSession])

  useEffect(() => {
    if (authState !== 'authenticated') {
      return
    }

    waitForBackend().catch(err => {
      if (err instanceof ApiError && err.status === 401) {
        setAuthState('anonymous')
        return
      }
      showFlash(`Initial load failed: ${(err as Error).message}`, 'bad')
    })

    const timer = setInterval(() => {
      loadDashboard().catch(err => {
        if (err instanceof ApiError && err.status === 401) {
          setAuthState('anonymous')
          setAuthError('Session expired. Sign in again.')
          return
        }
        console.warn('Refresh failed', err)
      })
    }, 5000)

    return () => clearInterval(timer)
  }, [authState, loadDashboard, showFlash, waitForBackend])

  const connectWallet = useCallback(async () => {
    const ethereum = (window as Window & { ethereum?: BrowserEthereum }).ethereum
    if (!ethereum) {
      setAuthError('No injected wallet found. Open the page in a browser with MetaMask or Rabby.')
      return
    }

    setAuthBusy(true)
    setAuthError(null)

    try {
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' }) as string[]
      const selectedAddress = accounts?.[0]
      if (!selectedAddress) {
        throw new Error('Wallet did not return an account')
      }

      const chainIdHex = await ethereum.request({ method: 'eth_chainId' }) as string
      const chainId = Number.parseInt(chainIdHex, 16) || null
      const challenge = await createChallenge({
        address: selectedAddress,
        chainId,
        domain: window.location.host,
        origin: window.location.origin,
      })

      if (!challenge.authEnabled || !challenge.message || !challenge.nonce) {
        throw new Error('Dashboard auth is not configured on the server')
      }

      const signature = await ethereum.request({
        method: 'personal_sign',
        params: [challenge.message, selectedAddress],
      }) as string

      const session = await verifyWallet({
        address: selectedAddress,
        nonce: challenge.nonce,
        signature,
      })

      setAuthSession(session)
      setAuthState('authenticated')
      setAuthError(null)
      showFlash(`Signed in as ${selectedAddress.slice(0, 6)}...${selectedAddress.slice(-4)}`)
    } catch (err) {
      setAuthError((err as Error).message)
      setAuthState('anonymous')
    } finally {
      setAuthBusy(false)
    }
  }, [showFlash])

  const handleLogout = useCallback(async () => {
    try {
      await logoutSession()
    } finally {
      setAuthState('anonymous')
      setAuthSession(session => session ? { ...session, authenticated: false, address: null } : session)
      setDashboard(null)
      setRuntime(null)
      setBalance(null)
      setConfig([])
    }
  }, [])

  const handleBotAction = useCallback(async (url: string, message: string, body: unknown) => {
    if (busy) return
    setBusy(true)
    try {
      await botAction(url, body)
      showFlash(message)
      await loadDashboard()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthState('anonymous')
        setAuthError('Session expired. Sign in again.')
        return
      }
      showFlash(`Action failed: ${(err as Error).message}`, 'bad')
    } finally {
      setBusy(false)
    }
  }, [busy, loadDashboard, showFlash])

  const handleSaveConfig = useCallback(async (values: Record<string, unknown>) => {
    try {
      await saveConfig(values)
      showFlash('Config saved to database. Restart the bot process to apply most changes.')
      await loadConfig()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthState('anonymous')
        setAuthError('Session expired. Sign in again.')
        return
      }
      showFlash(`Failed to save config: ${(err as Error).message}`, 'bad')
    }
  }, [loadConfig, showFlash])

  if (authState === 'checking') {
    return <main className="auth-shell"><section className="auth-card"><h1>Checking session...</h1></section></main>
  }

  if (authState !== 'authenticated') {
    return (
      <AuthScreen
        session={authSession}
        busy={authBusy}
        error={authError}
        onConnect={connectWallet}
      />
    )
  }

  return (
    <div className="shell">
      <Flash flash={flash} />

      <HeroSection
        dashboard={dashboard}
        runtime={runtime}
        balance={balance}
        busy={busy}
        voiceEnabled={voiceEnabled}
        lastEvent={lastEvent}
        onVoiceToggle={() => setVoiceEnabled(v => !v)}
        onScan={() => handleBotAction('/api/bot/scan', 'Manual scan requested.', {})}
        onPause={() =>
          handleBotAction('/api/bot/pause', 'Bot paused for 2 hours.', {
            reason: 'manual_dashboard_pause',
            durationMs: 2 * 60 * 60 * 1000,
          })
        }
        onResume={() => handleBotAction('/api/bot/resume', 'Bot resumed.', {})}
      />

      <section className="panel panel--auth-bar">
        <div className="auth-bar">
          <div>
            <div className="mini">Signed in wallet</div>
            <div className="panel-title mono">{authSession?.address ?? authSession?.allowedWallet ?? 'unknown'}</div>
          </div>
          <button className="btn-secondary" onClick={handleLogout}>Disconnect</button>
        </div>
      </section>

      <section className="layout">
        <div className="stack">
          <PositionsPanel positions={dashboard?.positions ?? []} />
          <PnlChart data={dashboard?.pnlChart ?? []} />
          <TradesTable trades={dashboard?.trades ?? []} />
        </div>
        <div className="stack">
          <SignalsPanel
            signals={dashboard?.signals ?? []}
            watchlist={dashboard?.watchlist ?? []}
          />
          <ConfigPanel
            sections={config}
            onSave={handleSaveConfig}
            onReload={loadConfig}
          />
        </div>
      </section>
    </div>
  )
}
