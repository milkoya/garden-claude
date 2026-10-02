import type { Language } from '../types'
import { ZONES, ZONE_ALIASES } from './zones'

export type City = {
  zone: string
  latitude: number
  longitude: number
  names: Record<Language, string>
}

const canonicalZone = (zone: string): string => ZONE_ALIASES[zone] ?? zone

export const cityForZone = (zone: string): City | null => {
  const canonical = canonicalZone(zone)
  const found = ZONES[canonical]
  if (!found) return null
  const [latitude, longitude, [en, tw, cn, ja, ko]] = found
  return { zone: canonical, latitude, longitude, names: { en, 'zh-TW': tw, 'zh-CN': cn, ja, ko } }
}
