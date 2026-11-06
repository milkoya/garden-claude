import type { Account, Plan, Usage, UsageWindow } from '../types'
import { toBase64 } from './garden'

export const BAR_CELLS = 10
const BLOCK = 0x2586
const DEFAULT = 0x01000000
const EMPTY = 0x3d3d45
const GREEN = 0x5a9e3e
const GOLD = 0xf2c84b
const RED = 0xd94f4f

export const emptyUsage = (): Usage => ({
  costUsd: null,
  context: null,
  five: null,
  week: null,
  fable: null,
  hasFiveHour: null,
  model: null,
  effort: null,
})

export const PLANS: readonly { code: Plan; name: string }[] = [
  { code: 'max', name: 'Max' },
  { code: 'ultra', name: 'Ultra' },
]

export const planName = (code: Plan): string => PLANS.find(plan => plan.code === code)?.name ?? code

export const parsePlan = (input: string): Plan | 'auto' | null => {
  const wanted = input.trim().toLowerCase()
  if (wanted === 'auto') return 'auto'
  return PLANS.find(plan => plan.code === wanted)?.code ?? null
}

export const planFor = (chosen: Plan | 'auto' | undefined, usage: Usage): Plan =>
  chosen === 'max' || chosen === 'ultra' ? chosen : usage.hasFiveHour === false ? 'ultra' : 'max'

export const barColor = (percent: number): number => (percent >= 90 ? RED : percent >= 70 ? GOLD : GREEN)

export const barCells = (percent: number, cells = BAR_CELLS): string => {
  const filled = Math.min(cells, Math.round((percent / 100) * cells))
  const words = new Uint32Array(cells * 3)
  for (let i = 0; i < cells; i += 1) {
    words.set([BLOCK, i < filled ? barColor(percent) : EMPTY, DEFAULT], i * 3)
  }
  return toBase64(new Uint8Array(words.buffer))
}

export const prettyModel = (id: string): string => {
  const parts = id
    .replace(/\[.*\]$/, '')
    .replace(/^claude-/, '')
    .split('-')
    .filter(part => !/^\d{8}$/.test(part))
  const [family = id, ...version] = parts
  const name = family.charAt(0).toUpperCase() + family.slice(1)
  return version.length > 0 ? `${name} ${version.join('.')}` : name
}

export const formatCost = (usd: number): string => `$${usd.toFixed(2)}`

export const formatReset = (resetsAt: string | null, now: number): string => {
  if (!resetsAt) return ''
  const minutes = Math.max(0, Math.round((Date.parse(resetsAt) - now) / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return minutes % 60 === 0 ? `${hours}h` : `${hours}h${minutes % 60}m`
  return hours % 24 === 0 ? `${hours / 24}d` : `${Math.floor(hours / 24)}d${hours % 24}h`
}

export const windowOf = (
  limits: readonly { kind: string; percentUsed: number; resetsAt?: string }[],
  kind: string,
): UsageWindow | null => {
  const found = limits.find(limit => limit.kind === kind)
  return found ? { percent: Math.round(found.percentUsed), resetsAt: found.resetsAt ?? null } : null
}

type ScopedLimit = {
  kind?: unknown
  percent?: unknown
  resets_at?: unknown
  scope?: { model?: { display_name?: unknown } | null } | null
}

const isFableLimit = (limit: unknown): limit is ScopedLimit => {
  if (typeof limit !== 'object' || limit === null) return false
  const scoped = limit as ScopedLimit
  const name = scoped.scope?.model?.display_name
  return scoped.kind === 'weekly_scoped' && typeof name === 'string' && /^fable\b/i.test(name)
}

const resetOf = (value: unknown): string | null => {
  if (typeof value === 'string') return value
  return typeof value === 'number' ? new Date(value * 1000).toISOString() : null
}

const bodyOf = (text: string): Record<string, unknown> | null => {
  try {
    const body: unknown = JSON.parse(text)
    return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export const accountOf = (text: string): Account | null => {
  const body = bodyOf(text)
  if (body === null) return null
  const limits = Array.isArray(body.limits) ? body.limits : []
  const fable = limits.find(isFableLimit)
  return {
    fable: fable && typeof fable.percent === 'number' ? { percent: Math.round(fable.percent), resetsAt: resetOf(fable.resets_at) } : null,
    hasFiveHour: 'five_hour' in body ? body.five_hour !== null : null,
  }
}
