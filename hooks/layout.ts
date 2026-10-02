import type { Usage } from '../types'
import { MIN_SCENE_COLUMNS, SCENE_ROWS, sceneWidth } from './garden'
import { formatCost } from './stats'

export const GAP = 3
export const STATS_BLOCK_COLUMNS = 28
export const MINI_BAR_CELLS = 5

export type Below = 'caption' | 'statsLine'

export type Layout = {
  sceneWidth: number | null
  isStatsBeside: boolean
  below: Below[]
  hasLineBars: boolean
  hasLineModel: boolean
}

type Reading = { label: string; percent: number }

export const readingsOf = (usage: Usage): Reading[] =>
  [
    { label: 'ctx', percent: usage.context },
    { label: '5h', percent: usage.five?.percent ?? null },
    { label: '7d', percent: usage.week?.percent ?? null },
  ].filter((reading): reading is Reading => reading.percent !== null)

export const costText = (usage: Usage): string => (usage.costUsd === null ? '$—' : formatCost(usage.costUsd))

export const lineText = (usage: Usage, hasModel: boolean): string =>
  [
    costText(usage),
    ...readingsOf(usage).map(({ label, percent }) => `${label} ${percent}%`),
    ...(hasModel && usage.model ? [usage.model] : []),
  ].join(' · ')

export const lineWidth = (usage: Usage, hasBars: boolean, hasModel: boolean): number =>
  lineText(usage, hasModel).length + (hasBars ? readingsOf(usage).length * (MINI_BAR_CELLS + 1) : 0)

const lineFit = (usage: Usage, columns: number) => {
  if (lineWidth(usage, true, true) <= columns) return { hasLineBars: true, hasLineModel: true }
  if (lineWidth(usage, false, true) <= columns) return { hasLineBars: false, hasLineModel: true }
  return { hasLineBars: false, hasLineModel: false }
}

export const layoutFor = (columns: number, maxRows: number, isTerminal: boolean, usage: Usage): Layout => {
  const fit = lineFit(usage, columns)
  const hasSceneRows = maxRows >= SCENE_ROWS + 1
  const besideColumns = columns - GAP - STATS_BLOCK_COLUMNS

  if (isTerminal && hasSceneRows && besideColumns >= MIN_SCENE_COLUMNS) {
    return { ...fit, sceneWidth: sceneWidth(besideColumns), isStatsBeside: true, below: ['caption'] }
  }
  if (isTerminal && hasSceneRows && columns >= MIN_SCENE_COLUMNS) {
    const below: Below[] = maxRows >= SCENE_ROWS + 2 ? ['statsLine', 'caption'] : ['statsLine']
    return { ...fit, sceneWidth: sceneWidth(columns), isStatsBeside: false, below }
  }
  return { ...fit, sceneWidth: null, isStatsBeside: false, below: maxRows >= 2 ? ['statsLine', 'caption'] : ['statsLine'] }
}
