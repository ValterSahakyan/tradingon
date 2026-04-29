export const PATTERN_NAMES: Record<string, string> = {
  volume_spike: 'Volume Spike',
  bull_bear_flag: 'Bull/Bear Flag',
  fibonacci: 'Fibonacci',
  accumulation_breakout: 'Accumulation Breakout',
}

export function formatUsd(value: number | string | undefined): string {
  const num = Number(value ?? 0)
  const sign = num > 0 ? '+' : ''
  return `${sign}$${num.toFixed(2)}`
}

export function formatPct(value: number | string | undefined): string {
  const num = Number(value ?? 0)
  const sign = num > 0 ? '+' : ''
  return `${sign}${num.toFixed(2)}%`
}

export function formatTime(ts: number | undefined): string {
  if (!ts) return '-'
  return new Date(ts).toLocaleString()
}

export function timeAgo(ts: number | undefined): string {
  if (!ts) return '-'
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  return `${Math.floor(sec / 3600)}h ago`
}

export function statePillClass(state: string): string {
  if (state.startsWith('active')) return 'good'
  if (state.startsWith('paused')) return 'warn'
  if (state.startsWith('stopped')) return 'bad'
  return 'neutral'
}
