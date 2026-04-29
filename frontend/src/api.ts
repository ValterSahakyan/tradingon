import type { DashboardData, RuntimeInfo, ConfigSection } from './types'

async function getJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
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
