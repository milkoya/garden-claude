export type Plot = { stage: number; kind: number; thirst: number }

export type JobKind = 'resting' | 'planting' | 'watering' | 'harvesting' | 'selling'

export type Job = { kind: JobKind; plot: number; flower: number; stage: number; count: number; earned: number }

export type Garden = {
  plots: Plot[]
  basket: number[]
  coins: number
  planted: number
  chores: number
  job: Job
}

export type UsageWindow = { percent: number; resetsAt: string | null }

export type Usage = {
  costUsd: number | null
  context: number | null
  five: UsageWindow | null
  week: UsageWindow | null
  model: string | null
}

export type Language = 'en' | 'zh-TW' | 'zh-CN' | 'ja' | 'ko'

export type Condition = 'sunny' | 'cloudy' | 'rainy' | 'snowy'

export type Prefs = { language: Language | 'auto' }

export type Detected = { language: Language; timeZone: string }

export type Weather = { condition: Condition; city: string }

declare module 'claude-code' {
  interface PluginState {
    'garden-claude': {
      garden: Garden
      hour: number
      minute: number
      usage: Usage
      prefs: Prefs
      detected: Detected
      weather: Weather | null
    }
  }
}
