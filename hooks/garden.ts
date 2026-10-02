import type { Condition, Garden, Job, Plot } from '../types'

export const HOUR = 3_600_000
export const PLOT_COUNT = 5
export const BASKET_SIZE = 3
export const BLOOM = 4

export const FLOWERS = [
  { name: 'daisy', petal: 0xe6e6dc, center: 0xf2c84b, price: 2 },
  { name: 'tulip', petal: 0xe0464e, center: 0xb8323a, price: 3 },
  { name: 'sunflower', petal: 0xf7c531, center: 0x7a4a1e, price: 4 },
  { name: 'lavender', petal: 0xa77bd6, center: 0x7d55b0, price: 3 },
  { name: 'rose', petal: 0xf07fa8, center: 0xc94f7c, price: 5 },
  { name: 'cornflower', petal: 0x5b8de8, center: 0x2f5fb8, price: 4 },
] as const

export const ACCESSORIES = [
  'sunglasses',
  'headphones',
  'a straw hat',
  'a flower crown',
  'bunny ears',
] as const

export type Flower = (typeof FLOWERS)[number]

export const flowerOf = (kind: number): Flower => FLOWERS[kind % FLOWERS.length] ?? FLOWERS[0]

export const freshGarden = (): Garden => ({
  plots: Array.from({ length: PLOT_COUNT }, () => ({ stage: 0, kind: 0, thirst: 0 })),
  basket: [],
  planted: 0,
  chores: 0,
})

export const RESTING: Job = { kind: 'resting', plot: 0, flower: 0, stage: 0, count: 0, earned: 0, sold: [], from: 0 }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export const isGarden = (value: unknown): value is Garden =>
  isObject(value) &&
  Array.isArray(value.plots) &&
  value.plots.length === PLOT_COUNT &&
  value.plots.every(isObject) &&
  Array.isArray(value.basket) &&
  value.basket.every(kind => typeof kind === 'number') &&
  typeof value.planted === 'number'

const numberOr = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback)

const loadPlot = (saved: Partial<Plot>): Plot => ({
  stage: numberOr(saved.stage, 0),
  kind: numberOr(saved.kind, 0),
  thirst: numberOr(saved.thirst, 0),
})

export const loadGarden = (saved: unknown): Garden | null => {
  if (!isGarden(saved)) return null
  return {
    plots: saved.plots.map(loadPlot),
    basket: saved.basket,
    planted: saved.planted,
    chores: numberOr(saved.chores, 0),
  }
}

const JOB_KINDS: readonly Job['kind'][] = ['resting', 'planting', 'watering', 'harvesting', 'storing', 'selling']

export const loadJob = (saved: unknown): Job => {
  if (!isObject(saved) || !JOB_KINDS.includes(saved.kind as Job['kind'])) return RESTING
  if (saved.kind === 'harvesting' && saved.from === undefined) return { ...RESTING, plot: numberOr(saved.plot, 0) }
  return {
    kind: saved.kind as Job['kind'],
    plot: numberOr(saved.plot, 0),
    flower: numberOr(saved.flower, 0),
    stage: numberOr(saved.stage, 0),
    count: numberOr(saved.count, 0),
    earned: numberOr(saved.earned, 0),
    from: numberOr(saved.from, numberOr(saved.stage, 0)),
    sold: Array.isArray(saved.sold) ? saved.sold.filter((kind): kind is number => typeof kind === 'number') : [],
  }
}

export const scramble = (n: number): number => {
  let x = (n ^ 0x9e3779b9) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0
  return (x ^ (x >>> 16)) >>> 0
}

export const hourOf = (now: number): number => Math.floor(now / HOUR)

export const accessoryFor = (hour: number): number => {
  const pick = scramble(hour) % ACCESSORIES.length
  const previous = scramble(hour - 1) % ACCESSORIES.length
  return pick === previous ? (pick + 1) % ACCESSORIES.length : pick
}

const isGrowing = (plot: Plot): boolean => plot.stage > 0 && plot.stage < BLOOM

const tend = (plots: Plot[], index: number, plot: Omit<Plot, 'thirst'>): Plot[] =>
  plots.map((one, i) => {
    if (i === index) return { ...plot, thirst: 0 }
    return isGrowing(one) ? { ...one, thirst: one.thirst + 1 } : one
  })

const STALL_SPOT = PLOT_COUNT

const spotOf = (job: Job): number => (job.plot < 0 ? STALL_SPOT : job.plot)

export type Help = { job: Job; busy?: readonly number[]; isStallBusy?: boolean; held?: number }

export type Chore = { garden: Garden; job: Job; earned: number }

const isBesideBusy = (i: number, busy: readonly number[]): boolean => busy.some(plot => Math.abs(plot - i) === 1)

const nearest = (plots: Plot[], from: number, busy: readonly number[], wanted: (plot: Plot) => boolean): number => {
  const open = plots.flatMap((plot, i) => (wanted(plot) && !busy.includes(i) ? [i] : []))
  const apart = open.filter(i => !isBesideBusy(i, busy))
  const choices = apart.length > 0 ? apart : open
  return choices.reduce((best, i) => (best < 0 || Math.abs(i - from) < Math.abs(best - from) ? i : best), -1)
}

