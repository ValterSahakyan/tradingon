export interface BotStatus {
  state: string
  pauseReason?: string
  pauseUntil?: number
  connectivity?: {
    connected: boolean
    lastConnectedAt?: number | null
    lastDisconnectedAt?: number | null
    lastMessageAt?: number | null
    lastMidsAt?: number | null
    lastUserFillsAt?: number | null
    lastUserEventsAt?: number | null
  }
  protection?: {
    protectedPositions: number
    unprotectedPositions: number
  }
  actionRateLimit?: {
    rateLimited: boolean
    cooldownMs: number
  }
  marketCondition: string
  marketMoves: { sol1h: number; btc4h: number }
  openPositions: number
  maxPositions: number
  trackedTokens: number
  accountValue?: number | null
  accountValueAt?: number | null
  scanDiagnostics?: {
    tokensSeen: number
    tokensEvaluated: number
    tokensWithCandles: number
    insufficientCandles: number
    signalsFound: number
    candidatesFound: number
    rejectReasons: Record<string, number>
  }
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
  tp2Price: number
  margin: number
  notional: number
  leverage: number
  holdMins: number
  timeLeftMins: number
  tp1Hit: boolean
  tp2Hit: boolean
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

export interface WatchCandidate {
  token: string
  direction: 'long' | 'short' | null
  score: number
  currentPrice: number
  timestamp: number
  patternsFired: string[]
  tradable: boolean
  reason: string | null
}

export interface Trade {
  id: string
  token: string
  direction: string
  entryPrice: number
  exitPrice?: number | null
  pnlUsd: number | null
  pnlPercent?: number | null
  exitReason?: string | null
  score: number
  durationMinutes?: number | null
  patternsFired?: string[]
  tp1Hit?: boolean
  tp2Hit?: boolean
  entryTime?: number
  exitTime?: number | null
}

export interface PnlPoint {
  time: number
  cumPnl: number
}

export interface DashboardData {
  meta?: {
    version: string
  }
  status: BotStatus
  positions: Position[]
  signals: Signal[]
  watchlist: WatchCandidate[]
  trades: Trade[]
  pnlChart: PnlPoint[]
  stats: DailyStats
}

export interface RuntimeInfo {
  mode: string
  isRunning: boolean
  initialized: boolean
  liveTradingEnabled: boolean
  mainnetSessionArmed: boolean
  scanIntervalSeconds: number
  connectivity?: {
    connected: boolean
    lastConnectedAt?: number | null
    lastDisconnectedAt?: number | null
    lastMessageAt?: number | null
    lastMidsAt?: number | null
    lastUserFillsAt?: number | null
    lastUserEventsAt?: number | null
  }
  protection?: {
    protectedPositions: number
    unprotectedPositions: number
  }
  actionRateLimit?: {
    rateLimited: boolean
    cooldownMs: number
  }
  lastScanAt?: number
  lastScanResult?: { ok: boolean; message: string }
  signalDiagnostics?: {
    tokensSeen: number
    tokensEvaluated: number
    tokensWithCandles: number
    insufficientCandles: number
    signalsFound: number
    candidatesFound: number
    rejectReasons: Record<string, number>
  }
}

export interface AuthSession {
  authEnabled: boolean
  authenticated: boolean
  address: string | null
  allowedWallet: string | null
}

export interface ConfigField {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'json'
  value: unknown
  rawValue: unknown
  editable: boolean
  help?: string
}

export interface ConfigSection {
  section: string
  fields: ConfigField[]
}

export type DashboardPage = 'portfolio' | 'positions' | 'trades' | 'signals' | 'config'
