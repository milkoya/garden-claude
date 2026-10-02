import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import {
  ACCESSORIES,
  BASKET_SIZE,
  BLOOM,
  CLAUDE_GAP,
  FLOWERS,
  HOUR,
  PLOT_COUNT,
  RESTING,
  basketSpot,
  choreGoal,
  freshPace,
  stepPace,
  MAX_SCENE_COLUMNS,
  MIN_SCENE_COLUMNS,
  plotX,
  SCENE_ROWS,
  THIRSTY,
  accessoryFor,
  coinsText,
  dayOf,
  freshGarden,
  loadGarden,
  loadJob,
  paint,
  sceneCells,
  spotFor,
  spreadGoals,
  wanderGoal,
  seedOfId,
  WANDER_MS,
  todayIn,
  work,
} from '../hooks/garden'
import type { Pace, Scene } from '../hooks/garden'
import { BAR_CELLS, barCells, formatReset, prettyModel } from '../hooks/stats'
import {
  CAPTION_SEPARATOR,
  GAP,
  MAX_BAR_CELLS,
  STATS_BLOCK_COLUMNS,
  captionFor,
  displayWidth,
  fitCaption,
  layoutFor,
  lineWidth,
} from '../hooks/layout'
import type { Condition, Garden, Job, Member, Room, Usage } from '../types'
import { LANGUAGES, STRINGS, detectLanguage, doingText, parseLanguage } from '../hooks/i18n'
import { cityForZone } from '../hooks/places'
import { ZONES } from '../hooks/zones'

const CITIES = Object.keys(ZONES).flatMap(zone => cityForZone(zone) ?? [])
import { conditionFromCode, parseCondition, parseIsNight, weatherUrl } from '../hooks/weather'
import {
  FRUITS,
  GRACE_MS,
  SILENT_MS,
  awayOf,
  busyFor,
  createRoom,
  freeAccessories,
  isAbandoned,
  isClosed,
  freeCode,
  parseCode,
  refusalFor,
  tidy,
} from '../hooks/room'

const FULL_USAGE: Usage = {
  costUsd: 8.7,
  context: 32,
  five: { percent: 1, resetsAt: '2026-10-02T14:30:00Z' },
  week: { percent: 34, resetsAt: '2026-10-05T10:00:00Z' },
  model: 'Opus 5.5',
}

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 20,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

type Farm = Garden & { job: Job; coins: number }

const farm = (): Farm => ({ ...freshGarden(), job: RESTING, coins: 0 })

const step = (state: Farm, condition: Condition | null = null): Farm => {
  const { garden, job, earned } = work(state, condition, { job: state.job })
  return { ...garden, job, coins: state.coins + earned }
}

type Solo = {
  garden: Garden
  accessory: number
  claudeX: number
  facing: number
  isWorking: boolean
  width: number
  job?: Job
  coins?: number
  weather?: Condition | null
}

const solo = ({ garden, accessory, claudeX, facing, isWorking, width, job = RESTING, coins = 0, weather }: Solo, frame = 0): Scene => ({
  garden,
  coins,
  claudes: [{ x: claudeX, target: spotFor(job, claudeX, width), facing, accessory, job, isWorking }],
  frame,
  width,
  weather,
})

describe('the garden', () => {
  test('plants every plot first', async () => {
    let garden = farm()
    for (let i = 0; i < PLOT_COUNT; i += 1) {
      garden = step(garden)
      expect(garden.job.kind).toBe('planting')
    }
    expect(garden.plots.every(plot => plot.stage === 1)).toBe(true)
    expect(step(garden).job.kind).toBe('watering')
  })

  test('grows, harvests and sells flowers for coins', async () => {
    let garden = farm()
    const seen = new Set<string>()
    for (let i = 0; i < 200; i += 1) {
      garden = step(garden)
      seen.add(garden.job.kind)
      expect(garden.basket.length <= BASKET_SIZE).toBe(true)
      expect(garden.plots.every(plot => plot.stage <= BLOOM)).toBe(true)
    }
    expect([...seen].sort()).toEqual(['harvesting', 'planting', 'selling', 'storing', 'watering'])
    expect(garden.coins > 0).toBe(true)
  })

  test('keeps tending every plot, not just the first', async () => {
    let garden = farm()
    for (let i = 0; i < 100; i += 1) garden = step(garden)
    const watered = new Set<number>()
    const harvested = new Set<number>()
    for (let i = 0; i < 200; i += 1) {
      garden = step(garden)
      if (garden.job.kind === 'watering') watered.add(garden.job.plot)
      if (garden.job.kind === 'harvesting') harvested.add(garden.job.plot)
    }
    const everyPlot = Array.from({ length: PLOT_COUNT }, (_, plot) => plot)
    expect([...watered].sort()).toEqual(everyPlot)
    expect([...harvested].sort()).toEqual(everyPlot)
  })

  test('never leaves a flower waiting long', async () => {
    let garden = farm()
    for (let i = 0; i < 1000; i += 1) {
      garden = step(garden)
      expect(Math.max(...garden.plots.map(plot => plot.thirst)) <= THIRSTY).toBe(true)
    }
  })

  test('remembers how grown the flower is after each chore', async () => {
    let garden = farm()
    for (let i = 0; i < 500; i += 1) {
      garden = step(garden)
      const { kind, plot, stage } = garden.job
      if (kind === 'planting') expect(stage).toBe(1)
      if (kind === 'watering') expect(stage).toBe(garden.plots[plot]?.stage ?? -1)
      if (kind === 'harvesting') expect(stage).toBe(BLOOM)
    }
  })

  test('moves on after watering a flower', async () => {
    let garden = farm()
    for (let i = 0; i < 1000; i += 1) {
      const before = garden.job
      garden = step(garden)
      const isRepeat = before.kind === 'watering' && garden.job.kind === 'watering' && before.plot === garden.job.plot
      expect(isRepeat).toBe(false)
    }
  })

  test('lets the rain do the watering', async () => {
    let garden = farm()
    const seen = new Set<string>()
    for (let i = 0; i < 300; i += 1) {
      garden = step(garden, 'rainy')
      seen.add(garden.job.kind)
    }
    expect(seen.has('watering')).toBe(false)
    expect([...seen].sort()).toEqual(['harvesting', 'planting', 'resting', 'selling', 'storing'])
    expect(garden.coins > 0).toBe(true)
  })

  test('chills all day in the snow', async () => {
    let garden = farm()
    for (let i = 0; i < 40; i += 1) garden = step(garden)
    while (garden.job.kind !== 'harvesting') garden = step(garden)
    const stored = step(garden, 'snowy')
    expect(stored.job.kind).toBe('storing')
    expect(stored.basket).toEqual([...garden.basket, garden.job.flower])
    garden = stored
    const before = garden
    for (let i = 0; i < 50; i += 1) garden = step(garden, 'snowy')
    expect(garden.job.kind).toBe('resting')
    expect(garden.plots).toEqual(before.plots)
    expect(garden.basket).toEqual(before.basket)
    expect(garden.coins).toBe(before.coins)
    expect(garden.chores).toBe(before.chores)
  })

  test('tends the garden in a loose order, not a fixed loop', async () => {
    let garden = farm()
    const order: number[] = []
    for (let i = 0; i < 300; i += 1) {
      garden = step(garden)
      if (garden.job.kind === 'watering') order.push(garden.job.plot)
    }
    const steps = order.slice(1).map((plot, i) => (plot - (order[i] ?? 0) + PLOT_COUNT) % PLOT_COUNT)
    expect(new Set(steps).size > 2).toBe(true)
  })
})

describe('the accessory', () => {
  test('stays the same within an hour and changes every hour', async () => {
    const start = 490_000
    for (let hour = start; hour < start + 200; hour += 1) {
      const pick = accessoryFor(hour)
      expect(pick >= 0 && pick < ACCESSORIES.length).toBe(true)
      expect(accessoryFor(hour)).toBe(pick)
    }
    const picks = new Set(Array.from({ length: 200 }, (_, i) => accessoryFor(start + i)))
    expect(picks.size).toBe(ACCESSORIES.length)
  })
})

describe('the scene', () => {
  test('packs one cell per column and row', async () => {
    const cells = sceneCells(
      solo({ garden: freshGarden(), accessory: 0, claudeX: 4, facing: 0, isWorking: false, width: MAX_SCENE_COLUMNS }),
    )
    const bytes = MAX_SCENE_COLUMNS * SCENE_ROWS * 12
    expect(cells.length).toBe(Math.ceil(bytes / 3) * 4)
  })
})

const framesOf = (scene: Solo) => new Set(Array.from({ length: 40 }, (_, frame) => sceneCells(solo(scene, frame))))

describe('the animations', () => {
  test('every accessory moves while Claude idles', async () => {
    ACCESSORIES.forEach((_, accessory) => {
      const idle = { garden: freshGarden(), accessory, claudeX: 4, facing: 0, isWorking: false, width: MAX_SCENE_COLUMNS }
      expect(framesOf(idle).size > 2).toBe(true)
    })
  })

  test('every chore moves while Claude works', async () => {
    const kinds = ['planting', 'watering', 'harvesting', 'storing', 'selling'] as const
    for (const kind of kinds) {
      const garden = { ...freshGarden(), basket: [1] }
      const job = { kind, plot: kind === 'storing' || kind === 'selling' ? -1 : 0, flower: 1, stage: 0, count: 3, earned: 9, sold: [1, 2, 3] }
      const claudeX = spotFor(job, 4, MAX_SCENE_COLUMNS)
      const plain = ACCESSORIES.indexOf('a flower crown')
      expect(framesOf({ garden, job, accessory: plain, claudeX, facing: 1, isWorking: true, width: MAX_SCENE_COLUMNS }).size > 2).toBe(true)
    }
  })
})