export const THIRSTY = 8

const seedOf = (garden: Garden): number => scramble(garden.chores + 0x51ed)

const NEARBY = 1.5
const WHIM = 200
const CROWDED = 4

const thirstOf = (plot: Plot): number => (plot.thirst === 0 ? -THIRSTY : plot.thirst)

const needOf = (plot: Plot, i: number, from: number, seed: number): number =>
  thirstOf(plot) - Math.abs(i - from) * NEARBY + (scramble(seed * PLOT_COUNT + i) % WHIM) / 100

const thirstiest = (garden: Garden, from: number, busy: readonly number[]): number => {
  const seed = seedOf(garden)
  const needs = garden.plots.map((plot, i) =>
    busy.includes(i) ? -Infinity : needOf(plot, i, from, seed) - (isBesideBusy(i, busy) ? CROWDED : 0),
  )
  const best = Math.max(...needs)
  return best === -Infinity ? -1 : needs.indexOf(best)
}

const job = (kind: Job['kind'], details: Partial<Omit<Job, 'kind'>> = {}): Job => ({
  kind,
  plot: 0,
  flower: 0,
  stage: 0,
  count: 0,
  earned: 0,
  sold: [],
  from: 0,
  ...details,
})

const done = (garden: Garden, chore: Job, earned = 0): Chore => ({ garden, job: chore, earned })

const water = (garden: Garden, index: number): Chore => {
  const plot = garden.plots[index] ?? { stage: 1, kind: 0 }
  const stage = plot.stage + (scramble(seedOf(garden) + index) % 3 !== 0 ? 1 : 0)
  return done(
    { ...garden, plots: tend(garden.plots, index, { stage, kind: plot.kind }) },
    job('watering', { plot: index, flower: plot.kind, stage, from: plot.stage }),
  )
}

const rainOn = (garden: Garden): Garden => {
  const growing = garden.plots.flatMap((plot, i) => (isGrowing(plot) ? [i] : []))
  const soaked = growing[seedOf(garden) % Math.max(growing.length, 1)]
  return {
    ...garden,
    plots: garden.plots.map((plot, i) =>
      isGrowing(plot) ? { ...plot, stage: plot.stage + (i === soaked ? 1 : 0), thirst: 0 } : plot,
    ),
  }
}

const rest = (garden: Garden, previous: Job): Chore => done(garden, job('resting', { plot: previous.plot }))

const store = (garden: Garden, picked: Job): Chore =>
  done({ ...garden, basket: [...garden.basket, picked.flower] }, job('storing', { plot: -1, flower: picked.flower }))

export const work = (previous: Garden, condition: Condition | null, help: Help): Chore => {
  const busy = help.busy ?? []
  const isRaining = condition === 'rainy'
  const chored = { ...previous, chores: previous.chores + 1 }
  if (help.job.kind === 'harvesting') return store(isRaining ? rainOn(chored) : chored, help.job)
  if (condition === 'snowy') return rest(previous, help.job)
  const garden = isRaining ? rainOn(chored) : chored
  const { plots, basket } = garden
  const from = spotOf(help.job)
  const isBasketFull = basket.length >= BASKET_SIZE

  if (isBasketFull && !help.isStallBusy) {
    const earned = basket.reduce((sum, kind) => sum + flowerOf(kind).price, 0)
    return done(
      { ...garden, basket: [] },
      job('selling', { plot: -1, count: basket.length, earned, sold: basket }),
      earned,
    )
  }

  const parched = nearest(plots, from, busy, plot => isGrowing(plot) && plot.thirst >= THIRSTY)
  if (parched >= 0) return water(garden, parched)

  const ripe = basket.length + (help.held ?? 0) >= BASKET_SIZE ? -1 : nearest(plots, from, busy, plot => plot.stage >= BLOOM)
  if (ripe >= 0) {
    const kind = plots[ripe]?.kind ?? 0
    return done(
      { ...garden, plots: tend(plots, ripe, { stage: 0, kind }) },
      job('harvesting', { plot: ripe, flower: kind, stage: BLOOM, from: BLOOM }),
    )
  }

  const empty = nearest(plots, from, busy, plot => plot.stage === 0)
  if (empty >= 0) {
    const kind = scramble(garden.planted) % FLOWERS.length
    return done(
      { ...garden, plots: tend(plots, empty, { stage: 1, kind }), planted: garden.planted + 1 },
      job('planting', { plot: empty, flower: kind, stage: 1, from: 0 }),
    )
  }

  const thirsty = isRaining ? -1 : thirstiest(garden, from, busy)
  return thirsty >= 0 ? water(garden, thirsty) : rest(garden, help.job)
}

