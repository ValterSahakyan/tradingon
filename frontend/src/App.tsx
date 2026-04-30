import { useState, useEffect, useCallback } from 'react'
import type { DashboardData, RuntimeInfo, ConfigSection } from './types'
import { fetchDashboard, fetchRuntime, fetchConfig, saveConfig, botAction, fetchBalance } from './api'
import Flash, { type FlashState } from './components/Flash'
import HeroSection from './components/HeroSection'
import PositionsPanel from './components/PositionsPanel'
import SignalsPanel from './components/SignalsPanel'
import PnlChart from './components/PnlChart'
import TradesTable from './components/TradesTable'
import ConfigPanel from './components/ConfigPanel'
import { useVoiceNotifications } from './hooks/useVoiceNotifications'

const INITIAL_LOAD_RETRIES = 10
const INITIAL_LOAD_DELAY_MS = 1500

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null)
  const [balance, setBalance] = useState<{ perpBalance: number | null; spotBalance: number | null; updatedAt: number | null } | null>(null)
  const [config, setConfig] = useState<ConfigSection[]>([])
  const [flash, setFlash] = useState<FlashState | null>(null)
  const [busy, setBusy] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(false)

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
    waitForBackend().catch(err => {
      showFlash(`Initial load failed: ${(err as Error).message}`, 'bad')
    })
    const timer = setInterval(() => {
      loadDashboard().catch(err => console.warn('Refresh failed', err))
    }, 5000)
    return () => clearInterval(timer)
  }, [loadDashboard, showFlash, waitForBackend])

  const handleBotAction = useCallback(async (url: string, message: string, body: unknown) => {
    if (busy) return
    setBusy(true)
    try {
      await botAction(url, body)
      showFlash(message)
      await loadDashboard()
    } catch (err) {
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
      showFlash(`Failed to save config: ${(err as Error).message}`, 'bad')
    }
  }, [loadConfig, showFlash])

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