describe('the stats', () => {
  test('names models the way the status line does', async () => {
    expect(prettyModel('claude-opus-5-5')).toBe('Opus 5.5')
    expect(prettyModel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(prettyModel('claude-fable-5-1[1m]')).toBe('Fable 5.1')
  })

  test('counts down to a reset', async () => {
    const now = Date.parse('2026-10-02T10:00:00Z')
    expect(formatReset('2026-10-02T10:45:00Z', now)).toBe('45m')
    expect(formatReset('2026-10-02T14:30:00Z', now)).toBe('4h30m')
    expect(formatReset('2026-10-05T10:00:00Z', now)).toBe('3d')
    expect(formatReset('2026-10-05T09:56:00Z', now)).toBe('2d23h')
    expect(formatReset('2026-10-03T13:00:00Z', now)).toBe('1d3h')
    expect(formatReset(null, now)).toBe('')
  })

  test('packs one bar cell per segment', async () => {
    expect(barCells(27).length).toBe(Math.ceil((BAR_CELLS * 12) / 3) * 4)
  })
})

describe('every terminal size', () => {
  test('never lays out wider or taller than the band', async () => {
    for (let columns = 20; columns <= 250; columns += 1) {
      for (let maxRows = 1; maxRows <= 30; maxRows += 1) {
        const layout = layoutFor(columns, maxRows, true, FULL_USAGE)
        const sceneRows = layout.sceneWidth === null ? 0 : SCENE_ROWS
        const sceneColumns = (layout.sceneWidth ?? 0) + (layout.isStatsBeside ? GAP + layout.statsColumns : 0)
        expect(sceneColumns <= columns).toBe(true)
        expect(sceneRows + layout.below.length <= maxRows).toBe(true)
        expect(lineWidth(FULL_USAGE, layout.hasLineBars, layout.hasLineModel, layout.lineLabels) <= columns).toBe(true)
      }
    }
  })

  test('shortens the stats line by dropping the least useful readings first', async () => {
    const at = (columns: number) => layoutFor(columns, 1, true, FULL_USAGE)
    expect(at(120).lineLabels).toEqual(['ctx', '5h', '7d'])
    expect(at(30).lineLabels).toEqual(['5h', '7d'])
    expect(at(20).lineLabels).toEqual(['5h'])
    expect(at(20).hasLineBars).toBe(false)
  })

  test('drops the title only when the chore and coins would not fit beside it', async () => {
    const parts = [
      { text: 'watering tulip, bud', dropOrder: 0 },
      { text: '12 coins', dropOrder: 0 },
    ]
    expect(captionFor('Garden Claude ', parts, 80)).toEqual({ hasTitle: true, details: 'watering tulip, bud · 12 coins' })
    expect(captionFor('Garden Claude ', parts, 40)).toEqual({ hasTitle: false, details: 'watering tulip, bud · 12 coins' })
  })

  test('counts Chinese, Japanese and Korean characters as two columns', async () => {
    expect(displayWidth('basket')).toBe(6)
    expect(displayWidth('籃子')).toBe(4)
    expect(displayWidth('かご 0/3')).toBe(8)
    expect(displayWidth('바구니')).toBe(6)
  })

  test('fits the caption by dropping the accessory, place and then coins, never the chore', async () => {
    for (const { code } of LANGUAGES) {
      const strings = STRINGS[code]
      const selling = { kind: 'selling', plot: -1, flower: 0, stage: 0, count: 3, earned: 12, sold: [] } as Job
      const accessory = { text: strings.accessories[3], dropOrder: 4 }
      const chore = { text: doingText(strings, selling, true), dropOrder: 0 }
      const coins = { text: strings.coins(1234), dropOrder: 1 }
      const parts = [
        { text: cityForZone('Europe/Warsaw')?.names[code] ?? '', dropOrder: 2 },
        accessory,
        chore,
        coins,
      ]
      const full = parts.map(part => part.text).join(CAPTION_SEPARATOR)
      const essential = [chore.text, coins.text].join(CAPTION_SEPARATOR)
      expect(fitCaption(parts, displayWidth(full))).toBe(full)
      expect(fitCaption(parts, displayWidth(full) - 1)).not.toContain(accessory.text)
      expect(fitCaption(parts, displayWidth(essential))).toBe(essential)
      expect(fitCaption(parts, displayWidth(chore.text))).toBe(chore.text)
      for (let columns = displayWidth(essential); columns <= displayWidth(full); columns += 1) {
        expect(displayWidth(fitCaption(parts, columns)) <= columns).toBe(true)
      }
    }
  })

  test('stretches the stats bars into spare room without squeezing the garden', async () => {
    const besideFrom = MIN_SCENE_COLUMNS + GAP + STATS_BLOCK_COLUMNS
    expect(layoutFor(besideFrom, 20, true, FULL_USAGE).barCells).toBe(BAR_CELLS)
    expect(layoutFor(MAX_SCENE_COLUMNS + GAP + STATS_BLOCK_COLUMNS, 20, true, FULL_USAGE).barCells).toBe(BAR_CELLS)
    expect(layoutFor(250, 20, true, FULL_USAGE).barCells).toBe(MAX_BAR_CELLS)
    for (let columns = besideFrom; columns <= 250; columns += 1) {
      const layout = layoutFor(columns, 20, true, FULL_USAGE)
      const roomy = layoutFor(columns + 1, 20, true, FULL_USAGE)
      expect(layout.statsColumns - STATS_BLOCK_COLUMNS).toBe(layout.barCells - BAR_CELLS)
      expect((roomy.sceneWidth ?? 0) >= (layout.sceneWidth ?? 0)).toBe(true)
      expect(roomy.barCells >= layout.barCells).toBe(true)
    }
  })

  test('keeps the plots, Claude and the stall apart at every garden width', async () => {
    for (let width = MIN_SCENE_COLUMNS; width <= MAX_SCENE_COLUMNS; width += 1) {
      const lastTilledEdge = plotX(PLOT_COUNT - 1, width) + 2
      const basketLeft = basketSpot(width) + 9
      expect(lastTilledEdge < basketLeft).toBe(true)
      expect(basketLeft + 4 < width - 11).toBe(true)
      expect(plotX(1, width) - plotX(0, width) >= 4).toBe(true)
      const selling = spotFor({ ...RESTING, kind: 'selling', plot: -1 }, 0, width)
      expect(selling > basketSpot(width) && selling + 8 < width - 11).toBe(true)
      expect(sceneCells(solo({ garden: freshGarden(), accessory: 0, claudeX: 4, facing: 0, isWorking: false, width })).length).toBe(
        Math.ceil((width * SCENE_ROWS * 12) / 3) * 4,
      )
    }
  })

  test('draws a valid band from a phone-sized terminal to an ultrawide one', async ($, on) => {
    mock.clock(on, { now: 490_000 * HOUR })
    mock.store(on)
    const sizes = [
      [250, 30, true],
      [120, 20, true],
      [80, 20, true],
      [60, 20, true],
      [56, 20, true],
      [50, 20, false],
      [120, 6, false],
      [30, 2, false],
      [20, 1, false],
    ] as const
    for (const [bodyColumns, maxRows, hasGarden] of sizes) {
      const band = await $.ui.mount({
        plugin: 'garden-claude',
        surface: 'terminal',
        component: 'AbovePrompt',
        props: { ...BAND.props, bodyColumns, maxRows, scroll: { offset: 0, bodyRows: maxRows } },
      })
      expect((await band.find({ key: 'garden' })) !== undefined).toBe(hasGarden)
      expect(await band.find({ type: 'Text', text: /\$/ })).toBeDefined()
      await band.unmount()
    }
  })
})

describe('the band', () => {
  test('draws the garden with the stats beside it above the prompt', async ($, on) => {
    mock.clock(on, { now: 490_000 * HOUR })
    mock.store(on)

    const band = await $.ui.mount({ plugin: 'garden-claude', surface: 'terminal', ...BAND })
    expect(await band.find({ key: 'garden' })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /ctx/ })).toBeDefined()
    expect((await band.find({ type: 'Text', text: /coins/ }))?.text).toContain(
      STRINGS.en.accessories[accessoryFor(490_000)],
    )
    await band.unmount()
  })

  test('shows only the caption on the desktop', async ($, on) => {
    mock.clock(on, { now: 490_000 * HOUR })
    mock.store(on)

    const desktop = await $.ui.mount({ plugin: 'garden-claude', surface: 'desktop', ...BAND })
    expect(await desktop.find({ key: 'garden' })).toBeUndefined()
    expect(await desktop.find({ type: 'Text', text: /Garden Claude/ })).toBeDefined()
    await desktop.unmount()
  })

  test('a tool call puts Claude to work', async ($, on) => {
    mock.clock(on, { now: 490_000 * HOUR })
    mock.store(on)
    on('session.id', () => ({ value: 'session-a' }))
    on('tool.call', () => ({ result: 'ok', text: 'ok' }))

    await $.tool.call({ tool: 'Read', file_path: 'a.md' })

    const band = await $.ui.mount({ plugin: 'garden-claude', surface: 'terminal', ...BAND })
    expect((await band.find({ type: 'Text', text: /coins/ }))?.text).toContain('planting ')
    await band.unmount()
  })

  test('skips a chore that comes in while Claude is still on the last one', async ($, on) => {
    const clock = mock.clock(on, { now: 490_000 * HOUR })
    mock.store(on)
    on('session.id', () => ({ value: 'session-a' }))
    on('ui.blit', () => ({ value: {} }))
    on('tool.call', () => ({ result: 'ok', text: 'ok' }))
    const first = step(farm())
    const second = step(first)
    const doing = (state: Farm) => doingText(STRINGS.en, state.job, true)
    expect(doing(first)).not.toBe(doing(second))

    const band = await $.ui.mount({ plugin: 'garden-claude', surface: 'terminal', ...BAND })
    const caption = async () => (await band.find({ type: 'Text', text: /coins/ }))?.text ?? ''
    for (const file of ['a.md', 'b.md', 'c.md', 'd.md']) await $.tool.call({ tool: 'Read', file_path: file })
    expect(await caption()).toContain(doing(first))
    await clock.advance(1_000)
    await $.tool.call({ tool: 'Read', file_path: 'e.md' })
    expect(await caption()).toContain(doing(first))
    await clock.advance(20_000)
    expect(await caption()).toContain(doing(first))

    await $.tool.call({ tool: 'Read', file_path: 'f.md' })
    expect(await caption()).toContain(doing(second))

    await band.redraw({ ...BAND.props, isWorking: false })
    expect(await caption()).toContain(doing(second))
    await clock.advance(20_000)
    expect(await caption()).toContain(STRINGS.en.resting)
    await band.unmount()
  })
})

