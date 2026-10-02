import type { Condition } from '../types'
import type { City } from './places'

export const WEATHER_REFRESH_MS = 30 * 60_000

const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86])
const CLOUD_CODES = new Set([2, 3, 45, 48])

export const conditionFromCode = (code: number): Condition => {
  if (code <= 1) return 'sunny'
  if (CLOUD_CODES.has(code)) return 'cloudy'
  if (SNOW_CODES.has(code)) return 'snowy'
  return 'rainy'
}

export const weatherUrl = (city: Pick<City, 'latitude' | 'longitude'>): string =>
  `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current=weather_code,is_day`

type Current = { weather_code?: unknown; is_day?: unknown }

const currentOf = (body: string): Current | null => {
  try {
    return (JSON.parse(body) as { current?: Current }).current ?? null
  } catch {
    return null
  }
}

export const parseCondition = (body: string): Condition | null => {
  const code = currentOf(body)?.weather_code
  return typeof code === 'number' ? conditionFromCode(code) : null
}

export const parseIsNight = (body: string): boolean => currentOf(body)?.is_day === 0