export const MAX_SCENE_COLUMNS = 68
export const MIN_SCENE_COLUMNS = 56
export const SCENE_ROWS = 6
const PIXEL_ROWS = SCENE_ROWS * 2
const DEFAULT = 0x01000000
const ORANGE = 0xd97757
const EYE = 0x2b1d17
const GRASS = 0x5a9e3e
const TILLED = 0x5c3b22
const SOIL = 0x7a4f2e
const STEM = 0x4caf50
const LEAF = 0x7ccf5a
const SEED = 0x8a5a33
const WOOD = 0x8b5a2b
const COUNTER = 0xa0703c
const AWNING = [0xd94f4f, 0xece2d0] as const
const GOLD = 0xf2c84b
const WATER = 0x4fa3e0
const PINK = 0xf4a3b5
const HOT_PINK = 0xc94f7c
const BUNNY = 0xf8f4ee
const SHADES = 0x15151c
const CAN = 0x7f97a8
const STALL_COLUMNS = 11
const FIRST_PLOT = 16
const BODY_TOP = 4

export const sceneWidth = (columns: number): number =>
  Math.max(MIN_SCENE_COLUMNS, Math.min(MAX_SCENE_COLUMNS, columns))

const stallX = (width: number): number => width - STALL_COLUMNS

const basketX = (width: number): number => stallX(width) - 9

export const plotX = (plot: number, width: number): number => {
  const spacing = Math.floor((basketX(width) - 4 - FIRST_PLOT) / (PLOT_COUNT - 1))
  return FIRST_PLOT + plot * Math.max(4, Math.min(7, spacing))
}

export const basketSpot = (width: number): number => basketX(width) - 9

export const spotFor = (job: Job, current: number, width: number): number => {
  if (job.kind === 'resting') return current
  if (job.kind === 'selling') return stallX(width) - 9
  if (job.kind === 'storing') return basketSpot(width)
  return plotX(job.plot, width) - 12
}

export type Claude = {
  x: number
  target: number
  facing: number
  accessory: number
  job: Job
  isWorking: boolean
  isCarrying?: boolean
  settled?: number | null
  phase?: number
}

export type Pace = { key: string; isCarrying: boolean; arrivedAt: number | null }

export const freshPace = (key: string): Pace => ({ key, isCarrying: false, arrivedAt: null })

export const choreGoal = (job: Job, isCarrying: boolean, x: number, width: number): number =>
  job.kind === 'selling' && !isCarrying ? basketSpot(width) : spotFor(job, x, width)

export const stepPace = (pace: Pace, job: Job, isBusy: boolean, x: number, frame: number, width: number): Pace => {
  if (!isBusy || job.kind === 'resting') return pace
  const isCarrying = pace.isCarrying || (job.kind === 'selling' && x === basketSpot(width))
  const isThere = x === choreGoal(job, isCarrying, x, width)
  return { key: pace.key, isCarrying, arrivedAt: pace.arrivedAt ?? (isThere ? frame : null) }
}

export const WANDER_MS = 12_000
const WANDER_LOOKBACK = 8
const WANDER_EDGE = 9

const isWanderWindow = (seed: number, window: number): boolean => scramble(seed * 31 + window) % 2 === 0

const wanderSpot = (seed: number, window: number, width: number): number => {
  const last = stallX(width) - 13
  return WANDER_EDGE + (scramble(seed * 131 + window * 7919) % Math.max(1, last - WANDER_EDGE + 1))
}

export const wanderGoal = (seed: number, now: number, width: number, home: number): number => {
  const window = Math.floor(now / WANDER_MS)
  for (let back = 0; back < WANDER_LOOKBACK; back += 1) {
    if (isWanderWindow(seed, window - back)) return wanderSpot(seed, window - back, width)
  }
  return home
}

export const phaseOf = (id: string): number => seedOfId(id) % IDLE_CYCLE

export const seedOfId = (id: string): number => [...id].reduce((hash, char) => scramble(hash ^ (char.codePointAt(0) ?? 0)), 7)

export type Scene = {
  garden: Garden
  coins: number
  claudes: readonly Claude[]
  frame: number
  width: number
  weather?: Condition | null
  isNight?: boolean
}

type Actor = Claude & { frame: number; width: number }

type Canvas = {
  pixels: Uint32Array
  width: number
  set: (x: number, y: number, color: number) => void
  under: (x: number, y: number, color: number) => void
}

const canvas = (width: number): Canvas => {
  const pixels = new Uint32Array(width * PIXEL_ROWS).fill(DEFAULT)
  const isInside = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < PIXEL_ROWS
  const set = (x: number, y: number, color: number) => {
    if (isInside(x, y)) pixels[y * width + x] = color
  }
  const under = (x: number, y: number, color: number) => {
    if (isInside(x, y) && pixels[y * width + x] === DEFAULT) pixels[y * width + x] = color
  }
  return { pixels, width, set, under }
}

const span = ({ set }: Canvas, from: number, to: number, y: number, color: number) => {
  for (let x = from; x <= to; x += 1) set(x, y, color)
}

const paintGround = (c: Canvas) => {
  span(c, 0, c.width - 1, 10, GRASS)
  span(c, 0, c.width - 1, 11, SOIL)
  const half = plotX(1, c.width) - plotX(0, c.width) >= 6 ? 2 : 1
  for (let plot = 0; plot < PLOT_COUNT; plot += 1) {
    span(c, plotX(plot, c.width) - half, plotX(plot, c.width) + half, 10, TILLED)
  }
}

