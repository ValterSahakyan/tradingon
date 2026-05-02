import type { DashboardData, RuntimeInfo, ConfigSection, AuthSession } from './types'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

function withApiBase(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function getJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(withApiBase(url), {
    credentials: 'include',
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    const parsed = parseErrorPayload(text)
    const msg = parsed?.message || parsed?.error || text || `HTTP ${res.status}`
    throw new ApiError(res.status, typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return res.json() as Promise<T>
}

function parseErrorPayload(text: string): { message?: unknown; error?: unknown } | null {
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed && typeof parsed === 'object') {
      return parsed as { message?: unknown; error?: unknown }
    }
    return null
  } catch {
    return null
  }
}

export const fetchSession = () => getJson<AuthSession>('/api/auth/session')

export const verifyWallet = (address: string) =>
  getJson<AuthSession>('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  })

export const logoutSession = () =>
  getJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })

export const fetchDashboard = () => getJson<DashboardData>('/api/dashboard/all')

export const fetchBalance = () =>
  getJson<{ perpBalance: number | null; spotBalance: number | null; updatedAt: number | null; needsAccountAddress: boolean }>(
    '/api/dashboard/balance',
  )

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
