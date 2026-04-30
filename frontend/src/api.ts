import type { DashboardData, RuntimeInfo, ConfigSection, AuthSession } from './types'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function getJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    let parsed: any
    try {
      parsed = JSON.parse(text)
    } catch {}
    const msg = parsed?.message || parsed?.error || text || `HTTP ${res.status}`
    throw new ApiError(res.status, typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return res.json() as Promise<T>
}

export const fetchSession = () => getJson<AuthSession>('/api/auth/session')

export const createChallenge = (payload: { address: string; chainId: number | null; domain: string; origin: string }) =>
  getJson<{ authEnabled: boolean; message: string | null; nonce: string | null; expiresAt: number | null; allowedWallet: string | null }>(
    '/api/auth/challenge',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )

export const verifyWallet = (payload: { address: string; nonce: string; signature: string }) =>
  getJson<AuthSession>('/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export const logoutSession = () =>
  getJson<{ ok: boolean }>('/api/auth/logout', {
    method: 'POST',
  })

export const fetchDashboard = () => getJson<DashboardData>('/api/dashboard/all')

export const fetchBalance = () => getJson<{ perpBalance: number | null; spotBalance: number | null; updatedAt: number | null }>('/api/dashboard/balance')

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
