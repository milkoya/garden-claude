import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Condition, Detected, Garden, Job, Language, Member, Prefs, Room, Usage, UsageWindow, Weather } from '../types'
import {
  ACCESSORIES,
  RESTING,
  SCENE_ROWS,
  accessoryFor,
  freshGarden,
  coinsText,
  dayOf,
  hourOf,
  todayIn,
  sceneCells,
  seedOfId,
  choreGoal,
  freshPace,
  phaseOf,
  stepPace,
  spotFor,
  spreadGoals,
  wanderGoal,
  work,
} from './garden'
import { LANGUAGES, STRINGS, detectLanguage, doingText, languageName, parseAccessory, parseLanguage } from './i18n'
import type { Strings } from './i18n'
import {
  CAPTION_SEPARATOR,
  GAP,
  KEEP,
  MINI_BAR_CELLS,
  captionFor,
  costText,
  displayWidth,
  fitBadge,
  fitCaption,
  layoutFor,
  lineText,
  readingsOf,
} from './layout'
import { cityForZone } from './places'
import type { City } from './places'
import {
  HEARTBEAT_MS,
  MAX_MEMBERS,
  POLL_MS,
  WORKING_MS,
  back,
  busyFor,
  createRoom,
  didChore,
  freeAccessories,
  isAbandoned,
  isClosed,
  isHostAway,
  isPresent,
  loadRoom,
  memberOf,
  freeCode,
  newMember,
  parseCode,
  presentMembers,
  refusalFor,
  renamed,
  roomKey,
  seatKey,
  tidy,
  withMember,
  withoutMember,
} from './room'
import { barCells, emptyUsage, formatReset, prettyModel, windowOf } from './stats'
import type { Pace } from './garden'
import { WEATHER_REFRESH_MS, parseCondition, parseIsNight, weatherUrl } from './weather'

const garden = atom({ plugin: 'garden-claude', key: 'garden' } as const, freshGarden())
const job = atom({ plugin: 'garden-claude', key: 'job' } as const, RESTING)
const coins = atom({ plugin: 'garden-claude', key: 'coins' } as const, 0)
const today = atom({ plugin: 'garden-claude', key: 'today' } as const, { day: '', coins: 0 })
const room = atom({ plugin: 'garden-claude', key: 'room' } as const, null)
const membership = atom({ plugin: 'garden-claude', key: 'membership' } as const, null)
const hour = atom({ plugin: 'garden-claude', key: 'hour' } as const, -1)
const minute = atom({ plugin: 'garden-claude', key: 'minute' } as const, 0)
const usage = atom({ plugin: 'garden-claude', key: 'usage' } as const, emptyUsage())
const prefs = atom({ plugin: 'garden-claude', key: 'prefs' } as const, { language: 'auto' })
const detected = atom({ plugin: 'garden-claude', key: 'detected' } as const, { language: 'en', timeZone: 'UTC' })
const weather = atom({ plugin: 'garden-claude', key: 'weather' } as const, null)
const started = atom({ plugin: 'garden-claude', key: 'started' } as const, false)
const choring = atom({ plugin: 'garden-claude', key: 'choring' } as const, false)

const OLD_GARDEN_KEY = 'garden'
const COINS_KEY = 'coins'
const TODAY_KEY = 'today'
const PREFS_KEY = 'prefs'
const LANGUAGE_COMMAND = 'garden-claude-language'
const LANGUAGE_PANE = 'garden-claude-language'
const ROOM_COMMAND = 'garden-claude-room'
const ACCESSORY_COMMAND = 'garden-claude-accessory'
const ACCESSORY_PANE = 'garden-claude-accessory'
const FRAME_MS = 200
const CLOCK_MS = 60_000
const ASLEEP_MS = 30_000
const RASTER = 'garden'
const ORANGE = '#d97757'
const GOLD = '#f2c84b'
const BLUE = '#5b8de8'
const DIM_GOLD = '#b8963a'
const TITLE = 'Garden Claude '
const CHORE_HOLD_FRAMES = 8
const CHORE_MAX_FRAMES = 50

const START_X = 10

type Other = { id: string; accessory: number; job: Job; jobAt: number }

type View = {
  garden: Garden
  coins: number
  accessory: number
  job: Job
  others: readonly Other[]
  width: number
  weather: Weather['condition'] | null
  isNight: boolean
  jobKey: string
}

let claudeX: number | undefined
let facing = 0
let frame = 0
let isWorking = false
let site: string | undefined
let shown: View | undefined
let timers: readonly { cancel: () => void }[] | undefined
let myId: string | undefined
let isClearing = false
let heardSince = 0
let lastPoll = 0
let clockNow = 0
let notices: string[] = []
let starting: Promise<void> | undefined
let isMidChore = false
let wasOnDuty: boolean | undefined
let choreKey: string | undefined
let choreFrame = 0
let queue: Promise<unknown> = Promise.resolve()
const otherX = new Map<string, number>()
const otherFacing = new Map<string, number>()
const paces = new Map<string, Pace>()

const languageOf = (chosen: Prefs, found: Detected): Language =>
  chosen.language === 'auto' ? found.language : chosen.language

const loadPrefs = (value: unknown): Prefs | null => {
  const saved = value as Partial<Prefs> | null
  if (typeof saved !== 'object' || saved === null) return null
  const language = typeof saved.language === 'string' ? parseLanguage(saved.language) : null
  return { language: language ?? 'auto' }
}

type Seat = { code: string; accessory: number }

