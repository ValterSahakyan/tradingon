export interface BotStatus {
  state: string
  pauseReason?: string
  pauseUntil?: number
  marketCondition: string
  marketMoves: { sol1h: number; btc4h: number }
  openPositions: number
  maxPositions: number
  trackedTokens: number
}

export interface DailyStats {
  todayPnl: number
  weekPnl: number
  winRatePct: number
}

export interface Position {
  token: string
  direction: 'long' | 'short'
  score: number
  marketCondition: string
  pnlUsd: number
  pnlPct: number
  entryPrice: number
  currentPrice: number
  stopPrice: number
  tp1Price: number
  margin: number
  notional: number
  timeLeftMins: number
  patternsFired: string[]
}

export interface Signal {
  token: string
  direction: 'long' | 'short'
  score: number
  currentPrice: number
  timestamp: number
  patternsFired: string[]
}

export interface Trade {
  token: string
  direction: string
  entryPrice: number
  exitPrice?: number
  pnlUsd: number
  exitReason?: string
  score: number
  durationMinutes?: number
}

export interface PnlPoint {
  date: string
  cumPnl: number
}

export interface DashboardData {
  status: BotStatus
  positions: Position[]
  signals: Signal[]
  trades: Trade[]
  pnlChart: PnlPoint[]
  stats: DailyStats
}

export interface RuntimeInfo {
  mode: string
  isRunning: boolean
  scanIntervalSeconds: number
  lastScanAt?: number
  lastScanResult?: { ok: boolean; message: string }
}

export interface ConfigField {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean'
  value: unknown
  rawValue: unknown
  editable: boolean
  help?: string
}

export interface ConfigSection {
  section: string
  fields: ConfigField[]
}