describe('languages', () => {
  test('follows the computer language and falls back to the time zone', async () => {
    expect(detectLanguage(['zh_TW.UTF-8'], 'Europe/London')).toBe('zh-TW')
    expect(detectLanguage(['zh-Hant-HK'], 'UTC')).toBe('zh-TW')
    expect(detectLanguage(['zh_CN.UTF-8'], 'UTC')).toBe('zh-CN')
    expect(detectLanguage(['ja_JP.UTF-8'], 'UTC')).toBe('ja')
    expect(detectLanguage(['ko-KR'], 'UTC')).toBe('ko')
    expect(detectLanguage(['en_US.UTF-8'], 'Asia/Taipei')).toBe('en')
    expect(detectLanguage(['fr_FR.UTF-8'], 'Asia/Tokyo')).toBe('en')
    expect(detectLanguage([undefined, 'C', ''], 'Asia/Tokyo')).toBe('ja')
    expect(detectLanguage([undefined], 'America/Chicago')).toBe('en')
  })

  test('understands what people type to pick a language', async () => {
    expect(parseLanguage('auto')).toBe('auto')
    expect(parseLanguage('ZH_tw')).toBe('zh-TW')
    expect(parseLanguage('繁體中文')).toBe('zh-TW')
    expect(parseLanguage('simplified')).toBe('zh-CN')
    expect(parseLanguage('japanese')).toBe('ja')
    expect(parseLanguage('한국어')).toBe('ko')
    expect(parseLanguage('klingon')).toBe(null)
  })

  test('describes every chore in every language', async () => {
    const jobs = [
      { kind: 'planting', plot: 0, flower: 1, stage: 1, count: 0, earned: 0, sold: [] },
      { kind: 'watering', plot: 0, flower: 2, stage: 3, count: 0, earned: 0, sold: [] },
      { kind: 'harvesting', plot: 0, flower: 3, stage: BLOOM, count: 0, earned: 0, sold: [] },
      { kind: 'selling', plot: -1, flower: 0, stage: 0, count: 3, earned: 9, sold: [] },
      { kind: 'storing', plot: -1, flower: 1, stage: 0, count: 0, earned: 0, sold: [] },
    ] as const satisfies readonly Job[]
    for (const { code } of LANGUAGES) {
      const strings = STRINGS[code]
      const texts = jobs.map(job => doingText(strings, job, true))
      expect(new Set(texts).size).toBe(jobs.length)
      expect(doingText(strings, jobs[0], false)).toBe(strings.resting)
      expect(strings.accessories.length).toBe(ACCESSORIES.length)
    }
    expect(doingText(STRINGS.ja, jobs[1], true)).toBe('ひまわりに水やり、つぼみ')
    expect(doingText(STRINGS['zh-TW'], jobs[2], true)).toBe('摘薰衣草（盛開）')
    expect(doingText(STRINGS.en, { ...jobs[1], stage: 0 }, true)).toBe('watering sunflower')
    expect(doingText(STRINGS['zh-TW'], jobs[3], true)).toBe('賣出 3 朵 +9 金幣')
    expect(doingText(STRINGS.en, jobs[3], true)).toBe('selling 3, +9 coins')
    expect(doingText(STRINGS.en, jobs[0], true)).toBe('planting tulip, seed')
    expect(doingText(STRINGS.en, jobs[4], true)).toBe('putting the tulip in the basket')
    expect(doingText(STRINGS.ko, jobs[4], true)).toBe('튤립을 바구니에 담기')
    expect(doingText(STRINGS.ko, { ...jobs[4], flower: 0 }, true)).toBe('데이지를 바구니에 담기')
  })

  test('loads an old job without English labels getting stuck, and skips broken saves', async () => {
    expect(loadJob({ kind: 'watering', plot: 2, label: 'watering the rose' })).toEqual({ ...RESTING, kind: 'watering', plot: 2 })
    expect(loadJob({ kind: 'dancing' })).toEqual(RESTING)
    expect(loadJob(null)).toEqual(RESTING)
    expect(loadGarden({ nope: true })).toBe(null)
    expect(loadGarden({ ...freshGarden(), plots: [null, ...freshGarden().plots.slice(1)] })).toBe(null)
    expect(loadGarden({ ...freshGarden(), job: null })?.chores).toBe(0)
  })

  test('loads a garden saved before flowers got thirsty', async () => {
    const { chores: _, ...old } = {
      ...freshGarden(),
      plots: Array.from({ length: PLOT_COUNT }, () => ({ stage: 2, kind: 1 })),
    }
    const loaded = loadGarden(old)
    expect(loaded?.chores).toBe(0)
    expect(loaded?.plots.every(plot => plot.thirst === 0 && plot.stage === 2)).toBe(true)
    expect(work(loaded ?? freshGarden(), null, { job: RESTING }).job.kind).toBe('watering')
  })
})

describe('cities', () => {
  test('names the city of every time zone in all five languages', async () => {
    expect(CITIES.length > 400).toBe(true)
    expect(new Set(CITIES.map(city => city.zone)).size).toBe(CITIES.length)
    for (const city of CITIES) {
      for (const { code } of LANGUAGES) expect(city.names[code].trim().length > 0).toBe(true)
      expect(Math.abs(city.latitude) <= 90 && Math.abs(city.longitude) <= 180).toBe(true)
    }
    expect(cityForZone('Asia/Taipei')?.names['zh-TW']).toBe('台北')
    expect(cityForZone('Europe/Warsaw')?.names).toEqual({ en: 'Warsaw', 'zh-TW': '華沙', 'zh-CN': '华沙', ja: 'ワルシャワ', ko: '바르샤바' })
    expect(cityForZone('Asia/Tokyo')?.names.ko).toBe('도쿄')
  })

  test('understands old time zone names and skips zones with no place', async () => {
    expect(cityForZone('Asia/Calcutta')?.zone).toBe('Asia/Kolkata')
    expect(cityForZone('Europe/Kiev')?.names.en).toBe('Kyiv')
    expect(cityForZone('US/Pacific')?.names.en).toBe('Los Angeles')
    expect(cityForZone('UTC')).toBe(null)
    expect(cityForZone('Etc/GMT+3')).toBe(null)
  })
})

describe('weather', () => {
  test('turns weather codes into sunny, cloudy, rainy and snowy', async () => {
    expect(conditionFromCode(0)).toBe('sunny')
    expect(conditionFromCode(1)).toBe('sunny')
    expect(conditionFromCode(3)).toBe('cloudy')
    expect(conditionFromCode(45)).toBe('cloudy')
    expect(conditionFromCode(61)).toBe('rainy')
    expect(conditionFromCode(95)).toBe('rainy')
    expect(conditionFromCode(73)).toBe('snowy')
    expect(conditionFromCode(86)).toBe('snowy')
    expect(parseCondition('{"current":{"weather_code":71}}')).toBe('snowy')
    expect(parseCondition('not json')).toBe(null)
    const taipei = cityForZone('Asia/Taipei')!
    expect(weatherUrl(taipei)).toContain('api.open-meteo.com')
    expect(weatherUrl(taipei)).toContain('latitude=25.05&longitude=121.5')
  })

  test('draws each weather differently and moves it over time', async () => {
    const scene = { garden: freshGarden(), accessory: 0, claudeX: 4, facing: 0, isWorking: false, width: MAX_SCENE_COLUMNS }
    const kinds = ['sunny', 'cloudy', 'rainy', 'snowy'] as const
    const firstFrames = kinds.map(weather => sceneCells(solo({ ...scene, weather })))
    expect(new Set([...firstFrames, sceneCells(solo({ ...scene, weather: null }))]).size).toBe(kinds.length + 1)
    for (const weather of kinds) {
      expect(framesOf({ ...scene, weather }).size > 2).toBe(true)
    }
  })

  test('covers the ground with snow when it snows', async () => {
    const scene = { garden: freshGarden(), accessory: 0, claudeX: 4, facing: 0, isWorking: false, width: MAX_SCENE_COLUMNS }
    const groundRow = 10
    const white = (pixels: Uint32Array) =>
      Array.from({ length: MAX_SCENE_COLUMNS }, (_, x) => pixels[groundRow * MAX_SCENE_COLUMNS + x]).filter(color => color === 0xf4f6fb || color === 0xd6e2f0).length
    expect(white(paint(solo({ ...scene, weather: 'snowy' }))) > MAX_SCENE_COLUMNS / 2).toBe(true)
    expect(white(paint(solo({ ...scene, weather: 'sunny' })))).toBe(0)
  })
})

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

describe('commands', () => {
  test('switches language from a typed shortcut and lists choices for a typo', async ($, on) => {
    mock.clock(on, { now: 490_000 * HOUR })
    mock.store(on)

    const set = await $.command.run({ ...RUN, command: 'garden-claude-language', args: 'ja' })
    expect(set.text).toBe('Garden Claude はこれから日本語で話します。')

    const band = await $.ui.mount({ plugin: 'garden-claude', surface: 'terminal', ...BAND })
    expect(await band.find({ type: 'Text', text: /コイン/ })).toBeDefined()
    await band.unmount()

    const typo = await $.command.run({ ...RUN, command: 'garden-claude-language', args: 'klingon' })
    expect(typo.text).toContain('zh-TW: 繁體中文')
  })
})

const sharedStore = (on: On, saved: Record<string, unknown> = {}) => {
  const store = new Map<string, unknown>(Object.entries(saved))
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    store.delete(e.key)
    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...store.keys()] }))
  return store
}

