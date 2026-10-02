import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Condition, Detected, Garden, Language, Prefs, Usage, UsageWindow, Weather } from '../types'
import {
  BASKET_SIZE,
  SCENE_ROWS,
  accessoryFor,
  freshGarden,
  hourOf,
  loadGarden,
  sceneCells,
  spotFor,
  work,
} from './garden'
import { LANGUAGES, STRINGS, detectLanguage, doingText, languageName, parseLanguage } from './i18n'
import type { Strings } from './i18n'
import { GAP, KEEP, MINI_BAR_CELLS, captionFor, costText, layoutFor, lineText, readingsOf } from './layout'
import { cityForZone } from './places'
import type { City } from './places'
import { barCells, emptyUsage, formatReset, prettyModel, windowOf } from './stats'
import { WEATHER_REFRESH_MS, parseCondition, weatherUrl } from './weather'

const garden = atom({ plugin: 'garden-claude', key: 'garden' } as const, freshGarden())
const hour = atom({ plugin: 'garden-claude', key: 'hour' } as const, -1)
const minute = atom({ plugin: 'garden-claude', key: 'minute' } as const, 0)
const usage = atom({ plugin: 'garden-claude', key: 'usage' } as const, emptyUsage())
const prefs = atom({ plugin: 'garden-claude', key: 'prefs' } as const, { language: 'auto' })
const detected = atom({ plugin: 'garden-claude', key: 'detected' } as const, { language: 'en', timeZone: 'UTC' })
const weather = atom({ plugin: 'garden-claude', key: 'weather' } as const, null)

const GARDEN_KEY = 'garden'
const PREFS_KEY = 'prefs'
const LANGUAGE_COMMAND = 'garden-claude-language'
const LANGUAGE_PANE = 'garden-claude-language'
const FRAME_MS = 200
const CLOCK_MS = 60_000
const RASTER = 'garden'
const ORANGE = '#d97757'
const GOLD = '#f2c84b'
const TITLE = 'Garden Claude '

const START_X = 4

let claudeX: number | undefined
let facing = 0
let frame = 0
let isWorking = false
let site: string | undefined
let shown: { garden: Garden; accessory: number; width: number; weather: Weather['condition'] | null } | undefined
let timers: readonly { cancel: () => void }[] | undefined

const languageOf = (chosen: Prefs, found: Detected): Language =>
  chosen.language === 'auto' ? found.language : chosen.language

const loadPrefs = (value: unknown): Prefs | null => {
  const saved = value as Partial<Prefs> | null
  if (typeof saved !== 'object' || saved === null) return null
  const language = typeof saved.language === 'string' ? parseLanguage(saved.language) : null
  return { language: language ?? 'auto' }
}

async function tick($: EngineInterface) {
  frame += 1
  if (!shown || site === undefined || claudeX === undefined) return
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

function startTimers($: EngineInterface) {
  timers ??= [
    $.clock.every(FRAME_MS, () => void tick($)),
    $.clock.every(CLOCK_MS, () => void refreshClock($)),
    $.clock.every(WEATHER_REFRESH_MS, () => void refreshWeather($)),
  ]
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

async function detect($: EngineInterface) {
  const locales = [await $.env.get('LC_ALL'), await $.env.get('LANG')]
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  await update($, detected, () => ({ language: detectLanguage(locales, timeZone), timeZone }))
}

async function fetchCondition($: EngineInterface, city: City): Promise<Condition | null> {
  try {
    const response = await $.http.fetch(weatherUrl(city))
    return response.ok ? parseCondition(response.text) : null
  } catch {
    return null
  }
}

async function refreshWeather($: EngineInterface) {
  const city = cityForZone((await read($, detected)).timeZone)
  const condition = city ? await fetchCondition($, city) : null
  await update($, weather, () => (city && condition ? { condition, city: city.zone } : null))
}

async function conditionNow($: EngineInterface): Promise<Condition | null> {
  const sky = await read($, weather)
  const city = cityForZone((await read($, detected)).timeZone)
  return sky && city && sky.city === city.zone ? sky.condition : null
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
  return STRINGS[languageOf(await read($, prefs), await read($, detected))]
}

const languageList = (strings: Strings): string =>
  [strings.supportedLanguages, '  auto', ...LANGUAGES.map(({ code, name }) => `  ${code}: ${name}`)].join('\n')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = loadGarden(await $.store.get(GARDEN_KEY))
    if (saved) await update($, garden, () => saved)
    const savedPrefs = loadPrefs(await $.store.get(PREFS_KEY))
    if (savedPrefs) await update($, prefs, () => savedPrefs)
    await detect($)
    await refreshClock($)
    await measure($)
    await $.command.register({
      name: LANGUAGE_COMMAND,
      description: 'Pick the language Garden Claude speaks',
      argumentHint: '[auto | en | zh-TW | zh-CN | ja | ko]',
    })
    void refreshWeather($)
    startTimers($)

    return next(e)
  })

  on('command.run', { command: LANGUAGE_COMMAND }, async ($, e) => {
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
    startTimers($)

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const condition = await conditionNow($)
    const grown = await update($, garden, current => work(current, condition))
    await $.store.set(GARDEN_KEY, grown)
    startTimers($)

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: LANGUAGE_PANE }, async ($, e) => {
    const chosen = await read($, prefs)
    const found = await read($, detected)
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
          onSelect={(value: string) => void pickLanguage($, value)}
        />
        <Text dimColor>{strings.pickHint}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    startTimers($)

    const storedHour = await read($, hour)
    const now = await $.clock.now()
    await read($, minute)
    const accessory = accessoryFor(storedHour >= 0 ? storedHour : hourOf(now))
    const current = await read($, garden)
    const stats: Usage = await read($, usage)
    const chosen = await read($, prefs)
    const found = await read($, detected)
    const language = languageOf(chosen, found)
    const strings = STRINGS[language]
    const city = cityForZone(found.timeZone)
    const condition = await conditionNow($)
    isWorking = e.props.isWorking
    const isTerminal = e.surface === 'terminal'
    const layout = layoutFor(e.props.bodyColumns, e.props.maxRows, isTerminal, stats)

    site = e.requestId
    shown =
      layout.sceneWidth === null
        ? undefined
        : { garden: current, accessory, width: layout.sceneWidth, weather: condition }
    if (shown) claudeX ??= spotFor(current.job, START_X, shown.width)

    const place = city ? [city.names[language], condition ? strings.weather[condition] : null].filter(Boolean).join(' ') : ''
    const { hasTitle, details } = captionFor(
      TITLE,
      [
        { text: place, dropOrder: 2 },
        { text: strings.accessories[accessory] ?? strings.accessories[0], dropOrder: 4 },
        { text: doingText(strings, current.job, isWorking), dropOrder: KEEP },
        { text: strings.basket(current.basket.length, BASKET_SIZE), dropOrder: 3 },
        { text: strings.coins(current.coins), dropOrder: 1 },
      ],
      e.props.bodyColumns,
    )

    const { Box, Text } = $.ui.resolve(e)

    const caption = (
      <Box flexDirection="row">
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

    if (!isTerminal) return caption

    const { Raster } = $.ui.resolve(e)

    const statsLine = layout.hasLineBars ? (
      <Box flexDirection="row">
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
      <Box flexDirection="row">
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
        <Raster
          key={RASTER}
          columns={shown.width}
          rows={SCENE_ROWS}
          cells={sceneCells({ ...shown, claudeX: claudeX ?? START_X, facing, frame, isWorking })}
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