const SUN = 0xf7c531
const SUN_CORE = 0xfde68a
const SUN_EDGE = 0xe0a92a
const RAY = 0xf9d65c
const CLOUD = [0xd9dce4, 0xb9bec9] as const
const STORM_CLOUD = [0x9aa0ad, 0x7f8594] as const
const RAIN = [0x4fa3e0, 0x9fd0f5] as const
const SNOW = 0xf4f6fb
const SNOW_SHADE = 0xd6e2f0
const MOON = 0xe8d890
const MOON_SHADE = 0xb8a868
const STAR = GOLD
const STAR_DIM = 0x8f96b8

const SUN_DISC = [
  [3, 5],
  [2, 6],
  [2, 6],
  [2, 6],
  [3, 5],
] as const
const SUN_LIGHT = [[3, 1], [4, 1], [3, 2]] as const
const SUN_SHADOW = [[6, 3], [5, 4], [4, 4]] as const
const STRAIGHT_RAYS = [[0, 2], [8, 2]] as const
const SLANTED_RAYS = [[1, 5], [7, 5], [0, 0], [8, 0]] as const

const paintSun = (c: Canvas, frame: number) => {
  SUN_DISC.forEach(([from, to], y) => span(c, from, to, y, SUN))
  SUN_LIGHT.forEach(([x, y]) => c.set(x, y, SUN_CORE))
  SUN_SHADOW.forEach(([x, y]) => c.set(x, y, SUN_EDGE))
  const rays = Math.floor(frame / 4) % 2 === 0 ? STRAIGHT_RAYS : SLANTED_RAYS
  rays.forEach(([x, y]) => c.set(x, y, RAY))
}

const MOON_SHAPE = [
  [4, 6],
  [3, 5],
  [2, 4],
  [2, 4],
  [3, 5],
  [4, 6],
] as const
const MOON_RIM = [[6, 0], [5, 1], [4, 2], [4, 3], [5, 4], [6, 5]] as const

const paintMoon = (c: Canvas) => {
  MOON_SHAPE.forEach(([from, to], y) => span(c, from, to, y, MOON))
  MOON_RIM.forEach(([x, y]) => c.set(x, y, MOON_SHADE))
}

const STAR_ROWS = 3
const STAR_SPACING = 9
const SKY_START = 10

const paintStars = ({ set, width }: Canvas, frame: number) => {
  const last = stallX(width) - 2
  for (let i = 0; SKY_START + i * STAR_SPACING < last; i += 1) {
    const x = SKY_START + i * STAR_SPACING + (scramble(i * 37 + 5) % (STAR_SPACING - 2))
    const y = scramble(i * 53 + 11) % STAR_ROWS
    if (x + 1 >= last) return
    const beat = (Math.floor(frame / 3) + (scramble(i * 71 + 3) % 8)) % 8
    if (beat === 0) {
      set(x, y, STAR)
      set(x - 1, y, STAR_DIM)
      set(x + 1, y, STAR_DIM)
      set(x, y + 1, STAR_DIM)
    } else set(x, y, beat < 5 && beat % 2 === 0 ? STAR : STAR_DIM)
  }
}

const paintNight = (c: Canvas, frame: number) => {
  paintStars(c, frame)
  paintMoon(c)
}

const paintCloud = (c: Canvas, x: number, y: number, [top, bottom]: readonly [number, number]) => {
  span(c, x + 1, x + 2, y, top)
  span(c, x + 4, x + 5, y, top)
  span(c, x, x + 6, y + 1, bottom)
}

const paintClouds = (c: Canvas, frame: number, colors: readonly [number, number]) => {
  const drift = Math.floor(frame / 4)
  const lane = c.width + 9
  paintCloud(c, ((drift + 7) % lane) - 7, 0, colors)
  paintCloud(c, ((drift + Math.floor(lane / 2)) % lane) - 7, 1, colors)
}

const FALL_ROWS = 7

const fallSpot = (width: number, seed: number, phase: number): { x: number; y: number } => ({
  x: scramble(seed * 7919 + Math.floor(phase / FALL_ROWS)) % width,
  y: 3 + (phase % FALL_ROWS),
})

const isUnderAwning = (x: number, y: number, width: number): boolean => x >= stallX(width) && y >= 3

const paintRain = ({ set, width }: Canvas, frame: number) => {
  for (let i = 0; i < Math.floor(width / 12); i += 1) {
    const { x, y } = fallSpot(width, i + 1, frame + i * 3)
    if (isUnderAwning(x, y, width)) continue
    set(x, y, RAIN[0])
    set(x, y - 1, RAIN[1])
  }
}

const paintSnowfall = ({ set, width }: Canvas, frame: number) => {
  for (let i = 0; i < Math.floor(width / 10); i += 1) {
    const { x, y } = fallSpot(width, i + 101, Math.floor(frame / 3) + i * 3)
    const sway = Math.floor((frame + i * 2) / 6) % 2
    if (!isUnderAwning((x + sway) % width, y, width)) set((x + sway) % width, y, i % 2 === 0 ? SNOW : SNOW_SHADE)
  }
}