const loadSeat = (value: unknown): Seat | null => {
  const seat = value as Partial<Seat> | null
  if (typeof seat !== 'object' || seat === null || typeof seat.code !== 'string') return null
  return { code: seat.code, accessory: typeof seat.accessory === 'number' ? seat.accessory : 0 }
}

const ignore = () => undefined

const notify = (text: string) => {
  notices = [...notices, text]
}

function flushNotices($: EngineInterface) {
  const waiting = notices
  notices = []
  for (const text of waiting) $.ui.toast(text)
}

const serially = <T,>(task: () => Promise<T>): Promise<T> => {
  const run = queue.then(task, task)
  queue = run.catch(() => undefined)
  return run
}

const isBusy = (other: Other): boolean => clockNow - other.jobAt <= WORKING_MS

const walk = (x: number, target: number): number => x + Math.sign(target - x)

const paceOf = (id: string, key: string): Pace => {
  const pace = paces.get(id)
  return pace?.key === key ? pace : freshPace(key)
}

const keyOf = (other: Other): string => `${other.jobAt}`

const settledOf = (pace: Pace): number | null => (pace.arrivedAt === null ? null : frame - pace.arrivedAt)

const isChoring = (job: Job, isBusy: boolean): boolean => isBusy && job.kind !== 'resting'

const goalsOf = (view: View): number[] => {
  const everyone = [
    ...view.others.map(other => ({ id: other.id, job: other.job, isBusy: isBusy(other), pace: paceOf(other.id, keyOf(other)), x: otherX.get(other.id) ?? START_X })),
    { id: myId ?? '', job: view.job, isBusy: isOnDuty(), pace: paceOf(myId ?? '', view.jobKey), x: claudeX ?? START_X },
  ]
  return spreadGoals(
    everyone.map(claude => ({
      seed: seedOfId(claude.id),
      goal: isChoring(claude.job, claude.isBusy)
        ? choreGoal(claude.job, claude.pace.isCarrying, claude.x, view.width)
        : wanderGoal(seedOfId(claude.id), clockNow, view.width, claude.x),
      isWandering: !isChoring(claude.job, claude.isBusy),
    })),
    view.width,
  )
}

const sceneOf = (view: View) => {
  const mine = paceOf(myId ?? '', view.jobKey)
  const goals = goalsOf(view)
  return {
    garden: view.garden,
    coins: view.coins,
    claudes: [
      ...view.others.map((other, i) => {
        const pace = paceOf(other.id, keyOf(other))
        const x = otherX.get(other.id) ?? START_X
        return {
          x,
          target: goals[i] ?? x,
          facing: otherFacing.get(other.id) ?? 0,
          accessory: other.accessory,
          job: other.job,
          isWorking: isBusy(other),
          isCarrying: pace.isCarrying,
          settled: settledOf(pace),
          phase: phaseOf(other.id),
        }
      }),
      {
        x: claudeX ?? START_X,
        target: goals[view.others.length] ?? claudeX ?? START_X,
        facing,
        accessory: view.accessory,
        job: view.job,
        isWorking: isOnDuty(),
        isCarrying: mine.isCarrying,
        settled: settledOf(mine),
        phase: phaseOf(myId ?? ''),
      },
    ],
    frame,
    width: view.width,
    weather: view.weather,
    isNight: view.isNight,
  }
}

async function tick($: EngineInterface) {
  frame += 1
  clockNow += FRAME_MS
  const busy = isOnDuty()
  if (wasOnDuty !== busy) {
    wasOnDuty = busy
    await update($, choring, () => busy)
  }
  if (!shown || site === undefined || claudeX === undefined) return
  const mine = paceOf(myId ?? '', shown.jobKey)
  const goals = goalsOf(shown)
  const target = goals[shown.others.length] ?? claudeX
  if (claudeX !== target) {
    facing = Math.sign(target - claudeX)
    claudeX = walk(claudeX, target)
  } else {
    facing = busy ? 1 : 0
  }
  paces.set(myId ?? '', stepPace(mine, shown.job, busy, claudeX, frame, shown.width))
  for (const [i, other] of shown.others.entries()) {
    const pace = paceOf(other.id, keyOf(other))
    const x = otherX.get(other.id) ?? START_X
    const goal = goals[i] ?? x
    otherFacing.set(other.id, x !== goal ? Math.sign(goal - x) : isBusy(other) ? 1 : 0)
    otherX.set(other.id, walk(x, goal))
    paces.set(other.id, stepPace(pace, other.job, isBusy(other), walk(x, goal), frame, shown.width))
  }
  const { deny } = await $.ui.blit({ requestId: site, key: RASTER, cells: sceneCells(sceneOf(shown)) }).catch((error: unknown) => ({ deny: String(error) }))
  if (deny !== undefined) shown = undefined
}

function startTimers($: EngineInterface) {
  timers ??= [
    $.clock.every(FRAME_MS, () => void tick($).catch(ignore)),
    $.clock.every(CLOCK_MS, () => void refreshClock($).catch(ignore)),
    $.clock.every(WEATHER_REFRESH_MS, () => void refreshWeather($).catch(ignore)),
    $.clock.every(POLL_MS, () => void serially(() => ensureStarted($).then(() => pollRoom($))).catch(ignore)),
  ]
}

const coinsIn = (value: unknown): number => (typeof value === 'number' && value >= 0 ? value : 0)

async function dayNow($: EngineInterface): Promise<string> {
  return dayOf(await $.clock.now(), (await read($, detected)).timeZone)
}

