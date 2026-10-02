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
  `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current=weather_code`

export const parseCondition = (body: string): Condition | null => {
  try {
    const code = (JSON.parse(body) as { current?: { weather_code?: unknown } }).current?.weather_code
    return typeof code === 'number' ? conditionFromCode(code) : null
  } catch {
    return null
  }
}