const paintSky = (c: Canvas, weather: Condition, frame: number, isNight: boolean) => {
  if (weather === 'sunny') {
    if (isNight) paintNight(c, frame)
    else paintSun(c, frame)
  }
  if (weather === 'cloudy') paintClouds(c, frame, CLOUD)
  if (weather === 'rainy') {
    paintClouds(c, frame, STORM_CLOUD)
    paintRain(c, frame)
  }
  if (weather === 'snowy') {
    paintClouds(c, frame, CLOUD)
    paintSnowfall(c, frame)
  }
}

const paintSnowCover = (c: Canvas) => {
  for (let x = 0; x < c.width; x += 1) {
    if (x % 7 !== 3) c.set(x, 10, x % 2 === 0 ? SNOW_SHADE : SNOW)
  }
  const left = stallX(c.width)
  for (let x = left; x < c.width; x += 2) c.set(x, 2, SNOW)
}

const paintBloom = ({ set }: Canvas, x: number, y: number, flower: Flower) => {
  set(x, y, flower.center)
  set(x - 1, y, flower.petal)
  set(x + 1, y, flower.petal)
  set(x, y - 1, flower.petal)
  set(x, y + 1, flower.petal)
}

const paintPlot = (c: Canvas, plot: Plot, x: number) => {
  const { set } = c
  const flower = flowerOf(plot.kind)
  if (plot.stage === 1) {
    span(c, x - 1, x + 1, 9, SEED)
    return
  }
  if (plot.stage === 2) {
    set(x, 9, STEM)
    set(x, 8, STEM)
    set(x - 1, 7, LEAF)
    set(x + 1, 7, LEAF)
    return
  }
  if (plot.stage === 3) {
    for (let y = 6; y <= 9; y += 1) set(x, y, STEM)
    set(x - 1, 8, LEAF)
    set(x + 1, 7, LEAF)
    set(x, 5, flower.petal)
    return
  }
  if (plot.stage >= BLOOM) {
    for (let y = 5; y <= 9; y += 1) set(x, y, STEM)
    set(x - 1, 8, LEAF)
    set(x + 1, 7, LEAF)
    paintBloom(c, x, 3, flower)
  }
}

const WICKER = 0xc8955a
const WICKER_DARK = 0x9a6a3a
const WICKER_LIGHT = 0xe2b97e

const BASKET_COLUMNS = 7
const SLOTS = [
  [3, 0],
  [1, 1],
  [5, 1],
] as const

const slotOf = (index: number) => SLOTS[Math.min(index, SLOTS.length - 1)] ?? SLOTS[0]

const paintBouquet = (c: Canvas, x: number, top: number, flowers: readonly number[]) => {
  flowers.slice(0, SLOTS.length).forEach((kind, i) => {
    const [dx, dy] = slotOf(i)
    c.set(x + dx, top + dy + 3, STEM)
    paintBloom(c, x + dx, top + dy + 1, flowerOf(kind))
  })
}

const paintBasket = (c: Canvas, x: number, bottom: number, flowers: readonly number[]) => {
  const right = x + BASKET_COLUMNS - 1
  span(c, x + 1, right - 1, bottom - 6, WICKER_DARK)
  for (let y = bottom - 5; y <= bottom - 3; y += 1) {
    c.set(x, y, WICKER_DARK)
    c.set(right, y, WICKER_DARK)
  }
  paintBouquet(c, x, bottom - 6, flowers)
  span(c, x, right, bottom - 2, WICKER_LIGHT)
  for (let i = x; i <= right; i += 1) c.set(i, bottom - 1, (i - x) % 2 === 0 ? WICKER : WICKER_DARK)
  span(c, x + 1, right - 1, bottom, WICKER_DARK)
}

const paintCounterBasket = (c: Canvas, flowers: readonly number[]) => {
  const x = stallX(c.width) + 2
  flowers.slice(0, SLOTS.length).forEach((kind, i) => paintBloom(c, x + slotOf(i)[0], 5, flowerOf(kind)))
  span(c, x, x + BASKET_COLUMNS - 1, 6, WICKER)
  for (let i = x + 1; i < x + BASKET_COLUMNS - 1; i += 2) c.set(i, 6, WICKER_DARK)
}

const paintStall = (c: Canvas, coins: number, frame: number) => {
  const { set, width } = c
  const left = stallX(width)
  const center = left + 5
  for (let x = left; x < width; x += 1) {
    const isRed = (x - left) % 2 === 0
    set(x, 3, isRed ? AWNING[0] : AWNING[1])
    if (isRed) set(x, 4, AWNING[0])
  }
  for (let y = 5; y <= 9; y += 1) {
    set(left + 1, y, WOOD)
    set(width - 2, y, WOOD)
  }
  span(c, left, width - 1, 7, COUNTER)
  if (coins > 0) set(center, 1 + (frame % 8 < 4 ? 0 : 1), GOLD)
}

const LEGS = [
  [1, 3, 5, 7],
  [2, 4, 6],
] as const

