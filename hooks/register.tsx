import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Garden, Usage, UsageWindow } from '../types'
import {
  ACCESSORIES,
  BASKET_SIZE,
  SCENE_ROWS,
  accessoryFor,
  freshGarden,
  hourOf,
  isGarden,
  sceneCells,
  spotFor,
  work,
} from './garden'
import { GAP, MINI_BAR_CELLS, costText, layoutFor, lineText, readingsOf } from './layout'
import { BAR_CELLS, barCells, emptyUsage, formatReset, prettyModel, windowOf } from './stats'

const garden = atom({ plugin: 'garden-claude', key: 'garden' } as const, freshGarden())
const hour = atom({ plugin: 'garden-claude', key: 'hour' } as const, -1)
const minute = atom({ plugin: 'garden-claude', key: 'minute' } as const, 0)
const usage = atom({ plugin: 'garden-claude', key: 'usage' } as const, emptyUsage())

const STORE_KEY = 'garden'
const FRAME_MS = 200
const CLOCK_MS = 60_000
const RASTER = 'garden'
const ORANGE = '#d97757'
const GOLD = '#f2c84b'

let claudeX = 4
let facing = 0
let frame = 0
let isWorking = false
let site: string | undefined
let shown: { garden: Garden; accessory: number; width: number } | undefined
let ticker: { cancel: () => void } | undefined

async function tick($: EngineInterface) {
  frame += 1
  if (!shown || site === undefined) return
  const target = spotFor(shown.garden.job, claudeX, shown.width)
  if (claudeX !== target) {
    facing = Math.sign(target - claudeX)
    claudeX += facing
  } else {
    facing = isWorking ? 1 : 0
  }
  const cells = sceneCells({ ...shown, claudeX, facing, frame, isWorking })
  await $.ui.blit({ requestId: site, key: RASTER, cells })
}

function startTicker($: EngineInterface) {
  ticker ??= $.clock.every(FRAME_MS, () => void tick($))
}

async function refreshClock($: EngineInterface) {
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get(STORE_KEY)
    if (isGarden(saved)) await update($, garden, () => saved)
    await refreshClock($)
    await measure($)
    $.clock.every(CLOCK_MS, () => void refreshClock($))
    startTicker($)

    return next(e)
  })

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

  on('turn.start', ($, e, next) => {
    isWorking = true

    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    isWorking = false

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const grown = await update($, garden, work)
    await $.store.set(STORE_KEY, grown)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const storedHour = await read($, hour)
    const now = await $.clock.now()
    await read($, minute)
    const accessory = accessoryFor(storedHour >= 0 ? storedHour : hourOf(now))
    const current = await read($, garden)
    const stats: Usage = await read($, usage)
    const working = e.props.isWorking
    const doing = working ? current.job.label : 'resting in the shade'
    const isTerminal = e.surface === 'terminal'
    const layout = layoutFor(e.props.bodyColumns, e.props.maxRows, isTerminal, stats)

    site = e.requestId
    shown = layout.sceneWidth === null ? undefined : { garden: current, accessory, width: layout.sceneWidth }

    const { Box, Text } = $.ui.resolve(e)

    const caption = (
      <Box flexDirection="row">
        <Text color={ORANGE} bold>
          Garden Claude{' '}
        </Text>
        <Text dimColor wrap="truncate-end">
          wearing {ACCESSORIES[accessory]} · {doing} · basket {current.basket.length}/{BASKET_SIZE} ·{' '}
          {current.coins} coins
        </Text>
      </Box>
    )

    if (!isTerminal) return caption

    const { Raster } = $.ui.resolve(e)

    const statsLine = layout.hasLineBars ? (
      <Box flexDirection="row">
        <Text color={GOLD} bold>
          {costText(stats)}
        </Text>
        {readingsOf(stats).map(({ label, percent }) => (
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
      <Box flexDirection="row">
        <Text color={GOLD} bold>
          {costText(stats)}
        </Text>
        <Text dimColor wrap="truncate-end">
          {lineText(stats, layout.hasLineModel).slice(costText(stats).length)}
        </Text>
      </Box>
    )

    const limitRow = (label: string, key: string, window: UsageWindow | null) => (
      <Box flexDirection="row">
        <Text color={ORANGE}>{label} </Text>
        {window ? (
          <Box flexDirection="row">
            <Raster key={key} columns={BAR_CELLS} rows={1} cells={barCells(window.percent)} />
            <Text>{`${window.percent}%`.padStart(5)}</Text>
            {window.resetsAt && <Text dimColor> · {formatReset(window.resetsAt, now)}</Text>}
          </Box>
        ) : (
          <Text dimColor>no reading yet</Text>
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
        <Raster
          key={RASTER}
          columns={shown.width}
          rows={SCENE_ROWS}
          cells={sceneCells({ ...shown, claudeX, facing, frame, isWorking: working })}
        />
      )

    return (
      <Box flexDirection="column">
        {scene && (
          <Box flexDirection="row">
            {scene}
            {layout.isStatsBeside && statsBlock}
          </Box>
        )}
        {layout.below.map(row => (row === 'caption' ? caption : statsLine))}
      </Box>
    )
  })
}