describe('starting a session', () => {
  const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const
  const quietWorld = (on: On, weatherCode?: number, isDay = 1) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.id', () => ({ value: 'session-a' }))
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('http.fetch', () =>
      weatherCode === undefined
        ? { deny: 'offline' }
        : { value: { ok: true, status: 200, headers: {}, text: `{"current":{"weather_code":${weatherCode},"is_day":${isDay}}}` } },
    )
  }

  test('guesses the language from the time zone when the computer gives none', async ($, on) => {
    mock.clock(on, { now: 490_000 * HOUR })
    mock.store(on)
    mock.env(on, {})
    quietWorld(on)

    await $.session.start(START)

    expect(detectLanguage([], 'Asia/Taipei')).toBe('zh-TW')
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const expected = STRINGS[detectLanguage([], zone)].coins(0)
    const band = await $.ui.mount({ plugin: 'garden-claude', surface: 'terminal', ...BAND })
    expect(await band.find({ type: 'Text', text: new RegExp(expected) })).toBeDefined()
    await band.unmount()
  })

  const chillsIn = async ($: Engine, on: On, code: number) => {
    const clock = mock.clock(on, { now: 490_000 * HOUR })
    mock.store(on)
    mock.env(on, { LANG: 'en_US.UTF-8' })
    quietWorld(on, code)
    on('tool.call', () => ({ result: 'ok', text: 'ok' }))

    await $.session.start(START)
    await clock.settle()
    await $.tool.call({ tool: 'Read', file_path: 'a.md' })

    const band = await $.ui.mount({ plugin: 'garden-claude', surface: 'terminal', ...BAND })
    const isResting = (await band.find({ type: 'Text', text: /resting/ })) !== undefined
    await band.unmount()
    return isResting
  }

  test('rests through the snow instead of watering', async ($, on) => {
    expect(await chillsIn($, on, 73)).toBe(true)
  })

  test('works on a clear day', async ($, on) => {
    expect(await chillsIn($, on, 0)).toBe(false)
  })

  test('draws the same Claude every frame after reloading in the middle of a turn', async ($, on) => {
    const clock = mock.clock(on, { now: 490_000 * HOUR })
    mock.store(on)
    mock.env(on, { LANG: 'en_US.UTF-8' })
    quietWorld(on)
    on('tool.call', () => ({ result: 'ok', text: 'ok' }))
    const blits: unknown[] = []
    on('ui.blit', ($, e) => {
      if ('cells' in e) blits.push(e.cells)
      return { value: {} }
    })

    await $.session.start(START)
    await $.tool.call({ tool: 'Read', file_path: 'a.md' })
    await $.tool.call({ tool: 'Read', file_path: 'b.md' })
    const band = await $.ui.mount({ plugin: 'garden-claude', surface: 'terminal', ...BAND })
    await clock.advance(200 * 60)
    await band.redraw()

    const scene = await band.find({ type: 'Raster', key: 'garden' })
    expect(blits.length > 0).toBe(true)
    expect(scene?.props.cells).toEqual(blits.at(-1))
    await band.unmount()
  })

  test('starts a fresh garden and keeps only the coins from an old save', async ($, on) => {
    const clock = mock.clock(on, { now: 490_000 * HOUR })
    const store = sharedStore(on, { garden: { ...freshGarden(), basket: [1, 2], coins: 7, job: RESTING } })
    mock.env(on, { LANG: 'en_US.UTF-8' })
    quietWorld(on, 0)

    await $.session.start(START)
    await clock.settle()

    expect(store.has('garden')).toBe(false)
    expect(store.get('coins')).toBe(7)
    const band = await $.ui.mount({ plugin: 'garden-claude', surface: 'terminal', ...BAND })
    expect(await band.find({ type: 'Text', text: /7 coins/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /basket/ })).toBeUndefined()
    await band.unmount()
  })

  test('says it is a clear night after dark', async ($, on) => {
    const clock = mock.clock(on, { now: 490_000 * HOUR })
    mock.store(on)
    mock.env(on, { LANG: 'en_US.UTF-8' })
    quietWorld(on, 0, 0)

    await $.session.start(START)
    await clock.settle()

    const band = await $.ui.mount({ plugin: 'garden-claude', surface: 'terminal', ...BAND })
    const city = cityForZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
    if (city) expect(await band.find({ type: 'Text', text: /clear night/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /sunny/ })).toBeUndefined()
    await band.unmount()
  })

  test('shares coins with other sessions while each keeps its own garden', async ($, on) => {
    const clock = mock.clock(on, { now: 490_000 * HOUR })
    const store = sharedStore(on, { coins: 5 })
    mock.env(on, { LANG: 'en_US.UTF-8' })
    quietWorld(on, 0)
    on('tool.call', () => ({ result: 'ok', text: 'ok' }))

    await $.session.start(START)
    await clock.settle()
    store.set('coins', 57)
    await clock.advance(60_000)
    const band = await $.ui.mount({ plugin: 'garden-claude', surface: 'terminal', ...BAND })
    expect(await band.find({ type: 'Text', text: /57 coins/ })).toBeDefined()
    await band.unmount()
    await clock.advance(200)

    store.set('coins', 100)
    for (let i = 0; i < 200 && store.get('coins') === 100; i += 1) await $.tool.call({ tool: 'Read', file_path: 'a.md' })
    expect((store.get('coins') as number) > 100).toBe(true)
    expect([...store.keys()].sort()).toEqual(['coins', 'today'])
  })

  test('keeps the saved language after /resume switches to a conversation that never started', async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    sharedStore(on, { prefs: { language: 'ja' } })
    mock.env(on, { LANG: 'en_US.UTF-8' })
    on('session.id', () => ({ value: 'session-a' }))
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
    on('http.fetch', () => ({ deny: 'offline' }))
    on('ui.blit', () => ({ value: {} }))
    const registered: string[] = []
    on('command.register', ($, e) => {
      registered.push(e.name)
      return { value: { command: e.name } }
    })

    const band = await $.ui.mount({ plugin: 'garden-claude', surface: 'terminal', ...BAND })
    expect(await band.find({ type: 'Text', text: /コイン/ })).toBeDefined()
    await band.unmount()
    await clock.advance(5_000)
    expect(registered).toContain('garden-claude-room')
  })

  test('follows the computer language and ignores a saved language it does not know', async ($, on) => {
    mock.clock(on, { now: 490_000 * HOUR })
    mock.store(on, { prefs: { language: 'fr' } })
    mock.env(on, { LANG: 'ja_JP.UTF-8' })
    quietWorld(on)

    await $.session.start(START)

    const band = await $.ui.mount({ plugin: 'garden-claude', surface: 'terminal', ...BAND })
    expect(await band.find({ type: 'Text', text: /コイン/ })).toBeDefined()
    await band.unmount()
  })
})

describe('splitting the work', () => {
  const growing = (): Garden => ({ ...freshGarden(), plots: Array.from({ length: PLOT_COUNT }, () => ({ stage: 2, kind: 1, thirst: 0 })) })

  test('never picks a plot another Claude is on and prefers one not next to it', async () => {
    let garden = growing()
    let job = RESTING
    for (let i = 0; i < 60; i += 1) {
      const chore = work(garden, null, { job, busy: [2] })
      expect(chore.job.plot).not.toBe(2)
      garden = chore.garden
      job = chore.job
    }
    const empty = { ...freshGarden() }
    expect(work(empty, null, { job: RESTING, busy: [0] }).job.plot).toBe(2)
  })

  test('leaves the stall to whoever is selling and rests when every plot is taken', async () => {
    const full = { ...growing(), basket: [0, 1, 2] }
    expect(work(full, null, { job: RESTING }).job.kind).toBe('selling')
    const waiting = work({ ...full, plots: full.plots.map(plot => ({ ...plot, stage: BLOOM })) }, null, { job: RESTING, isStallBusy: true })
    expect(waiting.job.kind).not.toBe('selling')
    expect(waiting.job.kind).not.toBe('harvesting')
    expect(waiting.earned).toBe(0)
    expect(work(growing(), null, { job: RESTING, busy: [0, 1, 2, 3, 4] }).job.kind).toBe('resting')
  })
})

const NOW = 490_000 * HOUR

const member = (id: string, seat: number, accessory: number, extra: Partial<Member> = {}): Member => ({
  id,
  seat,
  accessory,
  job: RESTING,
  jobAt: NOW,
  seen: NOW,
  ...extra,
})

const roomOf = (members: Member[], host = members[0]?.id ?? '', garden = freshGarden()): Room => ({
  code: 'MANGO',
  host,
  garden,
  members,
})

describe('room rules', () => {
  test('names rooms after fruits and runs out instead of numbering them', async () => {
    const taken = new Set<string>(FRUITS.slice(1))
    expect(freeCode(taken, () => 0.99)).toBe(FRUITS[0])
    expect(freeCode(new Set(FRUITS), () => 0.5)).toBe(null)
    expect(parseCode(' mango ')).toBe('MANGO')
    expect(parseCode('MANGO2')).toBe(null)
    expect(parseCode('KMRW')).toBe(null)
    expect(parseCode('12')).toBe(null)
  })

  test('counts a silent Claude as away after 3 minutes, measured from when this session was last awake', async () => {
    const quiet = member('b', 2, 1)
    expect(awayOf(quiet, NOW + SILENT_MS, 0)).toBeUndefined()
    expect(awayOf(quiet, NOW + SILENT_MS + 1, 0)).toEqual({ since: NOW + SILENT_MS })
    expect(awayOf(quiet, NOW + SILENT_MS + 1, NOW + SILENT_MS)).toBeUndefined()
    expect(awayOf({ ...quiet, away: { since: NOW } }, NOW, 0)).toEqual({ since: NOW })
  })

  test('closes when the host has been away 5 minutes, and drops joined Claudes away that long', async () => {
    const room = roomOf([member('a', 1, 0, { away: { since: NOW } }), member('b', 2, 1, { away: { since: NOW } }), member('c', 3, 2)])
    expect(isClosed(room, NOW + GRACE_MS, 0)).toBe(false)
    expect(isClosed(room, NOW + GRACE_MS + 1, 0)).toBe(true)
    const tidied = tidy(room, NOW + GRACE_MS + 1, NOW + GRACE_MS)
    expect(tidied.members.map(one => one.id)).toEqual(['a', 'c'])
  })

  test('refuses joins when full, when a seat is held, or while the host is away', async () => {
    const three = [member('a', 1, 0), member('b', 2, 1), member('c', 3, 2)]
    expect(refusalFor(roomOf(three.slice(0, 2)), NOW, 0)).toBe(null)
    expect(refusalFor(roomOf(three), NOW, 0)).toBe('full')
    expect(refusalFor(roomOf([three[0]!, three[1]!, { ...three[2]!, away: { since: NOW } }]), NOW, 0)).toBe('heldSeat')
    expect(refusalFor(roomOf([{ ...three[0]!, away: { since: NOW } }]), NOW, 0)).toBe('hostAway')
  })

  test('only fresh, present chores keep a plot or the stall busy', async () => {
    const watering = { ...RESTING, kind: 'watering' as const, plot: 2 }
    const selling = { ...RESTING, kind: 'selling' as const, plot: -1 }
    const room = roomOf([
      member('a', 1, 0),
      member('b', 2, 1, { job: watering }),
      member('c', 3, 2, { job: selling }),
    ])
    expect(busyFor(room, 'a', NOW, 0)).toEqual({ busy: [2], isStallBusy: true, held: 0 })
    expect(busyFor(room, 'a', NOW + 2 * 60_000, NOW + 2 * 60_000)).toEqual({ busy: [], isStallBusy: false, held: 0 })
    expect(busyFor(roomOf([member('a', 1, 0), member('b', 2, 1, { job: watering, away: { since: NOW } })]), 'a', NOW, 0).busy).toEqual([])
  })

  test('saves basket room for flowers other Claudes hold, even while they are away', async () => {
    const picking = { ...RESTING, kind: 'harvesting' as const, plot: 1, flower: 2, stage: BLOOM, from: BLOOM }
    const room = roomOf([
      member('a', 1, 0),
      member('b', 2, 1, { job: picking }),
      member('c', 3, 2, { job: picking, seen: NOW - 10 * 60_000, jobAt: NOW - 10 * 60_000 }),
    ])
    expect(busyFor(room, 'a', NOW, 0).held).toBe(2)
    expect(busyFor(room, 'b', NOW, 0).held).toBe(1)
  })

  test('frees accessories other Claudes are not wearing', async () => {
    const room = roomOf([member('a', 1, 2), member('b', 2, 4)])
    expect(freeAccessories(room, 'a')).toEqual([0, 1, 2, 3])
    expect(createRoom('MANGO', 'a', freshGarden(), 3, NOW).members[0]).toEqual(member('a', 1, 3, { jobAt: 0 }))
  })

  test('cleans up rooms whose host left for good or that nobody has touched for a day', async () => {
    expect(isAbandoned(roomOf([member('a', 1, 0, { away: { since: NOW } })]), NOW + GRACE_MS + 1)).toBe(true)
    expect(isAbandoned(roomOf([member('a', 1, 0)]), NOW + 60 * 60_000)).toBe(false)
    expect(isAbandoned(roomOf([member('a', 1, 0)]), NOW + 25 * HOUR)).toBe(true)
    expect(isAbandoned(roomOf([member('b', 2, 0)], 'a'), NOW)).toBe(true)
  })
})