const IDLE_CYCLE = 40
const CHORE_CYCLE = 6
const DROP_FRAMES = 6
const CLOSED_EYE = 0xa9553c
const NOTE_COLORS = [0xf07fa8, 0x5b8de8, GOLD] as const
const BUTTERFLY_PATH = [
  [9, -3],
  [10, -4],
  [11, -3],
  [11, -2],
  [10, -1],
  [9, -2],
] as const
const CROWN = [0xf07fa8, STEM, GOLD, STEM, 0xf5f5f0, STEM, 0xa77bd6] as const

export type Pose = {
  hop: boolean
  squash: boolean
  isBlinking: boolean
  look: number
  armsUp: boolean
  step: number
}

const isWalkingIn = (claude: Claude): boolean => claude.target !== claude.x

const sinceArrival = (claude: Claude): number | null =>
  claude.settled !== undefined ? claude.settled : isWalkingIn(claude) ? null : Infinity

const isOnTheWay = (claude: Claude): boolean => claude.isWorking && sinceArrival(claude) === null

const isDropping = (claude: Claude): boolean => {
  const since = sinceArrival(claude)
  return claude.job.kind === 'storing' && (isOnTheWay(claude) || (since !== null && since < DROP_FRAMES))
}

const isAtWork = (actor: Actor): boolean => isChoringIn(actor) || (actor.isWorking && actor.job.kind === 'storing')

const isChoringIn = (actor: Actor): boolean => {
  const since = sinceArrival(actor)
  if (!actor.isWorking || actor.job.kind === 'resting' || isWalkingIn(actor) || since === null) return false
  return actor.job.kind !== 'storing' || since < DROP_FRAMES
}

const idlePose = (actor: Actor): Pose => {
  const cycle = actor.frame % IDLE_CYCLE
  const isGrooving = ACCESSORIES[actor.accessory] === 'headphones'
  return {
    hop: false,
    squash: isGrooving ? actor.frame % 4 < 2 : actor.frame % 8 >= 6,
    isBlinking: cycle === 10 || cycle === 30 || cycle === 32,
    look: cycle >= 14 && cycle < 20 ? -1 : cycle >= 20 && cycle < 26 ? 1 : 0,
    armsUp: false,
    step: 0,
  }
}

const chorePose = (actor: Actor): Pose => {
  const beat = actor.frame % CHORE_CYCLE
  const base = { hop: false, squash: false, isBlinking: false, look: 1, armsUp: false, step: 0 }
  switch (actor.job.kind) {
    case 'planting':
      return { ...base, squash: beat >= 2 && beat <= 4 }
    case 'watering':
      return { ...base, squash: beat >= 3, isBlinking: beat === 5 }
    case 'harvesting':
      return beat < 3
        ? { ...base, squash: true }
        : { ...base, hop: beat === 4 }
    case 'storing': {
      const since = sinceArrival(actor) ?? 0
      return { ...base, squash: since >= 2 && since < 4 }
    }
    case 'selling':
      return { ...base, hop: beat % 3 === 0, armsUp: true, look: 0 }
    default:
      return base
  }
}

export const poseFor = (actor: Actor): Pose => {
  if (isWalkingIn(actor)) {
    return {
      hop: false,
      squash: actor.frame % 4 >= 2,
      isBlinking: false,
      look: actor.facing,
      armsUp: false,
      step: actor.frame % 2,
    }
  }
  return isChoringIn(actor) ? chorePose(actor) : idlePose(actor)
}

const paintClaude = (c: Canvas, x: number, pose: Pose): number => {
  const { set } = c
  const top = BODY_TOP - (pose.hop ? 1 : 0)
  const head = top + (pose.squash ? 1 : 0)
  const arms = head + 2
  for (let y = head; y <= top + 4; y += 1) span(c, x + 1, x + 7, y, ORANGE)
  if (pose.armsUp) {
    for (const y of [head, head + 1]) {
      set(x, y, ORANGE)
      set(x + 8, y, ORANGE)
    }
  } else {
    set(x, arms, ORANGE)
    set(x + 8, arms, ORANGE)
  }
  const eyes = pose.look > 0 ? [3, 6] : pose.look < 0 ? [2, 5] : [2, 6]
  eyes.forEach(eye => set(x + eye, head + 1, pose.isBlinking ? CLOSED_EYE : EYE))
  const legs = LEGS[pose.step] ?? LEGS[0]
  legs.forEach(leg => set(x + leg, top + 5, ORANGE))
  return head
}

const blush = ({ set }: Canvas, x: number, head: number) => {
  set(x + 1, head + 2, PINK)
  set(x + 7, head + 2, PINK)
}

const bunnyEar = (c: Canvas, left: number, head: number, isFolded: boolean, outward: number) => {
  const { set } = c
  set(left, head - 1, BUNNY)
  set(left + 1, head - 1, PINK)
  set(left + 2, head - 1, BUNNY)
  if (isFolded) {
    const tip = outward < 0 ? left - 1 : left + 2
    span(c, tip, tip + 1, head - 2, BUNNY)
    return
  }
  for (const y of [head - 3, head - 2]) {
    set(left, y, BUNNY)
    set(left + 1, y, PINK)
    set(left + 2, y, BUNNY)
  }
  set(left + 1, head - 4, BUNNY)
}

