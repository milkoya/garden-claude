import type { Garden, Job, Plot } from '../types'

export const HOUR = 3_600_000
export const PLOT_COUNT = 5
export const BASKET_SIZE = 3
export const BLOOM = 4

export const FLOWERS = [
  { name: 'daisy', petal: 0xf5f5f0, center: 0xf2c84b, price: 2 },
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
  plots: Array.from({ length: PLOT_COUNT }, () => ({ stage: 0, kind: 0 })),
  basket: [],
  coins: 0,
  planted: 0,
  job: { kind: 'resting', plot: 0, label: 'waiting for work' },
})

export const isGarden = (value: unknown): value is Garden => {
  const garden = value as Garden | null
  return (
    typeof garden === 'object' &&
    garden !== null &&
    Array.isArray(garden.plots) &&
    garden.plots.length === PLOT_COUNT &&
    Array.isArray(garden.basket) &&
    typeof garden.coins === 'number' &&
    typeof garden.planted === 'number' &&
    typeof garden.job === 'object'
  )
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

const withPlot = (plots: Plot[], index: number, plot: Plot): Plot[] =>
  plots.map((one, i) => (i === index ? plot : one))

const job = (kind: Job['kind'], plot: number, label: string): Job => ({ kind, plot, label })

export const work = (garden: Garden): Garden => {
  const { plots, basket } = garden

  if (basket.length >= BASKET_SIZE) {
    const earned = basket.reduce((sum, kind) => sum + flowerOf(kind).price, 0)
    return {
      ...garden,
      basket: [],
      coins: garden.coins + earned,
      job: job('selling', -1, `selling ${basket.length} flowers for ${earned} coins`),
    }
  }

  const ripe = plots.findIndex(plot => plot.stage >= BLOOM)
  if (ripe >= 0) {
    const kind = plots[ripe]?.kind ?? 0
    return {
      ...garden,
      plots: withPlot(plots, ripe, { stage: 0, kind }),
      basket: [...basket, kind],
      job: job('harvesting', ripe, `picking a ${flowerOf(kind).name}`),
    }
  }

  const empty = plots.findIndex(plot => plot.stage === 0)
  if (empty >= 0) {
    const kind = scramble(garden.planted) % FLOWERS.length
    return {
      ...garden,
      plots: withPlot(plots, empty, { stage: 1, kind }),
      planted: garden.planted + 1,
      job: job('planting', empty, `planting a ${flowerOf(kind).name} seed`),
    }
  }

  const thirsty = plots.reduce(
    (best, plot, i) => (plot.stage < (plots[best]?.stage ?? BLOOM) ? i : best),
    0,
  )
  const plot = plots[thirsty] ?? { stage: 1, kind: 0 }
  return {
    ...garden,
    plots: withPlot(plots, thirsty, { ...plot, stage: plot.stage + 1 }),
    job: job('watering', thirsty, `watering the ${flowerOf(plot.kind).name}`),
  }
}

export const MAX_SCENE_COLUMNS = 60
export const MIN_SCENE_COLUMNS = 46
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
const AWNING = [0xd94f4f, 0xf4efe6] as const
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

export const plotX = (plot: number, width: number): number => {
  const spacing = Math.floor((stallX(width) - 4 - FIRST_PLOT) / (PLOT_COUNT - 1))
  return FIRST_PLOT + plot * Math.max(4, Math.min(7, spacing))
}

export const spotFor = (job: Job, current: number, width: number): number => {
  if (job.kind === 'resting') return current
  if (job.kind === 'selling') return stallX(width) - 11
  return plotX(job.plot, width) - 12
}

export type Scene = {
  garden: Garden
  accessory: number
  claudeX: number
  facing: number
  frame: number
  isWorking: boolean
  width: number
}

type Canvas = { pixels: Uint32Array; width: number; set: (x: number, y: number, color: number) => void }

const canvas = (width: number): Canvas => {
  const pixels = new Uint32Array(width * PIXEL_ROWS).fill(DEFAULT)
  const set = (x: number, y: number, color: number) => {
    if (x >= 0 && x < width && y >= 0 && y < PIXEL_ROWS) {
      pixels[y * width + x] = color
    }
  }
  return { pixels, width, set }
}

const span = ({ set }: Canvas, from: number, to: number, y: number, color: number) => {
  for (let x = from; x <= to; x += 1) set(x, y, color)
}

const paintGround = (c: Canvas) => {
  span(c, 0, c.width - 1, 10, GRASS)
  span(c, 0, c.width - 1, 11, SOIL)
  for (let plot = 0; plot < PLOT_COUNT; plot += 1) {
    span(c, plotX(plot, c.width) - 2, plotX(plot, c.width) + 2, 10, TILLED)
  }
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

const paintStall = (c: Canvas, basket: number[], coins: number, frame: number) => {
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
  basket.forEach((kind, i) => set(center + i * 2 - (basket.length - 1), 6, flowerOf(kind).petal))
  if (coins > 0) set(center, 1 + (frame % 4 < 2 ? 0 : 1), GOLD)
}

const LEGS = [
  [1, 3, 5, 7],
  [2, 4, 6],
] as const

const IDLE_CYCLE = 40
const CHORE_CYCLE = 6
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

const isWalkingIn = (scene: Scene): boolean =>
  spotFor(scene.garden.job, scene.claudeX, scene.width) !== scene.claudeX

const isChoringIn = (scene: Scene): boolean => scene.isWorking && !isWalkingIn(scene)

const idlePose = (scene: Scene): Pose => {
  const cycle = scene.frame % IDLE_CYCLE
  const isGrooving = ACCESSORIES[scene.accessory] === 'headphones'
  return {
    hop: false,
    squash: isGrooving ? scene.frame % 4 < 2 : scene.frame % 8 >= 6,
    isBlinking: cycle === 10 || cycle === 30 || cycle === 32,
    look: cycle >= 14 && cycle < 20 ? -1 : cycle >= 20 && cycle < 26 ? 1 : 0,
    armsUp: false,
    step: 0,
  }
}

const chorePose = (scene: Scene): Pose => {
  const beat = scene.frame % CHORE_CYCLE
  const base = { hop: false, squash: false, isBlinking: false, look: 1, armsUp: false, step: 0 }
  switch (scene.garden.job.kind) {
    case 'planting':
      return { ...base, squash: beat >= 2 && beat <= 4 }
    case 'watering':
      return { ...base, squash: beat >= 3, isBlinking: beat === 5 }
    case 'harvesting':
      return beat < 3
        ? { ...base, squash: true }
        : { ...base, hop: beat === 4, armsUp: true, look: 0 }
    case 'selling':
      return { ...base, hop: beat % 2 === 0, armsUp: beat % 2 === 0, look: 0 }
    default:
      return base
  }
}

export const poseFor = (scene: Scene): Pose => {
  if (isWalkingIn(scene)) {
    return {
      hop: false,
      squash: scene.frame % 2 === 1,
      isBlinking: false,
      look: scene.facing,
      armsUp: false,
      step: scene.frame % 2,
    }
  }
  return isChoringIn(scene) ? chorePose(scene) : idlePose(scene)
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

const paintAccessory = (c: Canvas, x: number, head: number, scene: Scene) => {
  const { set } = c
  const { frame } = scene
  const cycle = frame % IDLE_CYCLE
  switch (ACCESSORIES[scene.accessory]) {
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
      if (rise < 4) {
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

const paintChore = (c: Canvas, scene: Scene, head: number) => {
  const { set } = c
  const { claudeX: x, frame, garden } = scene
  const beat = frame % CHORE_CYCLE
  switch (garden.job.kind) {
    case 'planting': {
      const arc = [
        [9, head + 2],
        [10, head + 1],
        [11, head + 2],
        [12, 7],
        [12, 8],
      ] as const
      const [dx, y] = arc[beat] ?? [12, 9]
      if (beat < arc.length) set(x + dx, y, SEED)
      return
    }
    case 'watering': {
      const isTilted = beat >= 3
      span(c, x + 9, x + 10, 6, CAN)
      span(c, x + 9, x + 10, 7, CAN)
      set(x + 11, isTilted ? 7 : 6, CAN)
      if (isTilted) {
        set(x + 12, 7 + (frame % 3), WATER)
        set(x + 13, 8 + ((frame + 1) % 2), WATER)
      }
      return
    }
    case 'harvesting': {
      const flower = flowerOf(garden.basket[garden.basket.length - 1] ?? 0)
      if (beat < 3) {
        set(x + 9, 7, STEM)
        set(x + 9, 6, flower.petal)
      } else {
        set(x + 4, head - 1, STEM)
        set(x + 4, head - 2, flower.petal)
        set(x + 3, head - 2, flower.petal)
        set(x + 5, head - 2, flower.petal)
      }
      return
    }
    case 'selling':
      set(x + 10, 5 - (frame % 4), GOLD)
      if (beat % 2 === 0) set(x + 11, 3 - (frame % 3), 0xffffff)
      return
  }
}

export const paint = (scene: Scene): Uint32Array => {
  const c = canvas(scene.width)
  const { garden } = scene
  paintGround(c)
  garden.plots.forEach((plot, i) => paintPlot(c, plot, plotX(i, scene.width)))
  paintStall(c, garden.basket, garden.coins, scene.frame)
  const head = paintClaude(c, scene.claudeX, poseFor(scene))
  paintAccessory(c, scene.claudeX, head, scene)
  if (isChoringIn(scene)) paintChore(c, scene, head)
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