async function syncCoins($: EngineInterface) {
  const saved = coinsIn(await $.store.get(COINS_KEY))
  await update($, coins, current => (current >= saved ? current : saved))
  const earnedToday = todayIn(await $.store.get(TODAY_KEY), await dayNow($))
  await update($, today, current => (current.day === earnedToday.day && current.coins === earnedToday.coins ? current : earnedToday))
}

async function earn($: EngineInterface, earned: number) {
  if (earned <= 0) return
  const total = coinsIn(await $.store.get(COINS_KEY)) + earned
  await $.store.set(COINS_KEY, total)
  await update($, coins, () => total)
  const saved = todayIn(await $.store.get(TODAY_KEY), await dayNow($))
  const earnedToday = { day: saved.day, coins: saved.coins + earned }
  await $.store.set(TODAY_KEY, earnedToday)
  await update($, today, () => earnedToday)
}

async function migrate($: EngineInterface) {
  const old = await $.store.get(OLD_GARDEN_KEY)
  if (old === undefined) return
  const oldCoins = typeof old === 'object' && old !== null ? coinsIn((old as { coins?: unknown }).coins) : 0
  const saved = coinsIn(await $.store.get(COINS_KEY))
  if (oldCoins > saved) await $.store.set(COINS_KEY, oldCoins)
  await $.store.delete(OLD_GARDEN_KEY)
}

async function refreshClock($: EngineInterface) {
  await syncCoins($)
  const now = await $.clock.now()
  await update($, hour, current => (current === hourOf(now) ? current : hourOf(now)))
  await update($, minute, () => Math.floor(now / CLOCK_MS))
}

async function measure($: EngineInterface) {
  const { context, rateLimits, cost } = await $.session.usage()
  await update($, usage, current => ({
    ...current,
    costUsd: cost?.usd ?? current.costUsd,
    context: context.percent ?? current.context,
    five: windowOf(rateLimits, 'five_hour') ?? current.five,
    week: windowOf(rateLimits, 'seven_day') ?? current.week,
  }))
}

async function detectedNow($: EngineInterface): Promise<Detected> {
  const locales = [await $.env.get('LC_ALL'), await $.env.get('LANG')]
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return { language: detectLanguage(locales, timeZone), timeZone }
}

async function detect($: EngineInterface) {
  const found = await detectedNow($)
  await update($, detected, () => found)
}

async function chosenNow($: EngineInterface): Promise<Prefs> {
  if (await read($, started)) return read($, prefs)
  return loadPrefs(await $.store.get(PREFS_KEY).catch(ignore)) ?? read($, prefs)
}

async function foundNow($: EngineInterface): Promise<Detected> {
  if (await read($, started)) return read($, detected)
  return detectedNow($).catch(() => read($, detected))
}

async function fetchWeather($: EngineInterface, city: City): Promise<Weather | null> {
  try {
    const response = await $.http.fetch(weatherUrl(city))
    const condition = response.ok ? parseCondition(response.text) : null
    return condition ? { condition, city: city.zone, isNight: parseIsNight(response.text) } : null
  } catch {
    return null
  }
}

async function refreshWeather($: EngineInterface) {
  const city = cityForZone((await read($, detected)).timeZone)
  const fetched = city ? await fetchWeather($, city) : null
  await update($, weather, () => fetched)
}

async function skyNow($: EngineInterface): Promise<Weather | null> {
  const sky = await read($, weather)
  const city = cityForZone((await read($, detected)).timeZone)
  return sky && city && sky.city === city.zone ? sky : null
}

async function conditionNow($: EngineInterface): Promise<Condition | null> {
  return (await skyNow($))?.condition ?? null
}

async function chooseLanguage($: EngineInterface, language: Language | 'auto') {
  const next = await update($, prefs, current => ({ ...current, language }))
  await $.store.set(PREFS_KEY, next)
}

async function pickLanguage($: EngineInterface, value: string) {
  const language = parseLanguage(value)
  if (language !== null) await chooseLanguage($, language)
  await $.ui.close({ id: LANGUAGE_PANE })
}

async function stringsNow($: EngineInterface): Promise<Strings> {
  return STRINGS[languageOf(await chosenNow($), await foundNow($))]
}

const languageList = (strings: Strings): string =>
  [strings.supportedLanguages, '  auto', ...LANGUAGES.map(({ code, name }) => `  ${code}: ${name}`)].join('\n')

async function hourlyAccessory($: EngineInterface): Promise<number> {
  const storedHour = await read($, hour)
  return accessoryFor(storedHour >= 0 ? storedHour : hourOf(await $.clock.now()))
}

async function fetchRoom($: EngineInterface, code: string): Promise<Room | null> {
  return loadRoom(await $.store.get(roomKey(code)))
}

async function saveRoom($: EngineInterface, next: Room) {
  await $.store.set(roomKey(next.code), next)
  await update($, room, current => (JSON.stringify(current) === JSON.stringify(next) ? current : next))
}

async function saveSeat($: EngineInterface, id: string, code: string, accessory: number) {
  await $.store.set(seatKey(id), { code, accessory })
}

async function enterRoom($: EngineInterface, id: string, next: Room) {
  await saveRoom($, next)
  await saveSeat($, id, next.code, memberOf(next, id)?.accessory ?? 0)
  await update($, membership, () => ({ code: next.code }))
  otherX.clear()
  otherFacing.clear()
  paces.clear()
}

async function goAlone($: EngineInterface) {
  await update($, membership, () => null)
  await update($, room, () => null)
  otherX.clear()
  otherFacing.clear()
  paces.clear()
}

