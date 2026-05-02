import { useState, useEffect, useCallback, useRef } from 'react'
import type { DashboardData, RuntimeInfo, ConfigSection, AuthSession } from './types'
import {
  ApiError,
  fetchDashboard, fetchRuntime, fetchConfig, saveConfig, botAction, fetchBalance,
  fetchSession, verifyWallet, logoutSession,
} from './api'
import Flash, { type FlashState } from './components/Flash'
import HeroSection from './components/HeroSection'
import PositionsPanel from './components/PositionsPanel'
import SignalsPanel from './components/SignalsPanel'
import PnlChart from './components/PnlChart'
import TradesTable from './components/TradesTable'
import ConfigPanel from './components/ConfigPanel'
import { useVoiceNotifications } from './hooks/useVoiceNotifications'
import AuthScreen from './components/AuthScreen'

type BrowserEthereum = {
  isMetaMask?: boolean
  providers?: BrowserEthereum[]
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>
}

function getMetaMaskProvider(): BrowserEthereum | null {
  const win = window as Window & { ethereum?: BrowserEthereum }
  const eth = win.ethereum
  if (!eth) return null
  if (eth.providers?.length) {
    return eth.providers.find((provider) => provider.isMetaMask) ?? null
  }
  return eth.isMetaMask ? eth : null
}

function getBooleanConfigValue(sections: ConfigSection[], key: string): boolean | null {
  for (const section of sections) {
    const field = section.fields.find((entry) => entry.key === key)
    if (!field) continue
    if (field.rawValue === true || field.rawValue === 'true') return true
    if (field.rawValue === false || field.rawValue === 'false') return false
  }
  return null
}