describe('the basket', () => {
  const WIDTH = MAX_SCENE_COLUMNS
  const WICKER_LIGHT = 0xe2b97e
  const WICKER = 0xc8955a
  const at = (pixels: Uint32Array, x: number, y: number) => pixels[y * WIDTH + x]
  const homeX = basketSpot(WIDTH) + 9
  const counterX = WIDTH - 11 + 2
  const garden = { ...freshGarden(), basket: [0, 1] }
  const picture = (claude: Partial<Scene['claudes'][number]> & { job: Job }, frame = 0, inBasket = garden.basket) =>
    paint({
      garden: { ...garden, basket: inBasket },
      coins: 0,
      claudes: [{ x: 4, target: 4, facing: 1, accessory: 0, isWorking: true, ...claude }],
      frame,
      width: WIDTH,
    })
  const centers: readonly number[] = FLOWERS.map(flower => flower.center)
  const flowersAtHome = (pixels: Uint32Array) =>
    [[3, 4], [1, 5], [5, 5]].filter(([dx, y]) => centers.includes(at(pixels, homeX + (dx ?? 0), y ?? 0) ?? 0)).length

  test('picking holds the flower, and the next chore puts it in the basket', async () => {
    const ripe = { ...freshGarden(), plots: freshGarden().plots.map(plot => ({ ...plot, stage: BLOOM })) }
    const picked = work(ripe, null, { job: RESTING })
    expect(picked.job.kind).toBe('harvesting')
    expect(picked.garden.basket).toEqual([])
    const stored = work(picked.garden, null, { job: picked.job })
    expect(stored.job.kind).toBe('storing')
    expect(stored.garden.basket).toEqual([picked.job.flower])
  })

  test('leaves room in the basket for flowers other Claudes are holding', async () => {
    const ripe = { ...freshGarden(), basket: [0, 1], plots: freshGarden().plots.map(plot => ({ ...plot, stage: BLOOM })) }
    expect(work(ripe, null, { job: RESTING }).job.kind).toBe('harvesting')
    expect(work(ripe, null, { job: RESTING, held: 1 }).job.kind).not.toBe('harvesting')
  })

  test('sits on the ground showing its flowers and stays out of the plots', async () => {
    const pixels = picture({ job: RESTING, isWorking: false })
    expect(at(pixels, homeX, 7)).toBe(WICKER_LIGHT)
    expect(flowersAtHome(pixels)).toBe(2)
    for (let width = MIN_SCENE_COLUMNS; width <= MAX_SCENE_COLUMNS; width += 1) {
      expect(plotX(PLOT_COUNT - 1, width) + 2 < basketSpot(width) + 9).toBe(true)
    }
  })

  test('shows the picked flower dropping in, then sitting in the basket', async () => {
    const storing = { ...RESTING, kind: 'storing' as const, plot: -1, flower: 4 }
    const spot = basketSpot(WIDTH)
    const walking = picture({ x: spot - 6, target: spot, job: storing, settled: null }, 0, [0, 1, 4])
    expect(flowersAtHome(walking)).toBe(2)
    expect(at(walking, spot - 6 + 9, 3)).toBe(FLOWERS[4].center)
    const holding = picture({ x: spot, target: spot, job: storing, settled: 0 }, 0, [0, 1, 4])
    expect(flowersAtHome(holding)).toBe(2)
    expect(at(holding, spot + 9, 2)).toBe(FLOWERS[4].center)
    const falling = picture({ x: spot, target: spot, job: storing, settled: 2 }, 0, [0, 1, 4])
    expect(flowersAtHome(falling)).toBe(2)
    expect(at(falling, homeX + 3, 2)).toBe(FLOWERS[4].center)
    const landing = picture({ x: spot, target: spot, job: storing, settled: 4 }, 0, [0, 1, 4])
    expect(at(landing, homeX + 5, 4)).toBe(FLOWERS[4].center)
    for (const frame of [0, 3, 6, 9]) {
      const dropped = picture({ x: spot, target: spot, job: storing, settled: 6 + frame }, frame, [0, 1, 4])
      expect(flowersAtHome(dropped)).toBe(3)
      expect(at(dropped, homeX + 5, 5)).toBe(FLOWERS[4].center)
    }
  })

  test('keeps a bloom on its plot until Claude gets there to pick it', async () => {
    const harvesting = { ...RESTING, kind: 'harvesting' as const, plot: 2, flower: 3, stage: BLOOM, from: BLOOM }
    const spot = spotFor(harvesting, 0, WIDTH)
    const bloomAt = (pixels: Uint32Array) => at(pixels, plotX(2, WIDTH), 3)
    expect(bloomAt(picture({ x: spot - 8, target: spot, job: harvesting }))).toBe(FLOWERS[3].center)
    expect(bloomAt(picture({ x: spot, target: spot, job: harvesting }))).not.toBe(FLOWERS[3].center)
  })

  test('is fetched, carried to the stall and set on the counter to sell', async () => {
    const selling = { ...RESTING, kind: 'selling' as const, plot: -1, count: 3, earned: 12, sold: [0, 1, 2] }
    const spot = basketSpot(WIDTH)
    const stall = spotFor(selling, 0, WIDTH)
    expect(stall > spot).toBe(true)
    const fetching = picture({ x: spot - 5, target: spot, job: selling, isCarrying: false }, 0, [])
    expect(at(fetching, homeX, 7)).toBe(WICKER_LIGHT)
    expect(flowersAtHome(fetching)).toBe(3)
    const carrying = picture({ x: spot + 3, target: stall, job: selling, isCarrying: true }, 0, [])
    expect(at(carrying, homeX + 2, 9)).not.toBe(0x9a6a3a)
    expect(at(fetching, homeX + 2, 9)).toBe(0x9a6a3a)
    expect([at(carrying, spot + 3 + 8, 6), at(carrying, spot + 3 + 8, 7)]).toContain(WICKER_LIGHT)
    const selling2 = picture({ x: stall, target: stall, job: selling, isCarrying: true }, 0, [])
    expect(at(selling2, counterX, 6)).toBe(WICKER)
    expect(at(selling2, counterX + 3, 5)).toBe(FLOWERS[0].center)
    expect(at(selling2, counterX + 1, 5)).toBe(FLOWERS[1].center)
    expect(at(selling2, counterX + 3, 7)).not.toBe(0x4caf50)
  })
})

describe('walking a chore', () => {
  const WIDTH = MAX_SCENE_COLUMNS
  const selling = { ...RESTING, kind: 'selling' as const, plot: -1, count: 3, earned: 9, sold: [0, 1, 2] }

  const walkUntilThere = (pace: Pace, job: Job, from: number) => {
    let x = from
    let current = pace
    const stops: number[] = []
    for (let frame = 0; frame < 200 && current.arrivedAt === null; frame += 1) {
      const goal = choreGoal(job, current.isCarrying, x, WIDTH)
      x += Math.sign(goal - x)
      current = stepPace(current, job, true, x, frame, WIDTH)
      if (x === goal) stops.push(x)
    }
    return { pace: current, x, stops }
  }

  test('fetches the basket before carrying it to the stall', async () => {
    const { pace, x, stops } = walkUntilThere(freshPace('sale-1'), selling, 4)
    expect(stops[0]).toBe(basketSpot(WIDTH))
    expect(pace.isCarrying).toBe(true)
    expect(x).toBe(spotFor(selling, 0, WIDTH))
  })

  test('fetches the basket again for the next sale, even one that looks the same', async () => {
    const first = walkUntilThere(freshPace('sale-1'), selling, 4)
    const again = freshPace('sale-2')
    expect(choreGoal(selling, again.isCarrying, first.x, WIDTH)).toBe(basketSpot(WIDTH))
  })

  test('remembers when it arrived, once, and only while working', async () => {
    const watering = { ...RESTING, kind: 'watering' as const, plot: 2, flower: 1, stage: 3, from: 2 }
    const spot = spotFor(watering, 0, WIDTH)
    expect(stepPace(freshPace('w'), watering, false, spot, 5, WIDTH).arrivedAt).toBe(null)
    const there = stepPace(freshPace('w'), watering, true, spot, 5, WIDTH)
    expect(there.arrivedAt).toBe(5)
    expect(stepPace(there, watering, true, spot, 9, WIDTH).arrivedAt).toBe(5)
  })

  test('shows a plot as it was until Claude gets there', async () => {
    const watering = { ...RESTING, kind: 'watering' as const, plot: 2, flower: 1, stage: 3, from: 2 }
    const garden = { ...freshGarden(), plots: freshGarden().plots.map((plot, i) => (i === 2 ? { ...plot, stage: 3, kind: 1 } : plot)) }
    const spot = spotFor(watering, 0, WIDTH)
    const budAt = (pixels: Uint32Array) => pixels[5 * WIDTH + plotX(2, WIDTH)]
    const scene = (claude: Partial<Scene['claudes'][number]>) =>
      paint({ garden, coins: 0, claudes: [{ x: spot, target: spot, facing: 1, accessory: 0, job: watering, isWorking: true, ...claude }], frame: 0, width: WIDTH })
    expect(budAt(scene({ x: spot - 10, settled: null }))).not.toBe(FLOWERS[1].petal)
    expect(budAt(scene({ settled: 0 }))).toBe(FLOWERS[1].petal)
  })

  test('keeps rain out from under the awning', async () => {
    const stall = WIDTH - 11
    for (let frame = 0; frame < 40; frame += 1) {
      const pixels = paint({ garden: freshGarden(), coins: 0, claudes: [], frame, width: WIDTH, weather: 'rainy' })
      for (let y = 3; y < 10; y += 1) {
        for (let x = stall; x < WIDTH; x += 1) expect([0x4fa3e0, 0x9fd0f5]).not.toContain(pixels[y * WIDTH + x])
      }
    }
  })

  test('forgets a pick saved before flowers were carried to the basket', async () => {
    expect(loadJob({ kind: 'harvesting', plot: 3, flower: 2, stage: BLOOM })).toEqual({ ...RESTING, plot: 3 })
    expect(loadJob({ kind: 'harvesting', plot: 3, flower: 2, stage: BLOOM, from: BLOOM }).kind).toBe('harvesting')
  })
})

