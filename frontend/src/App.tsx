import { useState, useEffect, useCallback } from 'react'
import type { DashboardData, RuntimeInfo, ConfigSection } from './types'
import { fetchDashboard, fetchRuntime, fetchConfig, saveConfig, botAction } from './api'
import Flash, { type FlashState } from './components/Flash'
import HeroSection from './components/HeroSection'
import PositionsPanel from './components/PositionsPanel'
import SignalsPanel from './components/SignalsPanel'
import PnlChart from './components/PnlChart'
import TradesTable from './components/TradesTable'
import ConfigPanel from './components/ConfigPanel'

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null)
  const [config, setConfig] = useState<ConfigSection[]>([])
  const [flash, setFlash] = useState<FlashState | null>(null)
  const [busy, setBusy] = useState(false)

  const showFlash = useCallback((message: string, kind: 'good' | 'bad' = 'good') => {
    setFlash({ message, kind, id: Date.now() })
  }, [])

  const loadDashboard = useCallback(async () => {
    const [dash, rt] = await Promise.all([fetchDashboard(), fetchRuntime()])
    setDashboard(dash)
    setRuntime(rt)
  }, [])

  const loadConfig = useCallback(async () => {
    const cfg = await fetchConfig()
    setConfig(cfg.sections)
  }, [])

  useEffect(() => {
    Promise.all([loadDashboard(), loadConfig()]).catch(err => {
      showFlash(`Initial load failed: ${(err as Error).message}`, 'bad')
    })
    const timer = setInterval(() => {
      loadDashboard().catch(err => console.warn('Refresh failed', err))
    }, 5000)
    return () => clearInterval(timer)
  }, [loadDashboard, loadConfig, showFlash])

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
      showFlash('Config saved to .env. Restart the bot process to apply most changes.')
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
        busy={busy}
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
          <SignalsPanel signals={dashboard?.signals ?? []} />
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