export default function App() {
  const [authed, setAuthed] = useState(false)
  const [session, setSession] = useState<AuthSession | null>(null)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null)
  const [balance, setBalance] = useState<{ perpBalance: number | null; spotBalance: number | null; updatedAt: number | null; needsAccountAddress: boolean } | null>(null)
  const [config, setConfig] = useState<ConfigSection[]>([])
  const [flash, setFlash] = useState<FlashState | null>(null)
  const [busy, setBusy] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const botActionInFlightRef = useRef<Set<string>>(new Set())
  const configSaveInFlightRef = useRef(false)
  const voiceToggleInFlightRef = useRef(false)

  const { lastEvent } = useVoiceNotifications(dashboard, voiceEnabled)

  const showFlash = useCallback((message: string, kind: 'good' | 'bad' = 'good') => {
    setFlash({ message, kind, id: Date.now() })
  }, [])

  const applySession = useCallback((nextSession: AuthSession) => {
    setSession(nextSession)
    setConnectedAddress(nextSession.address)
    setAuthError(null)
    if (!nextSession.authEnabled || nextSession.authenticated) {
      setAuthed(true)
    } else {
      setAuthed(false)
    }
  }, [])

  const refreshSession = useCallback(async () => {
    const nextSession = await fetchSession()
    applySession(nextSession)
    return nextSession
  }, [applySession])

  useEffect(() => {
    refreshSession()
      .catch(() => {
        setSession(null)
        setAuthed(false)
        setAuthError('Backend unavailable. Start the backend and retry.')
      })
      .finally(() => {
        setSessionChecked(true)
      })
  }, [refreshSession])

  const loadDashboard = useCallback(async () => {
    void fetchBalance()
      .then((value) => {
        console.log('[balance] fetched:', value)
        setBalance(value)
      })
      .catch((err) => {
        console.error('[balance] fetch failed:', err)
        showFlash(`Balance load failed: ${(err as Error).message}`, 'bad')
      })

    const results = await Promise.allSettled([fetchDashboard(), fetchRuntime()])
    const [dashResult, runtimeResult] = results

    if (dashResult.status === 'fulfilled') {
      setDashboard(dashResult.value)
    }

    if (runtimeResult.status === 'fulfilled') {
      setRuntime(runtimeResult.value)
    }

    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )

    if (rejected.length === results.length) {
      throw rejected[0].reason
    }

    if (rejected.length > 0) {
      showFlash(`Some dashboard data failed to load: ${rejected[0].reason.message}`, 'bad')
    }
  }, [showFlash])

  const loadConfig = useCallback(async () => {
    const cfg = await fetchConfig()
    setConfig(cfg.sections)
    const persistedVoiceEnabled = getBooleanConfigValue(cfg.sections, 'voiceAlertsEnabled')
    if (persistedVoiceEnabled !== null) {
      setVoiceEnabled(persistedVoiceEnabled)
    }
  }, [])

  useEffect(() => {
    if (!authed) return

    loadDashboard().catch((err) => {
      if (err instanceof ApiError && err.status === 401) {
        setAuthed(false)
        setAuthError('Session expired. Connect again.')
        return
      }
      showFlash(`Initial dashboard load failed: ${(err as Error).message}`, 'bad')
    })

    loadConfig().catch((err) => {
      if (err instanceof ApiError && err.status === 401) {
        setAuthed(false)
        setAuthError('Session expired. Connect again.')
        return
      }
      showFlash(`Config load failed: ${(err as Error).message}`, 'bad')
    })

    const timer = setInterval(() => {
      loadDashboard().catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setAuthed(false)
          setAuthError('Session expired. Connect again.')
        } else {
          console.warn('Refresh failed', err)
        }
      })
    }, 5000)

    return () => clearInterval(timer)
  }, [authed, loadDashboard, loadConfig, showFlash])

  const connectWallet = useCallback(async () => {
    setAuthBusy(true)

    try {
      const latestSession = await refreshSession()

      if (!latestSession.authEnabled) {
        setAuthed(true)
        return
      }

      const ethereum = getMetaMaskProvider()
      if (!ethereum) {
        setAuthError('MetaMask not found. Make sure the MetaMask extension is installed and enabled.')
        return
      }

      setAuthError(null)

      const accounts = await ethereum.request({ method: 'eth_requestAccounts' }) as string[]
      const address = accounts?.[0]
      if (!address) throw new Error('No account returned from MetaMask')

      const maxAttempts = 20
      const retryMs = 1500
      let lastErr: Error = new Error('Backend unavailable')

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
          const nextSession = await verifyWallet(address)
          applySession(nextSession)
          return
        } catch (err) {
          lastErr = err as Error
          if (err instanceof ApiError && err.status === 403) throw err
          setAuthError(`Backend connecting... (${attempt + 1}/${maxAttempts})`)
          await new Promise((resolveDelay) => setTimeout(resolveDelay, retryMs))
        }
      }

      throw lastErr
    } catch (err) {
      const message = (err as Error).message
      setAuthError(
        err instanceof ApiError && err.status === 403
          ? 'This wallet is not authorised to access the dashboard.'
          : `Connection failed: ${message}`,
      )
    } finally {
      setAuthBusy(false)
    }
  }, [applySession, refreshSession])

  const handleLogout = useCallback(async () => {
    try {
      await logoutSession()
    } catch {
      // Ignore logout failures during local cleanup.
    }
    setAuthed(false)
    setSession((prev) => (prev ? { ...prev, authenticated: false, address: null } : prev))
    setConnectedAddress(null)
    setDashboard(null)
    setRuntime(null)
    setBalance(null)
    setConfig([])
  }, [])

  const handleBotAction = useCallback(async (url: string, message: string, body: unknown) => {
    if (botActionInFlightRef.current.has(url)) {
      return
    }
    botActionInFlightRef.current.add(url)
    setBusy(true)
    try {
      await botAction(url, body)
      showFlash(message)
      await loadDashboard()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthed(false)
        setAuthError('Session expired. Connect again.')
        return
      }
      showFlash(`Action failed: ${(err as Error).message}`, 'bad')
    } finally {
      botActionInFlightRef.current.delete(url)
      setBusy(false)
    }
  }, [loadDashboard, showFlash])

  const handleSaveConfig = useCallback(async (values: Record<string, unknown>) => {
    if (configSaveInFlightRef.current) {
      return
    }
    configSaveInFlightRef.current = true
    try {
      await saveConfig(values)
      showFlash('Config saved. Restart the bot process to apply most changes.')
      await loadConfig()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAuthed(false)
        setAuthError('Session expired. Connect again.')
        return
      }
      showFlash(`Failed to save config: ${(err as Error).message}`, 'bad')
    } finally {
      configSaveInFlightRef.current = false
    }
  }, [loadConfig, showFlash])

  const handleVoiceToggle = useCallback(async () => {
    if (voiceToggleInFlightRef.current) {
      return
    }

    const nextValue = !voiceEnabled
    voiceToggleInFlightRef.current = true
    setVoiceEnabled(nextValue)

    try {
      await saveConfig({ voiceAlertsEnabled: nextValue })
      await loadConfig()
    } catch (err) {
      setVoiceEnabled(!nextValue)
      if (err instanceof ApiError && err.status === 401) {
        setAuthed(false)
        setAuthError('Session expired. Connect again.')
        return
      }
      showFlash(`Failed to save voice alerts: ${(err as Error).message}`, 'bad')
    } finally {
      voiceToggleInFlightRef.current = false
    }
  }, [loadConfig, showFlash, voiceEnabled])

  if (!sessionChecked) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="auth-kicker">Backend Session</div>
          <h1>Loading dashboard</h1>
          <p>Checking backend availability and restoring the current session.</p>
        </section>
      </main>
    )
  }

  if (!authed) {
    return (
      <AuthScreen
        session={session}
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
        onVoiceToggle={handleVoiceToggle}
        onScan={() => handleBotAction('/api/bot/scan', 'Manual scan requested.', {})}
        onPause={() =>
          handleBotAction('/api/bot/pause', 'Bot paused for 2 hours.', {
            reason: 'manual_dashboard_pause',
            durationMs: 2 * 60 * 60 * 1000,
          })
        }
        onResume={() => handleBotAction('/api/bot/resume', 'Bot resumed.', {})}
      />

      {session?.authEnabled !== false && (
        <section className="panel panel--auth-bar">
          <div className="auth-bar">
            <div>
              <div className="mini">Connected wallet</div>
              <div className="panel-title mono">{connectedAddress ?? '-'}</div>
            </div>
            <button className="btn-secondary" onClick={handleLogout}>Disconnect</button>
          </div>
        </section>
      )}

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
            latestSignalsFound={dashboard?.status.scanDiagnostics?.signalsFound ?? 0}
            latestCandidatesFound={dashboard?.status.scanDiagnostics?.candidatesFound ?? 0}
            lastScanAt={runtime?.lastScanAt}
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
