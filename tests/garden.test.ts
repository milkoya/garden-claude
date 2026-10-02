import { describe, expect, mock, test } from 'claude-code/testing'

import {
  ACCESSORIES,
  BASKET_SIZE,
  BLOOM,
  HOUR,
  PLOT_COUNT,
  MAX_SCENE_COLUMNS,
  MIN_SCENE_COLUMNS,
  PLOT_COUNT as PLOTS,
  plotX,
  SCENE_ROWS,
  accessoryFor,
  freshGarden,
  sceneCells,
  spotFor,
  work,
} from '../hooks/garden'
import type { Scene } from '../hooks/garden'
import { BAR_CELLS, barCells, formatReset, prettyModel } from '../hooks/stats'
import { GAP, STATS_BLOCK_COLUMNS, layoutFor, lineWidth } from '../hooks/layout'
import type { Usage } from '../types'

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
      const garden = { ...freshGarden(), basket: [1], job: { kind, plot: 0, label: kind } }
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
        const sceneColumns =
          (layout.sceneWidth ?? 0) + (layout.isStatsBeside ? GAP + STATS_BLOCK_COLUMNS : 0)
        expect(sceneColumns <= columns).toBe(true)
        expect(sceneRows + layout.below.length <= maxRows).toBe(true)
        if (layout.hasLineBars) {
          expect(lineWidth(FULL_USAGE, true, layout.hasLineModel) <= columns).toBe(true)
        }
      }
    }
  })

  test('keeps the plots, Claude and the stall apart at every garden width', async () => {
    for (let width = MIN_SCENE_COLUMNS; width <= MAX_SCENE_COLUMNS; width += 1) {
      const lastFlowerEdge = plotX(PLOTS - 1, width) + 1
      expect(lastFlowerEdge < width - 11).toBe(true)
      expect(plotX(1, width) - plotX(0, width) >= 4).toBe(true)
      const selling = spotFor({ kind: 'selling', plot: -1, label: '' }, 0, width)
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
    expect((await band.find({ type: 'Text', text: /wearing/ }))?.text).toContain(
      ACCESSORIES[accessoryFor(490_000)],
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
    expect((await band.find({ type: 'Text', text: /wearing/ }))?.text).toContain('planting a')
    await band.unmount()
  })
})
