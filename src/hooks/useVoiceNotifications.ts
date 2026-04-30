import { useRef, useEffect, useState } from 'react'
import type { DashboardData } from '../types'

function formatExitReason(reason: string): string {
  switch (reason) {
    case 'stop_loss':      return 'Stop loss'
    case 'time_stop':      return 'Time limit'
    case 'volatility_stop': return 'Volatility stop'
    case 'emergency':      return 'Emergency close'
    case 'TP1':            return 'Take profit 1'
    case 'TP2':            return 'Take profit 2'
    case 'TP3':            return 'Take profit 3'
    default:               return reason.replace(/_/g, ' ')
  }
}

function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.92
  utterance.pitch = 1.05
  utterance.volume = 1
  window.speechSynthesis.speak(utterance)
}

export function useVoiceNotifications(dashboard: DashboardData | null, enabled: boolean) {
  const prevTokens   = useRef<Set<string>>(new Set())
  const seenTradeIds = useRef<Set<string>>(new Set())
  const initialized  = useRef(false)
  const [lastEvent, setLastEvent] = useState<string | null>(null)

  useEffect(() => {
    if (!dashboard) return

    const currentTokens = new Set(dashboard.positions.map(p => p.token))

    if (!initialized.current) {
      prevTokens.current = currentTokens
      dashboard.trades.forEach(t => seenTradeIds.current.add(t.id))
      initialized.current = true
      return
    }

    // Always update baseline so unmuting never floods old events
    const newOpens: string[] = []
    const newCloses: string[] = []

    for (const token of currentTokens) {
      if (!prevTokens.current.has(token)) {
        const pos = dashboard.positions.find(p => p.token === token)
        if (pos) newOpens.push(`${pos.direction.toUpperCase()} ${token} opened (score ${pos.score})`)
      }
    }

    for (const trade of dashboard.trades) {
      if (seenTradeIds.current.has(trade.id)) continue
      seenTradeIds.current.add(trade.id)
      if (!trade.exitReason) continue

      const pnl = trade.pnlUsd
      const pnlText = pnl >= 0
        ? `+$${pnl.toFixed(2)}`
        : `-$${Math.abs(pnl).toFixed(2)}`
      newCloses.push(`${trade.token} closed — ${formatExitReason(trade.exitReason)} ${pnlText}`)
    }

    prevTokens.current = currentTokens

    if (newOpens.length > 0) setLastEvent(newOpens[newOpens.length - 1])
    if (newCloses.length > 0) setLastEvent(newCloses[newCloses.length - 1])

    if (!enabled) return

    for (const msg of newOpens) {
      const parts = msg.split(' opened')
      speak(`${parts[0]} opened.`)
    }
    for (const trade of newCloses) {
      speak(trade.replace('—', '.').replace(/\+|\-/, (m) => m === '+' ? 'profit ' : 'loss ').replace('$', '').replace(/(\d+\.\d+)/, '$1 dollars'))
    }
  }, [dashboard, enabled])

  return { lastEvent }
}
