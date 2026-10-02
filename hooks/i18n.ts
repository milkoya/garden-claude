import type { Condition, Job, Language } from '../types'

export const LANGUAGES: readonly { code: Language; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'zh-TW', name: '繁體中文' },
  { code: 'zh-CN', name: '简体中文' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
]

export type Strings = {
  flowers: readonly [string, string, string, string, string, string]
  accessories: readonly [string, string, string, string, string]
  weather: Record<Condition, string>
  resting: string
  planting: (flower: string) => string
  watering: (flower: string) => string
  harvesting: (flower: string) => string
  selling: (count: number, earned: number) => string
  stages: readonly [string, string, string, string]
  withStage: (chore: string, stage: string) => string
  basket: (count: number, size: number) => string
  coins: (count: number) => string
  languageTitle: string
  autoLanguage: (name: string) => string
  pickHint: string
  languageSet: (name: string) => string
  unknownLanguage: (input: string) => string
  supportedLanguages: string
}

const ENGLISH: Strings = {
  flowers: ['daisy', 'tulip', 'sunflower', 'lavender', 'rose', 'cornflower'],
  accessories: ['sunglasses', 'headphones', 'straw hat', 'flower crown', 'bunny ears'],
  weather: { sunny: 'sunny', cloudy: 'cloudy', rainy: 'rainy', snowy: 'snowy' },
  resting: 'resting',
  planting: flower => `planting ${flower}`,
  watering: flower => `watering ${flower}`,
  harvesting: flower => `picking ${flower}`,
  selling: (count, earned) => `selling ${count}, +${earned} coins`,
  stages: ['seed', 'sprout', 'bud', 'in bloom'],
  withStage: (chore, stage) => `${chore}, ${stage}`,
  basket: (count, size) => `basket ${count}/${size}`,
  coins: count => `${count} coins`,
  languageTitle: 'Garden language',
  autoLanguage: name => `Auto (your computer: ${name})`,
  pickHint: '↑↓ choose · Enter pick · Esc close',
  languageSet: name => `Garden Claude now speaks ${name}.`,
  unknownLanguage: input => `"${input}" isn't a supported language.`,
  supportedLanguages: 'Supported languages:',
}

const TRADITIONAL: Strings = {
  flowers: ['雛菊', '鬱金香', '向日葵', '薰衣草', '玫瑰', '矢車菊'],
  accessories: ['太陽眼鏡', '耳機', '草帽', '花冠', '兔耳朵'],
  weather: { sunny: '晴天', cloudy: '多雲', rainy: '下雨', snowy: '下雪' },
  resting: '休息中',
  planting: flower => `種${flower}`,
  watering: flower => `澆${flower}`,
  harvesting: flower => `摘${flower}`,
  selling: (count, earned) => `賣出 ${count} 朵 +${earned} 金幣`,
  stages: ['種子', '發芽', '花苞', '盛開'],
  withStage: (chore, stage) => `${chore}，${stage}`,
  basket: (count, size) => `籃子 ${count}/${size}`,
  coins: count => `${count} 金幣`,
  languageTitle: '花園語言',
  autoLanguage: name => `自動（依照電腦：${name}）`,
  pickHint: '↑↓ 選擇 · Enter 確定 · Esc 關閉',
  languageSet: name => `Garden Claude 現在說${name}。`,
  unknownLanguage: input => `不支援「${input}」這個語言。`,
  supportedLanguages: '支援的語言：',
}

const SIMPLIFIED: Strings = {
  flowers: ['雏菊', '郁金香', '向日葵', '薰衣草', '玫瑰', '矢车菊'],
  accessories: ['太阳镜', '耳机', '草帽', '花冠', '兔耳朵'],
  weather: { sunny: '晴天', cloudy: '多云', rainy: '下雨', snowy: '下雪' },
  resting: '休息中',
  planting: flower => `种${flower}`,
  watering: flower => `浇${flower}`,
  harvesting: flower => `摘${flower}`,
  selling: (count, earned) => `卖出 ${count} 朵 +${earned} 金币`,
  stages: ['种子', '发芽', '花苞', '盛开'],
  withStage: (chore, stage) => `${chore}，${stage}`,
  basket: (count, size) => `篮子 ${count}/${size}`,
  coins: count => `${count} 金币`,
  languageTitle: '花园语言',
  autoLanguage: name => `自动（依照电脑：${name}）`,
  pickHint: '↑↓ 选择 · Enter 确定 · Esc 关闭',
  languageSet: name => `Garden Claude 现在说${name}。`,
  unknownLanguage: input => `不支持“${input}”这个语言。`,
  supportedLanguages: '支持的语言：',
}

const JAPANESE: Strings = {
  flowers: ['デイジー', 'チューリップ', 'ひまわり', 'ラベンダー', 'バラ', 'ヤグルマギク'],
  accessories: ['サングラス', 'ヘッドホン', '麦わら帽子', '花かんむり', 'うさ耳'],
  weather: { sunny: '晴れ', cloudy: 'くもり', rainy: '雨', snowy: '雪' },
  resting: '休憩中',
  planting: flower => `${flower}の種まき`,
  watering: flower => `${flower}に水やり`,
  harvesting: flower => `${flower}を収穫`,
  selling: (count, earned) => `${count}本販売 +${earned}コイン`,
  stages: ['種', '芽', 'つぼみ', '満開'],
  withStage: (chore, stage) => `${chore}、${stage}`,
  basket: (count, size) => `かご ${count}/${size}`,
  coins: count => `${count} コイン`,
  languageTitle: 'ガーデンの言語',
  autoLanguage: name => `自動（パソコンの設定：${name}）`,
  pickHint: '↑↓ 選ぶ · Enter 決定 · Esc 閉じる',
  languageSet: name => `Garden Claude は${name}で話します。`,
  unknownLanguage: input => `「${input}」には対応していません。`,
  supportedLanguages: '対応言語：',
}

