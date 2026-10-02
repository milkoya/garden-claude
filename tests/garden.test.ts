import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import {
  ACCESSORIES,
  BASKET_SIZE,
  BLOOM,
  HOUR,
  PLOT_COUNT,
  MAX_SCENE_COLUMNS,
  MIN_SCENE_COLUMNS,
  plotX,
  SCENE_ROWS,
  THIRSTY,
  accessoryFor,
  freshGarden,
  loadGarden,
  paint,
  sceneCells,
  spotFor,
  work,
} from '../hooks/garden'
import type { Scene } from '../hooks/garden'
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
import type { Usage } from '../types'
import { LANGUAGES, STRINGS, detectLanguage, doingText, parseLanguage } from '../hooks/i18n'
import { cityForZone } from '../hooks/places'
import { ZONES } from '../hooks/zones'

const CITIES = Object.keys(ZONES).flatMap(zone => cityForZone(zone) ?? [])
import { conditionFromCode, parseCondition, weatherUrl } from '../hooks/weather'

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

describe('the garden', () => {
  test('plants every plot first', async () => {
    let garden = freshGarden()
    for (let i = 0; i < PLOT_COUNT; i += 1) {
      garden = work(garden)
      expect(garden.job.kind).toBe('planting')
    }
    expect(garden.plots.every(plot => plot.stage === 1)).toBe(true)
    expect(work(garden).job.kind).toBe('watering')
  })

  test('grows, harvests and sells flowers for coins', async () => {
    let garden = freshGarden()
    const seen = new Set<string>()
    for (let i = 0; i < 200; i += 1) {
      garden = work(garden)
      seen.add(garden.job.kind)
      expect(garden.basket.length <= BASKET_SIZE).toBe(true)
      expect(garden.plots.every(plot => plot.stage <= BLOOM)).toBe(true)
    }
    expect([...seen].sort()).toEqual(['harvesting', 'planting', 'selling', 'watering'])
    expect(garden.coins > 0).toBe(true)
  })

  test('keeps tending every plot, not just the first', async () => {
    let garden = freshGarden()
    for (let i = 0; i < 100; i += 1) garden = work(garden)
    const watered = new Set<number>()
    const harvested = new Set<number>()
    for (let i = 0; i < 200; i += 1) {
      garden = work(garden)
      if (garden.job.kind === 'watering') watered.add(garden.job.plot)
      if (garden.job.kind === 'harvesting') harvested.add(garden.job.plot)
    }
    const everyPlot = Array.from({ length: PLOT_COUNT }, (_, plot) => plot)
    expect([...watered].sort()).toEqual(everyPlot)
    expect([...harvested].sort()).toEqual(everyPlot)
  })

  test('never leaves a flower waiting long', async () => {
    let garden = freshGarden()
    for (let i = 0; i < 1000; i += 1) {
      garden = work(garden)
      expect(Math.max(...garden.plots.map(plot => plot.thirst)) <= THIRSTY).toBe(true)
    }
  })

  test('remembers how grown the flower is after each chore', async () => {
    let garden = freshGarden()
    for (let i = 0; i < 500; i += 1) {
      garden = work(garden)
      const { kind, plot, stage } = garden.job
      if (kind === 'planting') expect(stage).toBe(1)
      if (kind === 'watering') expect(stage).toBe(garden.plots[plot]?.stage ?? -1)
      if (kind === 'harvesting') expect(stage).toBe(BLOOM)
    }
  })

  test('moves on after watering a flower', async () => {
    let garden = freshGarden()
    for (let i = 0; i < 1000; i += 1) {
      const before = garden.job
      garden = work(garden)
      const isRepeat = before.kind === 'watering' && garden.job.kind === 'watering' && before.plot === garden.job.plot
      expect(isRepeat).toBe(false)
    }
  })

  test('lets the rain do the watering', async () => {
    let garden = freshGarden()
    const seen = new Set<string>()
    for (let i = 0; i < 300; i += 1) {
      garden = work(garden, 'rainy')
      seen.add(garden.job.kind)
    }
    expect(seen.has('watering')).toBe(false)
    expect([...seen].sort()).toEqual(['harvesting', 'planting', 'resting', 'selling'])
    expect(garden.coins > 0).toBe(true)
  })

  test('chills all day in the snow', async () => {
    let garden = freshGarden()
    for (let i = 0; i < 40; i += 1) garden = work(garden)
    const before = garden
    for (let i = 0; i < 50; i += 1) garden = work(garden, 'snowy')
    expect(garden.job.kind).toBe('resting')
    expect(garden.plots).toEqual(before.plots)
    expect(garden.basket).toEqual(before.basket)
    expect(garden.coins).toBe(before.coins)
    expect(garden.chores).toBe(before.chores)
  })

  test('tends the garden in a loose order, not a fixed loop', async () => {
    let garden = freshGarden()
    const order: number[] = []
    for (let i = 0; i < 300; i += 1) {
      garden = work(garden)
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
    const cells = sceneCells({
      garden: freshGarden(),
      accessory: 0,
      claudeX: 4,
      facing: 0,
      frame: 0,
      isWorking: false,
      width: MAX_SCENE_COLUMNS,
    })
    const bytes = MAX_SCENE_COLUMNS * SCENE_ROWS * 12
    expect(cells.length).toBe(Math.ceil(bytes / 3) * 4)
  })
})

const framesOf = (scene: Omit<Scene, 'frame'>) =>
  new Set(Array.from({ length: 40 }, (_, frame) => sceneCells({ ...scene, frame })))

describe('the animations', () => {
  test('every accessory moves while Claude idles', async () => {
    ACCESSORIES.forEach((_, accessory) => {
      const idle = { garden: freshGarden(), accessory, claudeX: 4, facing: 0, isWorking: false, width: MAX_SCENE_COLUMNS }
      expect(framesOf(idle).size > 2).toBe(true)
    })
  })

  test('every chore moves while Claude works', async () => {
    const kinds = ['planting', 'watering', 'harvesting', 'selling'] as const
    for (const kind of kinds) {
      const garden = { ...freshGarden(), basket: [1], job: { kind, plot: 0, flower: 1, stage: 0, count: 3, earned: 9 } }
      const claudeX = spotFor(garden.job, 4, MAX_SCENE_COLUMNS)
      const plain = ACCESSORIES.indexOf('a flower crown')
      expect(framesOf({ garden, accessory: plain, claudeX, facing: 1, isWorking: true, width: MAX_SCENE_COLUMNS }).size > 2).toBe(true)
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

  test('fits the caption by dropping the accessory, basket, place and then coins, never the chore', async () => {
    for (const { code } of LANGUAGES) {
      const strings = STRINGS[code]
      const selling = { kind: 'selling', plot: -1, flower: 0, stage: 0, count: 3, earned: 12 } as const
      const accessory = { text: strings.accessories[3], dropOrder: 4 }
      const chore = { text: doingText(strings, selling, true), dropOrder: 0 }
      const coins = { text: strings.coins(1234), dropOrder: 1 }
      const parts = [
        { text: cityForZone('Europe/Warsaw')?.names[code] ?? '', dropOrder: 2 },
        accessory,
        chore,
        { text: strings.basket(2, BASKET_SIZE), dropOrder: 3 },
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
      const lastFlowerEdge = plotX(PLOT_COUNT - 1, width) + 1
      expect(lastFlowerEdge < width - 11).toBe(true)
      expect(plotX(1, width) - plotX(0, width) >= 4).toBe(true)
      const selling = spotFor({ kind: 'selling', plot: -1, flower: 0, stage: 0, count: 0, earned: 0 }, 0, width)
      expect(selling >= 0 && selling + 9 < width - 11).toBe(true)
      expect(sceneCells({ garden: freshGarden(), accessory: 0, claudeX: 4, facing: 0, frame: 0, isWorking: false, width }).length).toBe(
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
      [46, 20, true],
      [40, 20, false],
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
    expect((await band.find({ type: 'Text', text: /basket/ }))?.text).toContain(
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
    on('tool.call', () => ({ result: 'ok', text: 'ok' }))

    await $.tool.call({ tool: 'Read', file_path: 'a.md' })

    const band = await $.ui.mount({ plugin: 'garden-claude', surface: 'terminal', ...BAND })
    expect((await band.find({ type: 'Text', text: /basket/ }))?.text).toContain('planting ')
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
      { kind: 'planting', plot: 0, flower: 1, stage: 1, count: 0, earned: 0 },
      { kind: 'watering', plot: 0, flower: 2, stage: 3, count: 0, earned: 0 },
      { kind: 'harvesting', plot: 0, flower: 3, stage: BLOOM, count: 0, earned: 0 },
      { kind: 'selling', plot: -1, flower: 0, stage: 0, count: 3, earned: 9 },
    ] as const
    for (const { code } of LANGUAGES) {
      const strings = STRINGS[code]
      const texts = jobs.map(job => doingText(strings, job, true))
      expect(new Set(texts).size).toBe(jobs.length)
      expect(doingText(strings, jobs[0], false)).toBe(strings.resting)
      expect(strings.accessories.length).toBe(ACCESSORIES.length)
    }
    expect(doingText(STRINGS.ja, jobs[1], true)).toBe('ひまわりに水やり、つぼみ')
    expect(doingText(STRINGS['zh-TW'], jobs[2], true)).toBe('摘薰衣草，盛開')
    expect(doingText(STRINGS.en, { ...jobs[1], stage: 0 }, true)).toBe('watering sunflower')
    expect(doingText(STRINGS['zh-TW'], jobs[3], true)).toBe('賣出 3 朵 +9 金幣')
    expect(doingText(STRINGS.en, jobs[3], true)).toBe('selling 3, +9 coins')
    expect(doingText(STRINGS.en, jobs[0], true)).toBe('planting tulip, seed')
  })

  test('loads an old save without English labels getting stuck', async () => {
    const old = { ...freshGarden(), coins: 7, job: { kind: 'watering', plot: 2, label: 'watering the rose' } }
    const loaded = loadGarden(old)
    expect(loaded?.coins).toBe(7)
    expect(loaded?.job.kind).toBe('resting')
    expect(loadGarden({ nope: true })).toBe(null)
  })

  test('loads a garden saved before flowers got thirsty', async () => {
    const { chores: _, ...old } = {
      ...freshGarden(),
      plots: Array.from({ length: PLOT_COUNT }, () => ({ stage: 2, kind: 1 })),
    }
    const loaded = loadGarden(old)
    expect(loaded?.chores).toBe(0)
    expect(loaded?.plots.every(plot => plot.thirst === 0 && plot.stage === 2)).toBe(true)
    expect(work(loaded ?? freshGarden()).job.kind).toBe('watering')
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
    const firstFrames = kinds.map(weather => sceneCells({ ...scene, frame: 0, weather }))
    expect(new Set([...firstFrames, sceneCells({ ...scene, frame: 0, weather: null })]).size).toBe(kinds.length + 1)
    for (const weather of kinds) {
      expect(framesOf({ ...scene, weather }).size > 2).toBe(true)
    }
  })

  test('covers the ground with snow when it snows', async () => {
    const scene = { garden: freshGarden(), accessory: 0, claudeX: 4, facing: 0, isWorking: false, width: MAX_SCENE_COLUMNS, frame: 0 }
    const groundRow = 10
    const white = (pixels: Uint32Array) =>
      Array.from({ length: MAX_SCENE_COLUMNS }, (_, x) => pixels[groundRow * MAX_SCENE_COLUMNS + x]).filter(color => color === 0xf4f6fb).length
    expect(white(paint({ ...scene, weather: 'snowy' })) > MAX_SCENE_COLUMNS / 2).toBe(true)
    expect(white(paint({ ...scene, weather: 'sunny' }))).toBe(0)
  })
})

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

describe('commands', () => {
  test('switches language from a typed shortcut and lists choices for a typo', async ($, on) => {
    mock.clock(on, { now: 490_000 * HOUR })
    mock.store(on)

    const set = await $.command.run({ ...RUN, command: 'garden-claude-language', args: 'ja' })
    expect(set.text).toBe('Garden Claude は日本語で話します。')

    const band = await $.ui.mount({ plugin: 'garden-claude', surface: 'terminal', ...BAND })
    expect(await band.find({ type: 'Text', text: /かご/ })).toBeDefined()
    await band.unmount()

    const typo = await $.command.run({ ...RUN, command: 'garden-claude-language', args: 'klingon' })
    expect(typo.text).toContain('zh-TW: 繁體中文')
  })
})

describe('starting a session', () => {
  const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const
  const quietWorld = (on: On, weatherCode?: number) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('http.fetch', () =>
      weatherCode === undefined
        ? { deny: 'offline' }
        : { value: { ok: true, status: 200, headers: {}, text: `{"current":{"weather_code":${weatherCode}}}` } },
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
    const expected = STRINGS[detectLanguage([], zone)].basket(0, BASKET_SIZE)
    const band = await $.ui.mount({ plugin: 'garden-claude', surface: 'terminal', ...BAND })
    expect(await band.find({ type: 'Text', text: new RegExp(expected) })).toBeDefined()
    await band.unmount()
  })

  const growing = { ...freshGarden(), plots: Array.from({ length: PLOT_COUNT }, () => ({ stage: 2, kind: 0, thirst: 0 })) }
  const chillsIn = async ($: Engine, on: On, code: number) => {
    const clock = mock.clock(on, { now: 490_000 * HOUR })
    mock.store(on, { garden: growing })
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

  test('waters on a clear day', async ($, on) => {
    expect(await chillsIn($, on, 0)).toBe(false)
  })

  test('draws the same Claude every frame after reloading in the middle of a turn', async ($, on) => {
    const clock = mock.clock(on, { now: 490_000 * HOUR })
    mock.store(on, { garden: { ...growing, job: { kind: 'watering', plot: 2, flower: 0, stage: 0, count: 0, earned: 0 } } })
    mock.env(on, { LANG: 'en_US.UTF-8' })
    quietWorld(on)
    const blits: unknown[] = []
    on('ui.blit', ($, e) => {
      if ('cells' in e) blits.push(e.cells)
      return { value: {} }
    })

    await $.session.start(START)
    const band = await $.ui.mount({ plugin: 'garden-claude', surface: 'terminal', ...BAND })
    await clock.advance(200 * 60)
    await band.redraw()

    const scene = await band.find({ type: 'Raster', key: 'garden' })
    expect(blits.length > 0).toBe(true)
    expect(scene?.props.cells).toEqual(blits.at(-1))
    await band.unmount()
  })

  test('follows the computer language and ignores a saved language it does not know', async ($, on) => {
    mock.clock(on, { now: 490_000 * HOUR })
    mock.store(on, { prefs: { language: 'fr' } })
    mock.env(on, { LANG: 'ja_JP.UTF-8' })
    quietWorld(on)

    await $.session.start(START)

    const band = await $.ui.mount({ plugin: 'garden-claude', surface: 'terminal', ...BAND })
    expect(await band.find({ type: 'Text', text: /かご/ })).toBeDefined()
    await band.unmount()
  })
})
