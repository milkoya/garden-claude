export type Plot = { stage: number; kind: number; thirst: number }

export type JobKind = 'resting' | 'planting' | 'watering' | 'harvesting' | 'storing' | 'selling'

export type Job = {
  kind: JobKind
  plot: number
  flower: number
  stage: number
  count: number
  earned: number
  sold: number[]
  from?: number
}

export type Garden = {
  plots: Plot[]
  basket: number[]
  planted: number
  chores: number
}

export type Away = { since: number }

export type Member = {
  id: string
  seat: number
  accessory: number
  job: Job
  jobAt: number
  seen: number
  away?: Away
}

export type Room = { code: string; host: string; garden: Garden; members: Member[] }

export type Membership = { code: string }

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

export type Prefs = { language: Language | 'auto'; isMembersHidden?: boolean }

export type Detected = { language: Language; timeZone: string }

export type Today = { day: string; coins: number }

export type Weather = { condition: Condition; city: string; isNight: boolean }

declare module 'claude-code' {
  interface PluginState {
    'garden-claude': {
      garden: Garden
      job: Job
      coins: number
      today: Today
      room: Room | null
      membership: Membership | null
      hour: number
      minute: number
      usage: Usage
      prefs: Prefs
      detected: Detected
      weather: Weather | null
      started: boolean
      choring: boolean
    }
  }
}