const KOREAN: Strings = {
  flowers: ['데이지', '튤립', '해바라기', '라벤더', '장미', '수레국화'],
  accessories: ['선글라스', '헤드폰', '밀짚모자', '화관', '토끼 귀'],
  weather: { sunny: '맑음', cloudy: '흐림', rainy: '비', snowy: '눈' },
  resting: '휴식 중',
  planting: flower => `${flower} 심기`,
  watering: flower => `${flower} 물주기`,
  harvesting: flower => `${flower} 수확`,
  selling: (count, earned) => `${count}송이 판매 +${earned} 코인`,
  stages: ['씨앗', '새싹', '꽃봉오리', '만개'],
  withStage: (chore, stage) => `${chore}, ${stage}`,
  basket: (count, size) => `바구니 ${count}/${size}`,
  coins: count => `${count} 코인`,
  languageTitle: '정원 언어',
  autoLanguage: name => `자동 (컴퓨터 설정: ${name})`,
  pickHint: '↑↓ 선택 · Enter 확인 · Esc 닫기',
  languageSet: name => `Garden Claude가 이제 ${name}로 말해요.`,
  unknownLanguage: input => `"${input}"은(는) 지원하지 않는 언어예요.`,
  supportedLanguages: '지원 언어:',
}

export const STRINGS: Record<Language, Strings> = {
  en: ENGLISH,
  'zh-TW': TRADITIONAL,
  'zh-CN': SIMPLIFIED,
  ja: JAPANESE,
  ko: KOREAN,
}

export const languageName = (code: Language): string =>
  LANGUAGES.find(language => language.code === code)?.name ?? code

const flowerName = (strings: Strings, kind: number): string =>
  strings.flowers[kind % strings.flowers.length] ?? strings.flowers[0]

const withStageOf = (strings: Strings, job: Job, chore: string): string => {
  const stage = strings.stages[job.stage - 1]
  return stage === undefined ? chore : strings.withStage(chore, stage)
}

export const doingText = (strings: Strings, job: Job, isWorking: boolean): string => {
  if (!isWorking) return strings.resting
  switch (job.kind) {
    case 'planting':
      return withStageOf(strings, job, strings.planting(flowerName(strings, job.flower)))
    case 'watering':
      return withStageOf(strings, job, strings.watering(flowerName(strings, job.flower)))
    case 'harvesting':
      return withStageOf(strings, job, strings.harvesting(flowerName(strings, job.flower)))
    case 'selling':
      return strings.selling(job.count, job.earned)
    default:
      return strings.resting
  }
}

export const languageFromLocale = (locale: string): Language => {
  const tag = locale.toLowerCase().replace(/_/g, '-')
  if (tag.startsWith('zh')) return /hant|-tw|-hk|-mo/.test(tag) ? 'zh-TW' : 'zh-CN'
  if (tag.startsWith('ja')) return 'ja'
  if (tag.startsWith('ko')) return 'ko'
  return 'en'
}

const ZONE_LANGUAGES: Readonly<Record<string, Language>> = {
  'Asia/Taipei': 'zh-TW',
  'Asia/Hong_Kong': 'zh-TW',
  'Asia/Macau': 'zh-TW',
  'Asia/Shanghai': 'zh-CN',
  'Asia/Chongqing': 'zh-CN',
  'Asia/Harbin': 'zh-CN',
  'Asia/Urumqi': 'zh-CN',
  'Asia/Tokyo': 'ja',
  'Asia/Seoul': 'ko',
}

const isReadableLocale = (locale: string | undefined): locale is string =>
  locale !== undefined && locale.trim() !== '' && !/^(c|posix)(\.|$)/i.test(locale)

export const detectLanguage = (locales: readonly (string | undefined)[], timeZone: string): Language => {
  const locale = locales.find(isReadableLocale)
  if (locale) return languageFromLocale(locale)
  return ZONE_LANGUAGES[timeZone] ?? 'en'
}

export const parseLanguage = (input: string): Language | 'auto' | null => {
  const wanted = input.trim().toLowerCase().replace(/_/g, '-')
  if (wanted === 'auto') return 'auto'
  const exact = LANGUAGES.find(
    language => language.code.toLowerCase() === wanted || language.name.toLowerCase() === wanted,
  )
  if (exact) return exact.code
  if (['zh-hant', 'tw', 'traditional', 'traditional chinese'].includes(wanted)) return 'zh-TW'
  if (['zh-hans', 'cn', 'simplified', 'simplified chinese'].includes(wanted)) return 'zh-CN'
  if (['english', 'japanese', 'korean'].includes(wanted)) {
    return wanted === 'english' ? 'en' : wanted === 'japanese' ? 'ja' : 'ko'
  }
  return null
}
