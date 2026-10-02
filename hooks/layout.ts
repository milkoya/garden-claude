import type { Usage } from '../types'
import { MAX_SCENE_COLUMNS, MIN_SCENE_COLUMNS, SCENE_ROWS, sceneWidth } from './garden'
import { BAR_CELLS, formatCost } from './stats'

export const GAP = 3
export const STATS_BLOCK_COLUMNS = 28
export const MINI_BAR_CELLS = 5
export const MAX_BAR_CELLS = 20

export type Below = 'caption' | 'statsLine'

export type Layout = {
  sceneWidth: number | null
  isStatsBeside: boolean
  statsColumns: number
  barCells: number
  below: Below[]
  hasLineBars: boolean
  hasLineModel: boolean
  lineLabels: readonly Label[]
}

export type Label = 'ctx' | '5h' | '7d'

type Reading = { label: Label; percent: number }

const ALL_LABELS: readonly Label[] = ['ctx', '5h', '7d']

const isWide = (codePoint: number): boolean =>
  (codePoint >= 0x1100 && codePoint <= 0x115f) ||
  (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
  (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
  (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
  (codePoint >= 0xfe30 && codePoint <= 0xfe4f) ||
  (codePoint >= 0xff00 && codePoint <= 0xff60) ||
  (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
  (codePoint >= 0x1f300 && codePoint <= 0x1faff)

export const displayWidth = (text: string): number =>
  [...text].reduce((sum, char) => sum + (isWide(char.codePointAt(0) ?? 0) ? 2 : 1), 0)

export const readingsOf = (usage: Usage, labels: readonly Label[] = ALL_LABELS): Reading[] =>
  [
    { label: 'ctx' as const, percent: usage.context },
    { label: '5h' as const, percent: usage.five?.percent ?? null },
    { label: '7d' as const, percent: usage.week?.percent ?? null },
  ].filter((reading): reading is Reading => reading.percent !== null && labels.includes(reading.label))

export const costText = (usage: Usage): string => (usage.costUsd === null ? '$—' : formatCost(usage.costUsd))

export const lineText = (usage: Usage, hasModel: boolean, labels: readonly Label[] = ALL_LABELS): string =>
  [
    costText(usage),
    ...readingsOf(usage, labels).map(({ label, percent }) => `${label} ${percent}%`),
    ...(hasModel && usage.model ? [usage.model] : []),
  ].join(' · ')

export const lineWidth = (usage: Usage, hasBars: boolean, hasModel: boolean, labels: readonly Label[] = ALL_LABELS): number =>
  displayWidth(lineText(usage, hasModel, labels)) + (hasBars ? readingsOf(usage, labels).length * (MINI_BAR_CELLS + 1) : 0)

type LineStep = Pick<Layout, 'hasLineBars' | 'hasLineModel' | 'lineLabels'>

const SHORTEST_LINE: LineStep = { hasLineBars: false, hasLineModel: false, lineLabels: ['5h'] }

const LINE_STEPS: readonly LineStep[] = [
  { hasLineBars: true, hasLineModel: true, lineLabels: ALL_LABELS },
  { hasLineBars: false, hasLineModel: true, lineLabels: ALL_LABELS },
  { hasLineBars: false, hasLineModel: false, lineLabels: ALL_LABELS },
  { hasLineBars: false, hasLineModel: false, lineLabels: ['5h', '7d'] },
  SHORTEST_LINE,
]

const lineFit = (usage: Usage, columns: number): LineStep =>
  LINE_STEPS.find(step => lineWidth(usage, step.hasLineBars, step.hasLineModel, step.lineLabels) <= columns) ??
  SHORTEST_LINE

export type CaptionPart = { text: string; dropOrder: number }

export const KEEP = 0

export const CAPTION_SEPARATOR = ' · '

export const fitCaption = (parts: readonly CaptionPart[], columns: number): string => {
  const join = (shown: readonly CaptionPart[]) => shown.map(part => part.text).join(CAPTION_SEPARATOR)
  let shown = parts.filter(part => part.text !== '')
  while (displayWidth(join(shown)) > columns && shown.some(part => part.dropOrder > KEEP)) {
    const first = Math.max(...shown.map(part => part.dropOrder))
    shown = shown.filter(part => part.dropOrder !== first)
  }
  return join(shown)
}

export const fitBadge = (tiers: readonly string[], keep: string, columns: number): string =>
  tiers.find(tier => displayWidth(tier) + 1 + displayWidth(keep) <= columns) ?? tiers[tiers.length - 1] ?? ''

export const captionFor = (title: string, parts: readonly CaptionPart[], columns: number) => {
  const titled = fitCaption(parts, columns - displayWidth(title))
  return displayWidth(title + titled) <= columns
    ? { hasTitle: true, details: titled }
    : { hasTitle: false, details: fitCaption(parts, columns) }
}

export const layoutFor = (columns: number, maxRows: number, isTerminal: boolean, usage: Usage): Layout => {
  const fit = lineFit(usage, columns)
  const hasSceneRows = maxRows >= SCENE_ROWS + 1
  const besideColumns = columns - GAP - STATS_BLOCK_COLUMNS

  if (isTerminal && hasSceneRows && besideColumns >= MIN_SCENE_COLUMNS) {
    const barCells = Math.min(MAX_BAR_CELLS, BAR_CELLS + Math.max(0, besideColumns - MAX_SCENE_COLUMNS))
    return {
      ...fit,
      sceneWidth: sceneWidth(besideColumns),
      isStatsBeside: true,
      statsColumns: STATS_BLOCK_COLUMNS + barCells - BAR_CELLS,
      barCells,
      below: ['caption'],
    }
  }
  const narrow = { ...fit, isStatsBeside: false, statsColumns: 0, barCells: BAR_CELLS }
  if (isTerminal && hasSceneRows && columns >= MIN_SCENE_COLUMNS) {
    const below: Below[] = maxRows >= SCENE_ROWS + 2 ? ['statsLine', 'caption'] : ['statsLine']
    return { ...narrow, sceneWidth: sceneWidth(columns), below }
  }
  return { ...narrow, sceneWidth: null, below: maxRows >= 2 ? ['statsLine', 'caption'] : ['statsLine'] }
}