async function resumeSeat($: EngineInterface, id: string, isQuiet = false) {
  const seat = loadSeat(await $.store.get(seatKey(id)))
  if (!seat) return
  const now = await $.clock.now()
  const saved = await fetchRoom($, seat.code)
  const strings = await stringsNow($)
  if (saved && !isClosed(saved, now, 0)) {
    const tidied = tidy(saved, now, 0)
    if (memberOf(tidied, id)) {
      await enterRoom($, id, withMember(tidied, id, member => back(member, now)))
      if (!isQuiet) notify(strings.welcomeBack(seat.code))
      return
    }
    if (refusalFor(tidied, now, 0) === null) {
      await enterRoom($, id, { ...tidied, members: [...tidied.members, newMember(tidied, id, now, seat.accessory)] })
      notify(strings.welcomeBack(seat.code))
      return
    }
  }
  await $.store.delete(seatKey(id))
  notify(strings.closedWhileAway(seat.code))
}

async function carryOver($: EngineInterface, previous: string, id: string): Promise<boolean> {
  const seat = loadSeat(await $.store.get(seatKey(previous)))
  const saved = seat ? await fetchRoom($, seat.code) : null
  const old = saved ? memberOf(saved, previous) : undefined
  if (!seat || !saved || !old || (old.away && !isClearing)) return false
  await $.store.set(roomKey(saved.code), renamed(saved, previous, id))
  await $.store.delete(seatKey(previous))
  await saveSeat($, id, saved.code, old.accessory)
  return true
}

async function switchTo($: EngineInterface, previous: string | undefined, id: string) {
  myId = id
  const isCarried = previous !== undefined && previous !== id && (await carryOver($, previous, id))
  isClearing = false
  await resumeSeat($, id, isCarried)
}

async function idNow($: EngineInterface): Promise<string> {
  const id = await $.session.id()
  if (myId === undefined) myId = id
  if (id === myId) return id
  const previous = myId
  await goAlone($)
  await switchTo($, previous, id)
  return id
}

async function liveRoom($: EngineInterface, id: string, code: string, now: number): Promise<Room | null> {
  const saved = await fetchRoom($, code)
  const strings = await stringsNow($)
  if (!saved || isClosed(saved, now, heardSince)) {
    await goAlone($)
    notify(saved?.host === id ? strings.closedWhileAway(code) : strings.hostClosed(code))
    return null
  }
  const tidied = tidy(saved, now, heardSince)
  if (memberOf(tidied, id)) return tidied
  const seat = loadSeat(await $.store.get(seatKey(id)))
  if (refusalFor(tidied, now, heardSince) === null) {
    const rejoined = { ...tidied, members: [...tidied.members, newMember(tidied, id, now, seat?.accessory)] }
    await saveRoom($, rejoined)
    return rejoined
  }
  await $.store.delete(seatKey(id))
  await goAlone($)
  notify(strings.closedWhileAway(code))
  return null
}

async function pollRoom($: EngineInterface) {
  flushNotices($)
  const now = await $.clock.now()
  if (lastPoll > 0 && now - lastPoll > ASLEEP_MS) heardSince = now
  lastPoll = now
  if (!(await read($, membership))) return
  const id = await idNow($)
  const seat = await read($, membership)
  if (!seat) return flushNotices($)
  const current = await liveRoom($, id, seat.code, now)
  if (!current) return flushNotices($)
  const me = memberOf(current, id)
  if (me && (me.away || now - me.seen >= HEARTBEAT_MS)) {
    await saveRoom($, withMember(current, id, member => back(member, now)))
    return
  }
  await update($, room, previous => (JSON.stringify(previous) === JSON.stringify(current) ? previous : current))
}

async function sweep($: EngineInterface, now: number) {
  const keys = await $.store.keys()
  const open = new Map<string, Room>()
  for (const key of keys.filter(one => one.startsWith('room:'))) {
    const saved = loadRoom(await $.store.get(key))
    if (!saved || isAbandoned(saved, now)) await $.store.delete(key)
    else open.set(saved.code, saved)
  }
  for (const key of keys.filter(one => one.startsWith('seat:'))) {
    const seat = loadSeat(await $.store.get(key))
    const saved = seat ? open.get(seat.code) : undefined
    if (!saved || !memberOf(saved, key.slice('seat:'.length))) await $.store.delete(key)
  }
}

async function uniqueCode($: EngineInterface): Promise<string | null> {
  const now = await $.clock.now()
  const taken = new Set<string>()
  for (const key of (await $.store.keys()).filter(one => one.startsWith('room:'))) {
    const saved = loadRoom(await $.store.get(key))
    if (saved && !isClosed(saved, now, 0)) taken.add(saved.code)
  }
  return freeCode(taken, Math.random)
}

const memberName = (strings: Strings, member: Member, current: Room): string =>
  current.host === member.id ? `${strings.claude(member.seat)} (${strings.host})` : strings.claude(member.seat)

async function roomStatus($: EngineInterface, strings: Strings): Promise<string> {
  const seat = await read($, membership)
  const current = seat ? await fetchRoom($, seat.code) : null
  if (!seat || !current) return `${strings.aloneStatus}\n\n${strings.roomHelp}`
  const id = await idNow($)
  const now = await $.clock.now()
  const lines = [...current.members]
    .sort((a, b) => a.seat - b.seat)
    .map(member =>
      [
        memberName(strings, member, current),
        ...(member.id === id ? [strings.you] : []),
        strings.accessories[member.accessory] ?? strings.accessories[0],
        ...(isPresent(member, now, heardSince) ? [] : [strings.away]),
      ].join(CAPTION_SEPARATOR),
    )
  return [strings.roomStatus(seat.code, current.host === id), ...lines.map(line => `  ${line}`), '', strings.roomHelp].join('\n')
}