describe('the night sky', () => {
  const sky = (isNight: boolean, frame = 0) =>
    paint({ garden: freshGarden(), coins: 0, claudes: [], frame, width: MAX_SCENE_COLUMNS, weather: 'sunny', isNight })
  const top = (pixels: Uint32Array) => Array.from({ length: 3 * MAX_SCENE_COLUMNS }, (_, i) => pixels[i])

  test('shows the sun by day and the moon and stars on a clear night', async () => {
    expect(top(sky(false))).toContain(0xf7c531)
    expect(top(sky(true))).not.toContain(0xf7c531)
    expect(top(sky(true))).toContain(0xe8d890)
    const frames = new Set(Array.from({ length: 30 }, (_, frame) => top(sky(true, frame)).join()))
    expect(frames.size > 2).toBe(true)
  })

  test('keeps the stars off the stall', async () => {
    const stall = MAX_SCENE_COLUMNS - 11
    for (let frame = 0; frame < 30; frame += 1) {
      const pixels = sky(true, frame)
      for (let y = 0; y < 3; y += 1) {
        for (let x = stall - 1; x < MAX_SCENE_COLUMNS; x += 1) {
          expect([0xf2c84b, 0x8f96b8]).not.toContain(pixels[y * MAX_SCENE_COLUMNS + x])
        }
      }
    }
  })

  test('reads day or night from the weather service', async () => {
    expect(parseIsNight('{"current":{"weather_code":0,"is_day":0}}')).toBe(true)
    expect(parseIsNight('{"current":{"weather_code":0,"is_day":1}}')).toBe(false)
    expect(parseIsNight('not json')).toBe(false)
    expect(weatherUrl(cityForZone('Asia/Taipei')!)).toContain('is_day')
    expect(STRINGS.en.clearNight).toBe('clear night')
  })
})

describe('drawing several Claudes', () => {
  const SHADES = 0x15151c
  const BUNNY = 0xf8f4ee
  const scene = (claudes: Scene['claudes']): Scene => ({ garden: freshGarden(), coins: 0, claudes, frame: 0, width: MAX_SCENE_COLUMNS })
  const at = (pixels: Uint32Array, x: number, y: number) => pixels[y * MAX_SCENE_COLUMNS + x]
  const head = 4
  const sunglasses = ACCESSORIES.indexOf('sunglasses')
  const bunny = ACCESSORIES.indexOf('bunny ears')

  test('gives every Claude its own accessory at its own head', async () => {
    const pixels = paint(
      scene([
        { x: 4, target: 4, facing: 0, accessory: sunglasses, job: RESTING, isWorking: false },
        { x: 30, target: 30, facing: 0, accessory: bunny, job: RESTING, isWorking: false },
      ]),
    )
    expect(at(pixels, 4 + 3, head + 1)).toBe(SHADES)
    expect(at(pixels, 30 + 1, head - 1)).toBe(BUNNY)
    expect(at(pixels, 30 + 3, head + 1)).not.toBe(SHADES)
  })

  test('draws your Claude last so it stays on top where they overlap', async () => {
    const pixels = paint(
      scene([
        { x: 10, target: 10, facing: 0, accessory: bunny, job: RESTING, isWorking: false },
        { x: 10, target: 10, facing: 0, accessory: sunglasses, job: RESTING, isWorking: false },
      ]),
    )
    expect(at(pixels, 10 + 3, head + 1)).toBe(SHADES)
  })
})

describe('coins', () => {
  const coinWorld = (on: On, saved: Record<string, unknown> = {}) => {
    const clock = mock.clock(on, { now: NOW })
    const store = sharedStore(on, saved)
    mock.env(on, { LANG: 'en_US.UTF-8' })
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.id', () => ({ value: 'session-a' }))
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('http.fetch', () => ({ deny: 'offline' }))
    on('tool.call', () => ({ result: 'ok', text: 'ok' }))
    return { clock, store }
  }
  const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const

  test('keeps the larger count when an old save meets newer coins, and drops broken saves', async ($, on) => {
    const { store } = coinWorld(on, { garden: { coins: 3 }, coins: 40 })
    await $.session.start(START)
    expect(store.get('coins')).toBe(40)
    expect(store.has('garden')).toBe(false)
  })

  test('migrates an old save with no coins or a broken value without touching coins', async ($, on) => {
    const { store } = coinWorld(on, { garden: 'broken', coins: 9 })
    await $.session.start(START)
    expect(store.get('coins')).toBe(9)
    expect(store.has('garden')).toBe(false)
  })

  test('does one chore for a burst of parallel tool calls and pays each sale once', async ($, on) => {
    const { store } = coinWorld(on)
    await $.session.start(START)
    for (let batch = 0; batch < 48; batch += 1) {
      await Promise.all(Array.from({ length: 4 }, (_, i) => $.tool.call({ tool: 'Read', file_path: `${batch}-${i}.md` })))
    }
    let expected = farm()
    for (let i = 0; i < 48; i += 1) expected = step(expected)
    expect(expected.coins > 0).toBe(true)
    expect(store.get('coins') ?? 0).toBe(expected.coins)
  })

  test('does a chore when a reply starts and when it ends, even with no tool calls', async ($, on) => {
    const { store } = coinWorld(on)
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('turn.complete', ($, e) => ({ text: e.answer }))
    await $.session.start(START)
    for (let i = 0; i < 24; i += 1) {
      await $.turn.start({ text: 'hi', turnId: `turn-${i}` })
      for (const n of [1, 2]) await $.turn.complete({ answer: '', durationMs: 1000, isAborted: true, turnId: `stopped-${i}-${n}`, reason: 'aborted' })
      for (const n of [1, 2, 3]) await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: false, turnId: `helper-${i}-${n}`, reason: 'answer', agentId: 'agent-1' })
      await $.turn.complete({ answer: 'hello', durationMs: 1000, isAborted: false, turnId: `turn-${i}`, reason: 'answer' })
    }
    let expected = farm()
    for (let i = 0; i < 48; i += 1) expected = step(expected)
    expect(expected.coins > 0).toBe(true)
    expect(store.get('coins') ?? 0).toBe(expected.coins)
  })

  test('counts the coins earned today, starting over each day', async () => {
    expect(dayOf(Date.UTC(2026, 9, 2, 15), 'Asia/Taipei')).toBe('2026-10-02')
    expect(dayOf(Date.UTC(2026, 9, 2, 17), 'Asia/Taipei')).toBe('2026-10-03')
    expect(todayIn({ day: '2026-10-02', coins: 12 }, '2026-10-02')).toEqual({ day: '2026-10-02', coins: 12 })
    expect(todayIn({ day: '2026-10-01', coins: 12 }, '2026-10-02')).toEqual({ day: '2026-10-02', coins: 0 })
    expect(todayIn({ day: '2026-10-02', coins: -3 }, '2026-10-02')).toEqual({ day: '2026-10-02', coins: 0 })
    expect(todayIn('broken', '2026-10-02')).toEqual({ day: '2026-10-02', coins: 0 })
    expect(coinsText('933 coins', 12)).toBe('933 coins ↑12')
    expect(coinsText('933 coins', 0)).toBe('933 coins')
  })

  test('shows the coins earned today beside the total, shared across sessions', async ($, on) => {
    const day = dayOf(NOW, Intl.DateTimeFormat().resolvedOptions().timeZone)
    const { store, clock } = coinWorld(on, { coins: 900, today: { day: 'long ago', coins: 50 } })
    await $.session.start(START)
    await clock.settle()
    const band = await $.ui.mount({ plugin: 'garden-claude', surface: 'terminal', ...BAND })
    expect((await band.find({ type: 'Text', text: /coins/ }))?.text).not.toContain('↑')

    for (let i = 0; i < 200 && store.get('coins') === 900; i += 1) {
      await $.tool.call({ tool: 'Read', file_path: `${i}.md` })
      await clock.advance(10_000)
    }
    const earned = (store.get('coins') as number) - 900
    expect(earned > 0).toBe(true)
    expect(store.get('today')).toEqual({ day, coins: earned })
    expect((await band.find({ type: 'Text', text: /coins/ }))?.text).toContain(`${900 + earned} coins ↑${earned}`)

    store.set('today', { day, coins: earned + 30 })
    await clock.advance(60_000)
    expect((await band.find({ type: 'Text', text: /coins/ }))?.text).toContain(`↑${earned + 30}`)
    await band.unmount()
  })
})