const paintAccessory = (c: Canvas, x: number, head: number, actor: Actor) => {
  const { set } = c
  const { frame } = actor
  const cycle = frame % IDLE_CYCLE
  switch (ACCESSORIES[actor.accessory]) {
    case 'sunglasses': {
      for (const lens of [x + 1, x + 5]) {
        span(c, lens, lens + 2, head + 1, SHADES)
        span(c, lens, lens + 2, head + 2, SHADES)
      }
      set(x + 4, head + 1, SHADES)
      set(x, head + 1, SHADES)
      set(x + 8, head + 1, SHADES)
      const sweep = cycle % 20
      const glint = sweep < 6 ? sweep : 0
      set(x + 1 + glint + (glint >= 3 ? 1 : 0), head + 1, 0xffffff)
      return
    }
    case 'headphones': {
      span(c, x + 1, x + 7, head - 2, 0xe8e4f0)
      set(x, head - 1, 0xe8e4f0)
      set(x + 8, head - 1, 0xe8e4f0)
      for (const y of [head, head + 1]) {
        set(x - 1, y, HOT_PINK)
        set(x, y, 0xf07fa8)
        set(x + 8, y, 0xf07fa8)
        set(x + 9, y, HOT_PINK)
      }
      const rise = frame % 6
      if (rise < 4 && !isAtWork(actor)) {
        const color = NOTE_COLORS[Math.floor(frame / 6) % NOTE_COLORS.length] ?? GOLD
        set(x + 10, head - rise, color)
        set(x + 11, head - rise - 1, color)
      }
      return
    }
    case 'a straw hat': {
      span(c, x, x + 8, head - 1, 0xe7c36a)
      span(c, x + 2, x + 6, head - 2, 0xd94f4f)
      span(c, x + 3, x + 5, head - 3, 0xd9b45a)
      if (isAtWork(actor)) return
      const [dx, dy] = BUTTERFLY_PATH[Math.floor(frame / 2) % BUTTERFLY_PATH.length] ?? [9, -3]
      set(x + dx, head + dy, 0x5b8de8)
      if (frame % 2 === 0) set(x + dx + 1, head + dy, 0x8fb4f0)
      return
    }
    case 'a flower crown': {
      const turn = Math.floor(frame / 3)
      for (let i = 0; i < CROWN.length; i += 1) {
        set(x + 1 + i, head - 1, CROWN[(i + turn) % CROWN.length] ?? GOLD)
      }
      if (frame % 4 === 0) set(x + 1 + ((frame * 3) % CROWN.length), head - 2, 0xffffff)
      return
    }
    case 'bunny ears':
      bunnyEar(c, x + 1, head, cycle >= 24 && cycle < 27, -1)
      bunnyEar(c, x + 5, head, cycle >= 34 && cycle < 37, 1)
      blush(c, x, head)
      return
  }
}

const paintChore = (c: Canvas, actor: Actor, head: number) => {
  const { set } = c
  const { x, frame, job } = actor
  const beat = frame % CHORE_CYCLE
  switch (job.kind) {
    case 'planting': {
      const arc = [
        [9, head + 2],
        [10, head + 1],
        [11, head + 2],
        [12, 7],
        [12, 8],
        [12, 9],
      ] as const
      const [dx, y] = arc[beat] ?? [12, 9]
      set(x + dx, y, SEED)
      return
    }
    case 'watering': {
      const isTilted = beat >= 3
      span(c, x + 9, x + 10, 6, CAN)
      span(c, x + 9, x + 10, 7, CAN)
      set(x + 11, isTilted ? 7 : 6, CAN)
      if (isTilted) {
        c.under(x + 12, 7 + (frame % 3), WATER)
        c.under(x + 13, 8 + ((frame + 1) % 2), WATER)
      }
      return
    }
    case 'harvesting':
      if (beat < 3) {
        set(x + 9, 7, STEM)
        set(x + 9, 6, flowerOf(job.flower).petal)
      } else paintHeld(c, x + 9, head, job.flower)
      return
    case 'storing':
      if ((sinceArrival(actor) ?? 0) < 2) {
        set(x + 9, head + 1, STEM)
        paintHeld(c, x + 9, head - 1, job.flower)
      }
      return
    case 'selling':
      set(x + 8, head - 2 - (frame % 3), GOLD)
      return
  }
}

const paintHeld = (c: Canvas, hand: number, head: number, kind: number) => {
  c.set(hand, head + 1, STEM)
  paintBloom(c, hand, head - 1, flowerOf(kind))
}

const handOf = (actor: Actor): number => (actor.facing < 0 ? actor.x - 1 : actor.x + 9)