async function createCommand($: EngineInterface, strings: Strings): Promise<string> {
  const seat = await read($, membership)
  if (seat) return strings.alreadyIn(seat.code)
  const code = await uniqueCode($)
  if (!code) return strings.noFreeRoom
  const id = await idNow($)
  const now = await $.clock.now()
  await enterRoom($, id, createRoom(code, id, await read($, garden), await hourlyAccessory($), now))
  return strings.created(code)
}

async function joinCommand($: EngineInterface, strings: Strings, input: string): Promise<string> {
  const seat = await read($, membership)
  if (seat) return strings.alreadyIn(seat.code)
  const code = parseCode(input)
  if (!code) return strings.badCode(input)
  const now = await $.clock.now()
  const saved = await fetchRoom($, code)
  if (!saved || isClosed(saved, now, heardSince)) return strings.noSuchRoom(code)
  const tidied = tidy(saved, now, heardSince)
  const refusal = refusalFor(tidied, now, heardSince)
  if (refusal === 'hostAway') return strings.hostIsAway(code)
  if (refusal === 'heldSeat') return strings.seatHeld(code)
  if (refusal === 'full') return strings.roomFull(code)
  const id = await idNow($)
  await enterRoom($, id, { ...tidied, members: [...tidied.members, newMember(tidied, id, now, await hourlyAccessory($))] })
  await openAccessoryPicker($, strings)
  return strings.joined(code)
}

async function leaveCommand($: EngineInterface, strings: Strings): Promise<string> {
  const seat = await read($, membership)
  if (!seat) return strings.notIn
  const id = await idNow($)
  const saved = await fetchRoom($, seat.code)
  await $.store.delete(seatKey(id))
  await goAlone($)
  if (!saved) return strings.left(seat.code)
  if (saved.host === id) {
    await $.store.delete(roomKey(seat.code))
    return strings.closed(seat.code)
  }
  await $.store.set(roomKey(seat.code), withoutMember(saved, id))
  return strings.left(seat.code)
}

async function hostCommand($: EngineInterface, strings: Strings, input: string): Promise<string> {
  const code = parseCode(input)
  if (!code) return strings.badCode(input)
  const seat = await read($, membership)
  if (seat && seat.code !== code) return strings.alreadyIn(seat.code)
  const now = await $.clock.now()
  const saved = await fetchRoom($, code)
  if (!saved || isClosed(saved, now, heardSince)) return strings.noSuchRoom(code)
  if (!isHostAway(saved, now, heardSince)) return strings.hostNotAway(code)
  const id = await idNow($)
  const old = memberOf(saved, saved.host)
  const rest = tidy(withoutMember(saved, saved.host), now, heardSince)
  const mine = memberOf(rest, id)
  if (!mine && rest.members.length >= MAX_MEMBERS) return strings.roomFull(code)
  const members = mine
    ? rest.members
    : [...rest.members, { ...newMember(rest, id, now, old?.accessory), ...(old ? { seat: old.seat } : {}) }]
  await enterRoom($, id, { ...rest, host: id, members })
  return strings.reclaimed(code)
}

async function myMember($: EngineInterface): Promise<{ id: string; current: Room } | null> {
  const seat = await read($, membership)
  if (!seat) return null
  const id = await idNow($)
  const current = await fetchRoom($, seat.code)
  return current && memberOf(current, id) ? { id, current } : null
}

async function setAccessory($: EngineInterface, strings: Strings, accessory: number): Promise<string> {
  const mine = await myMember($)
  if (!mine) return strings.accessoryAlone
  const name = strings.accessories[accessory] ?? strings.accessories[0]
  if (!freeAccessories(mine.current, mine.id).includes(accessory)) return strings.accessoryTaken(name)
  await saveRoom($, withMember(mine.current, mine.id, member => ({ ...member, accessory })))
  await saveSeat($, mine.id, mine.current.code, accessory)
  return strings.accessorySet(name)
}

async function openAccessoryPicker($: EngineInterface, strings: Strings) {
  await $.ui.open({
    id: ACCESSORY_PANE,
    title: strings.accessoryTitle,
    focus: true,
    closeOnEscape: true,
    holdToasts: true,
    rows: ACCESSORIES.length + 4,
  })
}

async function pickAccessory($: EngineInterface, value: string) {
  const accessory = Number(value)
  if (Number.isInteger(accessory)) $.ui.toast(await serially(async () => setAccessory($, await stringsNow($), accessory)))
  await $.ui.close({ id: ACCESSORY_PANE })
}

const freeList = (strings: Strings, current: Room, id: string): string =>
  [strings.freeAccessories, ...freeAccessories(current, id).map(i => `  ${strings.accessories[i] ?? ''}`)].join('\n')

async function startUp($: EngineInterface) {
  const savedPrefs = loadPrefs(await $.store.get(PREFS_KEY).catch(ignore))
  if (savedPrefs) await update($, prefs, () => savedPrefs)
  await detect($).catch(ignore)
  const now = await $.clock.now()
  lastPoll = now
  await migrate($).catch(ignore)
  await rejoinAtStart($, now).catch(ignore)
  await refreshClock($).catch(ignore)
  await measure($).catch(ignore)
  await registerCommands($).catch(ignore)
  await update($, started, () => true)
  void refreshWeather($).catch(ignore)
  startTimers($)
}

