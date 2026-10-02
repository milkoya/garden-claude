import type { Away, Garden, Job, Member, Room } from '../types'
import { ACCESSORIES, RESTING, loadGarden, loadJob } from './garden'

export const MAX_MEMBERS = 3
export const SILENT_MS = 3 * 60_000
export const GRACE_MS = 5 * 60_000
export const ABANDONED_MS = 24 * 60 * 60_000
export const BUSY_MS = 60_000
export const WORKING_MS = 10_000
export const HEARTBEAT_MS = 60_000
export const POLL_MS = 5_000

export const FRUITS = [
  'APPLE',
  'PEAR',
  'PEACH',
  'PLUM',
  'MANGO',
  'LEMON',
  'LIME',
  'KIWI',
  'GRAPE',
  'MELON',
  'CHERRY',
  'BERRY',
  'FIG',
  'GUAVA',
  'PAPAYA',
  'LYCHEE',
  'BANANA',
  'ORANGE',
  'YUZU',
  'POMELO',
] as const

export const roomKey = (code: string): string => `room:${code}`

export const seatKey = (id: string): string => `seat:${id}`

export const freeCode = (taken: ReadonlySet<string>, random: () => number): string | null => {
  const free = FRUITS.filter(fruit => !taken.has(fruit))
  return free[Math.floor(random() * free.length)] ?? null
}

export const parseCode = (input: string): string | null => {
  const code = input.trim().toUpperCase()
  return (FRUITS as readonly string[]).includes(code) ? code : null
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const loadAway = (value: unknown): Away | undefined =>
  isObject(value) && typeof value.since === 'number' ? { since: value.since } : undefined

const loadMember = (value: unknown): Member | null => {
  if (!isObject(value) || typeof value.id !== 'string') return null
  if (typeof value.seat !== 'number' || typeof value.accessory !== 'number' || typeof value.seen !== 'number') return null
  const away = loadAway(value.away)
  return {
    id: value.id,
    seat: value.seat,
    accessory: value.accessory,
    job: loadJob(value.job),
    jobAt: typeof value.jobAt === 'number' ? value.jobAt : 0,
    seen: value.seen,
    ...(away ? { away } : {}),
  }
}

export const loadRoom = (value: unknown): Room | null => {
  if (!isObject(value) || typeof value.code !== 'string' || typeof value.host !== 'string') return null
  const garden = loadGarden(value.garden)
  if (!garden || !Array.isArray(value.members)) return null
  const members = value.members.flatMap(member => loadMember(member) ?? [])
  return { code: value.code, host: value.host, garden, members }
}

export const memberOf = (room: Room, id: string): Member | undefined => room.members.find(member => member.id === id)

export const awayOf = (member: Member, now: number, heardSince: number): Away | undefined => {
  if (member.away) return member.away
  const heard = Math.max(member.seen, heardSince)
  return now - heard > SILENT_MS ? { since: heard + SILENT_MS } : undefined
}

export const isPresent = (member: Member, now: number, heardSince: number): boolean =>
  awayOf(member, now, heardSince) === undefined

export const isHostAway = (room: Room, now: number, heardSince: number): boolean => {
  const host = memberOf(room, room.host)
  return host === undefined || !isPresent(host, now, heardSince)
}

export const isClosed = (room: Room, now: number, heardSince: number): boolean => {
  const host = memberOf(room, room.host)
  if (!host) return true
  const away = awayOf(host, now, heardSince)
  return away !== undefined && now - away.since > GRACE_MS
}

export const tidy = (room: Room, now: number, heardSince: number): Room => ({
  ...room,
  members: room.members.filter(member => {
    if (member.id === room.host) return true
    const away = awayOf(member, now, heardSince)
    return away === undefined || now - away.since <= GRACE_MS
  }),
})

export const presentMembers = (room: Room, now: number, heardSince: number): Member[] =>
  room.members.filter(member => isPresent(member, now, heardSince)).sort((a, b) => a.seat - b.seat)

export type Busy = { busy: number[]; isStallBusy: boolean; held: number }

export const busyFor = (room: Room, id: string, now: number, heardSince: number): Busy => {
  const others = presentMembers(room, now, heardSince).filter(
    member => member.id !== id && member.job.kind !== 'resting' && now - member.jobAt <= BUSY_MS,
  )
  return {
    busy: others.flatMap(member => (member.job.plot >= 0 ? [member.job.plot] : [])),
    isStallBusy: others.some(member => member.job.kind === 'selling'),
    held: room.members.filter(member => member.id !== id && member.job.kind === 'harvesting').length,
  }
}

export type Refusal = 'hostAway' | 'full' | 'heldSeat'

export const refusalFor = (room: Room, now: number, heardSince: number): Refusal | null => {
  if (isHostAway(room, now, heardSince)) return 'hostAway'
  if (room.members.length < MAX_MEMBERS) return null
  return presentMembers(room, now, heardSince).length < MAX_MEMBERS ? 'heldSeat' : 'full'
}

export const freeAccessories = (room: Room, id: string): number[] =>
  ACCESSORIES.map((_, i) => i).filter(i => !room.members.some(member => member.id !== id && member.accessory === i))

const freeSeat = (room: Room): number =>
  Array.from({ length: MAX_MEMBERS }, (_, i) => i + 1).find(seat => !room.members.some(member => member.seat === seat)) ??
  room.members.length + 1

export const newMember = (room: Room, id: string, now: number, wanted?: number): Member => {
  const free = freeAccessories(room, id)
  const accessory = wanted !== undefined && free.includes(wanted) ? wanted : (free[0] ?? 0)
  return { id, seat: freeSeat(room), accessory, job: RESTING, jobAt: 0, seen: now }
}

export const createRoom = (code: string, id: string, garden: Garden, accessory: number, now: number): Room => {
  const room: Room = { code, host: id, garden, members: [] }
  return { ...room, members: [{ ...newMember(room, id, now, accessory), seat: 1 }] }
}

export const withMember = (room: Room, id: string, change: (member: Member) => Member): Room => ({
  ...room,
  members: room.members.map(member => (member.id === id ? change(member) : member)),
})

export const withoutMember = (room: Room, id: string): Room => ({
  ...room,
  members: room.members.filter(member => member.id !== id),
})

export const back = (member: Member, now: number): Member => {
  const { away: _, ...rest } = member
  return { ...rest, seen: now }
}

export const renamed = (room: Room, from: string, to: string): Room => ({
  ...withMember(room, from, member => ({ ...member, id: to })),
  host: room.host === from ? to : room.host,
})

export const didChore = (room: Room, id: string, garden: Garden, job: Job, now: number): Room =>
  withMember({ ...room, garden }, id, member => ({ ...back(member, now), job, jobAt: now }))

export const isAbandoned = (room: Room, now: number): boolean => {
  const host = memberOf(room, room.host)
  if (!host || (host.away && now - host.away.since > GRACE_MS)) return true
  return room.members.every(member => now - member.seen > ABANDONED_MS)
}
