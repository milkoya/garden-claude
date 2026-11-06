import type { Plan, Usage, UsageWindow } from '../types'
import { MAX_SCENE_COLUMNS, MIN_SCENE_COLUMNS, SCENE_ROWS, sceneWidth } from './garden'
import { BAR_CELLS, formatCost } from './stats'

export const GAP = 3
export const STATS_BLOCK_COLUMNS = 28
export const MINI_BAR_CELLS = 5
export const MAX_BAR_CELLS = 20

export type Below = 'caption' | 'statsLine'

export type Label = 'ctx' | '5h' | '7d' | 'fable'

export type Layout = {
  sceneWidth: number | null
  isStatsBeside: boolean
  statsColumns: number
  barCells: number
  below: Below[]
  hasLineBars: boolean
  hasLineModel: boolean
  lineLabels: readonly Label[]
  blockLabels: readonly Label[]
}

type Reading = { label: Label; percent: number }

const PLAN_LABELS: Readonly<Record<Plan, readonly Label[]>> = {
  max: ['ctx', '5h', '7d', 'fable'],
  ultra: ['ctx', '7d', 'fable'],
}

const ALL_LABELS = PLAN_LABELS.max

const DROP_ORDER: readonly Label[] = ['ctx', 'fable', '7d', '5h']

const SHORT_LABEL_COLUMNS = 3

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

export const windowFor = (usage: Usage, label: Label): UsageWindow | null => {
  switch (label) {
    case 'ctx':
      return usage.context === null ? null : { percent: usage.context, resetsAt: null }
    case '5h':
      return usage.five
    case '7d':
      return usage.week
    case 'fable':
      return usage.fable ?? null
  }
}

export const labelsFor = (usage: Usage, plan: Plan): Label[] =>
  PLAN_LABELS[plan].filter(label => label !== 'fable' || windowFor(usage, label) !== null)

export const labelColumns = (labels: readonly Label[]): number =>
  Math.max(SHORT_LABEL_COLUMNS, ...labels.map(label => label.length))

export const readingsOf = (usage: Usage, labels: readonly Label[] = ALL_LABELS): Reading[] =>
  labels.flatMap(label => {
    const window = windowFor(usage, label)
    return window === null ? [] : [{ label, percent: window.percent }]
  })

export const costText = (usage: Usage): string => (usage.costUsd === null ? '$—' : formatCost(usage.costUsd))

export const modelText = (usage: Usage): string =>
  usage.model && usage.effort ? `${usage.model} · ${usage.effort}` : (usage.model ?? '')

export const lineText = (usage: Usage, hasModel: boolean, labels: readonly Label[] = ALL_LABELS): string =>
  [
    costText(usage),
    ...readingsOf(usage, labels).map(({ label, percent }) => `${label} ${percent}%`),
    ...(hasModel && usage.model ? [modelText(usage)] : []),
  ].join(' · ')

export const lineWidth = (usage: Usage, hasBars: boolean, hasModel: boolean, labels: readonly Label[] = ALL_LABELS): number =>
  displayWidth(lineText(usage, hasModel, labels)) + (hasBars ? readingsOf(usage, labels).length * (MINI_BAR_CELLS + 1) : 0)

type LineStep = Pick<Layout, 'hasLineBars' | 'hasLineModel' | 'lineLabels'>

const shortenings = (labels: readonly Label[]): Label[][] => {
  const drops = DROP_ORDER.filter(label => labels.includes(label)).slice(0, -1)
  return drops.map((_, i) => labels.filter(label => !drops.slice(0, i + 1).includes(label)))
}

const lineFit = (usage: Usage, labels: readonly Label[], columns: number): LineStep => {
  const narrower = shortenings(labels)
  const steps: LineStep[] = [
    { hasLineBars: true, hasLineModel: true, lineLabels: labels },
    { hasLineBars: false, hasLineModel: true, lineLabels: labels },
    ...[labels, ...narrower].map(lineLabels => ({ hasLineBars: false, hasLineModel: false, lineLabels })),
  ]
  return (
    steps.find(step => lineWidth(usage, step.hasLineBars, step.hasLineModel, step.lineLabels) <= columns) ?? {
      hasLineBars: false,
      hasLineModel: false,
      lineLabels: narrower.at(-1) ?? labels,
    }
  )
}

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

export const layoutFor = (columns: number, maxRows: number, usage: Usage, plan: Plan = 'max'): Layout => {
  const blockLabels = labelsFor(usage, plan)
  const fit = { ...lineFit(usage, blockLabels, columns), blockLabels }
  const blockColumns = STATS_BLOCK_COLUMNS + labelColumns(blockLabels) - SHORT_LABEL_COLUMNS
  const hasSceneRows = maxRows >= SCENE_ROWS + 1
  const besideColumns = columns - GAP - blockColumns

  if (hasSceneRows && besideColumns >= MIN_SCENE_COLUMNS) {
    const barCells = Math.min(MAX_BAR_CELLS, BAR_CELLS + Math.max(0, besideColumns - MAX_SCENE_COLUMNS))
    return {
      ...fit,
      sceneWidth: sceneWidth(besideColumns),
      isStatsBeside: true,
      statsColumns: blockColumns + barCells - BAR_CELLS,
      barCells,
      below: ['caption'],
    }
  }
  const narrow = { ...fit, isStatsBeside: false, statsColumns: 0, barCells: BAR_CELLS }
  if (hasSceneRows && columns >= MIN_SCENE_COLUMNS) {
    const below: Below[] = maxRows >= SCENE_ROWS + 2 ? ['statsLine', 'caption'] : ['statsLine']
    return { ...narrow, sceneWidth: sceneWidth(columns), below }
  }
  return { ...narrow, sceneWidth: null, below: maxRows >= 2 ? ['statsLine', 'caption'] : ['statsLine'] }
}