const begin = ($: EngineInterface): Promise<void> =>
  (starting ??= startUp($).finally(() => {
    starting = undefined
  }))

async function ensureStarted($: EngineInterface) {
  if (starting) return starting
  if (await read($, started)) return
  return begin($)
}

async function registerCommands($: EngineInterface) {
  await $.command.register({
    name: LANGUAGE_COMMAND,
    description: 'Pick the language Garden Claude speaks',
    argumentHint: '[auto | en | zh-TW | zh-CN | ja | ko]',
  })
  await $.command.register({
    name: ROOM_COMMAND,
    description: 'Garden together: create or join a room of up to three Claudes',
    argumentHint: '[create | join CODE | leave | host CODE]',
  })
  await $.command.register({
    name: ACCESSORY_COMMAND,
    description: 'Pick what your Claude wears in a room',
    argumentHint: '[sunglasses | headphones | straw hat | flower crown | bunny ears]',
    immediate: true,
  })
}

async function rejoinAtStart($: EngineInterface, now: number) {
  await switchTo($, myId, await $.session.id())
  await sweep($, now)
}

async function markAway($: EngineInterface, code: string, id: string) {
  const now = await $.clock.now()
  const saved = await fetchRoom($, code)
  if (saved && memberOf(saved, id)) await $.store.set(roomKey(code), withMember(saved, id, member => ({ ...member, away: { since: now } })))
}

const isChoreDone = (): boolean => {
  if (!shown) return true
  if (frame - choreFrame >= CHORE_MAX_FRAMES) return true
  if (shown.jobKey === choreKey) return false
  const pace = paceOf(myId ?? '', shown.jobKey)
  return shown.job.kind === 'resting' || (pace.arrivedAt !== null && frame - pace.arrivedAt >= CHORE_HOLD_FRAMES)
}

const isOnDuty = (): boolean => isWorking || !isChoreDone()

async function doChore($: EngineInterface) {
  startTimers($)
  if (isMidChore || !isChoreDone()) return
  isMidChore = true
  choreKey = shown?.jobKey
  choreFrame = frame
  try {
    await serially(() => ensureStarted($).then(() => choreOnce($)))
  } catch {
    choreKey = undefined
  } finally {
    isMidChore = false
  }
}

async function choreOnce($: EngineInterface) {
  const condition = await conditionNow($)
  const id = await idNow($)
  const seat = await read($, membership)
  const now = await $.clock.now()
  const current = seat ? await liveRoom($, id, seat.code, now) : null
  const me = current ? memberOf(current, id) : undefined
  if (current && me) {
    const chore = work(current.garden, condition, { job: me.job, ...busyFor(current, id, now, heardSince) })
    await saveRoom($, didChore(current, id, chore.garden, chore.job, now))
    await earn($, chore.earned)
    return
  }
  const chore = work(await read($, garden), condition, { job: await read($, job) })
  await update($, garden, () => chore.garden)
  await update($, job, () => chore.job)
  await earn($, chore.earned)
}

type Badge = { text: string; color: string | null }

