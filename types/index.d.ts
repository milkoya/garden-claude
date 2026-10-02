export type Plot = { stage: number; kind: number }

export type JobKind = 'resting' | 'planting' | 'watering' | 'harvesting' | 'selling'

export type Job = { kind: JobKind; plot: number; label: string }

export type Garden = {
  plots: Plot[]
  basket: number[]
  coins: number
  planted: number
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

declare module 'claude-code' {
  interface PluginState {
    'garden-claude': { garden: Garden; hour: number; minute: number; usage: Usage }
  }
}