const paintCarried = (c: Canvas, actor: Actor, head: number) => {
  const { job } = actor
  if (job.kind === 'storing' && isOnTheWay(actor)) paintHeld(c, handOf(actor), head, job.flower)
  if (job.kind === 'harvesting' && !isOnTheWay(actor) && !isChoringIn(actor)) paintHeld(c, handOf(actor), head, job.flower)
  if (job.kind === 'selling' && actor.isCarrying && actor.isWorking && isWalkingIn(actor)) {
    paintBasket(c, actor.facing < 0 ? actor.x - BASKET_COLUMNS : actor.x + 8, head + 4, job.sold)
  }
}

const PLOT_CHORES: readonly Job['kind'][] = ['planting', 'watering', 'harvesting']

const shownPlots = (garden: Garden, claudes: readonly Claude[]): Plot[] =>
  garden.plots.map((plot, i) => {
    const coming = claudes.find(claude => isOnTheWay(claude) && claude.job.plot === i && PLOT_CHORES.includes(claude.job.kind))
    return coming ? { ...plot, stage: coming.job.from ?? coming.job.stage, kind: coming.job.flower } : plot
  })

const withoutOnce = (flowers: readonly number[], taken: readonly number[]): number[] =>
  taken.reduce((left, kind) => {
    const at = left.lastIndexOf(kind)
    return at < 0 ? left : [...left.slice(0, at), ...left.slice(at + 1)]
  }, [...flowers])

type Baskets = { home: readonly number[] | null; counter: readonly number[] | null }

const basketsOf = (garden: Garden, claudes: readonly Claude[]): Baskets => {
  const seller = claudes.find(claude => claude.isWorking && claude.job.kind === 'selling')
  const coming = claudes.filter(isDropping).map(claude => claude.job.flower)
  const stored = withoutOnce(garden.basket, coming)
  if (!seller) return { home: stored, counter: null }
  if (!seller.isCarrying) return { home: [...seller.job.sold, ...stored], counter: null }
  return {
    home: stored.length > 0 || coming.length > 0 ? stored : null,
    counter: isWalkingIn(seller) ? null : seller.job.sold,
  }
}

const paintFalling = (c: Canvas, claude: Claude, home: readonly number[]) => {
  const since = sinceArrival(claude)
  if (claude.job.kind !== 'storing' || since === null || since < 2 || since >= DROP_FRAMES) return
  const [dx, dy] = slotOf(home.length)
  const x = basketX(c.width) + (since === 2 ? Math.round(dx / 2) : dx)
  paintBloom(c, x, since === 5 ? 4 + dy : since, flowerOf(claude.job.flower))
}

export const paint = (scene: Scene): Uint32Array => {
  const c = canvas(scene.width)
  const { garden } = scene
  const weather = scene.weather ?? null
  if (weather) paintSky(c, weather, scene.frame, scene.isNight ?? false)
  paintGround(c)
  shownPlots(garden, scene.claudes).forEach((plot, i) => paintPlot(c, plot, plotX(i, scene.width)))
  paintStall(c, scene.coins, scene.frame)
  const baskets = basketsOf(garden, scene.claudes)
  const paintHome = () => {
    if (baskets.home) paintBasket(c, basketX(scene.width), 9, baskets.home)
    scene.claudes.forEach(claude => paintFalling(c, claude, baskets.home ?? []))
  }
  const isSellerAtStall = baskets.counter !== null
  if (!isSellerAtStall) paintHome()
  if (baskets.counter) paintCounterBasket(c, baskets.counter)
  if (weather === 'snowy') paintSnowCover(c)
  scene.claudes.forEach(claude => {
    const actor = { ...claude, frame: scene.frame + (claude.phase ?? 0), width: scene.width }
    const head = paintClaude(c, actor.x, poseFor(actor))
    paintAccessory(c, actor.x, head, actor)
    if (isChoringIn(actor)) paintChore(c, actor, head)
    paintCarried(c, actor, head)
  })
  if (isSellerAtStall) paintHome()
  return c.pixels
}

const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const FULL = 0x2588
const SPACE = 0x20

export const toCells = (pixels: Uint32Array, width: number): Uint32Array => {
  const words = new Uint32Array(width * SCENE_ROWS * 3)
  for (let row = 0; row < SCENE_ROWS; row += 1) {
    for (let x = 0; x < width; x += 1) {
      const top = pixels[row * 2 * width + x] ?? DEFAULT
      const bottom = pixels[(row * 2 + 1) * width + x] ?? DEFAULT
      const at = (row * width + x) * 3
      const cell =
        top === DEFAULT && bottom === DEFAULT
          ? [SPACE, DEFAULT, DEFAULT]
          : top === bottom
            ? [FULL, top, DEFAULT]
            : top === DEFAULT
              ? [LOWER_HALF, bottom, DEFAULT]
              : [UPPER_HALF, top, bottom]
      words.set(cell, at)
    }
  }
  return words
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export const toBase64 = (bytes: Uint8Array): string => {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += ALPHABET[(n >> 18) & 63]
    out += ALPHABET[(n >> 12) & 63]
    out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : '='
    out += i + 2 < bytes.length ? ALPHABET[n & 63] : '='
  }
  return out
}

export const sceneCells = (scene: Scene): string =>
  toBase64(new Uint8Array(toCells(paint(scene), scene.width).buffer))
