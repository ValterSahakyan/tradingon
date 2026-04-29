import type { DashboardData, RuntimeInfo, ConfigSection } from './types'

async function getJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const text = await res.text()
    let parsed: any
    try {
      parsed = JSON.parse(text)
    } catch {}
    const msg = parsed?.message || parsed?.error || text || `HTTP ${res.status}`
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return res.json() as Promise<T>
}

export const fetchDashboard = () => getJson<DashboardData>('/api/dashboard/all')

export const fetchRuntime = () => getJson<RuntimeInfo>('/api/bot/runtime')

export const fetchConfig = () => getJson<{ sections: ConfigSection[] }>('/api/dashboard/config')

export const saveConfig = (values: Record<string, unknown>) =>
  getJson('/api/dashboard/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  })

export const botAction = (url: string, body: unknown) =>
  getJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