describe('gardening in a room', () => {
  const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const
  const ROOM = 'garden-claude-room'
  const roomWorld = (on: On, saved: Record<string, unknown> = {}, id = 'host-a') => {
    const clock = mock.clock(on, { now: NOW })
    const store = sharedStore(on, saved)
    const who = { id }
    mock.env(on, { LANG: 'en_US.UTF-8' })
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.id', () => ({ value: who.id }))
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('http.fetch', () => ({ deny: 'offline' }))
    on('tool.call', () => ({ result: 'ok', text: 'ok' }))
    on('session.end', ($, e) => ({ sessionId: e.sessionId }))
    on('ui.blit', () => ({ value: {} }))
    const toasts: string[] = []
    on('ui.toast', ($, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    const opened: string[] = []
    on('ui.open', ($, e) => {
      opened.push(e.id)
      return { value: { isPlaced: true } }
    })
    return { clock, store, who, toasts, opened }
  }
  const savedRoom = (store: Map<string, unknown>, code = 'MANGO') => store.get(`room:${code}`) as Room | undefined
  const bandTexts = async ($: Engine, bodyColumns = 120, maxRows = 20) => {
    const band = await $.ui.mount({
      plugin: 'garden-claude',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: { ...BAND.props, bodyColumns, maxRows, scroll: { offset: 0, bodyRows: maxRows } },
    })
    const texts = (await band.findAll({ type: 'Text' })).map(found => found.text ?? '')
    await band.unmount()
    return texts
  }
  const bandText = async ($: Engine, bodyColumns = 120) => {
    const band = await $.ui.mount({
      plugin: 'garden-claude',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: { ...BAND.props, bodyColumns },
    })
    const texts = (await band.findAll({ type: 'Text' })).map(found => found.text ?? '')
    await band.unmount()
    return texts.join('')
  }
  const seeded = (members: Member[], host = members[0]?.id ?? '') => ({
    'room:MANGO': roomOf(members, host),
    ...Object.fromEntries(members.map(one => [`seat:${one.id}`, { code: 'MANGO', accessory: one.accessory }])),
  })

  test('creates a room with a code and shows the host badge and its member line', async ($, on) => {
    const { store } = roomWorld(on)
    await $.session.start(START)
    const created = await $.command.run({ ...RUN, command: ROOM, args: 'create' })
    const code = /Room ([A-Z]+) is open/.exec(created.text ?? '')?.[1] ?? ''
    expect((FRUITS as readonly string[]).includes(code)).toBe(true)
    expect(savedRoom(store, code)?.host).toBe('host-a')
    expect(store.get('seat:host-a')).toEqual({ code, accessory: accessoryFor(490_000) })
    const text = await bandText($)
    expect(text).toContain(`HOST · ${code} 1/3`)
    expect(text).toContain('Claude 1 (host)')
    expect(text).toContain(' · you · ')
  })

  test('joins with the code, opens the accessory picker and splits the work with the host', async ($, on) => {
    const watering = { ...RESTING, kind: 'watering' as const, plot: 2 }
    const host = member('host-a', 1, 2, { job: watering })
    const garden = { ...freshGarden(), plots: Array.from({ length: PLOT_COUNT }, () => ({ stage: 2, kind: 1, thirst: 0 })) }
    const { store, opened } = roomWorld(on, { 'room:MANGO': roomOf([host], 'host-a', garden), 'seat:host-a': { code: 'MANGO', accessory: 2 } }, 'guest-b')
    await $.session.start(START)
    const joined = await $.command.run({ ...RUN, command: ROOM, args: 'join mango' })
    expect(joined.text).toBe('You joined room MANGO.')
    expect(opened).toContain('garden-claude-accessory')
    const text = await bandText($)
    expect(text).toContain('JOINED · MANGO 2/3')
    expect(text).toContain('Claude 1 (host)')
    expect(text).toContain('Claude 2')
    for (let i = 0; i < 20; i += 1) {
      await $.tool.call({ tool: 'Read', file_path: 'a.md' })
      const mine = savedRoom(store)?.members.find(one => one.id === 'guest-b')
      expect(mine?.job.plot).not.toBe(2)
      store.set('room:MANGO', { ...savedRoom(store)!, members: savedRoom(store)!.members.map(one => (one.id === 'host-a' ? { ...one, jobAt: NOW } : one)) })
    }
    expect(savedRoom(store)?.members.find(one => one.id === 'guest-b')?.accessory).not.toBe(2)
  })

  test('refuses a fourth Claude, says when a seat is held, and waits for an away host', async ($, on) => {
    const three = [member('host-a', 1, 0), member('b', 2, 1), member('c', 3, 2)]
    const { store } = roomWorld(on, seeded(three), 'd')
    await $.session.start(START)
    expect((await $.command.run({ ...RUN, command: ROOM, args: 'join MANGO' })).text).toBe('Room MANGO is full.')
    store.set('room:MANGO', roomOf([three[0]!, three[1]!, { ...three[2]!, away: { since: NOW } }]))
    expect((await $.command.run({ ...RUN, command: ROOM, args: 'join MANGO' })).text).toContain('a seat is held')
    store.set('room:MANGO', roomOf([{ ...three[0]!, away: { since: NOW } }]))
    expect((await $.command.run({ ...RUN, command: ROOM, args: 'join MANGO' })).text).toContain('is away')
    expect((await $.command.run({ ...RUN, command: ROOM, args: 'join LEMON' })).text).toBe("There's no open room LEMON.")
    expect((await $.command.run({ ...RUN, command: ROOM, args: 'join 12' })).text).toContain("isn't a room code")
  })

  test('sends everyone home when the host leaves', async ($, on) => {
    const { store, clock, toasts } = roomWorld(on, seeded([member('host-a', 1, 0), member('guest-b', 2, 1)]), 'guest-b')
    await $.session.start(START)
    await clock.advance(5_000)
    expect(toasts).toContain('Welcome back to room MANGO.')
    store.delete('room:MANGO')
    await clock.advance(5_000)
    expect(toasts).toContain("The host closed room MANGO. You're back in your own garden.")
    const alone = await bandText($)
    expect(alone).not.toContain('MANGO')
    expect(alone).not.toContain('Claude 1')
    expect(alone).toContain('Garden Claude')
  })

  test('refuses a new room when every fruit is taken', async ($, on) => {
    const busy = Object.fromEntries(FRUITS.map(fruit => [`room:${fruit}`, { ...roomOf([member(`h-${fruit}`, 1, 0)]), code: fruit }]))
    const { store } = roomWorld(on, busy, 'new-c')
    await $.session.start(START)
    expect((await $.command.run({ ...RUN, command: ROOM, args: 'create' })).text).toContain('Every fruit is taken')
    expect(store.has('seat:new-c')).toBe(false)
    store.set('room:PLUM', { ...roomOf([member('h-PLUM', 1, 0, { seen: NOW - 20 * 60_000 })]), code: 'PLUM' })
    expect((await $.command.run({ ...RUN, command: ROOM, args: 'create' })).text).toContain('Room PLUM is open')
    expect(savedRoom(store, 'PLUM')?.host).toBe('new-c')
  })

  test('closes the room for good when the host leaves with the command', async ($, on) => {
    const { store } = roomWorld(on)
    await $.session.start(START)
    const created = await $.command.run({ ...RUN, command: ROOM, args: 'create' })
    const code = /Room ([A-Z]+)/.exec(created.text ?? '')?.[1] ?? ''
    expect((await $.command.run({ ...RUN, command: ROOM, args: 'leave' })).text).toContain(`You closed room ${code}`)
    expect([...store.keys()].some(key => key.startsWith('room:') || key.startsWith('seat:'))).toBe(false)
  })

  test('a joined Claude leaving frees only its seat', async ($, on) => {
    const { store } = roomWorld(on, seeded([member('host-a', 1, 0), member('guest-b', 2, 1)]), 'guest-b')
    await $.session.start(START)
    expect((await $.command.run({ ...RUN, command: ROOM, args: 'leave' })).text).toContain('You left room MANGO')
    expect(savedRoom(store)?.members.map(one => one.id)).toEqual(['host-a'])
    expect(store.has('seat:guest-b')).toBe(false)
  })

  test('stays in the room through an idle hour', async ($, on) => {
    const { store, clock } = roomWorld(on)
    await $.session.start(START)
    const created = await $.command.run({ ...RUN, command: ROOM, args: 'create' })
    const code = /Room ([A-Z]+)/.exec(created.text ?? '')?.[1] ?? ''
    for (let i = 0; i < 6; i += 1) await clock.advance(10 * 60_000)
    const host = savedRoom(store, code)?.members[0]
    expect((host?.seen ?? 0) >= NOW + 59 * 60_000).toBe(true)
    expect(await bandText($)).toContain(`HOST · ${code} 1/3`)
  })

  test('keeps the room through a host restart and gives it back on resume', async ($, on) => {
    const { store, clock, toasts } = roomWorld(on)
    await $.session.start(START)
    const created = await $.command.run({ ...RUN, command: ROOM, args: 'create' })
    const code = /Room ([A-Z]+)/.exec(created.text ?? '')?.[1] ?? ''
    await $.session.end({ reason: 'prompt_input_exit', sessionId: 'host-a', resume: { id: 'host-a' } })
    expect(savedRoom(store, code)?.members[0]?.away).toEqual({ since: NOW })
    await clock.advance(2 * 60_000)
    await $.session.start(START)
    await clock.advance(5_000)
    expect(toasts).toContain(`Welcome back to room ${code}.`)
    expect(savedRoom(store, code)?.members[0]?.away).toBeUndefined()
    expect(await bandText($)).toContain(`HOST · ${code} 1/3`)
  })

  test('shows the host as away, then sends members home after 5 minutes and sweeps the room', async ($, on) => {
    const { store, clock, toasts } = roomWorld(
      on,
      seeded([member('host-a', 1, 0, { away: { since: NOW } }), member('guest-b', 2, 1)]),
      'guest-b',
    )
    await $.session.start(START)
    const text = await bandText($)
    expect(text).toContain('HOST AWAY · MANGO 1/3')
    expect(text).toContain('Claude 1 (host) · sunglasses · away')
    await clock.advance(GRACE_MS + 10_000)
    expect(toasts).toContain("The host closed room MANGO. You're back in your own garden.")
    await $.session.start(START)
    expect([...store.keys()].some(key => key.startsWith('room:') || key.startsWith('seat:'))).toBe(false)
  })

  test('counts a crashed Claude as away after 3 minutes and frees its seat 5 minutes later', async ($, on) => {
    const { store, clock } = roomWorld(on, seeded([member('host-a', 1, 0), member('guest-b', 2, 1)]))
    await $.session.start(START)
    expect(await bandText($)).toContain('HOST · MANGO 2/3')
    await clock.advance(SILENT_MS + 10_000)
    expect(await bandText($)).toContain('HOST · MANGO 1/3')
    await clock.advance(GRACE_MS)
    await $.tool.call({ tool: 'Read', file_path: 'a.md' })
    expect(savedRoom(store)?.members.map(one => one.id)).toEqual(['host-a'])
  })

  test('/clear keeps the seat under the new session id', async ($, on) => {
    const { store, who } = roomWorld(on)
    await $.session.start(START)
    const created = await $.command.run({ ...RUN, command: ROOM, args: 'create' })
    const code = /Room ([A-Z]+)/.exec(created.text ?? '')?.[1] ?? ''
    await $.session.end({ reason: 'clear', sessionId: 'host-a', resume: { id: 'host-a' } })
    who.id = 'host-c'
    await $.tool.call({ tool: 'Read', file_path: 'a.md' })
    expect(savedRoom(store, code)?.host).toBe('host-c')
    expect(savedRoom(store, code)?.members.map(one => one.id)).toEqual(['host-c'])
    expect(store.has('seat:host-a')).toBe(false)
    expect(store.get('seat:host-c')).toEqual({ code, accessory: accessoryFor(490_000) })
  })

  test('/resume of another session steps away from this room and back into that one', async ($, on) => {
    const other = roomOf([member('owner-x', 1, 3), member('other-y', 2, 4)], 'owner-x')
    const { store, who } = roomWorld(on, { 'room:LEMON': { ...other, code: 'LEMON' }, 'seat:other-y': { code: 'LEMON', accessory: 4 } })
    await $.session.start(START)
    const created = await $.command.run({ ...RUN, command: ROOM, args: 'create' })
    const code = /Room ([A-Z]+)/.exec(created.text ?? '')?.[1] ?? ''
    await $.session.end({ reason: 'resume', sessionId: 'host-a', resume: { id: 'host-a' } })
    who.id = 'other-y'
    await $.tool.call({ tool: 'Read', file_path: 'a.md' })
    expect(savedRoom(store, code)?.members[0]?.away).toEqual({ since: NOW })
    expect(await bandText($)).toContain('JOINED · LEMON 2/3')
  })

  test('takes over a room whose host is away, keeping one host', async ($, on) => {
    const { store } = roomWorld(
      on,
      { 'room:MANGO': roomOf([member('old-h', 1, 3, { away: { since: NOW } }), member('guest-b', 2, 1)], 'old-h') },
      'new-c',
    )
    await $.session.start(START)
    expect((await $.command.run({ ...RUN, command: ROOM, args: 'host MANGO' })).text).toBe("You're now the host of room MANGO.")
    const saved = savedRoom(store)
    expect(saved?.host).toBe('new-c')
    expect(saved?.members.map(one => [one.id, one.seat, one.accessory])).toEqual([
      ['guest-b', 2, 1],
      ['new-c', 1, 3],
    ])
    expect((await $.command.run({ ...RUN, command: ROOM, args: 'host MANGO' })).text).toContain('is here')
  })

  test('picks accessories by hand only in a room, never one another Claude wears', async ($, on) => {
    const ACCESSORY = 'garden-claude-accessory'
    const { store } = roomWorld(on, seeded([member('host-a', 1, 2), member('guest-b', 2, 1)]), 'guest-b')
    await $.session.start(START)
    expect((await $.command.run({ ...RUN, command: ACCESSORY, args: 'straw hat' })).text).toBe(
      'Another Claude in the room already wears a straw hat.',
    )
    expect((await $.command.run({ ...RUN, command: ACCESSORY, args: 'bunny ears' })).text).toBe('Your Claude now wears bunny ears.')
    expect(savedRoom(store)?.members.find(one => one.id === 'guest-b')?.accessory).toBe(4)
    expect(store.get('seat:guest-b')).toEqual({ code: 'MANGO', accessory: 4 })
    expect((await $.command.run({ ...RUN, command: ACCESSORY, args: 'cape' })).text).toContain('Free accessories:')
    await $.command.run({ ...RUN, command: ROOM, args: 'leave' })
    expect((await $.command.run({ ...RUN, command: ACCESSORY, args: 'bunny ears' })).text).toContain('swaps accessories every hour')
  })

  test('tells a host who resumes too late that the room closed, then cleans it up', async ($, on) => {
    const late = NOW - GRACE_MS - 60_000
    const { store, toasts, clock } = roomWorld(on, seeded([member('host-a', 1, 0, { away: { since: late } }), member('guest-b', 2, 1)]))
    await $.session.start(START)
    await clock.advance(5_000)
    expect(toasts).toContain('Room MANGO closed while you were away.')
    expect([...store.keys()].some(key => key.startsWith('room:') || key.startsWith('seat:'))).toBe(false)
  })

  test('lets a joined Claude that resumes late back in with its accessory when a seat is free', async ($, on) => {
    const { store, toasts, clock } = roomWorld(
      on,
      { 'room:MANGO': roomOf([member('host-a', 1, 0)]), 'seat:host-a': { code: 'MANGO', accessory: 0 }, 'seat:guest-b': { code: 'MANGO', accessory: 3 } },
      'guest-b',
    )
    await $.session.start(START)
    await clock.advance(5_000)
    expect(toasts).toContain('Welcome back to room MANGO.')
    expect(savedRoom(store)?.members.find(one => one.id === 'guest-b')?.accessory).toBe(3)
    expect(store.get('seat:guest-b')).toEqual({ code: 'MANGO', accessory: 3 })
  })

  test('sees a host that went silent before this session started as away', async ($, on) => {
    const silent = member('old-h', 1, 3, { seen: NOW - 4 * 60_000 })
    const { store } = roomWorld(on, { 'room:MANGO': roomOf([silent, member('guest-b', 2, 1)], 'old-h') }, 'new-c')
    await $.session.start(START)
    expect((await $.command.run({ ...RUN, command: ROOM, args: 'join MANGO' })).text).toContain('is away')
    expect((await $.command.run({ ...RUN, command: ROOM, args: 'host MANGO' })).text).toBe("You're now the host of room MANGO.")
    expect(savedRoom(store)?.host).toBe('new-c')
  })

  test('keeps the seat when the session id changes before the clear event arrives', async ($, on) => {
    const { store, who } = roomWorld(on)
    await $.session.start(START)
    const created = await $.command.run({ ...RUN, command: ROOM, args: 'create' })
    const code = /Room ([A-Z]+)/.exec(created.text ?? '')?.[1] ?? ''
    who.id = 'host-c'
    await $.tool.call({ tool: 'Read', file_path: 'a.md' })
    expect(savedRoom(store, code)?.host).toBe('host-c')
    expect(store.has('seat:host-a')).toBe(false)
  })

  test('a live Claude clears an away mark another session wrote over it', async ($, on) => {
    const { store, clock } = roomWorld(on, seeded([member('host-a', 1, 0), member('guest-b', 2, 1)]))
    await $.session.start(START)
    const saved = savedRoom(store)!
    store.set('room:MANGO', { ...saved, members: saved.members.map(one => (one.id === 'host-a' ? { ...one, away: { since: NOW } } : one)) })
    await clock.advance(5_000)
    expect(savedRoom(store)?.members.find(one => one.id === 'host-a')?.away).toBeUndefined()
  })

  test('shows the joined and host-away badges whole at every width', async ($, on) => {
    const { store } = roomWorld(on, seeded([member('host-a', 1, 0), member('guest-b', 2, 1)]), 'guest-b')
    await $.session.start(START)
    for (const columns of [30, 46, 60, 120]) {
      const texts = await bandTexts($, columns)
      expect(texts.some(text => /^(JOINED · MANGO 2\/3|JOINED MANGO|MANGO) $/.test(text))).toBe(true)
      expect(texts).toContain('Claude 2')
      expect(texts.some(text => text.endsWith(STRINGS.en.resting))).toBe(true)
    }
    const saved = savedRoom(store)!
    store.set('room:MANGO', { ...saved, members: saved.members.map(one => (one.id === 'host-a' ? { ...one, away: { since: NOW } } : one)) })
    await $.tool.call({ tool: 'Read', file_path: 'a.md' })
    for (const columns of [30, 46, 60, 120]) {
      const texts = await bandTexts($, columns)
      expect(texts.some(text => /^(HOST AWAY · MANGO 1\/3|AWAY MANGO|MANGO) $/.test(text))).toBe(true)
      expect(texts.some(text => text.endsWith(STRINGS.en.away))).toBe(true)
    }
  })

  test('keeps your own line first when rows run short and moves the badge to the stats line in one row', async ($, on) => {
    roomWorld(on, seeded([member('host-a', 1, 0), member('guest-b', 2, 1)]), 'guest-b')
    await $.session.start(START)
    const lines = (texts: string[]) => texts.filter(text => /^Claude \d/.test(text))
    expect(lines(await bandTexts($, 120, 9))).toEqual(['Claude 1 (host)', 'Claude 2'])
    expect(lines(await bandTexts($, 120, 8))).toEqual(['Claude 2'])
    expect(lines(await bandTexts($, 120, 7))).toEqual([])
    const oneRow = await bandTexts($, 120, 1)
    expect(oneRow[0]).toMatch(/MANGO/)
  })

  test('keeps the badge and every chore whole from a narrow terminal to a wide one', async ($, on) => {
    roomWorld(on, seeded([member('host-a', 1, 0), member('guest-b', 2, 1)]))
    await $.session.start(START)
    for (const columns of [30, 46, 60, 120]) {
      const band = await $.ui.mount({
        plugin: 'garden-claude',
        surface: 'terminal',
        component: 'AbovePrompt',
        props: { ...BAND.props, bodyColumns: columns },
      })
      const texts = (await band.findAll({ type: 'Text' })).map(found => found.text ?? '')
      await band.unmount()
      expect(texts.some(text => /MANGO/.test(text))).toBe(true)
      expect(texts.some(text => text.includes('Claude 1 (host)'))).toBe(true)
      expect(texts.filter(text => text.includes(STRINGS.en.resting)).length >= 1).toBe(true)
    }
  })
})

describe('wandering', () => {
  test('switches between strolling somewhere new and idling where it stopped', async () => {
    const seed = seedOfId('session-a')
    const goals = Array.from({ length: 200 }, (_, window) => wanderGoal(seed, window * WANDER_MS, MAX_SCENE_COLUMNS, 4))
    const stall = spotFor({ ...RESTING, kind: 'selling', plot: -1 }, 0, MAX_SCENE_COLUMNS)
    expect(goals.every(goal => goal >= 2 && goal <= stall)).toBe(true)
    const moves = goals.filter((goal, i) => i > 0 && goal !== goals[i - 1]).length
    const stays = goals.filter((goal, i) => i > 0 && goal === goals[i - 1]).length
    expect(moves > 40).toBe(true)
    expect(stays > 40).toBe(true)
    expect(new Set(goals).size > 10).toBe(true)
  })

  test('gives every Claude its own stroll, the same in every session', async () => {
    const at = (id: string) => Array.from({ length: 30 }, (_, window) => wanderGoal(seedOfId(id), window * WANDER_MS, MAX_SCENE_COLUMNS, 4))
    expect(at('session-a')).toEqual(at('session-a'))
    expect(at('session-a')).not.toEqual(at('session-b'))
    expect(wanderGoal(seedOfId('session-a'), 5 * WANDER_MS + 1, MAX_SCENE_COLUMNS, 4)).toBe(wanderGoal(seedOfId('session-a'), 5 * WANDER_MS + 11_000, MAX_SCENE_COLUMNS, 4))
  })

  test('keeps wandering Claudes from standing on each other or on a working one', async () => {
    const ids = ['session-a', 'session-b', 'session-c'].map(seedOfId)
    const apart = (goals: readonly number[]) => goals.every((goal, i) => goals.every((other, j) => i === j || Math.abs(goal - other) >= CLAUDE_GAP))
    for (const width of [MIN_SCENE_COLUMNS, 60, MAX_SCENE_COLUMNS]) {
      const together = spreadGoals(ids.map(seed => ({ seed, goal: 20, isWandering: true })), width)
      expect(apart(together)).toBe(true)
      expect(together).toEqual(spreadGoals(ids.map(seed => ({ seed, goal: 20, isWandering: true })).reverse(), width).reverse())

      const xs = ids.map(() => 20)
      for (let window = 0; window < 300; window += 1) {
        const goals = spreadGoals(ids.map((seed, i) => ({ seed, goal: wanderGoal(seed, window * WANDER_MS, width, xs[i] ?? 20), isWandering: true })), width)
        expect(apart(goals)).toBe(true)
        goals.forEach((goal, i) => (xs[i] = goal))
      }

      const working = plotX(1, width)
      const [first, second, plot] = spreadGoals([{ seed: ids[0] ?? 0, goal: working, isWandering: true }, { seed: ids[1] ?? 0, goal: working + 2, isWandering: true }, { seed: ids[2] ?? 0, goal: working, isWandering: false }], width)
      expect(plot).toBe(working)
      expect(apart([first ?? 0, second ?? 0, plot ?? 0])).toBe(true)
    }
    expect(spreadGoals([{ seed: ids[0] ?? 0, goal: 3, isWandering: true }], MAX_SCENE_COLUMNS)).toEqual([3])
  })
})