type MemberLine = { label: string; details: string; isMine: boolean }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await serially(() => begin($))

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    const seat = await read($, membership)
    if (seat && e.reason === 'clear') isClearing = true
    if (seat && e.reason !== 'clear') await markAway($, seat.code, e.sessionId).catch(ignore)

    return next(e)
  })

  on('command.run', { command: LANGUAGE_COMMAND }, async ($, e) => {
    await serially(() => ensureStarted($))
    const strings = await stringsNow($)
    if (e.args.trim() === '') {
      await $.ui.open({ id: LANGUAGE_PANE, title: strings.languageTitle, focus: true, closeOnEscape: true, holdToasts: true, rows: LANGUAGES.length + 5 })
      return {}
    }
    const language = parseLanguage(e.args)
    if (language === null) return { text: `${strings.unknownLanguage(e.args.trim())}\n${languageList(strings)}` }
    await chooseLanguage($, language)
    const after = await stringsNow($)
    const found = await read($, detected)
    return { text: after.languageSet(languageName(language === 'auto' ? found.language : language)) }
  })

  on('command.run', { command: ROOM_COMMAND }, async ($, e) => {
    const [action = '', ...rest] = e.args.trim().split(/\s+/)
    const argument = rest.join(' ')
    const text = await serially(async () => {
      await ensureStarted($)
      const strings = await stringsNow($)
      switch (action.toLowerCase()) {
        case 'create':
          return createCommand($, strings)
        case 'join':
          return joinCommand($, strings, argument)
        case 'leave':
          return leaveCommand($, strings)
        case 'host':
          return hostCommand($, strings, argument)
        default:
          return roomStatus($, strings)
      }
    })
    return { text }
  })

  on('command.run', { command: ACCESSORY_COMMAND }, async ($, e) =>
    serially(async () => {
      await ensureStarted($)
      const strings = await stringsNow($)
      const mine = await myMember($)
      if (!mine) return { text: strings.accessoryAlone }
      if (e.args.trim() === '') {
        await openAccessoryPicker($, strings)
        return {}
      }
      const accessory = parseAccessory(e.args)
      if (accessory === null) return { text: `${strings.unknownAccessory(e.args.trim())}\n${freeList(strings, mine.current, mine.id)}` }
      return { text: await setAccessory($, strings, accessory) }
    }),
  )

  on('session.measure', async ($, e, next) => {
    await update($, usage, current => ({
      ...current,
      costUsd: e.cost?.usd ?? current.costUsd,
      context: e.context.percent ?? current.context,
      five: windowOf(e.rateLimits, 'five_hour') ?? current.five,
      week: windowOf(e.rateLimits, 'seven_day') ?? current.week,
    }))

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const model = prettyModel(e.model)
      await update($, usage, current => (current.model === model ? current : { ...current, model }))
    }

    return yield* next(e)
  })

  on('tool.call', async ($, e, next) => {
    await doChore($)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await doChore($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && (e.reason === 'answer' || e.reason === 'refusal')) await doChore($)
    return result
  })

  on('ui.render', { component: 'Pane', requestId: LANGUAGE_PANE }, async ($, e) => {
    const chosen = await chosenNow($)
    const found = await foundNow($)
    const strings = STRINGS[languageOf(chosen, found)]
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)
      return <Text>{languageList(strings)}</Text>
    }
    const { Box, Text, Select } = $.ui.resolve(e)
    const options = [
      { value: 'auto', label: strings.autoLanguage(languageName(found.language)) },
      ...LANGUAGES.map(({ code, name }) => ({ value: code, label: name })),
    ]

    return (
      <Box flexDirection="column">
        <Select
          key="language"
          options={options}
          value={chosen.language}
          autoFocus
          onSelect={(value: string) => void pickLanguage($, value).catch(ignore)}
        />
        <Text dimColor>{strings.pickHint}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: ACCESSORY_PANE }, async ($, e) => {
    const strings = await stringsNow($)
    const current = await read($, room)
    const id = myId ?? ''
    const me = current ? memberOf(current, id) : undefined
    if (e.surface === 'mobile' || !current || !me) {
      const { Text } = $.ui.resolve(e)
      return <Text>{current && me ? freeList(strings, current, id) : strings.accessoryAlone}</Text>
    }
    const { Box, Text, Select } = $.ui.resolve(e)
    const options = freeAccessories(current, id).map(i => ({ value: String(i), label: strings.accessories[i] ?? '' }))

    return (
      <Box flexDirection="column">
        <Select
          key="accessory"
          options={options}
          value={String(me.accessory)}
          autoFocus
          onSelect={(value: string) => void pickAccessory($, value).catch(ignore)}
        />
        <Text dimColor>{strings.pickHint}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    startTimers($)

    const now = await $.clock.now()
    clockNow = now
    await read($, minute)
    const hourly = await hourlyAccessory($)
    const purse = await read($, coins)
    const earnedToday = await read($, today)
    const seat = await read($, membership)
    const saved = seat ? await read($, room) : null
    const stats: Usage = await read($, usage)
    const chosen = await chosenNow($)
    const found = await foundNow($)
    const language = languageOf(chosen, found)
    const strings = STRINGS[language]
    const city = cityForZone(found.timeZone)
    const coinsShown = coinsText(strings.coins(purse), earnedToday.day === dayOf(now, found.timeZone) ? earnedToday.coins : 0)
    const sky = await skyNow($)
    const condition = sky?.condition ?? null
    const isNight = sky?.isNight ?? false
    isWorking = e.props.isWorking
    const isBusyNow = isWorking || (await read($, choring))
    const isTerminal = e.surface === 'terminal'
    const columns = e.props.bodyColumns
    const layout = layoutFor(columns, e.props.maxRows, isTerminal, stats)
    const id = myId ?? ''
    const me = saved ? memberOf(saved, id) : undefined
    const current = saved && me ? saved : null
    const present = current ? presentMembers(current, now, heardSince) : []
    const myJob = me?.job ?? (await read($, job))
    const myAccessory = me?.accessory ?? hourly
    const plantedIn = current?.garden ?? (await read($, garden))
    const jobKey = current && me ? `${me.jobAt}` : `${plantedIn.chores}:${myJob.kind}:${myJob.plot}`
    const others: Other[] = present
      .filter(member => member.id !== id)
      .map(member => ({ id: member.id, accessory: member.accessory, job: member.job, jobAt: member.jobAt }))

    site = e.requestId
    shown =
      layout.sceneWidth === null
        ? undefined
        : { garden: plantedIn, coins: purse, accessory: myAccessory, job: myJob, others, width: layout.sceneWidth, weather: condition, isNight, jobKey }
    if (shown) {
      claudeX ??= spotFor(myJob, START_X, shown.width)
      for (const other of others) if (!otherX.has(other.id)) otherX.set(other.id, spotFor(other.job, START_X, shown.width))
    }

    const place = city ? [city.names[language], condition ? (isNight && condition === 'sunny' ? strings.clearNight : strings.weather[condition]) : null].filter(Boolean).join(' ') : ''
    const myChore = doingText(strings, myJob, isBusyNow)

    const badge: Badge = (() => {
      if (!current) return { text: '', color: null }
      const count = `${current.code} ${present.length}/${MAX_MEMBERS}`
      const tiers = (word: string, short: string) => [`${word} · ${count}`, `${short} ${current.code}`, current.code]
      if (current.host === id) return { text: fitBadge(tiers(strings.badge.host, strings.badge.host), '', columns), color: GOLD }
      if (isHostAway(current, now, heardSince)) {
        return { text: fitBadge(tiers(strings.badge.hostAway, strings.badge.away), '', columns), color: DIM_GOLD }
      }
      return { text: fitBadge(tiers(strings.badge.joined, strings.badge.joined), '', columns), color: BLUE }
    })()
    const badgeColumns = badge.text === '' ? 0 : displayWidth(badge.text) + 1

    const sharedParts = current
      ? [
          { text: place, dropOrder: 2 },
          { text: coinsShown, dropOrder: 1 },
        ]
      : [
          { text: place, dropOrder: 2 },
          { text: strings.accessories[myAccessory] ?? strings.accessories[0], dropOrder: 4 },
          { text: myChore, dropOrder: KEEP },
          { text: coinsShown, dropOrder: 1 },
        ]
    const { hasTitle, details } = captionFor(TITLE, sharedParts, columns - badgeColumns)

    const rowsUsed = isTerminal ? (shown ? SCENE_ROWS : 0) + layout.below.length : 1
    const spareRows = Math.max(0, e.props.maxRows - rowsUsed)
    const hasCaption = !isTerminal || layout.below.includes('caption')
    const memberLines: MemberLine[] = (() => {
      if (!current || !me || !hasCaption) return []
      const seated = [...current.members].sort((a, b) => a.seat - b.seat)
      const kept = seated.length <= spareRows ? seated : [me, ...seated.filter(member => member.id !== id)].slice(0, spareRows)
      return seated
        .filter(member => kept.includes(member))
        .map(member => {
          const isMine = member.id === id
          const label = memberName(strings, member, current)
          const chore = isPresent(member, now, heardSince)
            ? doingText(strings, member.job, isMine ? isBusyNow : now - member.jobAt <= WORKING_MS)
            : strings.away
          const fitted = fitCaption(
            [
              { text: label, dropOrder: KEEP },
              { text: isMine ? strings.you : '', dropOrder: 1 },
              { text: strings.accessories[member.accessory] ?? strings.accessories[0], dropOrder: 2 },
              { text: chore, dropOrder: KEEP },
            ],
            columns,
          )
          return { label, details: fitted.slice(label.length), isMine }
        })
    })()

    const { Box, Text } = $.ui.resolve(e)

    const badgeView =
      badge.color === null ? null : (
        <Text color={badge.color} bold>
          {badge.text}{' '}
        </Text>
      )

    const caption = (
      <Box key="caption" flexDirection="row">
        {badgeView}
        {hasTitle && (
          <Text color={ORANGE} bold>
            {TITLE}
          </Text>
        )}
        <Text dimColor wrap="truncate-end">
          {details}
        </Text>
      </Box>
    )

    const members = memberLines.map(line => (
      <Box key={`member-${line.label}`} flexDirection="row">
        {line.isMine ? (
          <Text color={ORANGE} bold>
            {line.label}
          </Text>
        ) : (
          <Text>{line.label}</Text>
        )}
        <Text dimColor wrap="truncate-end">
          {line.details}
        </Text>
      </Box>
    ))

    if (!isTerminal) {
      return (
        <Box flexDirection="column">
          {caption}
          {members}
        </Box>
      )
    }

    const { Raster } = $.ui.resolve(e)
    const lineBadge = !hasCaption && current ? badgeView : null

    const statsLine = layout.hasLineBars ? (
      <Box key="stats" flexDirection="row">
        {lineBadge}
        <Text color={GOLD} bold>
          {costText(stats)}
        </Text>
        {readingsOf(stats, layout.lineLabels).map(({ label, percent }) => (
          <Box flexDirection="row">
            <Text dimColor> · </Text>
            <Text color={ORANGE}>{label} </Text>
            <Raster key={`${label}-mini`} columns={MINI_BAR_CELLS} rows={1} cells={barCells(percent, MINI_BAR_CELLS)} />
            <Text> {percent}%</Text>
          </Box>
        ))}
        {stats.model && <Text dimColor> · {stats.model}</Text>}
      </Box>
    ) : (
      <Box key="stats" flexDirection="row">
        {lineBadge}
        <Text color={GOLD} bold>
          {costText(stats)}
        </Text>
        <Text dimColor wrap="truncate-end">
          {lineText(stats, layout.hasLineModel, layout.lineLabels).slice(costText(stats).length)}
        </Text>
      </Box>
    )

    const limitRow = (label: string, key: string, window: UsageWindow | null) => (
      <Box flexDirection="row">
        <Text color={ORANGE}>{label} </Text>
        {window ? (
          <Box flexDirection="row">
            <Raster key={key} columns={layout.barCells} rows={1} cells={barCells(window.percent, layout.barCells)} />
            <Text>{`${window.percent}%`.padStart(5)}</Text>
            {window.resetsAt && <Text dimColor> · {formatReset(window.resetsAt, now)}</Text>}
          </Box>
        ) : (
          <Text dimColor>--</Text>
        )}
      </Box>
    )

    const statsBlock = (
      <Box flexDirection="column" marginLeft={GAP} marginTop={1}>
        <Box flexDirection="row">
          <Text color={GOLD} bold>
            {costText(stats)}
          </Text>
          {stats.model && <Text dimColor> · </Text>}
          {stats.model && <Text bold>{stats.model}</Text>}
        </Box>
        {limitRow('ctx', 'ctx-bar', stats.context === null ? null : { percent: stats.context, resetsAt: null })}
        {limitRow('5h ', 'five-bar', stats.five)}
        {limitRow('7d ', 'week-bar', stats.week)}
      </Box>
    )

    const scene =
      shown === undefined ? null : (
        <Raster key={RASTER} columns={shown.width} rows={SCENE_ROWS} cells={sceneCells(sceneOf(shown))} />
      )

    return (
      <Box flexDirection="column">
        {scene && (
          <Box flexDirection="row">
            {scene}
            {layout.isStatsBeside && statsBlock}
          </Box>
        )}
        {layout.below.flatMap(row => (row === 'caption' ? [caption, ...members] : [statsLine]))}
      </Box>
    )
  })
}
